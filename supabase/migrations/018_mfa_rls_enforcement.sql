-- 018: segunda capa de MFA en RLS.
-- Con require_mfa activo, los roles privilegiados necesitan una sesión AAL2
-- para leer o escribir tablas sensibles, aunque llamen la API directamente.
-- Operadores y empleados no se ven afectados. Con el flag en false no cambia nada.

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when coalesce((select cs.require_mfa from public.company_settings cs where cs.id = true), false) = false then true
    when public.current_app_role() = any (array['operador'::public.app_role, 'empleado'::public.app_role]) then true
    else coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  end
$function$;

revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('profiles', 'company_settings', 'notifications')
  loop
    if pol.qual is not null and pol.qual not like '%mfa_ok()%' then
      execute format(
        'alter policy %I on public.%I using (public.mfa_ok() and (%s))',
        pol.policyname, pol.tablename, pol.qual
      );
    end if;
    if pol.with_check is not null and pol.with_check not like '%mfa_ok()%' then
      execute format(
        'alter policy %I on public.%I with check (public.mfa_ok() and (%s))',
        pol.policyname, pol.tablename, pol.with_check
      );
    end if;
  end loop;
end $$;

-- El propio perfil sigue disponible en AAL1 para poder redirigir al reto MFA;
-- el resto de perfiles exige AAL2 cuando la política está activa.
alter policy profiles_select on public.profiles
using (
  id = (select auth.uid())
  or (
    public.mfa_ok()
    and (
      public.can_read_all_people()
      or (public.current_app_role() = 'supervisor'::public.app_role and site_id = public.current_app_site())
    )
  )
);

create or replace function public.set_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.can_manage_people() then raise exception 'No autorizado'; end if;
  if not public.mfa_ok() then raise exception 'Se requiere segundo factor (MFA) para esta operación'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener 4 a 6 dígitos'; end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Empleado no encontrado';
  end if;
  insert into public.employee_credentials(employee_id, pin_hash, updated_at)
  values (p_employee_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
  insert into public.audit_log(actor_id, actor_role, action, entity, entity_id)
  values (auth.uid(), public.current_app_role(), 'set_pin', 'employee_credentials', p_employee_id::text);
  return jsonb_build_object('ok', true);
end $function$;
