// =====================================================================
// THU THẬP LÃI SUẤT TỰ ĐỘNG - TẤT CẢ 17 NGÂN HÀNG
// Sử dụng Playwright (trình duyệt thật) để đọc website ngân hàng
// =====================================================================

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// ============ CẤU HÌNH ============
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TARGET_BANK = process.env.TARGET_BANK || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ HELPERS ============
function parseRate(text) {
  if (!text || text.trim() === '-' || text.trim() === '' || text.trim() === 'N/A') return null;
  const cleaned = text.replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '').replace(/\.{2,}/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function todayVN() {
  const d = new Date();
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().split('T')[0];
}

function log(bankCode, msg) {
  const time = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${time}] [${bankCode}] ${msg}`);
}

const TERM_MAP = {
  'không kỳ hạn': 'KKH', 'kkh': 'KKH', 'demand': 'KKH',
  '1 tháng': '1M', '01 tháng': '1M', '1t': '1M', '01t': '1M',
  '2 tháng': '2M', '02 tháng': '2M',
  '3 tháng': '3M', '03 tháng': '3M', '3t': '3M', '03t': '3M',
  '6 tháng': '6M', '06 tháng': '6M', '6t': '6M', '06t': '6M',
  '9 tháng': '9M', '09 tháng': '9M', '9t': '9M', '09t': '9M',
  '12 tháng': '12M', '12t': '12M', '1 năm': '12M',
  '13 tháng': '13M',
  '15 tháng': '15M',
  '18 tháng': '18M', '18t': '18M', '1.5 năm': '18M',
  '24 tháng': '24M', '24t': '24M', '2 năm': '24M',
  '36 tháng': '36M', '36t': '36M', '3 năm': '36M',
};

const VALID_TERMS = ['KKH', '1M', '3M', '6M', '9M', '12M', '18M', '24M', '36M'];

function matchTerm(text) {
  const lower = text.toLowerCase().trim();
  for (const [key, code] of Object.entries(TERM_MAP)) {
    if (lower.includes(key)) return code;
  }
  // Try matching just numbers like "1", "3", "6", "12" etc
  const numMatch = lower.match(/^(\d+)\s*(tháng|thang|t$)/);
  if (numMatch) {
    const months = parseInt(numMatch[1]);
    const map = { 1: '1M', 3: '3M', 6: '6M', 9: '9M', 12: '12M', 18: '18M', 24: '24M', 36: '36M' };
    return map[months] || null;
  }
  return null;
}

// ============ GENERIC TABLE SCRAPER ============
async function scrapeGenericTable(page, bankCode) {
  const rates = [];

  // Wait for any table to appear
  await page.waitForSelector('table', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(2000); // Extra wait for JS rendering

  // Try to find all tables and extract rate data
  const tables = await page.$$('table');
  
  for (const table of tables) {
    const rows = await table.$$('tr');
    
    for (const row of rows) {
      const cells = await row.$$('td, th');
      if (cells.length < 2) continue;

      const texts = [];
      for (const cell of cells) {
        const text = await cell.textContent().catch(() => '');
        texts.push((text || '').trim());
      }

      // First cell might be term, remaining cells might be rates
      const term = matchTerm(texts[0]);
      if (!term || !VALID_TERMS.includes(term)) continue;

      // Try to find rate values in remaining cells
      for (let i = 1; i < texts.length; i++) {
        const rate = parseRate(texts[i]);
        if (rate !== null && rate > 0 && rate < 20) {
          // Check if we already have this term
          const existing = rates.find(r => r.term_code === term);
          if (existing) {
            // Update min/max
            if (rate < existing.rate_min) existing.rate_min = rate;
            if (rate > existing.rate_max) existing.rate_max = rate;
          } else {
            rates.push({ term_code: term, rate_min: rate, rate_max: rate });
          }
        }
      }
    }
  }

  return rates;
}

// ============ BANK-SPECIFIC SCRAPERS ============

// --- Agribank ---
async function scrapeAGR(page) {
  log('AGR', 'Truy cập Agribank...');
  await page.goto('https://www.agribank.com.vn/vn/lai-suat', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Agribank may have tabs for different customer types
  // Try clicking on "Tiền gửi tiết kiệm" tab if exists
  const tabs = await page.$$('text=tiết kiệm, text=Tiết kiệm, text=Tiền gửi');
  if (tabs.length > 0) {
    await tabs[0].click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  return await scrapeGenericTable(page, 'AGR');
}

// --- BIDV ---
async function scrapeBIDV(page) {
  log('BIDV', 'Truy cập BIDV...');
  // BIDV has a JSON API
  try {
    const response = await page.goto('https://www.bidv.com.vn/ServicesBIDV/InterestDetailServlet', { timeout: 15000 });
    const contentType = (await response?.headerValue('content-type')) || '';
    
    if (contentType.includes('json')) {
      const json = await response.json().catch(() => null);
      if (json) {
        // Parse BIDV JSON response
        return parseBIDVJson(json);
      }
    }
  } catch (e) {
    // Fallback to HTML page
  }

  await page.goto('https://www.bidv.com.vn/vn/tra-cuu-lai-suat', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'BIDV');
}

function parseBIDVJson(json) {
  const rates = [];
  // BIDV API structure varies, try common patterns
  const items = json.data || json.interestRates || json || [];
  if (!Array.isArray(items)) return rates;
  
  for (const item of items) {
    const termText = item.ky_han || item.term || item.kyHan || '';
    const term = matchTerm(termText);
    if (!term || !VALID_TERMS.includes(term)) continue;
    
    const rate = parseRate(String(item.lai_suat || item.rate || item.laiSuat || ''));
    if (rate !== null && rate > 0) {
      rates.push({ term_code: term, rate_min: rate, rate_max: rate });
    }
  }
  return rates;
}

// --- Vietcombank ---
async function scrapeVCB(page) {
  log('VCB', 'Truy cập Vietcombank...');
  await page.goto('https://portal.vietcombank.com.vn/Personal/TK/Pages/lai-suat.aspx?devicechannel=default', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'VCB');
}

// --- VietinBank ---
async function scrapeCTG(page) {
  log('CTG', 'Truy cập VietinBank...');
  await page.goto('https://www.vietinbank.vn/web/home/vn/lai-suat/lai-suat-huy-dong-von', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'CTG');
}

// --- ACB ---
async function scrapeACB(page) {
  log('ACB', 'Truy cập ACB...');
  await page.goto('https://www.acb.com.vn/vn/interest/personal/tai-khoan-tien-gui/khac/lai-suat', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'ACB');
}

// --- Techcombank ---
async function scrapeTCB(page) {
  log('TCB', 'Truy cập Techcombank...');
  await page.goto('https://techcombank.com/cong-cu-tien-ich/bieu-phi-lai-suat', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000); // Techcombank loads slow

  // Try to click on "Lãi suất tiền gửi" tab
  const selectors = ['text=Lãi suất tiền gửi', 'text=Tiền gửi', 'text=lãi suất tiền gửi'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); break; }
  }

  return await scrapeGenericTable(page, 'TCB');
}

// --- Sacombank ---
async function scrapeSTB(page) {
  log('STB', 'Truy cập Sacombank...');
  await page.goto('https://www.sacombank.com.vn/canhan/Pages/lai-suat.aspx', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'STB');
}

// --- SHB ---
async function scrapeSHB(page) {
  log('SHB', 'Truy cập SHB...');
  await page.goto('https://www.shb.com.vn/category/lien-ket-nhanh/lai-suat/', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'SHB');
}

// --- VPBank ---
async function scrapeVPB(page) {
  log('VPB', 'Truy cập VPBank...');
  await page.goto('https://www.vpbank.com.vn/tai-lieu-bieu-mau', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // VPBank may need to click on "Lãi suất" section
  const selectors = ['text=Lãi suất', 'text=lãi suất', '[data-tab*="lai-suat"]'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); break; }
  }

  return await scrapeGenericTable(page, 'VPB');
}

// --- MBBank ---
async function scrapeMBB(page) {
  log('MBB', 'Truy cập MBBank...');
  await page.goto('https://www.mbbank.com.vn/Fee', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // MBBank may load rates in tabs
  const selectors = ['text=Lãi suất tiền gửi', 'text=Tiền gửi', 'text=lãi suất'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); break; }
  }

  return await scrapeGenericTable(page, 'MBB');
}

// --- LPBank ---
async function scrapeLPB(page) {
  log('LPB', 'Truy cập LPBank...');
  await page.goto('https://lienvietpostbank.com.vn/lai-suat/', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'LPB');
}

// --- MSB ---
async function scrapeMSB(page) {
  log('MSB', 'Truy cập MSB...');
  await page.goto('https://www.msb.com.vn/Bieu-mau-Bieu-phi-va-Lai-suat/', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const selectors = ['text=Lãi suất', 'text=Tiền gửi'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); break; }
  }

  return await scrapeGenericTable(page, 'MSB');
}

// --- Eximbank ---
async function scrapeEIB(page) {
  log('EIB', 'Truy cập Eximbank...');
  await page.goto('https://eximbank.com.vn/khachhangcanhan', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Navigate to interest rate section
  const selectors = ['text=Lãi suất', 'a[href*="lai-suat"]'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }

  return await scrapeGenericTable(page, 'EIB');
}

// --- VIB ---
async function scrapeVIB(page) {
  log('VIB', 'Truy cập VIB...');
  await page.goto('https://www.vib.com.vn/wps/portal/vn/product-landing/tai-khoan-ngan-hang/bieu-lai-suat-tiet-kiem-tai-quay', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  return await scrapeGenericTable(page, 'VIB');
}

// --- ABBank ---
async function scrapeABB(page) {
  log('ABB', 'Truy cập ABBank...');
  await page.goto('https://www.abbank.vn/thong-tin/lai-suat', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await scrapeGenericTable(page, 'ABB');
}

// --- HDBank ---
async function scrapeHDB(page) {
  log('HDB', 'Truy cập HDBank...');
  await page.goto('https://hdbank.com.vn/vi/personal/cong-cu/interest-rate', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // HDBank may need to select "Tiền gửi tiết kiệm"
  const selectors = ['text=Tiết kiệm', 'text=Tiền gửi'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(2000); break; }
  }

  return await scrapeGenericTable(page, 'HDB');
}

// --- SeABank ---
async function scrapeSSB(page) {
  log('SSB', 'Truy cập SeABank...');
  await page.goto('https://www.seabank.com.vn/interest', 
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  return await scrapeGenericTable(page, 'SSB');
}

// ============ REGISTRY ============
const SCRAPERS = {
  'AGR':  { name: 'Agribank',     fn: scrapeAGR },
  'BIDV': { name: 'BIDV',         fn: scrapeBIDV },
  'VCB':  { name: 'Vietcombank',  fn: scrapeVCB },
  'CTG':  { name: 'VietinBank',   fn: scrapeCTG },
  'ACB':  { name: 'ACB',          fn: scrapeACB },
  'TCB':  { name: 'Techcombank',  fn: scrapeTCB },
  'STB':  { name: 'Sacombank',    fn: scrapeSTB },
  'SHB':  { name: 'SHB',          fn: scrapeSHB },
  'VPB':  { name: 'VPBank',       fn: scrapeVPB },
  'MBB':  { name: 'MBBank',       fn: scrapeMBB },
  'LPB':  { name: 'LPBank',       fn: scrapeLPB },
  'MSB':  { name: 'MSB',          fn: scrapeMSB },
  'EIB':  { name: 'Eximbank',     fn: scrapeEIB },
  'VIB':  { name: 'VIB',          fn: scrapeVIB },
  'ABB':  { name: 'ABBank',       fn: scrapeABB },
  'HDB':  { name: 'HDBank',       fn: scrapeHDB },
  'SSB':  { name: 'SeABank',      fn: scrapeSSB },
};

// ============ LƯU VÀO DATABASE ============
async function saveRates(bankCode, rates, reportDate) {
  const { data: bank } = await supabase
    .from('banks').select('id').eq('code', bankCode).single();

  if (!bank) {
    log(bankCode, `⚠️ Không tìm thấy mã NH trong database`);
    return 0;
  }

  let saved = 0;
  for (const rate of rates) {
    if (!VALID_TERMS.includes(rate.term_code)) continue;

    const { error } = await supabase.from('deposit_rates').upsert({
      bank_id: bank.id,
      report_date: reportDate,
      customer_type: 'CN',
      term_code: rate.term_code,
      rate_min: rate.rate_min,
      rate_max: rate.rate_max,
      rate_type: 'standard',
    }, { onConflict: 'bank_id,report_date,customer_type,term_code,rate_type' });

    if (!error) saved++;
  }
  return saved;
}

// ============ MAIN ============
async function main() {
  const reportDate = todayVN();
  console.log('='.repeat(60));
  console.log(`🏦 THU THẬP LÃI SUẤT TỰ ĐỘNG - Ngày ${reportDate}`);
  console.log('='.repeat(60));

  // Determine which banks to scrape
  let bankCodes = Object.keys(SCRAPERS);
  if (TARGET_BANK) {
    bankCodes = TARGET_BANK.split(',').map(s => s.trim().toUpperCase()).filter(c => SCRAPERS[c]);
    console.log(`🎯 Chỉ thu thập: ${bankCodes.join(', ')}`);
  } else {
    console.log(`🎯 Thu thập tất cả ${bankCodes.length} ngân hàng`);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];

  for (const code of bankCodes) {
    const scraper = SCRAPERS[code];
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      log(code, `Bắt đầu thu thập ${scraper.name}...`);
      const rates = await scraper.fn(page);
      
      if (rates.length > 0) {
        const saved = await saveRates(code, rates, reportDate);
        log(code, `✅ Thành công! ${rates.length} kỳ hạn, đã lưu ${saved} bản ghi`);
        
        // Print rates for verification
        rates.forEach(r => {
          log(code, `   ${r.term_code}: ${r.rate_min} - ${r.rate_max}%`);
        });

        results.push({ bank: code, name: scraper.name, success: true, rates: rates.length, saved });
      } else {
        log(code, `⚠️ Không tìm thấy dữ liệu lãi suất`);
        results.push({ bank: code, name: scraper.name, success: false, rates: 0, saved: 0, error: 'No rates found' });
      }
    } catch (err) {
      log(code, `❌ Lỗi: ${err.message}`);
      results.push({ bank: code, name: scraper.name, success: false, rates: 0, saved: 0, error: err.message });
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  await browser.close();

  // ============ TỔNG KẾT ============
  console.log('\n' + '='.repeat(60));
  console.log('📊 TỔNG KẾT');
  console.log('='.repeat(60));

  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Thành công: ${success.length}/${results.length}`);
  success.forEach(r => console.log(`   ✅ ${r.name}: ${r.rates} kỳ hạn`));

  if (failed.length > 0) {
    console.log(`❌ Thất bại: ${failed.length}/${results.length}`);
    failed.forEach(r => console.log(`   ❌ ${r.name}: ${r.error}`));
  }

  // Save scraping log to database
  const totalRates = success.reduce((sum, r) => sum + r.saved, 0);
  console.log(`\n📝 Tổng cộng đã lưu: ${totalRates} bản ghi lãi suất`);
  console.log('='.repeat(60));

  // Exit with error code if more than half failed
  if (failed.length > results.length / 2) {
    console.log('\n⚠️ Quá nhiều ngân hàng thất bại, cần kiểm tra lại scrapers');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Lỗi nghiêm trọng:', err);
  process.exit(1);
});
