-- 015: evitar la re-evaluación de auth.uid() por fila (auth_rls_initplan).

alter policy biometric_insert on public.biometric_credentials
with check (
  exists (
    select 1 from public.employees e
    where e.id = biometric_credentials.employee_id and e.user_id = (select auth.uid())
  )
);

alter policy biometric_select on public.biometric_credentials
using (
  public.is_admin() or exists (
    select 1 from public.employees e
    where e.id = biometric_credentials.employee_id and e.user_id = (select auth.uid())
  )
);

alter policy biometric_update on public.biometric_credentials
using (
  public.is_admin() or exists (
    select 1 from public.employees e
    where e.id = biometric_credentials.employee_id and e.user_id = (select auth.uid())
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.employees e
    where e.id = biometric_credentials.employee_id and e.user_id = (select auth.uid())
  )
);

alter policy consents_select on public.consents
using (
  public.can_read_all_people() or exists (
    select 1 from public.employees e
    where e.id = consents.employee_id and e.user_id = (select auth.uid())
  )
);

alter policy employee_plans_select on public.employee_plans
using (
  exists (
    select 1 from public.employees e
    where e.id = employee_plans.employee_id and e.user_id = (select auth.uid())
  )
  or public.can_read_site(site_id)
);

alter policy employees_select on public.employees
using (
  user_id = (select auth.uid()) or public.can_read_site(site_id)
);

alter policy notifications_select on public.notifications
using (user_id = (select auth.uid()));

alter policy notifications_update on public.notifications
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy profiles_select on public.profiles
using (
  id = (select auth.uid())
  or public.can_read_all_people()
  or (public.current_app_role() = 'supervisor'::public.app_role and site_id = public.current_app_site())
);

alter policy profiles_update_self on public.profiles
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

alter policy redemptions_select on public.redemptions
using (
  exists (
    select 1 from public.employees e
    where e.id = redemptions.employee_id and e.user_id = (select auth.uid())
  )
  or public.can_read_site(site_id)
);

alter policy report_exports_insert on public.report_exports
with check (user_id = (select auth.uid()));

alter policy report_exports_select on public.report_exports
using (
  user_id = (select auth.uid())
  or public.current_app_role() = any (array['admin'::public.app_role, 'auditor'::public.app_role])
);

alter policy sessions_self on public.sessions
using (user_id = (select auth.uid()) or public.is_admin());

alter policy sync_batches_read on public.sync_batches
using (
  operator_id = (select auth.uid())
  or public.current_app_role() = 'admin'::public.app_role
);

alter policy ticket_events_select on public.ticket_events
using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_events.ticket_id
      and (
        public.can_read_site(t.site_id)
        or exists (
          select 1 from public.employees e
          where e.id = t.employee_id and e.user_id = (select auth.uid())
        )
      )
  )
);

alter policy tickets_select on public.tickets
using (
  exists (
    select 1 from public.employees e
    where e.id = tickets.employee_id and e.user_id = (select auth.uid())
  )
  or public.can_read_site(site_id)
);
