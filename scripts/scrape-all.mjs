// =====================================================================
// CHẨN ĐOÁN: Khám phá cấu trúc dữ liệu cafef.vn
// Script này KHÔNG lưu dữ liệu, chỉ in ra log để phân tích
// =====================================================================

import { chromium } from 'playwright';

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 CHẨN ĐOÁN CẤU TRÚC CAFEF.VN');
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // ============ BẮT TẤT CẢ NETWORK REQUESTS ============
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();

    // Chỉ quan tâm đến API calls (JSON, XHR)
    const contentType = (await response.headerValue('content-type')) || '';
    const isAPI = contentType.includes('json') || contentType.includes('xml') ||
                  url.includes('/api/') || url.includes('ajax') || url.includes('servlet') ||
                  url.includes('interest') || url.includes('lai-suat') || url.includes('rate');

    if (isAPI && status === 200) {
      let bodyPreview = '';
      try {
        const body = await response.text();
        bodyPreview = body.substring(0, 500);
        apiCalls.push({ url, contentType, bodyLength: body.length, bodyPreview });
      } catch (e) {
        apiCalls.push({ url, contentType, bodyLength: 0, bodyPreview: 'Cannot read body' });
      }
    }
  });

  // ============ MỞ TRANG CAFEF ============
  console.log('\n📡 Truy cập cafef.vn/du-lieu/lai-suat-ngan-hang.chn...');
  await page.goto('https://cafef.vn/du-lieu/lai-suat-ngan-hang.chn', {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  console.log('✅ Trang đã load xong (networkidle)');

  // Đợi thêm cho JS render
  await page.waitForTimeout(8000);

  // Scroll xuống để trigger lazy load
  console.log('📜 Scroll trang...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 800);
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000);

  // ============ IN KẾT QUẢ API CALLS ============
  console.log('\n' + '='.repeat(60));
  console.log(`📋 TÌM THẤY ${apiCalls.length} API CALLS`);
  console.log('='.repeat(60));

  apiCalls.forEach((call, i) => {
    console.log(`\n--- API Call #${i + 1} ---`);
    console.log(`URL: ${call.url}`);
    console.log(`Content-Type: ${call.contentType}`);
    console.log(`Body Length: ${call.bodyLength} chars`);
    console.log(`Preview: ${call.bodyPreview}`);
  });

  // ============ PHÂN TÍCH HTML CỦA TRANG ============
  console.log('\n' + '='.repeat(60));
  console.log('📋 PHÂN TÍCH HTML');
  console.log('='.repeat(60));

  const analysis = await page.evaluate(() => {
    const result = {};

    // Đếm bảng
    const tables = document.querySelectorAll('table');
    result.tableCount = tables.length;
    result.tables = [];
    tables.forEach((t, i) => {
      const rows = t.querySelectorAll('tr');
      const cells = rows[0] ? Array.from(rows[0].querySelectorAll('th, td')).map(c => c.textContent.trim()) : [];
      result.tables.push({
        index: i,
        rows: rows.length,
        headerCells: cells.slice(0, 10),
        className: t.className,
        parentClass: t.parentElement ? t.parentElement.className : '',
      });
    });

    // Tìm iframes (cafef có thể load data trong iframe)
    const iframes = document.querySelectorAll('iframe');
    result.iframeCount = iframes.length;
    result.iframes = [];
    iframes.forEach((f, i) => {
      result.iframes.push({ index: i, src: f.src, id: f.id, className: f.className });
    });

    // Tìm các select/dropdown (kỳ hạn)
    const selects = document.querySelectorAll('select');
    result.selectCount = selects.length;
    result.selects = [];
    selects.forEach((s, i) => {
      const options = Array.from(s.querySelectorAll('option')).map(o => ({ value: o.value, text: o.textContent.trim() }));
      result.selects.push({ index: i, id: s.id, name: s.name, className: s.className, options: options.slice(0, 15) });
    });

    // Tìm text có chứa "lãi suất" hoặc "%"
    const allText = document.body.innerText;
    const lines = allText.split('\n').filter(l => l.includes('%') || l.toLowerCase().includes('lãi suất') || l.toLowerCase().includes('tháng'));
    result.rateLines = lines.slice(0, 30);

    // Tìm data attributes
    const dataElements = document.querySelectorAll('[data-url], [data-api], [data-src], [ng-src], [data-bind]');
    result.dataElements = [];
    dataElements.forEach((el, i) => {
      if (i < 10) {
        const attrs = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-') || attr.name.startsWith('ng-')) {
            attrs[attr.name] = attr.value.substring(0, 200);
          }
        }
        result.dataElements.push({ tag: el.tagName, attrs });
      }
    });

    return result;
  });

  console.log(`\nBảng (tables): ${analysis.tableCount}`);
  analysis.tables.forEach(t => {
    console.log(`  Table #${t.index}: ${t.rows} rows, class="${t.className}", parent="${t.parentClass}"`);
    console.log(`    Headers: ${JSON.stringify(t.headerCells)}`);
  });

  console.log(`\nIframes: ${analysis.iframeCount}`);
  analysis.iframes.forEach(f => {
    console.log(`  Iframe #${f.index}: src="${f.src}", id="${f.id}"`);
  });

  console.log(`\nSelect/Dropdown: ${analysis.selectCount}`);
  analysis.selects.forEach(s => {
    console.log(`  Select #${s.index}: id="${s.id}", name="${s.name}", class="${s.className}"`);
    console.log(`    Options: ${JSON.stringify(s.options)}`);
  });

  console.log(`\nDòng chứa lãi suất (${analysis.rateLines.length}):`);
  analysis.rateLines.forEach(l => console.log(`  "${l.trim().substring(0, 150)}"`));

  console.log(`\nData elements: ${analysis.dataElements.length}`);
  analysis.dataElements.forEach(d => console.log(`  ${d.tag}: ${JSON.stringify(d.attrs)}`));

  // ============ THỬ TÌM API ENDPOINT ============
  console.log('\n' + '='.repeat(60));
  console.log('🔍 THỬ GỌI CÁC API PHỔ BIẾN CỦA CAFEF');
  console.log('='.repeat(60));

  const possibleAPIs = [
    'https://cafef.vn/du-lieu/ajax/lai-suat-ngan-hang.chn',
    'https://cafef.vn/api/interest-rate',
    'https://cafef.vn/du-lieu/InterestRate.ashx',
    'https://api.cafef.vn/interest-rate',
    'https://cafef.vn/du-lieu/lai-suat-ngan-hang-ajax.chn',
  ];

  for (const apiUrl of possibleAPIs) {
    try {
      const resp = await page.evaluate(async (url) => {
        try {
          const r = await fetch(url);
          const text = await r.text();
          return { status: r.status, length: text.length, preview: text.substring(0, 300) };
        } catch (e) {
          return { error: e.message };
        }
      }, apiUrl);
      console.log(`\n${apiUrl}:`);
      console.log(`  ${JSON.stringify(resp)}`);
    } catch (e) {
      console.log(`\n${apiUrl}: Error - ${e.message}`);
    }
  }

  await browser.close();
  console.log('\n✅ Chẩn đoán hoàn tất');
}

main().catch(err => { console.error('💥', err); process.exit(1); });
