// =====================================================
// Phân tích biến động lãi suất tuần
// So sánh dữ liệu giữa 2 ngày để phát hiện thay đổi
// =====================================================

import { supabase } from './supabase';
import { VALID_TERMS, TERM_SHORT } from './termMapping';

// Types
export interface RateChange {
  bank_id: number;
  bank_name: string;
  bank_code: string;
  group_type: string;
  term_code: string;
  old_rate: number | null;
  new_rate: number | null;
  change: number;  // new - old
  direction: 'up' | 'down' | 'unchanged';
}

export interface BankSummary {
  bank_id: number;
  bank_name: string;
  bank_code: string;
  group_type: string;
  changes: RateChange[];
  direction: 'up' | 'down' | 'mixed' | 'unchanged';
  avg_change: number;
  terms_up: number;
  terms_down: number;
  terms_unchanged: number;
  max_change: number;
  min_change: number;
  change_description: string;  // VD: "tang 0,2-0,3%/nam tai cac ky han tu 6T tro len"
}

export interface WeeklyComparison {
  date_start: string;
  date_end: string;
  total_banks: number;
  banks_up: BankSummary[];
  banks_down: BankSummary[];
  banks_unchanged: BankSummary[];
  banks_mixed: BankSummary[];
  nn_summary: GroupSummary;
  cp_summary: GroupSummary;
  all_changes: RateChange[];
}

export interface GroupSummary {
  group_label: string;
  total: number;
  up: number;
  down: number;
  unchanged: number;
  avg_12m_start: number | null;
  avg_12m_end: number | null;
  avg_12m_change: number | null;
}

