create or replace function public.update_my_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := nullif(btrim(p_username), '');
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if normalized_username is null or char_length(normalized_username) not between 2 and 24 then
    raise exception '用户名需要 2 至 24 个字符';
  end if;

  update public.profiles
  set username = normalized_username
  where id = auth.uid();

  if not found then raise exception '用户资料不存在'; end if;
  return normalized_username;
end;
$$;

revoke all on function public.update_my_username(text) from public, anon;
grant execute on function public.update_my_username(text) to authenticated;

-- Display names are not account identifiers, so different users may share one.
drop index if exists public.profiles_username_lower_unique;
