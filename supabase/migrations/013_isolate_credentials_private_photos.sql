-- 013: aislar credenciales y cerrar el bucket de fotos.
-- Los hashes de PIN dejan de vivir en employees/profiles y pasan a tablas
-- sin políticas RLS, accesibles solo por funciones SECURITY DEFINER.

create table if not exists public.employee_credentials (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  override_pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.employee_credentials enable row level security;
alter table public.employee_credentials force row level security;
alter table public.profile_credentials enable row level security;
alter table public.profile_credentials force row level security;

revoke all on public.employee_credentials from public, anon, authenticated;
revoke all on public.profile_credentials from public, anon, authenticated;
grant all on public.employee_credentials to service_role;
grant all on public.profile_credentials to service_role;

insert into public.employee_credentials(employee_id, pin_hash)
select id, pin_hash from public.employees where pin_hash is not null
on conflict (employee_id) do update set pin_hash = excluded.pin_hash, updated_at = now();

insert into public.profile_credentials(profile_id, override_pin_hash)
select id, override_pin_hash from public.profiles where override_pin_hash is not null
on conflict (profile_id) do update set override_pin_hash = excluded.override_pin_hash, updated_at = now();

create or replace function public.set_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.can_manage_people() then raise exception 'No autorizado'; end if;
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

create or replace function public.verify_employee_pin(p_employee_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_emp public.employees%rowtype;
  v_hash text;
begin
  select * into v_emp from public.employees
  where (lower(code) = lower(p_employee_code) or document_number = p_employee_code)
    and status = 'activo'
  limit 1;
  if v_emp.id is null then return jsonb_build_object('ok', false, 'message', 'Empleado no encontrado'); end if;
  select pin_hash into v_hash from public.employee_credentials where employee_id = v_emp.id;
  if v_hash is null then return jsonb_build_object('ok', false, 'message', 'El empleado no tiene PIN configurado'); end if;
  if crypt(p_pin, v_hash) = v_hash then
    return jsonb_build_object('ok', true, 'employee_id', v_emp.id, 'full_name', v_emp.full_name,
      'site_id', v_emp.site_id, 'photo_url', v_emp.photo_url);
  end if;
  return jsonb_build_object('ok', false, 'message', 'PIN incorrecto');
end $function$;

create or replace function public.verify_supervisor_pin(p_email text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_p public.profiles%rowtype;
  v_hash text;
begin
  select * into v_p from public.profiles
  where lower(email) = lower(p_email) and active and role in ('supervisor', 'admin')
  limit 1;
  if v_p.id is null then return jsonb_build_object('ok', false, 'message', 'Supervisor no encontrado'); end if;
  select override_pin_hash into v_hash from public.profile_credentials where profile_id = v_p.id;
  if v_hash is null then return jsonb_build_object('ok', false, 'message', 'Supervisor sin PIN de autorización'); end if;
  if crypt(p_pin, v_hash) = v_hash then
    return jsonb_build_object('ok', true, 'profile_id', v_p.id, 'role', v_p.role,
      'site_id', v_p.site_id, 'full_name', v_p.full_name);
  end if;
  return jsonb_build_object('ok', false, 'message', 'PIN de supervisor incorrecto');
end $function$;

create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new) - 'pin_hash' - 'override_pin_hash' - 'public_key' - 'key_hash' - 'token_hash';
    insert into public.audit_log(actor_id, actor_role, action, entity, entity_id, new_data)
    values (v_actor, v_role, 'insert', tg_table_name, coalesce((v_new->>'id'), ''), v_new);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old) - 'pin_hash' - 'override_pin_hash' - 'public_key' - 'key_hash' - 'token_hash';
    v_new := to_jsonb(new) - 'pin_hash' - 'override_pin_hash' - 'public_key' - 'key_hash' - 'token_hash';
    insert into public.audit_log(actor_id, actor_role, action, entity, entity_id, old_data, new_data)
    values (v_actor, v_role, 'update', tg_table_name, coalesce((v_new->>'id'), ''), v_old, v_new);
    return new;
  else
    v_old := to_jsonb(old) - 'pin_hash' - 'override_pin_hash' - 'public_key' - 'key_hash' - 'token_hash';
    insert into public.audit_log(actor_id, actor_role, action, entity, entity_id, old_data)
    values (v_actor, v_role, 'delete', tg_table_name, coalesce((v_old->>'id'), ''), v_old);
    return old;
  end if;
end $function$;

grant execute on function public.set_employee_pin(uuid, text) to authenticated, service_role;
revoke execute on function public.set_employee_pin(uuid, text) from public, anon;
revoke execute on function public.verify_employee_pin(text, text) from public, anon, authenticated;
revoke execute on function public.verify_supervisor_pin(text, text) from public, anon, authenticated;
revoke execute on function public.fn_audit_row() from public, anon, authenticated;

alter table public.employees drop column if exists pin_hash;
alter table public.profiles drop column if exists override_pin_hash;

update storage.buckets set public = false where id = 'employee-photos';

drop policy if exists employee_photos_read on storage.objects;
create policy employee_photos_read on storage.objects
for select to authenticated
using (
  bucket_id = 'employee-photos' and (
    public.can_read_all_people()
    or exists (
      select 1 from public.employees e
      where e.id::text = (storage.foldername(name))[1]
        and (e.user_id = (select auth.uid()) or public.can_read_site(e.site_id))
    )
  )
);

drop policy if exists employee_photos_insert on storage.objects;
create policy employee_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'employee-photos'
  and public.can_manage_people()
  and exists (
    select 1 from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists employee_photos_update on storage.objects;
create policy employee_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'employee-photos'
  and public.can_manage_people()
  and exists (
    select 1 from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'employee-photos'
  and public.can_manage_people()
  and exists (
    select 1 from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists employee_photos_delete on storage.objects;
create policy employee_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'employee-photos'
  and public.can_manage_people()
  and exists (
    select 1 from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);
