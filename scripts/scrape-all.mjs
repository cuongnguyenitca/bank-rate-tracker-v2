// =====================================================================
// THU THẬP LÃI SUẤT TỰ ĐỘNG (v5) - TẤT CẢ NGÂN HÀNG
// Nguồn: CafeF JSON API (chính xác, ổn định, không cần trình duyệt)
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ CẤU HÌNH ============
const CAFEF_JSON_URL = 'https://cafefnew.mediacdn.vn/Images/Uploaded/DuLieuDownload/Liveboard/all_banks_interest_rates.json';

const VALID_TERMS = ['KKH', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'];

// Mapping "time" trong JSON CafeF -> term code trong DB
const TIME_TO_TERM = {
  '0T': 'KKH',
  '1T': '1M',
  '2T': '2M',
  '3T': '3M',
  '6T': '6M',
  '9T': '9M',
  '12T': '12M',
  '13T': '13M',
  '18T': '18M',
  '24T': '24M',
  '36T': '36M',
};

// Mapping "symbol" trong JSON CafeF -> code trong DB
const SYMBOL_TO_CODE = {
  'MBB': 'MBB',
  'VCB': 'VCB',
  'BID': 'BIDV',
  'BIDV': 'BIDV',
  'CTG': 'CTG',
  'ACB': 'ACB',
  'TCB': 'TCB',
  'STB': 'STB',
  'SHB': 'SHB',
  'VPB': 'VPB',
  'LPB': 'LPB',
  'MSB': 'MSB',
  'EIB': 'EIB',
  'VIB': 'VIB',
  'ABB': 'ABB',
  'HDB': 'HDB',
  'SSB': 'SSB',
};

// Mapping ten ngan hang (lowercase) -> code
const NAME_TO_CODE = {
  'agribank': 'AGR',
  'bidv': 'BIDV',
  'vietcombank': 'VCB',
  'vietinbank': 'CTG',
  'acb': 'ACB',
  'techcombank': 'TCB',
  'sacombank': 'STB',
  'shb': 'SHB',
  'vpbank': 'VPB',
  'mb bank': 'MBB',
  'mbbank': 'MBB',
  'lpbank': 'LPB',
  'lienvietpostbank': 'LPB',
  'msb': 'MSB',
  'eximbank': 'EIB',
  'vib': 'VIB',
  'abbank': 'ABB',
  'ab bank': 'ABB',
  'hdbank': 'HDB',
  'hd bank': 'HDB',
  'seabank': 'SSB',
  'sea bank': 'SSB',
};

function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function log(msg) {
  const t = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log('[' + t + '] ' + msg);
}

function matchBankCode(symbol, name) {
  if (symbol && SYMBOL_TO_CODE[symbol.toUpperCase()]) {
    return SYMBOL_TO_CODE[symbol.toUpperCase()];
  }
  if (name) {
    const lower = name.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const [key, code] of Object.entries(NAME_TO_CODE)) {
      if (lower.includes(key)) return code;
    }
  }
  return null;
}

