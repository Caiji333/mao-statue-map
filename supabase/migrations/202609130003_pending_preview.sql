create or replace function public.nearby_pending_contributions(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 50
)
returns table (
  id uuid,
  payload jsonb,
  distance_m double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.payload, st_distance(
    st_setsrid(st_makepoint((c.payload->>'longitude')::double precision, (c.payload->>'latitude')::double precision), 4326)::geography,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  ), c.created_at
  from public.contributions c
  where c.status = 'pending_review'
    and c.kind = 'new_statue'
    and c.payload ? 'longitude'
    and c.payload ? 'latitude'
    and st_dwithin(
      st_setsrid(st_makepoint((c.payload->>'longitude')::double precision, (c.payload->>'latitude')::double precision), 4326)::geography,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  order by 3
  limit 10;
$$;

revoke all on function public.nearby_pending_contributions(double precision, double precision, integer) from public, anon;
grant execute on function public.nearby_pending_contributions(double precision, double precision, integer) to authenticated;
