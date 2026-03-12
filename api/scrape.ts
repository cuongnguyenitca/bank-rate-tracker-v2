import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// ============================================
// CẤU HÌNH SUPABASE
// ============================================
const supabaseUrl = 'https://kccdttwbjheadqnakqje.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// TYPES
// ============================================
interface ScrapedRate {
  term_code: string;
  rate_min: number | null;
  rate_max: number | null;
}

interface ScrapeResult {
  bank_code: string;
  bank_name: string;
  success: boolean;
  rates_cn: ScrapedRate[];
  rates_tckt: ScrapedRate[];
  error?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function parseRate(text: string): number | null {
  if (!text || text.trim() === '-' || text.trim() === '') return null;
  const cleaned = text.replace(/[%,]/g, '.').replace(/\s/g, '').replace(/\.+/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function todayISO(): string {
  const d = new Date();
  // Vietnam timezone UTC+7
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().split('T')[0];
}

async function fetchHTML(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

// ============================================
// SCRAPERS CHO TỪNG NGÂN HÀNG
// ============================================

// --- BIDV ---
async function scrapeBIDV(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'BIDV', bank_name: 'BIDV', success: false, rates_cn: [], rates_tckt: [] };
  try {
    const html = await fetchHTML('https://www.bidv.com.vn/ServicesBIDV/InterestDetailServlet');
    const $ = cheerio.load(html);
    
    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '1 tháng': '1M', '3 tháng': '3M',
      '6 tháng': '6M', '9 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();
        
        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// --- Vietcombank ---
async function scrapeVCB(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'VCB', bank_name: 'Vietcombank', success: false, rates_cn: [], rates_tckt: [] };
  try {
    const html = await fetchHTML('https://portal.vietcombank.com.vn/Personal/TK/Pages/ty-gia.aspx?devicechannel=default');
    const $ = cheerio.load(html);

    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '01 tháng': '1M', '1 tháng': '1M',
      '03 tháng': '3M', '3 tháng': '3M', '06 tháng': '6M', '6 tháng': '6M',
      '09 tháng': '9M', '9 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table.table-interest tr, table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();

        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// --- VietinBank ---
async function scrapeCTG(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'CTG', bank_name: 'VietinBank', success: false, rates_cn: [], rates_tckt: [] };
  try {
    const html = await fetchHTML('https://www.vietinbank.vn/web/home/vn/lai-suat/lai-suat-huy-dong-von');
    const $ = cheerio.load(html);

    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '01 tháng': '1M', '1 tháng': '1M',
      '03 tháng': '3M', '3 tháng': '3M', '06 tháng': '6M', '6 tháng': '6M',
      '09 tháng': '9M', '9 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();
        
        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// --- Techcombank ---
async function scrapeTCB(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'TCB', bank_name: 'Techcombank', success: false, rates_cn: [], rates_tckt: [] };
  try {
    // Techcombank often has JSON API
    const html = await fetchHTML('https://techcombank.com/cong-cu-tien-ich/bieu-phi-lai-suat');
    const $ = cheerio.load(html);

    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '1 tháng': '1M', '3 tháng': '3M',
      '6 tháng': '6M', '9 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();
        
        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// --- ACB ---
async function scrapeACB(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'ACB', bank_name: 'ACB', success: false, rates_cn: [], rates_tckt: [] };
  try {
    const html = await fetchHTML('https://www.acb.com.vn/vn/interest/personal/tai-khoan-tien-gui/khac/lai-suat');
    const $ = cheerio.load(html);

    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '1 tháng': '1M', '01 tháng': '1M',
      '3 tháng': '3M', '03 tháng': '3M', '6 tháng': '6M', '06 tháng': '6M',
      '9 tháng': '9M', '09 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();
        
        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// --- SHB ---
async function scrapeSHB(): Promise<ScrapeResult> {
  const result: ScrapeResult = { bank_code: 'SHB', bank_name: 'SHB', success: false, rates_cn: [], rates_tckt: [] };
  try {
    const html = await fetchHTML('https://www.shb.com.vn/category/lien-ket-nhanh/lai-suat/');
    const $ = cheerio.load(html);

    const termMap: Record<string, string> = {
      'không kỳ hạn': 'KKH', '1 tháng': '1M', '01 tháng': '1M',
      '3 tháng': '3M', '03 tháng': '3M', '6 tháng': '6M', '06 tháng': '6M',
      '9 tháng': '9M', '09 tháng': '9M', '12 tháng': '12M',
      '18 tháng': '18M', '24 tháng': '24M', '36 tháng': '36M',
    };

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const termText = $(cells[0]).text().trim().toLowerCase();
        const rateText = $(cells[1]).text().trim();
        
        for (const [key, code] of Object.entries(termMap)) {
          if (termText.includes(key)) {
            const rate = parseRate(rateText);
            if (rate !== null) {
              result.rates_cn.push({ term_code: code, rate_min: rate, rate_max: rate });
            }
            break;
          }
        }
      }
    });

    result.success = result.rates_cn.length > 0;
  } catch (err: any) {
    result.error = err.message;
  }
  return result;
}

// ============================================
// DANH SÁCH TẤT CẢ SCRAPERS
// ============================================
const SCRAPERS: Record<string, () => Promise<ScrapeResult>> = {
  'BIDV': scrapeBIDV,
  'VCB': scrapeVCB,
  'CTG': scrapeCTG,
  'TCB': scrapeTCB,
  'ACB': scrapeACB,
  'SHB': scrapeSHB,
};

// ============================================
// LƯU KẾT QUẢ VÀO SUPABASE
// ============================================
async function saveRatesToDB(result: ScrapeResult, reportDate: string) {
  // Get bank_id from code
  const { data: bank } = await supabase
    .from('banks')
    .select('id')
    .eq('code', result.bank_code)
    .single();

  if (!bank) return { saved: 0, error: `Bank ${result.bank_code} not found` };

  let saved = 0;

  // Save CN rates
  for (const rate of result.rates_cn) {
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

  // Save TCKT rates
  for (const rate of result.rates_tckt) {
    const { error } = await supabase.from('deposit_rates').upsert({
      bank_id: bank.id,
      report_date: reportDate,
      customer_type: 'TCKT',
      term_code: rate.term_code,
      rate_min: rate.rate_min,
      rate_max: rate.rate_max,
      rate_type: 'standard',
    }, { onConflict: 'bank_id,report_date,customer_type,term_code,rate_type' });

    if (!error) saved++;
  }

  return { saved, error: null };
}

// ============================================
// MAIN API HANDLER
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Optional: verify secret for cron jobs
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.headers['x-vercel-cron'] === '1';
  
  // Allow if: cron job, or has valid auth, or is manual trigger from app
  const bankCode = req.query.bank as string | undefined;
  const reportDate = todayISO();
  
  const results: Array<{
    bank: string;
    success: boolean;
    rates_found: number;
    saved: number;
    error?: string;
  }> = [];

  // If specific bank requested, only scrape that one
  const scrapersToRun = bankCode
    ? { [bankCode]: SCRAPERS[bankCode] }
    : SCRAPERS;

  for (const [code, scraper] of Object.entries(scrapersToRun)) {
    if (!scraper) {
      results.push({ bank: code, success: false, rates_found: 0, saved: 0, error: 'No scraper available' });
      continue;
    }

    try {
      const scrapeResult = await scraper();
      const totalRates = scrapeResult.rates_cn.length + scrapeResult.rates_tckt.length;

      if (scrapeResult.success) {
        const { saved } = await saveRatesToDB(scrapeResult, reportDate);
        results.push({ bank: code, success: true, rates_found: totalRates, saved });
      } else {
        results.push({
          bank: code,
          success: false,
          rates_found: 0,
          saved: 0,
          error: scrapeResult.error || 'No rates found',
        });
      }
    } catch (err: any) {
      results.push({ bank: code, success: false, rates_found: 0, saved: 0, error: err.message });
    }
  }

  const summary = {
    date: reportDate,
    total_banks: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };

  return res.status(200).json(summary);
}
