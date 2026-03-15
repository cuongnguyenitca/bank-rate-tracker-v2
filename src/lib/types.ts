export interface Bank {
  id: number;
  code: string;
  name: string;
  full_name: string | null;
  group_type: 'NHTMNN' | 'NHTMCP_LON' | 'NHTMCP_TB';
  website_url: string | null;
  rate_page_url: string | null;
  is_active: boolean;
}

export interface DepositRate {
  id: number;
  bank_id: number;
  report_date: string;
  customer_type: 'CN' | 'TCKT';
  term_code: string;
  rate_min: number | null;
  rate_max: number | null;
  rate_type: 'standard' | 'policy' | 'online' | 'vip' | 'promotional';
  source: 'cafef' | 'manual';
  product_name: string | null;
  channel: 'counter' | 'online';
  min_deposit: number | null;
  is_promotional: boolean;
  effective_date: string | null;
  note: string | null;
}

export interface LendingRateAvg {
  id: number;
  bank_id: number;
  report_month: string;
  avg_rate_all: number | null;
  avg_rate_personal: number | null;
  avg_rate_corporate: number | null;
  avg_deposit_rate: number | null;
}

export interface LendingRateProduct {
  id: number;
  bank_id: number;
  report_date: string;
  loan_type: string;
  fixed_period: string | null;
  rate_min: number | null;
  rate_max: number | null;
  note: string | null;
}

export interface WeeklyReport {
  id: number;
  report_date: string;
  week_start: string;
  week_end: string;
  deposit_summary: string | null;
  lending_summary: string | null;
  forecast: string | null;
}

export const TERM_CODES = ['KKH', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'] as const;

export const TERM_LABELS: Record<string, string> = {
  'KKH': 'KKH',
  '1M': '1 tháng',
  '3M': '3 tháng',
  '6M': '6 tháng',
  '9M': '9 tháng',
  '12M': '12 tháng',
  '18M': '18 tháng',
  '24M': '24 tháng',
  '36M': '36 tháng',
};

export const GROUP_LABELS: Record<string, string> = {
  'NHTMNN': 'Nhóm NHTM Nhà nước',
  'NHTMCP_LON': 'Nhóm NHTMCP lớn',
  'NHTMCP_TB': 'Nhóm NHTMCP trung bình',
};
