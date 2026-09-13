alter table public.profiles add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_length
      check (username is null or char_length(btrim(username)) between 2 and 24);
  end if;
end $$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested_username text := nullif(btrim(new.raw_user_meta_data->>'username'), '');
begin
  if requested_username is not null and char_length(requested_username) not between 2 and 24 then
    raise exception 'username must contain 2 to 24 characters';
  end if;

  insert into public.profiles (id, email, username)
  values (new.id, new.email, requested_username)
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username);
  return new;
end;
$$;
