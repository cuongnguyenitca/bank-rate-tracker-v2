// =====================================================
// Kiểm soát chất lượng dữ liệu lãi suất
// Phát hiện bất thường, thiếu dữ liệu, lỗi logic
// =====================================================

import { supabase } from './supabase';
import { VALID_TERMS } from './termMapping';

export interface DataAlert {
  id: string;
  level: 'error' | 'warning' | 'info';
  type: string;
  bank_name: string;
  bank_code: string;
  term_code?: string;
  message: string;
  detail?: string;
  date: string;
}

// =====================================================
// Chạy toàn bộ kiểm tra
// =====================================================
export async function runDataQualityChecks(reportDate: string): Promise<DataAlert[]> {
  const alerts: DataAlert[] = [];

  // Lấy dữ liệu
  const { data: banks } = await supabase
    .from('banks').select('id, code, name, group_type').eq('is_active', true).order('id');
  const { data: rates } = await supabase
    .from('deposit_rates').select('*').eq('report_date', reportDate).eq('customer_type', 'CN').eq('rate_type', 'standard');

  if (!banks || !rates) {
    alerts.push({ id: 'no-data', level: 'error', type: 'system', bank_name: '', bank_code: '', message: 'Khong lay duoc du lieu tu database', date: reportDate });
    return alerts;
  }

  // Lấy dữ liệu ngày trước để so sánh
  const { data: dateList } = await supabase
    .from('deposit_rates').select('report_date')
    .lt('report_date', reportDate).order('report_date', { ascending: false }).limit(50);
  const prevDates = dateList ? [...new Set(dateList.map(d => d.report_date))] : [];
  const prevDate = prevDates.length > 0 ? prevDates[0] : null;

  let prevRates: any[] = [];
  if (prevDate) {
    const { data } = await supabase
      .from('deposit_rates').select('*').eq('report_date', prevDate).eq('customer_type', 'CN').eq('rate_type', 'standard');
    prevRates = data || [];
  }

  let alertIdx = 0;
  function addAlert(level: DataAlert['level'], type: string, bankName: string, bankCode: string, message: string, termCode?: string, detail?: string) {
    alerts.push({ id: `alert-${alertIdx++}`, level, type, bank_name: bankName, bank_code: bankCode, term_code: termCode, message, detail, date: reportDate });
  }

  // =====================================================
  // CHECK 1: Ngân hàng thiếu dữ liệu
  // =====================================================
  for (const bank of banks) {
    const bankRates = rates.filter(r => r.bank_id === bank.id);
    if (bankRates.length === 0) {
      addAlert('warning', 'missing_bank', bank.name, bank.code,
        `${bank.name}: Khong co du lieu ngay ${reportDate}`,
        undefined, 'Kiem tra scraper hoac website ngan hang');
    } else if (bankRates.length < 5) {
      addAlert('info', 'few_terms', bank.name, bank.code,
        `${bank.name}: Chi co ${bankRates.length} ky han (binh thuong 7-9)`,
        undefined, 'Co the website ngan hang thieu mot so ky han');
    }
  }

  // =====================================================
  // CHECK 2: Lãi suất vượt ngưỡng bất thường
  // =====================================================
  for (const rate of rates) {
    const bank = banks.find(b => b.id === rate.bank_id);
    if (!bank) continue;

    const val = rate.rate_max ?? rate.rate_min;
    if (val === null) continue;

    // LS tiền gửi thông thường: 0-15%/năm
    if (val > 12) {
      addAlert('error', 'rate_too_high', bank.name, bank.code,
        `${bank.name} ${rate.term_code}: LS = ${val}% vuot nguong 12%`,
        rate.term_code, 'Kiem tra lai du lieu nguon');
    }
    if (val < 0) {
      addAlert('error', 'rate_negative', bank.name, bank.code,
        `${bank.name} ${rate.term_code}: LS = ${val}% (am)`,
        rate.term_code, 'Du lieu khong hop le');
    }

    // LS KKH thường < 1%
    if (rate.term_code === 'KKH' && val > 2) {
      addAlert('warning', 'kkh_high', bank.name, bank.code,
        `${bank.name} KKH: LS = ${val}% (thong thuong < 1%)`,
        'KKH', 'Kiem tra lai');
    }
  }

  // =====================================================
  // CHECK 3: Biến động bất thường so với ngày trước
  // =====================================================
  if (prevDate && prevRates.length > 0) {
    for (const rate of rates) {
      const bank = banks.find(b => b.id === rate.bank_id);
      if (!bank) continue;

      const prev = prevRates.find(p => p.bank_id === rate.bank_id && p.term_code === rate.term_code);
      if (!prev) continue;

      const newVal = rate.rate_max ?? rate.rate_min;
      const oldVal = prev.rate_max ?? prev.rate_min;
      if (newVal === null || oldVal === null) continue;

      const change = Math.abs(newVal - oldVal);

      // Thay đổi > 2% trong 1 ngày là bất thường
      if (change > 2) {
        addAlert('error', 'sudden_change', bank.name, bank.code,
          `${bank.name} ${rate.term_code}: Thay doi ${change > 0 ? '+' : ''}${(newVal - oldVal).toFixed(2)}% trong 1 ngay`,
          rate.term_code, `Truoc: ${oldVal}%, Sau: ${newVal}%`);
      }
      // Thay đổi > 1% cần chú ý
      else if (change > 1) {
        addAlert('warning', 'large_change', bank.name, bank.code,
          `${bank.name} ${rate.term_code}: Thay doi ${(newVal - oldVal).toFixed(2)}% so voi ngay truoc`,
          rate.term_code, `Truoc: ${oldVal}%, Sau: ${newVal}%`);
      }
    }
  }

  // =====================================================
  // CHECK 4: Kỳ hạn dài lãi suất thấp hơn kỳ hạn ngắn
  // =====================================================
  const termOrder = ['KKH', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'];
  for (const bank of banks) {
    const bankRates = rates.filter(r => r.bank_id === bank.id);
    if (bankRates.length < 2) continue;

    for (let i = 0; i < termOrder.length - 1; i++) {
      const short = bankRates.find(r => r.term_code === termOrder[i]);
      const long = bankRates.find(r => r.term_code === termOrder[i + 1]);
      if (!short || !long) continue;

      const shortVal = short.rate_max ?? short.rate_min;
      const longVal = long.rate_max ?? long.rate_min;
      if (shortVal === null || longVal === null) continue;

      // KKH thường thấp hơn nhiều, bỏ qua
      if (termOrder[i] === 'KKH') continue;

      // Kỳ hạn dài mà thấp hơn kỳ hạn ngắn > 0.5%
      if (shortVal - longVal > 0.5) {
        addAlert('warning', 'inverted_curve', bank.name, bank.code,
          `${bank.name}: ${termOrder[i]}(${shortVal}%) > ${termOrder[i+1]}(${longVal}%)`,
          termOrder[i+1], 'Ky han dai thap hon ky han ngan — kiem tra lai');
      }
    }
  }

  // =====================================================
  // CHECK 5: Min > Max
  // =====================================================
  for (const rate of rates) {
    const bank = banks.find(b => b.id === rate.bank_id);
    if (!bank) continue;

    if (rate.rate_min !== null && rate.rate_max !== null && rate.rate_min > rate.rate_max) {
      addAlert('error', 'min_gt_max', bank.name, bank.code,
        `${bank.name} ${rate.term_code}: Min(${rate.rate_min}%) > Max(${rate.rate_max}%)`,
        rate.term_code, 'Du lieu nguon co the bi dao nguoc');
    }
  }

  // Sắp xếp: error trước, warning sau, info cuối
  const levelOrder = { error: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return alerts;
}
