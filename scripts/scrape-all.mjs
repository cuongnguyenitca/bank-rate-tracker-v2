// =====================================================================
// THU THẬP LÃI SUẤT TỰ ĐỘNG - TẤT CẢ NGÂN HÀNG (v3)
// Nguồn: simplize.vn (trang tổng hợp lãi suất - 1 trang duy nhất)
// Backup: website chính thức từng ngân hàng
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

function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function log(msg) {
  const t = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${t}] ${msg}`);
}

const VALID_TERMS = ['KKH','1M','3M','6M','9M','12M','18M','24M','36M'];

// Mapping tên ngân hàng trên simplize.vn -> mã code trong DB
const BANK_NAME_MAP = {
  'agribank': 'AGR',
  'bidv': 'BIDV',
  'vietcombank': 'VCB',
  'vietinbank': 'CTG',
  'acb': 'ACB',
  'techcombank': 'TCB',
  'sacombank': 'STB',
  'shb': 'SHB',
  'vpbank': 'VPB',
  'mbbank': 'MBB',
  'mb': 'MBB',
  'lpbank': 'LPB',
  'lienvietpostbank': 'LPB',
  'msb': 'MSB',
  'eximbank': 'EIB',
  'vib': 'VIB',
  'abbank': 'ABB',
  'hdbank': 'HDB',
  'seabank': 'SSB',
};

// Mapping header cột trên simplize -> term code
const COLUMN_MAP = {
  'không kỳ hạn': 'KKH',
  'kkh': 'KKH',
  '1 tháng': '1M',
  '3 tháng': '3M',
  '6 tháng': '6M',
  '9 tháng': '9M',
  '12 tháng': '12M',
  '13 tháng': '13M',
  '18 tháng': '18M',
  '24 tháng': '24M',
  '36 tháng': '36M',
};

function parseRate(text) {
  if (!text) return null;
  const cleaned = text.replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '').replace(/\u00a0/g, '').replace(/−/g, '-');
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === 'N/A') return null;
  const num = parseFloat(cleaned);
  return (isNaN(num) || num <= 0 || num > 20) ? null : Math.round(num * 100) / 100;
}

function matchBankCode(name) {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  for (const [key, code] of Object.entries(BANK_NAME_MAP)) {
    if (lower.includes(key)) return code;
  }
  return null;
}

// ============ NGUỒN CHÍNH: simplize.vn ============
async function scrapeSimplize(page) {
  log('📡 Truy cập simplize.vn...');
  await page.goto('https://simplize.vn/lai-suat-ngan-hang', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  
  // Đợi bảng lãi suất xuất hiện
  await page.waitForTimeout(5000);
  
  // Scroll xuống để load bảng
  await page.evaluate(() => {
    window.scrollTo(0, 2000);
  });
  await page.waitForTimeout(3000);
  
  // Đọc dữ liệu bảng
  const data = await page.evaluate(() => {
    const results = {};
    
    // Tìm tất cả bảng trên trang
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 3) continue; // Bỏ bảng quá nhỏ
      
      // Đọc header để xác định cột
      let headers = [];
      const headerRow = rows[0];
      const headerCells = headerRow.querySelectorAll('th, td');
      headerCells.forEach(cell => {
        headers.push((cell.textContent || '').trim().toLowerCase());
      });
      
      // Nếu header không chứa từ khóa liên quan lãi suất, bỏ qua
      const hasRateHeaders = headers.some(h => 
        h.includes('tháng') || h.includes('kỳ hạn') || h.includes('không kỳ')
      );
      if (!hasRateHeaders && headers.length < 5) continue;
      
      // Đọc từng dòng dữ liệu
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td, th');
        if (cells.length < 3) continue;
        
        const bankName = (cells[0].textContent || '').trim();
        if (!bankName || bankName.length < 2) continue;
        
        const bankRates = {};
        for (let j = 1; j < cells.length && j < headers.length; j++) {
          const rateText = (cells[j].textContent || '').trim();
          bankRates[headers[j]] = rateText;
        }
        
        results[bankName] = bankRates;
      }
    }
    
    return results;
  });

  log(`📊 Đọc được ${Object.keys(data).length} ngân hàng từ simplize.vn`);
  return data;
}

// ============ BACKUP: Techcombank blog ============
async function scrapeTechcombankBlog(page) {
  log('📡 [Backup] Truy cập techcombank.com blog...');
  await page.goto('https://techcombank.com/thong-tin/blog/lai-suat-tiet-kiem', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  
  const data = await page.evaluate(() => {
    const results = {};
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 5) continue;
      
      let headers = [];
      const headerRow = rows[0];
      headerRow.querySelectorAll('th, td').forEach(cell => {
        headers.push((cell.textContent || '').trim().toLowerCase());
      });
      
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td, th');
        if (cells.length < 3) continue;
        
        const bankName = (cells[0].textContent || '').trim();
        if (!bankName || bankName.length < 2) continue;
        
        const bankRates = {};
        for (let j = 1; j < cells.length && j < headers.length; j++) {
          bankRates[headers[j]] = (cells[j].textContent || '').trim();
        }
        results[bankName] = bankRates;
      }
    }
    return results;
  });

  log(`📊 [Backup] Đọc được ${Object.keys(data).length} ngân hàng từ Techcombank blog`);
  return data;
}

// ============ XỬ LÝ VÀ LƯU DỮ LIỆU ============
async function processAndSave(rawData, reportDate) {
  const results = [];
  
  // Lấy danh sách bank từ DB
  const { data: banks } = await supabase.from('banks').select('id, code, name').eq('is_active', true);
  if (!banks) { log('❌ Không đọc được danh sách ngân hàng từ DB'); return results; }

  for (const [bankName, rates] of Object.entries(rawData)) {
    const bankCode = matchBankCode(bankName);
    if (!bankCode) continue;
    
    const bank = banks.find(b => b.code === bankCode);
    if (!bank) continue;

    const parsedRates = [];
    
    for (const [colHeader, rateText] of Object.entries(rates)) {
      // Tìm term code từ header
      let termCode = null;
      const colLower = colHeader.toLowerCase();
      
      for (const [key, code] of Object.entries(COLUMN_MAP)) {
        if (colLower.includes(key)) {
          termCode = code;
          break;
        }
      }
      
      // Fallback: thử match số + tháng
      if (!termCode) {
        const numMatch = colLower.match(/(\d+)\s*th/);
        if (numMatch) {
          const map = { '1': '1M', '3': '3M', '6': '6M', '9': '9M', '12': '12M', '13': '13M', '18': '18M', '24': '24M', '36': '36M' };
          termCode = map[numMatch[1]] || null;
        }
      }
      
      if (!termCode || !VALID_TERMS.includes(termCode)) continue;
      
      const rate = parseRate(rateText);
      if (rate === null) continue;
      
      parsedRates.push({ term_code: termCode, rate_min: rate, rate_max: rate });
    }

    if (parsedRates.length > 0) {
      // Lưu vào DB
      let saved = 0;
      for (const rate of parsedRates) {
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

      log(`✅ ${bank.name} (${bankCode}): ${parsedRates.length} kỳ hạn, lưu ${saved} bản ghi`);
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
  console.log(`🏦 THU THẬP LÃI SUẤT TỰ ĐỘNG - Ngày ${reportDate}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });
  
  const page = await context.newPage();
  // Block heavy resources
  await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,webm,woff,woff2}', route => route.abort());

  let allResults = [];

  // === NGUỒN 1: simplize.vn ===
  try {
    const simplizeData = await scrapeSimplize(page);
    const simplizeResults = await processAndSave(simplizeData, reportDate);
    allResults = [...simplizeResults];
    
    if (simplizeResults.length > 0) {
      log(`\n✅ Nguồn simplize.vn: Thu thập được ${simplizeResults.length} ngân hàng`);
    }
  } catch (err) {
    log(`❌ Nguồn simplize.vn thất bại: ${err.message}`);
  }

  // Kiểm tra ngân hàng nào chưa có dữ liệu
  const { data: dbBanks } = await supabase.from('banks').select('id, code, name').eq('is_active', true);
  const missingBanks = (dbBanks || []).filter(b => !allResults.find(r => r.bank === b.code));

  if (missingBanks.length > 0) {
    log(`\n⚠️ Còn ${missingBanks.length} NH chưa có: ${missingBanks.map(b => b.code).join(', ')}`);
    
    // === NGUỒN 2 (Backup): Techcombank blog ===
    try {
      log('\n📡 Thử nguồn backup: Techcombank blog...');
      const tcbData = await scrapeTechcombankBlog(page);
      const tcbResults = await processAndSave(tcbData, reportDate);
      
      // Chỉ thêm NH mà simplize chưa có
      for (const result of tcbResults) {
        if (!allResults.find(r => r.bank === result.bank)) {
          allResults.push(result);
        }
      }
      
      if (tcbResults.length > 0) {
        log(`✅ Nguồn backup: Thêm ${tcbResults.length} ngân hàng`);
      }
    } catch (err) {
      log(`❌ Nguồn backup thất bại: ${err.message}`);
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
  const totalBanks = (dbBanks || []).length;
  const missingFinal = (dbBanks || []).filter(b => !allResults.find(r => r.bank === b.code));

  console.log(`✅ Thành công: ${ok.length}/${totalBanks} ngân hàng`);
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
