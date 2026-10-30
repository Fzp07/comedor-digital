export type AppRole = "admin" | "rrhh" | "operador" | "supervisor" | "auditor" | "empleado";

export type EmployeeStatus = "activo" | "suspendido" | "retirado";
export type MealType = "almuerzo" | "merienda";
export type TicketStatus = "emitido" | "disponible" | "usado" | "vencido" | "anulado";
export type RedemptionMethod = "qr" | "huella" | "pin" | "carnet" | "manual";
export type RedemptionStatus = "valido" | "compensado";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  site_id: string | null;
  phone: string | null;
  active: boolean;
  mfa_enrolled: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface CompanySettings {
  id: boolean;
  company_name: string;
  nit: string | null;
  logo_url: string | null;
  primary_color: string;
  timezone: string;
  currency: string;
  locale: string;
  ticket_validity_minutes: number;
  qr_ttl_seconds: number;
  allow_offline: boolean;
  offline_grace_minutes: number;
  max_overrides_per_day: number;
  support_email: string | null;
  privacy_url: string | null;
  report_enabled: boolean;
  report_recipients: string[];
  report_schedule: string;
  report_hour: string;
  require_device: boolean;
}

export interface Site {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  manager_name: string | null;
  active: boolean;
}

export interface CostCenter {
  id: string;
  site_id: string | null;
  name: string;
  code: string;
  active: boolean;
}

export interface Employee {
  id: string;
  user_id: string | null;
  code: string;
  document_type: string;
  document_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  site_id: string;
  cost_center_id: string | null;
  photo_url: string | null;
  status: EmployeeStatus;
  hire_date: string | null;
  exit_date: string | null;
  biometric_enrolled: boolean;
  consent_data: boolean;
  consent_biometric: boolean;
  notes: string | null;
  created_at: string;
  site_name?: string;
  cost_center_name?: string;
  plans?: string | null;
}

export interface MealPlan {
  id: string;
  name: string;
  description: string | null;
  meal_type: MealType;
  meals_per_day: number;
  days_allowed: number[];
  valid_from: string | null;
  valid_to: string | null;
  price_cop: number;
  active: boolean;
}

export interface EmployeePlan {
  id: string;
  employee_id: string;
  plan_id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

export interface ServiceWindow {
  id: string;
  site_id: string;
  meal_type: MealType;
  name: string;
  start_time: string;
  end_time: string;
  days_allowed: number[];
  active: boolean;
}

export interface Ticket {
  id: string;
  code: string;
  batch_id: string | null;
  employee_id: string;
  plan_id: string | null;
  site_id: string;
  meal_type: MealType;
  service_date: string;
  status: TicketStatus;
  valid_from: string;
  valid_to: string;
  used_at: string | null;
  created_at: string;
  employees?: { full_name: string; code: string; photo_url: string | null };
  sites?: { name: string };
}

export interface Redemption {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  photo_url?: string | null;
  site_id: string;
  site_name?: string;
  cost_center_name?: string | null;
  meal_type: MealType;
  method: RedemptionMethod;
  status: RedemptionStatus;
  operator_id: string | null;
  operator_name?: string | null;
  redemption_date: string;
  redeemed_at: string;
  offline: boolean;
  ticket_code?: string | null;
  override_id?: string | null;
  notes?: string | null;
}

export interface DashboardData {
  today: string;
  employees_active: number;
  redemptions_today: number;
  tickets_available: number;
  tickets_used_today: number;
  alerts: number;
  sites: Array<{
    id: string;
    name: string;
    employees: number;
    redemptions_today: number;
    tickets_available: number;
  }>;
  ticket_status: Record<string, number>;
  recent: Array<{
    id: string;
    redeemed_at: string;
    employee: string;
    code: string;
    photo_url: string | null;
    site: string;
    meal_type: MealType;
    method: RedemptionMethod;
    offline: boolean;
  }>;
}

export interface WalletPlan {
  id: string;
  name: string;
  meal_type: MealType;
  meals_per_day: number;
  days_allowed: number[];
  used_today: number;
}

export interface WalletTicket {
  id: string;
  code: string;
  meal_type: MealType;
  service_date: string;
  status: TicketStatus;
  valid_from: string;
  valid_to: string;
  used_at: string | null;
}

export interface EmployeeWallet {
  linked: boolean;
  employee?: {
    id: string;
    code: string;
    full_name: string;
    photo_url: string | null;
    status: EmployeeStatus;
    site_id: string;
    site_name: string;
    cost_center: string | null;
    biometric_enrolled: boolean;
  };
  plans?: WalletPlan[];
  tickets?: WalletTicket[];
  history?: Array<{
    id: string;
    redeemed_at: string;
    redemption_date: string;
    meal_type: MealType;
    method: RedemptionMethod;
    status: RedemptionStatus;
    site: string;
    ticket_code: string | null;
  }>;
  windows?: Array<{
    name: string;
    meal_type: MealType;
    start_time: string;
    end_time: string;
    days_allowed: number[];
  }>;
}

export interface Device {
  id: string;
  name: string;
  site_id: string;
  status: "activo" | "revocado";
  last_seen_at: string | null;
  created_at: string;
  sites?: { name: string };
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_role: AppRole | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null };
}

export interface SecurityEvent {
  id: number;
  event_type: string;
  severity: "info" | "warning" | "critical";
  user_id: string | null;
  employee_id: string | null;
  site_id: string | null;
  details: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export interface KitchenSummary {
  id: string;
  site_id: string;
  site_name: string;
  reconciliation_date: string;
  meal_type: MealType;
  meals_prepared: number;
  meals_served: number;
  difference: number;
  notes: string | null;
}

export interface DailySummary {
  redemption_date: string;
  site_id: string;
  site_name: string;
  meal_type: MealType;
  total: number;
  employees: number;
  offline_total: number;
  overrides: number;
}

export interface CostCenterSummary {
  redemption_date: string;
  cost_center_id: string | null;
  cost_center_name: string;
  meal_type: MealType;
  total: number;
}

export interface TicketSummary {
  service_date: string;
  site_id: string;
  site_name: string;
  meal_type: MealType;
  status: TicketStatus;
  total: number;
}

export interface QrTokenResponse {
  token: string;
  expires_at: string;
  ttl_seconds: number;
  meal_type: MealType;
  employee: {
    id: string;
    full_name: string;
    code: string;
    photo_url: string | null;
    site_name: string;
  };
}

export interface ValidationResult {
  ok: boolean;
  duplicate?: boolean;
  message?: string;
  redemption_id?: string;
  ticket_code?: string;
  employee?: {
    id: string;
    code: string;
    full_name: string;
    photo_url: string | null;
    position: string | null;
  };
  site?: string;
  meal_type?: MealType;
  method?: RedemptionMethod;
  offline?: boolean;
  override?: boolean;
  plan?: string;
  remaining_today?: number;
  redeemed_at?: string;
}
