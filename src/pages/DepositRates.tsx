import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, GROUP_LABELS } from '../lib/types';
import { formatDate, todayISO } from '../lib/utils';
import { VALID_TERMS, TERM_SHORT } from '../lib/termMapping';
import { TableSkeleton } from '../components/Skeleton';
import { Download, AlertCircle, Info, ChevronDown, ChevronUp, Clock, FileText, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportDepositRatesPDF, exportDepositRatesWord } from '../lib/exportReports';

// Types
interface DepositRateRow {
  id: number;
  bank_id: number;
  report_date: string;
  customer_type: string;
  term_code: string;
  rate_min: number | null;
  rate_max: number | null;
  rate_type: string;
  channel: string;
  source: string;
  product_name: string | null;
  min_deposit: number | null;
  is_promotional: boolean;
  note: string | null;
}

interface CellData {
  min: number | null;
  max: number | null;
  hasPolicy: boolean;
  policyNote: string;
}

// Format rate number to Vietnamese style
function fmtRate(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

function fmtRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '-';
  if (min === null) return fmtRate(max);
  if (max === null) return fmtRate(min);
  if (min === max) return fmtRate(min);
  return `${fmtRate(min)}-${fmtRate(max)}`;
}

export default function DepositRates() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [allRates, setAllRates] = useState<DepositRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [recentManual, setRecentManual] = useState<DepositRateRow[]>([]);

  useEffect(() => {
    loadBanks();
    loadAvailableDates();
    loadRecentManual();
  }, []);

  useEffect(() => {
    if (selectedDate) loadRates();
  }, [selectedDate]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadAvailableDates() {
    const { data } = await supabase
      .from('deposit_rates')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(200);
    if (data) {
      const unique = [...new Set(data.map(d => d.report_date))];
      setAvailableDates(unique);
      if (unique.length > 0 && !unique.includes(selectedDate)) {
        setSelectedDate(unique[0]);
      }
    }
  }

  async function loadRates() {
    setLoading(true);
    const { data } = await supabase
      .from('deposit_rates')
      .select('*')
      .eq('report_date', selectedDate);
    setAllRates((data as DepositRateRow[]) || []);
    setLoading(false);
  }

  async function loadRecentManual() {
    const { data } = await supabase
      .from('deposit_rates')
      .select('*')
      .eq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(30);
    setRecentManual((data as DepositRateRow[]) || []);
  }

  // Group banks
  const groups = useMemo(() => [
    { key: 'NHTMNN', label: GROUP_LABELS['NHTMNN'], banks: banks.filter(b => b.group_type === 'NHTMNN') },
    { key: 'NHTMCP_LON', label: GROUP_LABELS['NHTMCP_LON'], banks: banks.filter(b => b.group_type === 'NHTMCP_LON') },
    { key: 'NHTMCP_TB', label: GROUP_LABELS['NHTMCP_TB'], banks: banks.filter(b => b.group_type === 'NHTMCP_TB') },
  ], [banks]);

  // Build cell data: combine standard + policy/online/vip rates
  function getCellData(bankId: number, custType: string, termCode: string): CellData {
    const rates = allRates.filter(r =>
      r.bank_id === bankId &&
      r.customer_type === custType &&
      r.term_code === termCode
    );

    if (rates.length === 0) return { min: null, max: null, hasPolicy: false, policyNote: '' };

    // Standard rate = niêm yết cơ bản
    const standard = rates.find(r => r.rate_type === 'standard');
    // Policy/premium rates
    const policyRates = rates.filter(r => r.rate_type !== 'standard');

    let min = standard?.rate_min ?? null;
    let max = standard?.rate_max ?? null;

    // Nếu có LS theo chính sách, lấy max cao nhất
    let hasPolicy = false;
    let policyNote = '';

    for (const pr of policyRates) {
      if (pr.rate_max !== null) {
        if (max === null || pr.rate_max > max) {
          max = pr.rate_max;
          hasPolicy = true;
          // Build note
          const parts: string[] = [];
          if (pr.product_name) parts.push(pr.product_name);
          if (pr.min_deposit) parts.push(`TG >= ${pr.min_deposit} tr`);
          if (pr.channel === 'online') parts.push('Gửi online');
          if (pr.is_promotional) parts.push('Khuyến mại');
          if (pr.rate_type === 'vip') parts.push('KH VIP');
          policyNote = parts.join(', ');
        }
      }
    }

    return { min, max, hasPolicy, policyNote };
  }

  // Find column-level max and min for highlighting
  const columnStats = useMemo(() => {
    const stats: Record<string, Record<string, { max: number; min: number }>> = {};
    for (const custType of ['CN', 'TCKT']) {
      stats[custType] = {};
      for (const term of VALID_TERMS) {
        let allMax: number[] = [];
        for (const bank of banks) {
          const cell = getCellData(bank.id, custType, term);
          if (cell.max !== null) allMax.push(cell.max);
        }
        if (allMax.length > 0) {
          stats[custType][term] = { max: Math.max(...allMax), min: Math.min(...allMax) };
        }
      }
    }
    return stats;
  }, [allRates, banks]);

  // Export Excel
  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const wsData: any[][] = [
        [`BẢNG TỔNG HỢP LÃI SUẤT TIỀN GỬI - Ngày ${formatDate(selectedDate)}`],
        ['Đơn vị: %/năm'],
        [],
        ['Ngân hàng', '', ...VALID_TERMS.map(t => TERM_SHORT[t])],
      ];

      for (const group of groups) {
        wsData.push([group.label]);
        for (const bank of group.banks) {
          // CN row
          const cnCells = VALID_TERMS.map(t => {
            const cell = getCellData(bank.id, 'CN', t);
            return fmtRange(cell.min, cell.max);
          });
          wsData.push([bank.name, 'CN', ...cnCells]);

          // TCKT row
          const tcktCells = VALID_TERMS.map(t => {
            const cell = getCellData(bank.id, 'TCKT', t);
            return fmtRange(cell.min, cell.max);
          });
          wsData.push(['', 'TCKT', ...tcktCells]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Set column widths
      ws['!cols'] = [{ wch: 16 }, { wch: 6 }, ...VALID_TERMS.map(() => ({ wch: 12 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'LS Tiền gửi');
      XLSX.writeFile(wb, `lai-suat-tien-gui-${selectedDate}.xlsx`);
      toast.success('Đã xuất file Excel!');
    } catch {
      toast.error('Lỗi khi xuất Excel');
    }
  }

  function getBankName(bankId: number): string {
    return banks.find(b => b.id === bankId)?.name || `NH #${bankId}`;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ngày báo cáo</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" />
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setShowRecent(!showRecent); }} 
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors">
              <Clock size={16} /> {showRecent ? 'Ẩn' : 'LS nhập tay'}
              {showRecent ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors">
              <Download size={16} /> Xuất Excel
            </button>
            <button onClick={() => { exportDepositRatesPDF(banks, getCellData, selectedDate); toast.success("Dang xuat PDF..."); }} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors">
              <FileDown size={16} /> PDF
            </button>
            <button onClick={() => { exportDepositRatesWord(banks, getCellData, selectedDate); toast.success("Dang xuat Word..."); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
              <FileText size={16} /> Word
            </button>
          </div>
        </div>
        {availableDates.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="text-xs text-gray-400">Ngày có dữ liệu:</span>
            {availableDates.slice(0, 10).map(d => (
              <button key={d} onClick={() => setSelectedDate(d)}
                className={`text-xs px-2 py-0.5 rounded ${d === selectedDate ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {formatDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent manual entries (collapsible) */}
      {showRecent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-[#1e3a5f] text-sm">Lãi suất nhập tay gần đây</h3>
          </div>
          {recentManual.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Chưa có dữ liệu nhập tay</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-3 py-2 text-left">Ngân hàng</th>
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-center">KH</th>
                    <th className="px-3 py-2 text-center">Kỳ hạn</th>
                    <th className="px-3 py-2 text-center">Min</th>
                    <th className="px-3 py-2 text-center">Max</th>
                    <th className="px-3 py-2 text-left">Loại</th>
                    <th className="px-3 py-2 text-left">Sản phẩm</th>
                    <th className="px-3 py-2 text-center">Kênh</th>
                  </tr>
                </thead>
                <tbody>
                  {recentManual.map(r => (
                    <tr key={r.id} className="border-t hover:bg-blue-50/30">
                      <td className="px-3 py-1.5 font-medium text-[#1e3a5f]">{getBankName(r.bank_id)}</td>
                      <td className="px-3 py-1.5">{formatDate(r.report_date)}</td>
                      <td className="px-3 py-1.5 text-center">{r.customer_type}</td>
                      <td className="px-3 py-1.5 text-center">{r.term_code}</td>
                      <td className="px-3 py-1.5 text-center">{fmtRate(r.rate_min)}</td>
                      <td className="px-3 py-1.5 text-center">{fmtRate(r.rate_max)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          r.rate_type === 'policy' ? 'bg-purple-100 text-purple-700' :
                          r.rate_type === 'online' ? 'bg-blue-100 text-blue-700' :
                          r.rate_type === 'vip' ? 'bg-amber-100 text-amber-700' :
                          r.rate_type === 'promotional' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {r.rate_type}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{r.product_name || '-'}</td>
                      <td className="px-3 py-1.5 text-center">{r.channel === 'online' ? 'Online' : 'Quầy'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Main Report Table */}
      {loading ? (
        <TableSkeleton rows={12} cols={11} />
      ) : allRates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-500">Không có dữ liệu cho ngày {formatDate(selectedDate)}</h3>
          <p className="text-sm text-gray-400 mt-1">Chọn ngày khác hoặc chạy thu thập tự động</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-[#1e3a5f]">
              Bảng tổng hợp lãi suất tiền gửi — Ngày {formatDate(selectedDate)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Đơn vị: %/năm | 
              <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded-sm align-middle mx-1" /> Cao nhất |
              <span className="inline-block w-3 h-3 bg-red-100 border border-red-300 rounded-sm align-middle mx-1" /> Thấp nhất |
              <span className="inline-block w-2 h-2 bg-purple-400 rounded-full align-middle mx-1" /> Có LS CSKH
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm rate-table">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-3 py-2.5 text-left font-medium min-w-[130px] sticky left-0 bg-[#1e3a5f] z-20">Ngân hàng</th>
                  <th className="px-2 py-2.5 text-center font-medium w-[45px]"></th>
                  {VALID_TERMS.map(t => (
                    <th key={t} className="px-2 py-2.5 text-center font-medium min-w-[85px]">{TERM_SHORT[t]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <>
                    {/* Group header */}
                    <tr key={group.key} className="bg-gray-100">
                      <td colSpan={VALID_TERMS.length + 2} className="px-3 py-2 font-bold text-[#1e3a5f] text-xs uppercase sticky left-0 bg-gray-100">
                        {group.label}
                      </td>
                    </tr>

                    {/* Banks in group */}
                    {group.banks.map((bank, bankIdx) => (
                      <>
                        {/* CN row */}
                        <tr key={`${bank.id}-cn`} className={`border-t ${bankIdx % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-blue-50/20`}>
                          <td className="px-3 py-1.5 font-medium text-[#1e3a5f] sticky left-0 bg-white z-10" rowSpan={2}>
                            <a href={bank.rate_page_url || '#'} target="_blank" rel="noopener noreferrer"
                              className="hover:underline hover:text-blue-600" title={bank.full_name || bank.name}>
                              {bank.name}
                            </a>
                          </td>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-500 font-medium">CN</td>
                          {VALID_TERMS.map(term => {
                            const cell = getCellData(bank.id, 'CN', term);
                            const stats = columnStats['CN']?.[term];
                            const isMax = stats && cell.max !== null && cell.max === stats.max;
                            const isMin = stats && cell.max !== null && cell.max === stats.min && stats.max !== stats.min;

                            return (
                              <td key={term} className={`px-2 py-1.5 text-center relative group ${
                                isMax ? 'bg-green-50 text-green-800 font-semibold' : 
                                isMin ? 'bg-red-50 text-red-700' : ''
                              }`}>
                                <span>{fmtRange(cell.min, cell.max)}</span>
                                {cell.hasPolicy && (
                                  <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full ml-0.5 align-super" />
                                )}
                                {cell.hasPolicy && cell.policyNote && (
                                  <div className="hidden group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
                                    {cell.policyNote}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* TCKT row */}
                        <tr key={`${bank.id}-tckt`} className={`${bankIdx % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-blue-50/20`}>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-500 font-medium">TCKT</td>
                          {VALID_TERMS.map(term => {
                            const cell = getCellData(bank.id, 'TCKT', term);
                            const stats = columnStats['TCKT']?.[term];
                            const isMax = stats && cell.max !== null && cell.max === stats.max;
                            const isMin = stats && cell.max !== null && cell.max === stats.min && stats.max !== stats.min;

                            return (
                              <td key={term} className={`px-2 py-1.5 text-center relative group ${
                                isMax ? 'bg-green-50 text-green-800 font-semibold' : 
                                isMin ? 'bg-red-50 text-red-700' : ''
                              }`}>
                                <span>{fmtRange(cell.min, cell.max)}</span>
                                {cell.hasPolicy && (
                                  <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full ml-0.5 align-super" />
                                )}
                                {cell.hasPolicy && cell.policyNote && (
                                  <div className="hidden group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
                                    {cell.policyNote}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            <p>
              <span className="inline-block w-2 h-2 bg-purple-400 rounded-full align-middle mr-1" />
              Mức lãi suất cận trên bao gồm lãi suất phụ trội/CSKH (rê chuột vào ô để xem điều kiện).
              Dữ liệu LS niêm yết lấy từ CafeF, LS CSKH/phụ trội nhập thủ công.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
