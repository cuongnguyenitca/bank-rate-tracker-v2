import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, LendingRateAvg, LendingRateProduct } from '../lib/types';
import { formatRate, getCurrentMonth } from '../lib/utils';
import { TableSkeleton } from '../components/Skeleton';
import { AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function LendingRates() {
  const [tab, setTab] = useState<'avg' | 'product'>('avg');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [avgRates, setAvgRates] = useState<LendingRateAvg[]>([]);
  const [productRates, setProductRates] = useState<LendingRateProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  useEffect(() => {
    loadBanks();
  }, []);

  useEffect(() => {
    if (tab === 'avg') loadAvgRates();
    else loadProductRates();
  }, [tab, selectedMonth]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadAvgRates() {
    setLoading(true);
    // Get latest month available
    const { data: monthData } = await supabase
      .from('lending_rates_avg')
      .select('report_month')
      .order('report_month', { ascending: false })
      .limit(1);

    const month = monthData?.[0]?.report_month || selectedMonth;
    if (month !== selectedMonth) setSelectedMonth(month);

    const { data } = await supabase.from('lending_rates_avg').select('*').eq('report_month', month);
    setAvgRates(data || []);
    setLoading(false);
  }

  async function loadProductRates() {
    setLoading(true);
    const { data: dateData } = await supabase
      .from('lending_rates_product')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1);

    const date = dateData?.[0]?.report_date;
    if (date) {
      const { data } = await supabase.from('lending_rates_product').select('*').eq('report_date', date);
      setProductRates(data || []);
    }
    setLoading(false);
  }

  function getBankName(bankId: number) {
    return banks.find(b => b.id === bankId)?.name || '';
  }

  // Chart data for avg rates
  const chartData = avgRates
    .filter(r => r.avg_rate_all)
    .map(r => ({
      name: getBankName(r.bank_id),
      'LSCV BQ': r.avg_rate_all,
      'LSHĐ BQ': r.avg_deposit_rate,
    }))
    .slice(0, 15);

  // Product rates grouped by bank group
  const nnBanks = banks.filter(b => b.group_type === 'NHTMNN');
  const cpBanks = banks.filter(b => b.group_type !== 'NHTMNN');

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1">
        <button
          onClick={() => setTab('avg')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'avg' ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          LSCV Bình quân
        </button>
        <button
          onClick={() => setTab('product')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'product' ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          LSCV theo sản phẩm
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : tab === 'avg' ? (
        <>
          {/* Average lending rates table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-[#1e3a5f]">Lãi suất cho vay bình quân - Tháng {selectedMonth}</h3>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            {avgRates.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">Chưa có dữ liệu LSCV bình quân</p>
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
                        <td className="px-4 py-2.5 text-center font-semibold">{formatRate(r.avg_rate_all)}</td>
                        <td className="px-4 py-2.5 text-center">{formatRate(r.avg_rate_personal)}</td>
                        <td className="px-4 py-2.5 text-center">{formatRate(r.avg_rate_corporate)}</td>
                        <td className="px-4 py-2.5 text-center">{formatRate(r.avg_deposit_rate)}</td>
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
      ) : (
        <>
          {/* Product lending rates */}
          {productRates.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
              <AlertCircle size={40} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">Chưa có dữ liệu LSCV theo sản phẩm</p>
            </div>
          ) : (
            <>
              {/* NHTMNN fixed rates */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#1e3a5f]">Chính sách cho vay trung dài hạn cố định LS - Nhóm NHTMNN</h3>
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
                                {r ? `${formatRate(r.rate_min)} - ${formatRate(r.rate_max)}` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* NHTMCP rates */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#1e3a5f]">Lãi suất cho vay - Nhóm NHTMCP</h3>
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
                            <td className="px-4 py-2.5 text-center">
                              {shortTerm ? `${formatRate(shortTerm.rate_min)} - ${formatRate(shortTerm.rate_max)}` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {longTerm ? `${formatRate(longTerm.rate_min)} - ${formatRate(longTerm.rate_max)}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
