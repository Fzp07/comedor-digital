-- 016: retención automática de datos operativos.
-- No toca audit_log: la auditoría es inmutable y se conserva.

create extension if not exists pg_cron;

create or replace function public.purge_operational_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nonces int := 0;
  v_rates int := 0;
  v_sync int := 0;
  v_sessions int := 0;
begin
  delete from public.qr_nonces where expires_at < now() - interval '7 days';
  get diagnostics v_nonces = row_count;

  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rates = row_count;

  delete from public.sync_batches where created_at < now() - interval '90 days';
  get diagnostics v_sync = row_count;

  delete from public.sessions
  where last_seen_at < now() - interval '90 days'
     or (revoked_at is not null and revoked_at < now() - interval '30 days');
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'qr_nonces', v_nonces,
    'rate_limits', v_rates,
    'sync_batches', v_sync,
    'sessions', v_sessions,
    'purged_at', now()
  );
end $function$;

revoke all on function public.purge_operational_data() from public, anon, authenticated;
grant execute on function public.purge_operational_data() to service_role;

select cron.schedule(
  'purge-operational-data',
  '15 8 * * *',
  $job$select public.purge_operational_data();$job$
);
