-- Keep every approved contribution linked to the public statue it changed.
create or replace function public.review_contribution(contribution_id uuid, next_status public.contribution_status, comment text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  item public.contributions;
  target_statue_id uuid;
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  select * into item from public.contributions where id = contribution_id for update;
  if item.id is null then raise exception 'contribution not found'; end if;
  if item.status <> 'pending_review' then raise exception 'contribution already reviewed'; end if;
  if next_status not in ('approved', 'rejected') then raise exception 'invalid review status'; end if;

  target_statue_id := item.statue_id;
  if next_status = 'approved' then
    if item.kind = 'new_statue' then
      insert into public.statues (name, province, city, address, longitude, latitude, "desc", background, year, image_url, source, verification_status, created_by)
      values (item.payload->>'name', item.payload->>'province', item.payload->>'city', item.payload->>'address',
        (item.payload->>'longitude')::double precision, (item.payload->>'latitude')::double precision,
        item.payload->>'desc', item.payload->>'background', item.payload->>'year', item.payload->>'image_url', '用户贡献', 'verified', item.user_id)
      returning id into target_statue_id;
    elsif item.statue_id is not null then
      update public.statues set name = coalesce(item.payload->>'name', name), province = coalesce(item.payload->>'province', province), city = coalesce(item.payload->>'city', city), address = coalesce(item.payload->>'address', address), longitude = coalesce((item.payload->>'longitude')::double precision, longitude), latitude = coalesce((item.payload->>'latitude')::double precision, latitude), "desc" = coalesce(item.payload->>'desc', "desc"), background = coalesce(item.payload->>'background', background), year = coalesce(item.payload->>'year', year), image_url = coalesce(item.payload->>'image_url', image_url), updated_at = now() where id = item.statue_id;
    elsif item.kind = 'edit_suggestion' and item.payload->>'external_id' is not null then
      insert into public.statues (external_id, name, province, city, address, longitude, latitude, "desc", background, year, image_url, source, verification_status, created_by)
      values (item.payload->>'external_id', item.payload->>'name', item.payload->>'province', item.payload->>'city', item.payload->>'address', (item.payload->>'longitude')::double precision, (item.payload->>'latitude')::double precision, item.payload->>'desc', item.payload->>'background', item.payload->>'year', item.payload->>'image_url', '用户修改建议', 'verified', item.user_id)
      on conflict (external_id) do update set name = excluded.name, province = excluded.province, city = excluded.city, address = excluded.address, longitude = excluded.longitude, latitude = excluded.latitude, "desc" = excluded."desc", background = excluded.background, year = excluded.year, image_url = coalesce(excluded.image_url, public.statues.image_url), verification_status = 'verified', updated_at = now()
      returning id into target_statue_id;
    end if;
  end if;

  update public.contributions
  set status = next_status,
      review_comment = comment,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      statue_id = coalesce(target_statue_id, statue_id)
  where id = contribution_id;
end; $$;

-- Backfill links for contributions approved before statue_id was populated consistently.
update public.contributions c
set statue_id = (
  select s.id as statue_id
  from public.statues s
  where (c.kind = 'edit_suggestion' and s.external_id is not null and s.external_id = c.payload->>'external_id')
     or (c.kind = 'new_statue'
       and s.created_by = c.user_id
       and s.longitude = (c.payload->>'longitude')::double precision
       and s.latitude = (c.payload->>'latitude')::double precision)
  order by s.updated_at desc
  limit 1
)
where c.status = 'approved'
  and c.statue_id is null
  and exists (
    select 1
    from public.statues s
    where (c.kind = 'edit_suggestion' and s.external_id is not null and s.external_id = c.payload->>'external_id')
       or (c.kind = 'new_statue'
         and s.created_by = c.user_id
         and s.longitude = (c.payload->>'longitude')::double precision
         and s.latitude = (c.payload->>'latitude')::double precision)
  );

-- Public map data exposes usernames only; account emails remain private.
create or replace function public.public_statue_contributors()
returns table (statue_id uuid, contributor_names text[])
language sql stable security definer set search_path = public as $$
  with contributor_links as (
    select s.id as statue_id, s.created_by as user_id
    from public.statues s
    where s.status = 'approved' and s.created_by is not null
    union
    select c.statue_id, c.user_id
    from public.contributions c
    join public.statues s on s.id = c.statue_id and s.status = 'approved'
    where c.status = 'approved' and c.statue_id is not null
  )
  select links.statue_id, array_agg(distinct p.username order by p.username) as contributor_names
  from contributor_links links
  join public.profiles p on p.id = links.user_id
  where nullif(btrim(p.username), '') is not null
  group by links.statue_id;
$$;

revoke all on function public.public_statue_contributors() from public;
grant execute on function public.public_statue_contributors() to anon, authenticated;
