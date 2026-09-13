create or replace function public.admin_reset_user_password(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt('mao123456', extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

revoke all on function public.admin_reset_user_password(uuid) from public, anon;
grant execute on function public.admin_reset_user_password(uuid) to authenticated;
