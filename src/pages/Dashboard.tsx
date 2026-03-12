import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, DepositRate, TERM_CODES, GROUP_LABELS } from '../lib/types';
import { formatRateRange, formatDate } from '../lib/utils';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { Landmark, TrendingUp, Building2, CalendarDays, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SummaryCard {
  title: string;
  value: string;
  sub: string;
  icon: any;
  color: string;
}

export default function Dashboard() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [rates, setRates] = useState<DepositRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: bankData } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
      setBanks(bankData || []);

      // Get latest deposit rates
      const { data: dateData } = await supabase
        .from('deposit_rates')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1);

      if (dateData && dateData.length > 0) {
        const date = dateData[0].report_date;
        setLatestDate(date);
        const { data: rateData } = await supabase
          .from('deposit_rates')
          .select('*')
          .eq('report_date', date)
          .eq('customer_type', 'CN');
        setRates(rateData || []);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  // Compute summary
  const avgDeposit12M = rates.filter(r => r.term_code === '12M' && r.rate_max)
    .reduce((acc, r, _, arr) => acc + (r.rate_max || 0) / arr.length, 0);

  const summaryCards: SummaryCard[] = [
    {
      title: 'LS HĐV BQ 12T',
      value: rates.length > 0 ? `${avgDeposit12M.toFixed(2).replace('.', ',')}%` : '--',
      sub: 'Khách hàng cá nhân',
      icon: Landmark,
      color: 'bg-blue-500',
    },
    {
      title: 'Số NH theo dõi',
      value: `${banks.length}`,
      sub: 'Ngân hàng đang hoạt động',
      icon: Building2,
      color: 'bg-emerald-500',
    },
    {
      title: 'Cập nhật gần nhất',
      value: latestDate ? formatDate(latestDate) : 'Chưa có',
      sub: 'Lãi suất tiền gửi',
      icon: CalendarDays,
      color: 'bg-purple-500',
    },
  ];

  // Build chart data for 12M rates by group
  const groupRates = (['NHTMNN', 'NHTMCP_LON', 'NHTMCP_TB'] as const).map(group => {
    const groupBankIds = banks.filter(b => b.group_type === group).map(b => b.id);
    const groupRateData = rates.filter(r => r.term_code === '12M' && groupBankIds.includes(r.bank_id) && r.rate_max);
    const avg = groupRateData.length > 0
      ? groupRateData.reduce((sum, r) => sum + (r.rate_max || 0), 0) / groupRateData.length
      : 0;
    return { group, label: GROUP_LABELS[group], avg: Math.round(avg * 100) / 100 };
  });

  // Summary table data: latest rates for 6M and 12M
  const tableData = banks.map(bank => {
    const bankRates = rates.filter(r => r.bank_id === bank.id);
    const get = (term: string) => {
      const r = bankRates.find(x => x.term_code === term);
      return r ? formatRateRange(r.rate_min, r.rate_max) : '-';
    };
    return { bank, r6M: get('6M'), r12M: get('12M'), r24M: get('24M') };
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <TableSkeleton rows={8} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((card, i) => (
          <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
            <div className={`${card.color} text-white p-3 rounded-lg`}>
              <card.icon size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{card.title}</p>
              <p className="text-2xl font-bold text-[#1e3a5f]">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart section */}
      {rates.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h3 className="font-semibold text-[#1e3a5f] mb-4">So sánh LS HĐV 12 tháng theo nhóm NH</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={groupRates.map(g => ({ name: g.label, 'LS 12T (%)': g.avg }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="LS 12T (%)" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-500">Chưa có dữ liệu lãi suất</h3>
          <p className="text-sm text-gray-400 mt-1">Vào trang <strong>Nhập liệu</strong> để bắt đầu nhập dữ liệu lãi suất tiền gửi</p>
        </div>
      )}

      {/* Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-[#1e3a5f]">
            Tổng hợp lãi suất mới nhất {latestDate && `(${formatDate(latestDate)})`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="px-4 py-3 text-left font-medium">Ngân hàng</th>
                <th className="px-4 py-3 text-left font-medium">Nhóm</th>
                <th className="px-4 py-3 text-center font-medium">6 tháng</th>
                <th className="px-4 py-3 text-center font-medium">12 tháng</th>
                <th className="px-4 py-3 text-center font-medium">24 tháng</th>
              </tr>
            </thead>
            <tbody>
              {banks.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Chưa có dữ liệu</td></tr>
              ) : (
                tableData.map(({ bank, r6M, r12M, r24M }, i) => (
                  <tr key={bank.id} className={`border-t ${i % 2 === 0 ? 'bg-gray-50/50' : ''} hover:bg-blue-50/50`}>
                    <td className="px-4 py-2.5 font-medium text-[#1e3a5f]">{bank.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        bank.group_type === 'NHTMNN' ? 'bg-red-100 text-red-700' :
                        bank.group_type === 'NHTMCP_LON' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {bank.group_type === 'NHTMNN' ? 'TMNN' : bank.group_type === 'NHTMCP_LON' ? 'TMCP lớn' : 'TMCP TB'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">{r6M}</td>
                    <td className="px-4 py-2.5 text-center font-medium">{r12M}</td>
                    <td className="px-4 py-2.5 text-center">{r24M}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
