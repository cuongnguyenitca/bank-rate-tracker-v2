import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, DepositRate, TERM_CODES, GROUP_LABELS } from '../lib/types';
import { formatRateRange, formatDate, todayISO } from '../lib/utils';
import { TableSkeleton } from '../components/Skeleton';
import { Download, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DepositRates() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [rates, setRates] = useState<DepositRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [customerType, setCustomerType] = useState<'CN' | 'TCKT'>('CN');
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  useEffect(() => {
    loadBanks();
    loadAvailableDates();
  }, []);

  useEffect(() => {
    if (selectedDate) loadRates();
  }, [selectedDate, customerType]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadAvailableDates() {
    const { data } = await supabase
      .from('deposit_rates')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(100);
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
      .eq('report_date', selectedDate)
      .eq('customer_type', customerType);
    setRates(data || []);
    setLoading(false);
  }

  // Build table structure grouped by bank group
  const groups: { group: string; label: string; banks: Bank[] }[] = [
    { group: 'NHTMNN', label: GROUP_LABELS['NHTMNN'], banks: banks.filter(b => b.group_type === 'NHTMNN') },
    { group: 'NHTMCP_LON', label: GROUP_LABELS['NHTMCP_LON'], banks: banks.filter(b => b.group_type === 'NHTMCP_LON') },
    { group: 'NHTMCP_TB', label: GROUP_LABELS['NHTMCP_TB'], banks: banks.filter(b => b.group_type === 'NHTMCP_TB') },
  ];

  // Find max and min for each term
  const termStats: Record<string, { max: number; min: number }> = {};
  TERM_CODES.forEach(term => {
    const termRates = rates.filter(r => r.term_code === term && r.rate_max !== null);
    if (termRates.length > 0) {
      const maxVals = termRates.map(r => r.rate_max!);
      termStats[term] = { max: Math.max(...maxVals), min: Math.min(...maxVals) };
    }
  });

  function getRateCell(bankId: number, termCode: string) {
    const rate = rates.find(r => r.bank_id === bankId && r.term_code === termCode);
    if (!rate) return { display: '-', isMax: false, isMin: false };
    const display = formatRateRange(rate.rate_min, rate.rate_max);
    const stats = termStats[termCode];
    const isMax = stats && rate.rate_max === stats.max;
    const isMin = stats && rate.rate_max === stats.min;
    return { display, isMax, isMin };
  }

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const wsData: any[][] = [
        [`BÁO CÁO LÃI SUẤT TIỀN GỬI - ${customerType === 'CN' ? 'CÁ NHÂN' : 'TỔ CHỨC KINH TẾ'} - Ngày ${formatDate(selectedDate)}`],
        [],
        ['Ngân hàng', ...TERM_CODES.map(t => t)],
      ];

      groups.forEach(g => {
        wsData.push([g.label]);
        g.banks.forEach(bank => {
          const row = [bank.name, ...TERM_CODES.map(t => getRateCell(bank.id, t).display)];
          wsData.push(row);
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'LS Tiền gửi');
      XLSX.writeFile(wb, `lai-suat-tien-gui-${selectedDate}.xlsx`);
      toast.success('Đã xuất file Excel!');
    } catch {
      toast.error('Lỗi khi xuất Excel');
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ngày báo cáo</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Đối tượng KH</label>
            <select
              value={customerType}
              onChange={e => setCustomerType(e.target.value as 'CN' | 'TCKT')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            >
              <option value="CN">Cá nhân (CN)</option>
              <option value="TCKT">Tổ chức kinh tế (TCKT)</option>
            </select>
          </div>
          <div className="ml-auto">
            <label className="block text-xs font-medium text-transparent mb-1">.</label>
            <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors">
              <Download size={16} /> Xuất Excel
            </button>
          </div>
        </div>
        {availableDates.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="text-xs text-gray-400">Ngày có dữ liệu:</span>
            {availableDates.slice(0, 7).map(d => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`text-xs px-2 py-0.5 rounded ${d === selectedDate ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {formatDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={10} cols={10} />
      ) : rates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-500">Không có dữ liệu cho ngày {formatDate(selectedDate)}</h3>
          <p className="text-sm text-gray-400 mt-1">Chọn ngày khác hoặc vào trang Nhập liệu để thêm dữ liệu</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-[#1e3a5f]">
              Bảng tổng hợp lãi suất tiền gửi - {customerType === 'CN' ? 'Cá nhân' : 'TCKT'} ({formatDate(selectedDate)})
            </h3>
            <p className="text-xs text-gray-400 mt-1">Đơn vị: %/năm | <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded-sm align-middle" /> Cao nhất | <span className="inline-block w-3 h-3 bg-red-100 border border-red-300 rounded-sm align-middle" /> Thấp nhất</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm rate-table">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-3 py-2.5 text-left font-medium min-w-[140px] sticky left-0 bg-[#1e3a5f] z-20">Ngân hàng</th>
                  {TERM_CODES.map(t => (
                    <th key={t} className="px-3 py-2.5 text-center font-medium min-w-[90px]">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <>
                    <tr key={g.group} className="bg-gray-100">
                      <td colSpan={TERM_CODES.length + 1} className="px-3 py-2 font-semibold text-[#1e3a5f] text-xs uppercase sticky left-0 bg-gray-100">
                        {g.label}
                      </td>
                    </tr>
                    {g.banks.map(bank => (
                      <tr key={bank.id} className="border-t hover:bg-blue-50/30">
                        <td className="px-3 py-2 font-medium text-[#1e3a5f] sticky left-0 bg-white z-10">{bank.name}</td>
                        {TERM_CODES.map(t => {
                          const { display, isMax, isMin } = getRateCell(bank.id, t);
                          return (
                            <td
                              key={t}
                              className={`px-3 py-2 text-center ${isMax ? 'rate-highlight-high font-semibold text-green-700' : ''} ${isMin ? 'rate-highlight-low text-red-600' : ''}`}
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
