create extension if not exists postgis;

create type public.profile_role as enum ('user', 'admin');
create type public.contribution_kind as enum ('new_statue', 'edit_suggestion');
create type public.contribution_status as enum ('pending_review', 'approved', 'rejected', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.profile_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.statues (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  province text not null,
  city text not null,
  address text not null,
  longitude double precision not null check (longitude between 73 and 136),
  latitude double precision not null check (latitude between 3 and 54),
  location geography(Point, 4326) generated always as (st_setsrid(st_makepoint(longitude, latitude), 4326)::geography) stored,
  desc text,
  background text,
  year text,
  image_url text,
  source text,
  verification_status text check (verification_status in ('verified', 'user_verified', 'amap_unverified')),
  status public.contribution_status not null default 'approved',
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index statues_location_gix on public.statues using gist (location);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.contribution_kind not null,
  statue_id uuid references public.statues(id) on delete set null,
  payload jsonb not null,
  status public.contribution_status not null default 'pending_review',
  review_comment text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.statues enable row level security;
alter table public.contributions enable row level security;

create policy "public reads approved statues" on public.statues for select using (status = 'approved');
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create policy "users read own contributions" on public.contributions for select using (auth.uid() = user_id or public.is_admin());
create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());

create or replace function public.review_contribution(contribution_id uuid, next_status public.contribution_status, comment text default '') returns void
language plpgsql security definer set search_path = public as $$
declare item public.contributions;
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  select * into item from public.contributions where id = contribution_id for update;
  if item.id is null then raise exception 'contribution not found'; end if;
  if item.status <> 'pending_review' then raise exception 'contribution already reviewed'; end if;
  if next_status not in ('approved', 'rejected') then raise exception 'invalid review status'; end if;
  if next_status = 'approved' then
    if item.kind = 'new_statue' then
      insert into public.statues (name, province, city, address, longitude, latitude, desc, background, year, image_url, source, verification_status, created_by)
      values (item.payload->>'name', item.payload->>'province', item.payload->>'city', item.payload->>'address',
        (item.payload->>'longitude')::double precision, (item.payload->>'latitude')::double precision,
        item.payload->>'desc', item.payload->>'background', item.payload->>'year', item.payload->>'image_url', '用户贡献', 'verified', item.user_id);
    elsif item.statue_id is not null then
      update public.statues set name = coalesce(item.payload->>'name', name), province = coalesce(item.payload->>'province', province), city = coalesce(item.payload->>'city', city), address = coalesce(item.payload->>'address', address), longitude = coalesce((item.payload->>'longitude')::double precision, longitude), latitude = coalesce((item.payload->>'latitude')::double precision, latitude), desc = coalesce(item.payload->>'desc', desc), background = coalesce(item.payload->>'background', background), year = coalesce(item.payload->>'year', year), image_url = coalesce(item.payload->>'image_url', image_url), updated_at = now() where id = item.statue_id;
    elsif item.kind = 'edit_suggestion' and item.payload->>'external_id' is not null then
      insert into public.statues (external_id, name, province, city, address, longitude, latitude, desc, background, year, image_url, source, verification_status, created_by)
      values (item.payload->>'external_id', item.payload->>'name', item.payload->>'province', item.payload->>'city', item.payload->>'address', (item.payload->>'longitude')::double precision, (item.payload->>'latitude')::double precision, item.payload->>'desc', item.payload->>'background', item.payload->>'year', item.payload->>'image_url', '用户修改建议', 'verified', item.user_id)
      on conflict (external_id) do update set name = excluded.name, province = excluded.province, city = excluded.city, address = excluded.address, longitude = excluded.longitude, latitude = excluded.latitude, desc = excluded.desc, background = excluded.background, year = excluded.year, image_url = coalesce(excluded.image_url, public.statues.image_url), verification_status = 'verified', updated_at = now();
    end if;
  end if;
  update public.contributions set status = next_status, review_comment = comment, reviewed_by = auth.uid(), reviewed_at = now() where id = contribution_id;
end; $$;

create or replace function public.nearby_approved_statue(p_lng double precision, p_lat double precision, p_radius_m integer default 50) returns table (id uuid, name text, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, st_distance(s.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) from public.statues s where s.status = 'approved' and st_dwithin(s.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m) order by 3 limit 1;
$$;

create or replace function public.submit_contribution(p_kind public.contribution_kind, p_statue_id uuid, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare created_id uuid; duplicate_name text; lng double precision; lat double precision;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  perform pg_advisory_xact_lock(84201950);
  if (select count(*) from public.contributions where user_id = auth.uid() and created_at >= current_date) >= 5 then raise exception '今日提交次数已达上限'; end if;
  if nullif(trim(p_payload->>'name'), '') is null or length(p_payload->>'name') > 80 then raise exception '点位名称无效'; end if;
  if nullif(trim(p_payload->>'province'), '') is null or length(p_payload->>'province') > 30 then raise exception '省份无效'; end if;
  if nullif(trim(p_payload->>'city'), '') is null or length(p_payload->>'city') > 30 then raise exception '城市无效'; end if;
  if nullif(trim(p_payload->>'address'), '') is null or length(p_payload->>'address') > 160 then raise exception '地址无效'; end if;
  if length(coalesce(p_payload->>'desc', '')) > 800 or length(coalesce(p_payload->>'background', '')) > 800 then raise exception '资料内容过长'; end if;
  lng := (p_payload->>'longitude')::double precision; lat := (p_payload->>'latitude')::double precision;
  if lng not between 73 and 136 or lat not between 3 and 54 then raise exception '坐标无效'; end if;
  if p_kind = 'new_statue' then
    select s.name into duplicate_name from public.statues s where s.status = 'approved' and st_dwithin(s.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, 50) limit 1;
    if duplicate_name is null then select c.payload->>'name' into duplicate_name from public.contributions c where c.status = 'pending_review' and c.kind = 'new_statue' and st_dwithin(st_setsrid(st_makepoint((c.payload->>'longitude')::double precision, (c.payload->>'latitude')::double precision), 4326)::geography, st_setsrid(st_makepoint(lng, lat), 4326)::geography, 50) limit 1; end if;
    if duplicate_name is not null then raise exception '50米内已有点位：%', duplicate_name; end if;
  elsif p_kind = 'edit_suggestion' then
    if nullif(p_payload->>'external_id', '') is null and p_statue_id is null then raise exception '缺少原点位标识'; end if;
    if exists (select 1 from public.contributions where status = 'pending_review' and kind = 'edit_suggestion' and payload->>'external_id' = p_payload->>'external_id') then raise exception '该点位已有待审核修改建议'; end if;
  end if;
  insert into public.contributions (user_id, kind, statue_id, payload) values (auth.uid(), p_kind, p_statue_id, p_payload) returning id into created_id;
  return created_id;
end; $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('contribution-photos', 'contribution-photos', true, 5242880, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create or replace function public.can_upload_contribution_photo() returns boolean language sql stable security definer set search_path = public, storage as $$ select auth.uid() is not null and (select count(*) from storage.objects where bucket_id = 'contribution-photos' and owner_id = auth.uid()::text and created_at >= current_date) < 5; $$;
create policy "authenticated upload contribution photos" on storage.objects for insert to authenticated with check (bucket_id = 'contribution-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.can_upload_contribution_photo());
create policy "public reads contribution photos" on storage.objects for select using (bucket_id = 'contribution-photos');
create policy "users delete own contribution photos" on storage.objects for delete to authenticated using (bucket_id = 'contribution-photos' and owner_id = auth.uid()::text);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id, email) values (new.id, new.email); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- 首位管理员：登录后将对应用户 UUID 写入下句并执行。
-- update public.profiles set role = 'admin' where id = 'YOUR-USER-UUID';