// =====================================================
// Hàm lấy dữ liệu và so sánh
// =====================================================
export async function compareWeeklyRates(
  dateStart: string,
  dateEnd: string,
  customerType: string = 'CN'
): Promise<WeeklyComparison | null> {
  // Lấy danh sách ngân hàng
  const { data: banks } = await supabase
    .from('banks')
    .select('id, code, name, group_type')
    .eq('is_active', true)
    .order('id');

  if (!banks) return null;

  // Lấy lãi suất ngày đầu tuần
  const { data: ratesStart } = await supabase
    .from('deposit_rates')
    .select('*')
    .eq('report_date', dateStart)
    .eq('customer_type', customerType)
    .eq('rate_type', 'standard');

  // Lấy lãi suất ngày cuối tuần
  const { data: ratesEnd } = await supabase
    .from('deposit_rates')
    .select('*')
    .eq('report_date', dateEnd)
    .eq('customer_type', customerType)
    .eq('rate_type', 'standard');

  if (!ratesStart || !ratesEnd) return null;

  const allChanges: RateChange[] = [];
  const bankSummaries: BankSummary[] = [];

  for (const bank of banks) {
    const changes: RateChange[] = [];

    for (const term of VALID_TERMS) {
      const rStart = ratesStart.find(r => r.bank_id === bank.id && r.term_code === term);
      const rEnd = ratesEnd.find(r => r.bank_id === bank.id && r.term_code === term);

      const oldRate = rStart?.rate_max ?? null;
      const newRate = rEnd?.rate_max ?? null;

      // Chỉ tính biến động khi cả 2 ngày đều có dữ liệu
      if (oldRate !== null && newRate !== null) {
        const change = Math.round((newRate - oldRate) * 100) / 100;
        const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';

        const rc: RateChange = {
          bank_id: bank.id,
          bank_name: bank.name,
          bank_code: bank.code,
          group_type: bank.group_type,
          term_code: term,
          old_rate: oldRate,
          new_rate: newRate,
          change,
          direction,
        };

        changes.push(rc);
        if (change !== 0) allChanges.push(rc);
      }
    }

    // Tổng hợp cho ngân hàng
    const termsUp = changes.filter(c => c.direction === 'up').length;
    const termsDown = changes.filter(c => c.direction === 'down').length;
    const termsUnchanged = changes.filter(c => c.direction === 'unchanged').length;

    const changesNonZero = changes.filter(c => c.change !== 0);
    const avgChange = changesNonZero.length > 0
      ? Math.round(changesNonZero.reduce((s, c) => s + c.change, 0) / changesNonZero.length * 100) / 100
      : 0;

    const maxChange = changesNonZero.length > 0 ? Math.max(...changesNonZero.map(c => c.change)) : 0;
    const minChange = changesNonZero.length > 0 ? Math.min(...changesNonZero.map(c => c.change)) : 0;

    let direction: BankSummary['direction'] = 'unchanged';
    if (termsUp > 0 && termsDown === 0) direction = 'up';
    else if (termsDown > 0 && termsUp === 0) direction = 'down';
    else if (termsUp > 0 && termsDown > 0) direction = 'mixed';

    // Sinh mô tả biến động
    const changeDesc = generateChangeDescription(changes, bank.name);

    bankSummaries.push({
      bank_id: bank.id,
      bank_name: bank.name,
      bank_code: bank.code,
      group_type: bank.group_type,
      changes,
      direction,
      avg_change: avgChange,
      terms_up: termsUp,
      terms_down: termsDown,
      terms_unchanged: termsUnchanged,
      max_change: maxChange,
      min_change: minChange,
      change_description: changeDesc,
    });
  }

  // Phân nhóm
  const banksUp = bankSummaries.filter(b => b.direction === 'up');
  const banksDown = bankSummaries.filter(b => b.direction === 'down');
  const banksMixed = bankSummaries.filter(b => b.direction === 'mixed');
  const banksUnchanged = bankSummaries.filter(b => b.direction === 'unchanged');

  // Tính trung bình 12T theo nhóm
  const nnBanks = bankSummaries.filter(b => b.group_type === 'NHTMNN');
  const cpBanks = bankSummaries.filter(b => b.group_type !== 'NHTMNN');

  function groupAvg12M(group: BankSummary[], field: 'old_rate' | 'new_rate'): number | null {
    const rates = group
      .map(b => b.changes.find(c => c.term_code === '12M'))
      .filter(c => c && c[field] !== null)
      .map(c => c![field]!);
    return rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length * 100) / 100 : null;
  }

  const nnAvgStart = groupAvg12M(nnBanks, 'old_rate');
  const nnAvgEnd = groupAvg12M(nnBanks, 'new_rate');
  const cpAvgStart = groupAvg12M(cpBanks, 'old_rate');
  const cpAvgEnd = groupAvg12M(cpBanks, 'new_rate');

  return {
    date_start: dateStart,
    date_end: dateEnd,
    total_banks: banks.length,
    banks_up: banksUp,
    banks_down: banksDown,
    banks_unchanged: banksUnchanged,
    banks_mixed: banksMixed,
    nn_summary: {
      group_label: 'Khoi NHTMNN',
      total: nnBanks.length,
      up: nnBanks.filter(b => b.direction === 'up').length,
      down: nnBanks.filter(b => b.direction === 'down').length,
      unchanged: nnBanks.filter(b => b.direction === 'unchanged').length,
      avg_12m_start: nnAvgStart,
      avg_12m_end: nnAvgEnd,
      avg_12m_change: nnAvgStart && nnAvgEnd ? Math.round((nnAvgEnd - nnAvgStart) * 100) / 100 : null,
    },
    cp_summary: {
      group_label: 'Khoi NHTMCP',
      total: cpBanks.length,
      up: cpBanks.filter(b => b.direction === 'up').length,
      down: cpBanks.filter(b => b.direction === 'down').length,
      unchanged: cpBanks.filter(b => b.direction === 'unchanged').length,
      avg_12m_start: cpAvgStart,
      avg_12m_end: cpAvgEnd,
      avg_12m_change: cpAvgStart && cpAvgEnd ? Math.round((cpAvgEnd - cpAvgStart) * 100) / 100 : null,
    },
    all_changes: allChanges,
  };
}

// =====================================================
// Sinh mô tả biến động cho từng ngân hàng
// =====================================================
function generateChangeDescription(changes: RateChange[], bankName: string): string {
  const ups = changes.filter(c => c.direction === 'up');
  const downs = changes.filter(c => c.direction === 'down');

  if (ups.length === 0 && downs.length === 0) return 'Khong thay doi';

  const parts: string[] = [];

  if (ups.length > 0) {
    const minUp = Math.min(...ups.map(c => c.change));
    const maxUp = Math.max(...ups.map(c => c.change));
    const terms = ups.map(c => TERM_SHORT[c.term_code]).join(', ');
    const rangeStr = minUp === maxUp ? `${fmtNum(maxUp)}%/nam` : `${fmtNum(minUp)}-${fmtNum(maxUp)}%/nam`;
    parts.push(`tang ${rangeStr} tai cac ky han ${terms}`);
  }

  if (downs.length > 0) {
    const minDown = Math.min(...downs.map(c => Math.abs(c.change)));
    const maxDown = Math.max(...downs.map(c => Math.abs(c.change)));
    const terms = downs.map(c => TERM_SHORT[c.term_code]).join(', ');
    const rangeStr = minDown === maxDown ? `${fmtNum(maxDown)}%/nam` : `${fmtNum(minDown)}-${fmtNum(maxDown)}%/nam`;
    parts.push(`giam ${rangeStr} tai cac ky han ${terms}`);
  }

  return parts.join('; ');
}

