-- Restrict SECURITY DEFINER helpers to authenticated role for RLS
revoke execute on function public.is_league_member(uuid) from public, anon;
revoke execute on function public.is_league_admin(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_admin(uuid) to authenticated;