// ============ MAIN ============
async function main() {
  const reportDate = todayVN();
  console.log('='.repeat(60));
  console.log('THU THAP LAI SUAT TU DONG (v5) - Ngay ' + reportDate);
  console.log('Nguon: CafeF JSON API');
  console.log('='.repeat(60));

  // Buoc 1: Lay danh sach NH tu DB
  const { data: banks, error: bankErr } = await supabase
    .from('banks')
    .select('id, code, name')
    .eq('is_active', true);

  if (bankErr || !banks) {
    log('Khong doc duoc danh sach NH: ' + (bankErr ? bankErr.message : 'null'));
    process.exit(1);
  }
  log(banks.length + ' ngan hang trong he thong');

  // Buoc 2: Tai du lieu JSON tu CafeF
  log('Tai du lieu tu CafeF...');
  let cafefData;
  try {
    const response = await fetch(CAFEF_JSON_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://cafef.vn/du-lieu/lai-suat-ngan-hang.chn',
      },
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }

    cafefData = await response.json();
    log('Tai thanh cong!');
  } catch (err) {
    log('Khong tai duoc du lieu CafeF: ' + err.message);
    process.exit(1);
  }

  // Buoc 3: Parse du lieu
  const bankList = cafefData.Data || cafefData.data || cafefData;
  if (!Array.isArray(bankList)) {
    log('Cau truc JSON khong dung');
    log('Keys: ' + Object.keys(cafefData).join(', '));
    process.exit(1);
  }

  log('CafeF tra ve ' + bankList.length + ' ngan hang');

  // Buoc 4: Xu ly va luu tung ngan hang
  const results = [];

  for (const bankData of bankList) {
    const symbol = bankData.symbol || '';
    const name = bankData.name || '';
    const rates = bankData.interestRates || [];

    const bankCode = matchBankCode(symbol, name);
    if (!bankCode) continue;

    const dbBank = banks.find(b => b.code === bankCode);
    if (!dbBank) continue;

    const parsedRates = [];
    for (const rate of rates) {
      const termCode = TIME_TO_TERM[rate.time];
      if (!termCode || !VALID_TERMS.includes(termCode)) continue;

      const value = parseFloat(rate.value);
      if (isNaN(value) || value <= 0 || value > 20) continue;

      parsedRates.push({
        term_code: termCode,
        rate_min: value,
        rate_max: value,
      });
    }

    if (parsedRates.length === 0) {
      log('!! ' + dbBank.name + ' (' + bankCode + '): Khong co du lieu lai suat hop le');
      results.push({ bank: bankCode, name: dbBank.name, success: false, rates: 0, saved: 0 });
      continue;
    }

    let saved = 0;
    for (const rate of parsedRates) {
      const { error } = await supabase.from('deposit_rates').upsert({
        bank_id: dbBank.id,
        report_date: reportDate,
        customer_type: 'CN',
        term_code: rate.term_code,
        rate_min: rate.rate_min,
        rate_max: rate.rate_max,
        rate_type: 'standard',
      }, { onConflict: 'bank_id,report_date,customer_type,term_code,rate_type' });

      if (!error) saved++;
      else log('   Loi luu ' + bankCode + '/' + rate.term_code + ': ' + error.message);
    }

    log('OK ' + dbBank.name + ' (' + bankCode + '): ' + parsedRates.length + ' ky han, luu ' + saved + ' ban ghi');
    parsedRates.forEach(r => log('   ' + r.term_code + ': ' + r.rate_min + '%'));
    results.push({ bank: bankCode, name: dbBank.name, success: true, rates: parsedRates.length, saved });
  }

  // ============ TONG KET ============
  console.log('');
  console.log('='.repeat(60));
  console.log('TONG KET');
  console.log('='.repeat(60));

  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  const missing = banks.filter(b => !results.find(r => r.bank === b.code));

  console.log('Thanh cong: ' + ok.length + '/' + banks.length + ' ngan hang');
  ok.forEach(r => console.log('   OK ' + r.name + ': ' + r.rates + ' ky han'));

  if (fail.length > 0) {
    console.log('Co du lieu nhung khong hop le: ' + fail.length);
    fail.forEach(r => console.log('   !! ' + r.name));
  }

  if (missing.length > 0) {
    console.log('Khong tim thay tren CafeF: ' + missing.length);
    missing.forEach(b => console.log('   XX ' + b.name + ' (' + b.code + ')'));
  }

  const totalSaved = ok.reduce((s, r) => s + r.saved, 0);
  console.log('');
  console.log('Tong luu: ' + totalSaved + ' ban ghi lai suat');
  console.log('='.repeat(60));

  if (ok.length === 0) process.exit(1);
}

main().catch(err => { console.error('LOI:', err); process.exit(1); });
