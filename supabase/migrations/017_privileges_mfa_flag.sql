-- 017: mínimo privilegio sobre tablas sensibles y política de MFA.

revoke all on public.app_secrets from public, anon, authenticated;
revoke all on public.qr_nonces from public, anon, authenticated;
revoke all on public.rate_limits from public, anon, authenticated;
revoke all on public.employee_credentials from public, anon, authenticated;
revoke all on public.profile_credentials from public, anon, authenticated;

grant all on public.app_secrets to service_role;
grant all on public.qr_nonces to service_role;
grant all on public.rate_limits to service_role;
grant all on public.employee_credentials to service_role;
grant all on public.profile_credentials to service_role;

alter table public.company_settings
  add column if not exists require_mfa boolean not null default false;

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
  select role into v_role from public.profiles where id = v_actor;
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

revoke execute on function public.fn_audit_row() from public, anon, authenticated;