function fmtNum(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

// =====================================================
// Sinh nhận xét tự động cho báo cáo tuần (#15)
// =====================================================
export function generateWeeklyCommentary(comparison: WeeklyComparison): {
  deposit_summary: string;
  nn_commentary: string;
  cp_commentary: string;
} {
  const { banks_up, banks_down, banks_mixed, banks_unchanged, nn_summary, cp_summary, total_banks } = comparison;

  const totalChanged = banks_up.length + banks_down.length + banks_mixed.length;
  const totalSurveyed = total_banks;

  // --- NHTMNN commentary ---
  let nnText = '';
  const nnChangedBanks = [...banks_up, ...banks_down, ...banks_mixed].filter(b => b.group_type === 'NHTMNN');
  if (nnChangedBanks.length === 0) {
    nnText = '+ Lai suat huy dong (LSHD): Trong tuan qua, mat bang lai suat niem yet duoc duy tri on dinh, chua ghi nhan su dieu chinh.';
  } else {
    const details = nnChangedBanks.map(b => `${b.bank_name} dieu chinh ${b.change_description}`).join('; ');
    nnText = `+ Lai suat huy dong (LSHD): Trong tuan qua, co ${nnChangedBanks.length}/${nn_summary.total} NHTMNN dieu chinh lai suat: ${details}.`;
  }

  if (nn_summary.avg_12m_end !== null) {
    nnText += ` Lai suat BQ 12T nhom NHTMNN o muc ${fmtNum(nn_summary.avg_12m_end)}%/nam.`;
  }

  // --- NHTMCP commentary ---
  let cpText = '';
  const cpChangedBanks = [...banks_up, ...banks_down, ...banks_mixed].filter(b => b.group_type !== 'NHTMNN');
  const cpUp = cpChangedBanks.filter(b => b.direction === 'up' || b.direction === 'mixed');
  const cpDown = cpChangedBanks.filter(b => b.direction === 'down' || b.direction === 'mixed');

  if (cpChangedBanks.length === 0) {
    cpText = `Trong tuan qua, cac NHTMCP khao sat giu nguyen lai suat huy dong.`;
  } else {
    const parts: string[] = [];
    parts.push(`Trong tuan qua co ${cpChangedBanks.length}/${cp_summary.total} NHTMCP khao sat dieu chinh lai suat huy dong von`);

    for (const b of cpChangedBanks.slice(0, 5)) {
      parts.push(`(${b.bank_name} ${b.change_description})`);
    }

    cpText = parts.join(' ');

    if (cp_summary.avg_12m_end !== null && nn_summary.avg_12m_end !== null) {
      const diff = Math.round((cp_summary.avg_12m_end - nn_summary.avg_12m_end) * 100) / 100;
      if (diff > 0) {
        cpText += `. LSNY khach hang thong thuong cua khoi NHTMCP cao hon khoi NHTMNN khoang ${fmtNum(diff)}%.`;
      }
    }
  }

  // --- Overall summary ---
  let depositSummary = '';
  if (totalChanged === 0) {
    depositSummary = `Trong tuan qua, mat bang lai suat huy dong duoc duy tri on dinh, khong ghi nhan su dieu chinh tai ${totalSurveyed} ngan hang khao sat.`;
  } else {
    depositSummary = `Trong tuan qua, co ${totalChanged}/${totalSurveyed} ngan hang dieu chinh lai suat huy dong`;
    if (banks_up.length > 0) depositSummary += `, ${banks_up.length} NH tang`;
    if (banks_down.length > 0) depositSummary += `, ${banks_down.length} NH giam`;
    if (banks_mixed.length > 0) depositSummary += `, ${banks_mixed.length} NH dieu chinh hon hop`;
    depositSummary += '.';
  }

  return {
    deposit_summary: depositSummary,
    nn_commentary: nnText,
    cp_commentary: cpText,
  };
}

// =====================================================
// Lấy danh sách ngày có dữ liệu
// =====================================================
export async function getAvailableDates(limit: number = 30): Promise<string[]> {
  const { data } = await supabase
    .from('deposit_rates')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(limit * 20);

  if (!data) return [];
  return [...new Set(data.map(d => d.report_date))].slice(0, limit);
}
