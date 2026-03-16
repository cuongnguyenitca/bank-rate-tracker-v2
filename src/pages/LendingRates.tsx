import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, GROUP_LABELS } from '../lib/types';
import { formatRate, formatDate } from '../lib/utils';
import { TableSkeleton } from '../components/Skeleton';
import { AlertCircle, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import LendingAvgBatchForm from '../components/LendingAvgBatchForm';
import LendingProductBatchForm from '../components/LendingProductBatchForm';
import toast from 'react-hot-toast';

interface LendingRateAvg {
  id: number;
  bank_id: number;
  report_month: string;
  avg_rate_all: number | null;
  avg_rate_personal: number | null;
  avg_rate_corporate: number | null;
  avg_deposit_rate: number | null;
}

interface LendingRateProduct {
  id: number;
  bank_id: number;
  report_date: string;
  loan_type: string;
  fixed_period: string | null;
  rate_min: number | null;
  rate_max: number | null;
  note: string | null;
}

function fmtRate(v: number | null): string {
  if (v === null || v === undefined) return '-';
  return v.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

function fmtRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '-';
  if (min === null) return fmtRate(max);
  if (max === null) return fmtRate(min);
  if (min === max) return fmtRate(min);
  return `${fmtRate(min)}-${fmtRate(max)}`;
}

export default function LendingRates() {
  const [tab, setTab] = useState<'report_avg' | 'report_product' | 'input_avg' | 'input_product'>('report_avg');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [avgRates, setAvgRates] = useState<LendingRateAvg[]>([]);
  const [productRates, setProductRates] = useState<LendingRateProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => { loadBanks(); }, []);
  useEffect(() => { loadAvgRates(); loadProductRates(); }, [selectedMonth]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadAvgRates() {
    setLoading(true);
    const { data } = await supabase.from('lending_rates_avg').select('*').eq('report_month', selectedMonth);
    setAvgRates(data || []);
    setLoading(false);
  }

  async function loadProductRates() {
    const { data: dateData } = await supabase
      .from('lending_rates_product').select('report_date')
      .order('report_date', { ascending: false }).limit(1);
    const latestDate = dateData?.[0]?.report_date;
    if (latestDate) {
      const { data } = await supabase.from('lending_rates_product').select('*').eq('report_date', latestDate);
      setProductRates(data || []);
    }
  }

  function getBankName(bankId: number) {
    return banks.find(b => b.id === bankId)?.name || '';
  }

  function getBankGroup(bankId: number) {
    return banks.find(b => b.id === bankId)?.group_type || '';
  }

  // Chart data
  const chartData = avgRates.filter(r => r.avg_rate_all).map(r => ({
    name: getBankName(r.bank_id),
    'LSCV BQ': r.avg_rate_all,
    'LSHĐ BQ': r.avg_deposit_rate,
  })).slice(0, 15);

  // NHTMNN and NHTMCP banks
  const nnBanks = banks.filter(b => b.group_type === 'NHTMNN');
  const cpBanks = banks.filter(b => b.group_type !== 'NHTMNN');

  // Export Excel for avg rates
  async function exportAvgExcel() {
    try {
      const XLSX = await import('xlsx');
      const wsData: any[][] = [
        [`BÁO CÁO LSCV BÌNH QUÂN — ${selectedMonth}`],
        ['Đơn vị: %/năm'],
        [],
        ['STT', 'Tên ngân hàng', 'LSCV BQ Chung', 'LSCV BQ KHCN', 'LSCV BQ KHDN', 'LSHĐ BQ'],
      ];
      avgRates.forEach((r, i) => {
        wsData.push([i + 1, getBankName(r.bank_id), r.avg_rate_all, r.avg_rate_personal, r.avg_rate_corporate, r.avg_deposit_rate]);
      });
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'LSCV BQ');
      XLSX.writeFile(wb, `lscv-binh-quan-${selectedMonth}.xlsx`);
      toast.success('Đã xuất Excel!');
    } catch { toast.error('Lỗi xuất Excel'); }
  }

  const tabs = [
    { key: 'report_avg' as const, label: 'Báo cáo LSCV BQ' },
    { key: 'report_product' as const, label: 'Báo cáo LSCV SP' },
    { key: 'input_avg' as const, label: 'Nhập LSCV BQ' },
    { key: 'input_product' as const, label: 'Nhập LSCV SP' },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors px-3 ${
              tab === t.key ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Báo cáo LSCV Bình quân */}
      {tab === 'report_avg' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-[#1e3a5f]">Lãi suất cho vay bình quân — Tháng {selectedMonth}</h3>
              <div className="flex items-center gap-3">
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
                <button onClick={exportAvgExcel} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-emerald-700">
                  <Download size={14} /> Excel
                </button>
              </div>
            </div>
            {loading ? (
              <TableSkeleton rows={10} cols={6} />
            ) : avgRates.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">Chưa có dữ liệu LSCV bình quân tháng {selectedMonth}</p>
                <p className="text-xs text-gray-400 mt-1">Chuyển sang tab "Nhập LSCV BQ" để nhập dữ liệu</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="px-4 py-2.5 text-center font-medium w-12">STT</th>
                      <th className="px-4 py-2.5 text-left font-medium">Tên ngân hàng</th>
                      <th className="px-4 py-2.5 text-center font-medium">LSCV BQ Chung</th>
                      <th className="px-4 py-2.5 text-center font-medium">LSCV BQ KHCN</th>
                      <th className="px-4 py-2.5 text-center font-medium">LSCV BQ KHDN</th>
                      <th className="px-4 py-2.5 text-center font-medium">LSHĐ BQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avgRates.map((r, i) => (
                      <tr key={r.id} className={`border-t ${i % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-blue-50/30`}>
                        <td className="px-4 py-2.5 text-center text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-[#1e3a5f]">{getBankName(r.bank_id)}</td>
                        <td className="px-4 py-2.5 text-center font-semibold">{fmtRate(r.avg_rate_all)}</td>
                        <td className="px-4 py-2.5 text-center">{fmtRate(r.avg_rate_personal)}</td>
                        <td className="px-4 py-2.5 text-center">{fmtRate(r.avg_rate_corporate)}</td>
                        <td className="px-4 py-2.5 text-center">{fmtRate(r.avg_deposit_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h3 className="font-semibold text-[#1e3a5f] mb-4">So sánh LSCV và LSHĐ bình quân</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="LSCV BQ" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="LSHĐ BQ" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Tab: Báo cáo LSCV Sản phẩm */}
      {tab === 'report_product' && (
        <>
          {productRates.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
              <AlertCircle size={40} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">Chưa có dữ liệu LSCV theo sản phẩm</p>
              <p className="text-xs text-gray-400 mt-1">Chuyển sang tab "Nhập LSCV SP" để nhập dữ liệu</p>
            </div>
          ) : (
            <>
              {/* NHTMNN fixed rates table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#1e3a5f]">Chính sách cho vay trung dài hạn cố định LS — Nhóm NHTMNN</h3>
                  <p className="text-xs text-gray-400">Đơn vị: %/năm</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1e3a5f] text-white">
                        <th className="px-4 py-2.5 text-left font-medium">Cố định LS</th>
                        {nnBanks.map(b => (
                          <th key={b.id} className="px-4 py-2.5 text-center font-medium">{b.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['06 tháng đầu', '12 tháng đầu', '18 tháng đầu'].map(period => (
                        <tr key={period} className="border-t hover:bg-blue-50/30">
                          <td className="px-4 py-2.5 font-medium">{period}</td>
                          {nnBanks.map(b => {
                            const r = productRates.find(p => p.bank_id === b.id && p.fixed_period === period);
                            return (
                              <td key={b.id} className="px-4 py-2.5 text-center">
                                {r ? fmtRange(r.rate_min, r.rate_max) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* NHTMCP rates table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#1e3a5f]">Lãi suất cho vay — Nhóm NHTMCP</h3>
                  <p className="text-xs text-gray-400">Đơn vị: %/năm</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1e3a5f] text-white">
                        <th className="px-4 py-2.5 text-center font-medium w-12">STT</th>
                        <th className="px-4 py-2.5 text-left font-medium">Ngân hàng</th>
                        <th className="px-4 py-2.5 text-center font-medium">Ngắn hạn</th>
                        <th className="px-4 py-2.5 text-center font-medium">Trung, dài hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cpBanks.map((b, i) => {
                        const shortTerm = productRates.find(p => p.bank_id === b.id && p.loan_type === 'short_term');
                        const longTerm = productRates.find(p => p.bank_id === b.id && p.loan_type === 'long_term');
                        return (
                          <tr key={b.id} className={`border-t ${i % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-blue-50/30`}>
                            <td className="px-4 py-2.5 text-center text-gray-500">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-[#1e3a5f]">{b.name}</td>
                            <td className="px-4 py-2.5 text-center">{shortTerm ? fmtRange(shortTerm.rate_min, shortTerm.rate_max) : '-'}</td>
                            <td className="px-4 py-2.5 text-center">{longTerm ? fmtRange(longTerm.rate_min, longTerm.rate_max) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500">
                  (*) Mức LS tham khảo theo biểu LSCV cơ sở trên website. NHTMCP xác định LSCV = LSCV cơ sở + Biên độ (3-4%/năm).
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Tab: Nhập LSCV Bình quân */}
      {tab === 'input_avg' && <LendingAvgBatchForm />}

      {/* Tab: Nhập LSCV Sản phẩm */}
      {tab === 'input_product' && <LendingProductBatchForm />}
    </div>
  );
}
