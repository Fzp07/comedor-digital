-- 020: integridad del flag de MFA.
-- `profiles.mfa_enrolled` es informativo, pero no debe poder marcarse como
-- activo desde una sesión AAL1. El reto real sigue viviendo en RLS (`mfa_ok()`),
-- que exige el claim `aal = aal2` cuando `require_mfa` está activo.

create or replace function public.set_my_mfa_enrolled(p_enrolled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida';
  end if;

  if p_enrolled and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Verifica el segundo factor antes de marcarlo como activo';
  end if;

  update public.profiles
     set mfa_enrolled = p_enrolled
   where id = auth.uid();
end;
$function$;

revoke all on function public.set_my_mfa_enrolled(boolean) from public, anon;
grant execute on function public.set_my_mfa_enrolled(boolean) to authenticated, service_role;
