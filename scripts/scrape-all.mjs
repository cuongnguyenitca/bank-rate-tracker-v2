// =====================================================================
// THU THẬP LÃI SUẤT TỰ ĐỘNG - TẤT CẢ NGÂN HÀNG (v4)
// Nguồn chính: cafef.vn | Backup: simplize.vn
// =====================================================================

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function log(msg) {
  const t = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${t}] ${msg}`);
}

const VALID_TERMS = ['KKH','1M','3M','6M','9M','12M','18M','24M','36M'];

// Mapping tên ngân hàng -> mã code trong DB
const BANK_NAME_MAP = {
  'agribank': 'AGR',
  'bidv': 'BIDV',
  'vietcombank': 'VCB',
  'vcb': 'VCB',
  'vietinbank': 'CTG',
  'ctg': 'CTG',
  'acb': 'ACB',
  'techcombank': 'TCB',
  'tcb': 'TCB',
  'sacombank': 'STB',
  'stb': 'STB',
  'shb': 'SHB',
  'vpbank': 'VPB',
  'vpb': 'VPB',
  'mbbank': 'MBB',
  'mb bank': 'MBB',
  'mb': 'MBB',
  'lpbank': 'LPB',
  'lienvietpostbank': 'LPB',
  'msb': 'MSB',
  'eximbank': 'EIB',
  'eib': 'EIB',
  'vib': 'VIB',
  'abbank': 'ABB',
  'abb': 'ABB',
  'hdbank': 'HDB',
  'hdb': 'HDB',
  'seabank': 'SSB',
  'ssb': 'SSB',
};

const COLUMN_MAP = {
  'không kỳ hạn': 'KKH', 'kkh': 'KKH', 'kkhạn': 'KKH',
  '1 tháng': '1M', '01 tháng': '1M',
  '2 tháng': '2M', '02 tháng': '2M',
  '3 tháng': '3M', '03 tháng': '3M',
  '6 tháng': '6M', '06 tháng': '6M',
  '9 tháng': '9M', '09 tháng': '9M',
  '12 tháng': '12M',
  '13 tháng': '13M',
  '18 tháng': '18M',
  '24 tháng': '24M',
  '36 tháng': '36M',
};

function parseRate(text) {
  if (!text) return null;
  const cleaned = text.replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '').replace(/\u00a0/g, '').replace(/−/g, '-');
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === 'N/A' || cleaned === '...') return null;
  const num = parseFloat(cleaned);
  return (isNaN(num) || num <= 0 || num > 20) ? null : Math.round(num * 100) / 100;
}

function matchBankCode(name) {
  const lower = name.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  for (const [key, code] of Object.entries(BANK_NAME_MAP)) {
    if (lower.includes(key.replace(/\s+/g, ''))) return code;
  }
  return null;
}

function matchTermFromHeader(header) {
  const h = header.toLowerCase().trim();
  for (const [key, code] of Object.entries(COLUMN_MAP)) {
    if (h.includes(key)) return code;
  }
  const numMatch = h.match(/(\d+)\s*th/);
  if (numMatch) {
    const map = { '1': '1M', '2': '2M', '3': '3M', '6': '6M', '9': '9M', '12': '12M', '13': '13M', '18': '18M', '24': '24M', '36': '36M' };
    return map[numMatch[1]] || null;
  }
  return null;
}

// ============ GENERIC TABLE READER ============
async function readAllTables(page) {
  return await page.evaluate(() => {
    const allData = {};
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 3) continue;

      // Read headers
      const headers = [];
      const headerCells = rows[0].querySelectorAll('th, td');
      headerCells.forEach(cell => headers.push((cell.textContent || '').trim()));

      // Check if this looks like a rate table
      const headerText = headers.join(' ').toLowerCase();
      const isRateTable = headerText.includes('tháng') || headerText.includes('kỳ hạn') || headerText.includes('không kỳ');
      if (!isRateTable) continue;

      // Read data rows
      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        if (cells.length < 3) continue;

        // First cell = bank name (also check for links/images with alt text)
        let bankName = (cells[0].textContent || '').trim();
        const img = cells[0].querySelector('img');
        if (img && img.alt) bankName = img.alt.trim() || bankName;
        const link = cells[0].querySelector('a');
        if (link) bankName = (link.textContent || '').trim() || bankName;
        
        if (!bankName || bankName.length < 2) continue;

        const rates = {};
        for (let j = 1; j < cells.length && j < headers.length; j++) {
          rates[headers[j]] = (cells[j].textContent || '').trim();
        }
        allData[bankName] = rates;
      }
    }
    return allData;
  });
}

// ============ NGUỒN 1: cafef.vn ============
async function scrapeCafef(page) {
  log('📡 [Nguồn chính] Truy cập cafef.vn...');
  await page.goto('https://cafef.vn/du-lieu/lai-suat-ngan-hang.chn', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });

  // CafeF loads data via JS, need to wait
  await page.waitForTimeout(5000);
  
  // Chọn kỳ hạn "Tất cả" nếu có dropdown
  const selectors = [
    'select', '[class*="select"]', '[class*="dropdown"]',
    'text=Tất cả kỳ hạn', 'text=Tất cả',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const tagName = await el.evaluate(e => e.tagName);
        if (tagName === 'SELECT') {
          // Try to select "all" option
          const options = await el.$$('option');
          for (const opt of options) {
            const text = await opt.textContent();
            if (text && text.includes('Tất cả')) {
              await el.selectOption({ label: text.trim() });
              await page.waitForTimeout(3000);
              break;
            }
          }
        }
      }
    } catch (e) {}
  }

  // Scroll to load all content
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);

  // Try to click through different term tabs if they exist
  const termTabs = await page.$$('[class*="tab"], [class*="period"], button, a');
  for (const tab of termTabs) {
    const text = await tab.textContent().catch(() => '');
    if (text && (text.includes('12 tháng') || text.includes('Tất cả'))) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }
  }

  const data = await readAllTables(page);
  log(`📊 [CafeF] Đọc được ${Object.keys(data).length} ngân hàng`);
  
  // Debug: In ra tên ngân hàng đọc được
  if (Object.keys(data).length > 0) {
    log(`   Các NH: ${Object.keys(data).slice(0, 5).join(', ')}...`);
  }
  
  return data;
}

// ============ NGUỒN 2: simplize.vn ============
async function scrapeSimplize(page) {
  log('📡 [Backup] Truy cập simplize.vn...');
  await page.goto('https://simplize.vn/lai-suat-ngan-hang', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(3000);

  const data = await readAllTables(page);
  log(`📊 [Simplize] Đọc được ${Object.keys(data).length} ngân hàng`);
  return data;
}

// ============ XỬ LÝ VÀ LƯU DỮ LIỆU ============
async function processAndSave(rawData, reportDate, banks) {
  const results = [];

  for (const [bankName, rates] of Object.entries(rawData)) {
    const bankCode = matchBankCode(bankName);
    if (!bankCode) continue;

    const bank = banks.find(b => b.code === bankCode);
    if (!bank) continue;

    const parsedRates = [];
    for (const [colHeader, rateText] of Object.entries(rates)) {
      const termCode = matchTermFromHeader(colHeader);
      if (!termCode || !VALID_TERMS.includes(termCode)) continue;

      const rate = parseRate(rateText);
      if (rate === null) continue;
      parsedRates.push({ term_code: termCode, rate_min: rate, rate_max: rate });
    }

    if (parsedRates.length > 0) {
      let saved = 0;
      for (const rate of parsedRates) {
        const { error } = await supabase.from('deposit_rates').upsert({
          bank_id: bank.id, report_date: reportDate, customer_type: 'CN',
          term_code: rate.term_code, rate_min: rate.rate_min, rate_max: rate.rate_max,
          rate_type: 'standard',
        }, { onConflict: 'bank_id,report_date,customer_type,term_code,rate_type' });
        if (!error) saved++;
      }
      log(`✅ ${bank.name} (${bankCode}): ${parsedRates.length} kỳ hạn, lưu ${saved}`);
      parsedRates.forEach(r => log(`   ${r.term_code}: ${r.rate_min}%`));
      results.push({ bank: bankCode, name: bank.name, success: true, rates: parsedRates.length, saved });
    }
  }
  return results;
}

// ============ MAIN ============
async function main() {
  const reportDate = todayVN();
  console.log('='.repeat(60));
  console.log(`🏦 THU THẬP LÃI SUẤT TỰ ĐỘNG (v4) - Ngày ${reportDate}`);
  console.log(`📡 Nguồn chính: cafef.vn | Backup: simplize.vn`);
  console.log('='.repeat(60));

  const { data: banks } = await supabase.from('banks').select('id, code, name').eq('is_active', true);
  if (!banks || banks.length === 0) { log('❌ Không đọc được danh sách NH'); process.exit(1); }
  log(`📋 ${banks.length} ngân hàng trong hệ thống`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,webm,woff2}', route => route.abort());

  let allResults = [];

  // === NGUỒN 1: cafef.vn ===
  try {
    const cafefData = await scrapeCafef(page);
    const cafefResults = await processAndSave(cafefData, reportDate, banks);
    allResults = [...cafefResults];
    if (cafefResults.length > 0) {
      log(`\n✅ Nguồn CafeF: ${cafefResults.length} ngân hàng thành công`);
    } else {
      log(`⚠️ Nguồn CafeF: Không đọc được dữ liệu, chuyển sang backup`);
    }
  } catch (err) {
    log(`❌ Nguồn CafeF lỗi: ${err.message}`);
  }

  // Kiểm tra thiếu NH nào
  const collected = new Set(allResults.map(r => r.bank));
  const missing = banks.filter(b => !collected.has(b.code));

  // === NGUỒN 2: simplize.vn (nếu cafef thiếu) ===
  if (missing.length > 3) {
    try {
      log(`\n📡 Bổ sung từ simplize.vn (thiếu ${missing.length} NH)...`);
      const simplizeData = await scrapeSimplize(page);
      const simplizeResults = await processAndSave(simplizeData, reportDate, banks);
      for (const r of simplizeResults) {
        if (!collected.has(r.bank)) {
          allResults.push(r);
          collected.add(r.bank);
        }
      }
      if (simplizeResults.length > 0) {
        log(`✅ Simplize bổ sung: ${simplizeResults.filter(r => !collected.has(r.bank)).length} NH mới`);
      }
    } catch (err) {
      log(`❌ Simplize lỗi: ${err.message}`);
    }
  }

  await page.close();
  await context.close();
  await browser.close();

  // ============ TỔNG KẾT ============
  console.log('\n' + '='.repeat(60));
  console.log('📊 TỔNG KẾT');
  console.log('='.repeat(60));

  const ok = allResults.filter(r => r.success);
  const missingFinal = banks.filter(b => !allResults.find(r => r.bank === b.code));

  console.log(`✅ Thành công: ${ok.length}/${banks.length} ngân hàng`);
  ok.forEach(r => console.log(`   ✅ ${r.name}: ${r.rates} kỳ hạn`));

  if (missingFinal.length > 0) {
    console.log(`⚠️ Chưa thu thập: ${missingFinal.length} ngân hàng`);
    missingFinal.forEach(b => console.log(`   ⚠️ ${b.name}`));
  }

  const totalSaved = ok.reduce((s, r) => s + r.saved, 0);
  console.log(`\n📝 Tổng lưu: ${totalSaved} bản ghi lãi suất`);
  console.log('='.repeat(60));

  if (ok.length === 0) process.exit(1);
}

main().catch(err => { console.error('💥', err); process.exit(1); });
