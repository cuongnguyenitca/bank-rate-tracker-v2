// =====================================================================
// THU THẬP LÃI SUẤT TỰ ĐỘNG - 17 NGÂN HÀNG VIỆT NAM (v2)
// Playwright + Chiến lược riêng cho từng ngân hàng
// =====================================================================

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

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
  if (!text) return null;
  const cleaned = text.replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '').replace(/\u00a0/g, '');
  if (cleaned === '-' || cleaned === '' || cleaned === 'N/A' || cleaned === '—') return null;
  const num = parseFloat(cleaned);
  return (isNaN(num) || num <= 0 || num > 20) ? null : Math.round(num * 100) / 100;
}

function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function log(code, msg) {
  const t = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${t}] [${code}] ${msg}`);
}

const VALID_TERMS = ['KKH','1M','3M','6M','9M','12M','18M','24M','36M'];

// ============ CHIẾN LƯỢC CHUNG: Đọc tất cả text trên trang ============
async function extractAllRatesFromPage(page, bankCode) {
  // Đợi trang load hoàn toàn
  await page.waitForTimeout(5000);
  
  // Scroll xuống để trigger lazy loading
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Chiến lược 1: Tìm trong tất cả bảng
  let rates = await page.evaluate(() => {
    const results = [];
    const termPatterns = [
      { pattern: /kh[oô]ng\s*k[yỳ]\s*h[aạ]n/i, code: 'KKH' },
      { pattern: /^0?1\s*(th[aá]ng|t$|t\b)/i, code: '1M' },
      { pattern: /^0?3\s*(th[aá]ng|t$|t\b)/i, code: '3M' },
      { pattern: /^0?6\s*(th[aá]ng|t$|t\b)/i, code: '6M' },
      { pattern: /^0?9\s*(th[aá]ng|t$|t\b)/i, code: '9M' },
      { pattern: /^12\s*(th[aá]ng|t$|t\b)/i, code: '12M' },
      { pattern: /^18\s*(th[aá]ng|t$|t\b)/i, code: '18M' },
      { pattern: /^24\s*(th[aá]ng|t$|t\b)/i, code: '24M' },
      { pattern: /^36\s*(th[aá]ng|t$|t\b)/i, code: '36M' },
    ];

    function matchTerm(text) {
      const t = text.trim().replace(/\s+/g, ' ');
      for (const { pattern, code } of termPatterns) {
        if (pattern.test(t)) return code;
      }
      return null;
    }

    function tryParseRate(text) {
      const c = text.replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '').replace(/\u00a0/g, '');
      if (!c || c === '-' || c === '—') return null;
      const n = parseFloat(c);
      return (isNaN(n) || n <= 0 || n > 20) ? null : Math.round(n * 100) / 100;
    }

    // Scan all tables
    document.querySelectorAll('table').forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length < 2) return;
        
        const firstText = cells[0].textContent || '';
        const term = matchTerm(firstText);
        if (!term) return;

        // Try to get rates from remaining cells
        for (let i = 1; i < cells.length; i++) {
          const rate = tryParseRate(cells[i].textContent || '');
          if (rate !== null) {
            const existing = results.find(r => r.term_code === term);
            if (existing) {
              if (rate < existing.rate_min) existing.rate_min = rate;
              if (rate > existing.rate_max) existing.rate_max = rate;
            } else {
              results.push({ term_code: term, rate_min: rate, rate_max: rate });
            }
          }
        }
      });
    });

    // Chiến lược 2: Tìm trong div/span có cấu trúc lãi suất
    if (results.length === 0) {
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(l => l);
      
      for (let i = 0; i < lines.length; i++) {
        const term = matchTerm(lines[i]);
        if (!term) continue;
        
        // Tìm số liệu trong cùng dòng hoặc dòng kế
        const searchText = lines[i] + ' ' + (lines[i + 1] || '');
        const numbers = searchText.match(/\d+[.,]\d+/g);
        if (numbers) {
          for (const numStr of numbers) {
            const rate = tryParseRate(numStr);
            if (rate !== null) {
              const existing = results.find(r => r.term_code === term);
              if (existing) {
                if (rate < existing.rate_min) existing.rate_min = rate;
                if (rate > existing.rate_max) existing.rate_max = rate;
              } else {
                results.push({ term_code: term, rate_min: rate, rate_max: rate });
              }
            }
          }
        }
      }
    }

    return results;
  });

  return rates.filter(r => VALID_TERMS.includes(r.term_code));
}

// ============ SCRAPER CHO TỪNG NGÂN HÀNG ============

async function scrapeAGR(page) {
  log('AGR', 'Truy cập Agribank...');
  await page.goto('https://www.agribank.com.vn/vn/lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Thử click tab tiết kiệm
  for (const sel of ['text=Tiết kiệm', 'text=tiết kiệm', 'text=Tiền gửi', '[class*="tab"]']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'AGR');
}

async function scrapeBIDV(page) {
  log('BIDV', 'Truy cập BIDV...');
  await page.goto('https://www.bidv.com.vn/vn/tra-cuu-lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // BIDV thường có tab "Tiền gửi tiết kiệm"
  for (const sel of ['text=Tiết kiệm', 'text=Tiền gửi tiết kiệm', 'text=Lãi suất tiền gửi']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'BIDV');
}

async function scrapeVCB(page) {
  log('VCB', 'Truy cập Vietcombank...');
  // Thử URL chính trước, nếu lỗi thì thử URL backup
  const urls = [
    'https://vietcombank.com.vn/vi-VN/lai-suat/lai-suat-tien-gui',
    'https://www.vietcombank.com.vn/vi-VN/Cong-cu-Tien-ich/Lai-suat',
    'https://portal.vietcombank.com.vn/Personal/TK/Pages/lai-suat.aspx',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const rates = await extractAllRatesFromPage(page, 'VCB');
      if (rates.length > 0) return rates;
    } catch (e) {
      log('VCB', `URL ${url} thất bại, thử URL tiếp...`);
    }
  }
  return [];
}

async function scrapeCTG(page) {
  log('CTG', 'Truy cập VietinBank...');
  const urls = [
    'https://www.vietinbank.vn/lai-suat',
    'https://www.vietinbank.vn/web/home/vn/lai-suat/lai-suat-huy-dong-von',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const rates = await extractAllRatesFromPage(page, 'CTG');
      if (rates.length > 0) return rates;
    } catch (e) {
      log('CTG', `URL thất bại, thử tiếp...`);
    }
  }
  return [];
}

async function scrapeACB(page) {
  log('ACB', 'Truy cập ACB...');
  await page.goto('https://www.acb.com.vn/vn/interest', { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const sel of ['text=Tiền gửi', 'text=tiền gửi', 'text=Lãi suất tiết kiệm']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'ACB');
}

async function scrapeTCB(page) {
  log('TCB', 'Truy cập Techcombank...');
  await page.goto('https://techcombank.com/cong-cu-tien-ich/bieu-phi-lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000); // TCB load chậm
  for (const sel of ['text=Lãi suất tiền gửi', 'text=Tiền gửi', 'text=lãi suất huy động']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'TCB');
}

async function scrapeSTB(page) {
  log('STB', 'Truy cập Sacombank...');
  await page.goto('https://www.sacombank.com.vn/canhan/Pages/lai-suat.aspx', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'STB');
}

async function scrapeSHB(page) {
  log('SHB', 'Truy cập SHB...');
  await page.goto('https://www.shb.com.vn/lai-suat/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'SHB');
}

async function scrapeVPB(page) {
  log('VPB', 'Truy cập VPBank...');
  const urls = [
    'https://www.vpbank.com.vn/tai-lieu-bieu-mau',
    'https://www.vpbank.com.vn/cong-cu-tien-ich/lai-suat',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(5000);
      for (const sel of ['text=Lãi suất', 'text=Biểu lãi suất']) {
        const el = await page.$(sel).catch(() => null);
        if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
      }
      const rates = await extractAllRatesFromPage(page, 'VPB');
      if (rates.length > 0) return rates;
    } catch (e) { continue; }
  }
  return [];
}

async function scrapeMBB(page) {
  log('MBB', 'Truy cập MBBank...');
  const urls = [
    'https://www.mbbank.com.vn/Fee',
    'https://www.mbbank.com.vn/lai-suat',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(6000);
      for (const sel of ['text=Lãi suất tiền gửi', 'text=Tiền gửi', 'text=Biểu lãi suất']) {
        const el = await page.$(sel).catch(() => null);
        if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
      }
      const rates = await extractAllRatesFromPage(page, 'MBB');
      if (rates.length > 0) return rates;
    } catch (e) { continue; }
  }
  return [];
}

async function scrapeLPB(page) {
  log('LPB', 'Truy cập LPBank...');
  await page.goto('https://lienvietpostbank.com.vn/lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'LPB');
}

async function scrapeMSB(page) {
  log('MSB', 'Truy cập MSB...');
  await page.goto('https://www.msb.com.vn/bieu-lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'MSB');
}

async function scrapeEIB(page) {
  log('EIB', 'Truy cập Eximbank...');
  await page.goto('https://eximbank.com.vn/lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const sel of ['text=Tiền gửi', 'text=tiết kiệm', 'text=Huy động']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'EIB');
}

async function scrapeVIB(page) {
  log('VIB', 'Truy cập VIB...');
  const urls = [
    'https://www.vib.com.vn/vn/product-landing/tai-khoan-ngan-hang/bieu-lai-suat-tiet-kiem-tai-quay',
    'https://www.vib.com.vn/vn/lai-suat',
  ];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const rates = await extractAllRatesFromPage(page, 'VIB');
      if (rates.length > 0) return rates;
    } catch (e) { continue; }
  }
  return [];
}

async function scrapeABB(page) {
  log('ABB', 'Truy cập ABBank...');
  await page.goto('https://www.abbank.vn/thong-tin/lai-suat', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'ABB');
}

async function scrapeHDB(page) {
  log('HDB', 'Truy cập HDBank...');
  await page.goto('https://hdbank.com.vn/vi/personal/cong-cu/interest-rate', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  for (const sel of ['text=Tiết kiệm', 'text=Tiền gửi']) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(3000); break; }
  }
  return await extractAllRatesFromPage(page, 'HDB');
}

async function scrapeSSB(page) {
  log('SSB', 'Truy cập SeABank...');
  await page.goto('https://www.seabank.com.vn/interest', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return await extractAllRatesFromPage(page, 'SSB');
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
  const { data: bank } = await supabase.from('banks').select('id').eq('code', bankCode).single();
  if (!bank) { log(bankCode, '⚠️ Không tìm thấy trong DB'); return 0; }

  let saved = 0;
  for (const rate of rates) {
    if (!VALID_TERMS.includes(rate.term_code)) continue;
    const { error } = await supabase.from('deposit_rates').upsert({
      bank_id: bank.id, report_date: reportDate, customer_type: 'CN',
      term_code: rate.term_code, rate_min: rate.rate_min, rate_max: rate.rate_max,
      rate_type: 'standard',
    }, { onConflict: 'bank_id,report_date,customer_type,term_code,rate_type' });
    if (!error) saved++;
  }
  return saved;
}

// ============ CHỤP ẢNH DEBUG ============
async function takeScreenshot(page, bankCode) {
  try {
    const path = `/tmp/screenshot-${bankCode}.png`;
    await page.screenshot({ path, fullPage: true });
    log(bankCode, `📸 Đã chụp ảnh debug: ${path}`);
  } catch (e) {}
}

// ============ MAIN ============
async function main() {
  const reportDate = todayVN();
  console.log('='.repeat(60));
  console.log(`🏦 THU THẬP LÃI SUẤT TỰ ĐỘNG - Ngày ${reportDate}`);
  console.log('='.repeat(60));

  let bankCodes = Object.keys(SCRAPERS);
  if (TARGET_BANK) {
    bankCodes = TARGET_BANK.split(',').map(s => s.trim().toUpperCase()).filter(c => SCRAPERS[c]);
    console.log(`🎯 Chỉ thu thập: ${bankCodes.join(', ')}`);
  } else {
    console.log(`🎯 Thu thập tất cả ${bankCodes.length} ngân hàng`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-web-security', '--ignore-certificate-errors'],
  });

  const results = [];

  for (const code of bankCodes) {
    const scraper = SCRAPERS[code];
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    
    // Block heavy resources to speed up loading
    await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,webm,woff,woff2}', route => route.abort());

    try {
      const rates = await scraper.fn(page);

      if (rates.length > 0) {
        const saved = await saveRates(code, rates, reportDate);
        log(code, `✅ ${scraper.name}: ${rates.length} kỳ hạn, lưu ${saved} bản ghi`);
        rates.forEach(r => log(code, `   ${r.term_code}: ${r.rate_min} - ${r.rate_max}%`));
        results.push({ bank: code, name: scraper.name, success: true, rates: rates.length, saved });
      } else {
        await takeScreenshot(page, code);
        log(code, `⚠️ ${scraper.name}: Không tìm thấy dữ liệu`);
        results.push({ bank: code, name: scraper.name, success: false, rates: 0, saved: 0 });
      }
    } catch (err) {
      await takeScreenshot(page, code).catch(() => {});
      log(code, `❌ ${scraper.name}: ${err.message}`);
      results.push({ bank: code, name: scraper.name, success: false, rates: 0, saved: 0, error: err.message });
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }

  await browser.close();

  // TỔNG KẾT
  console.log('\n' + '='.repeat(60));
  console.log('📊 TỔNG KẾT');
  console.log('='.repeat(60));
  
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  
  console.log(`✅ Thành công: ${ok.length}/${results.length}`);
  ok.forEach(r => console.log(`   ✅ ${r.name}: ${r.rates} kỳ hạn`));
  if (fail.length > 0) {
    console.log(`❌ Thất bại: ${fail.length}/${results.length}`);
    fail.forEach(r => console.log(`   ❌ ${r.name}: ${r.error || 'Không tìm thấy dữ liệu'}`));
  }
  
  const totalSaved = ok.reduce((s, r) => s + r.saved, 0);
  console.log(`\n📝 Tổng lưu: ${totalSaved} bản ghi`);
  
  // Không exit(1) nếu có ít nhất 1 bank thành công
  if (ok.length === 0) process.exit(1);
}

main().catch(err => { console.error('💥', err); process.exit(1); });
