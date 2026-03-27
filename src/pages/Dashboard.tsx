import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, TERM_CODES, GROUP_LABELS } from '../lib/types';
import { formatRateRange, formatDate } from '../lib/utils';
import { VALID_TERMS, TERM_SHORT } from '../lib/termMapping';
import { runDataQualityChecks } from '../lib/dataQuality';
import type { DataAlert } from '../lib/dataQuality';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton';
import RateChangeLog from '../components/RateChangeLog';
import { Landmark, Building2, CalendarDays, AlertCircle, AlertTriangle, CheckCircle, Info, Shield, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [totalRates, setTotalRates] = useState(0);
  const [alerts, setAlerts] = useState<DataAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const { data: bankData } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
      setBanks(bankData || []);

      // Latest date
      const { data: dateData } = await supabase
        .from('deposit_rates').select('report_date')
        .order('report_date', { ascending: false }).limit(1);

      if (dateData && dateData.length > 0) {
        const date = dateData[0].report_date;
        setLatestDate(date);

        // Count rates for latest date
        const { count } = await supabase
          .from('deposit_rates').select('*', { count: 'exact', head: true })
          .eq('report_date', date);
        setTotalRates(count || 0);

        // Run quality checks
        setAlertsLoading(true);
        const qualityAlerts = await runDataQualityChecks(date);
        setAlerts(qualityAlerts);
        setAlertsLoading(false);
      }

      // Scrape history (last 7 days)
      const { data: recentDates } = await supabase
        .from('deposit_rates').select('report_date')
        .eq('rate_type', 'standard').eq('customer_type', 'CN')
        .order('report_date', { ascending: false }).limit(200);

      if (recentDates) {
        const dateCounts: Record<string, number> = {};
        recentDates.forEach(r => { dateCounts[r.report_date] = (dateCounts[r.report_date] || 0) + 1; });
        const sorted = Object.entries(dateCounts)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 7)
          .map(([date, count]) => ({ date, count }));
        setScrapeStatus(sorted);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  const errorCount = alerts.filter(a => a.level === 'error').length;
  const warningCount = alerts.filter(a => a.level === 'warning').length;
  const infoCount = alerts.filter(a => a.level === 'info').length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
          <div className="bg-blue-500 text-white p-3 rounded-lg"><Building2 size={24} /></div>
          <div>
            <p className="text-sm text-gray-500">Ngan hang</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">{banks.length}</p>
            <p className="text-xs text-gray-400">Dang theo doi</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
          <div className="bg-emerald-500 text-white p-3 rounded-lg"><Landmark size={24} /></div>
          <div>
            <p className="text-sm text-gray-500">Ban ghi hom nay</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">{totalRates}</p>
            <p className="text-xs text-gray-400">Lai suat tien gui</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
          <div className="bg-purple-500 text-white p-3 rounded-lg"><CalendarDays size={24} /></div>
          <div>
            <p className="text-sm text-gray-500">Cap nhat gan nhat</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">{latestDate ? formatDate(latestDate) : 'Chua co'}</p>
            <p className="text-xs text-gray-400">Du lieu lai suat</p>
          </div>
        </div>

        <div className={`rounded-xl p-5 shadow-sm border flex items-start gap-4 ${
          errorCount > 0 ? 'bg-red-50 border-red-200' : warningCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className={`p-3 rounded-lg text-white ${
            errorCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-amber-500' : 'bg-green-500'
          }`}>
            <Shield size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Chat luong DL</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">
              {errorCount > 0 ? `${errorCount} loi` : warningCount > 0 ? `${warningCount} chu y` : 'Tot'}
            </p>
            <p className="text-xs text-gray-400">{alerts.length} kiem tra</p>
          </div>
        </div>
      </div>

      {/* Two columns: Scrape status + Quality alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scrape history */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-[#1e3a5f]">Lich su thu thap 7 ngay gan nhat</h3>
          </div>
          {scrapeStatus.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Chua co du lieu</div>
          ) : (
            <div className="divide-y">
              {scrapeStatus.map(s => (
                <div key={s.date} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    {s.count >= 10 ? (
                      <CheckCircle size={18} className="text-emerald-500" />
                    ) : s.count > 0 ? (
                      <AlertTriangle size={18} className="text-amber-500" />
                    ) : (
                      <AlertCircle size={18} className="text-red-400" />
                    )}
                    <span className="text-sm font-medium text-[#1e3a5f]">{formatDate(s.date)}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${
                      s.count >= 10 ? 'text-emerald-600' : s.count > 0 ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      {s.count} ban ghi
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      ({Math.round(s.count / (banks.length || 1) * 10) / 10} BG/NH)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Data quality alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-[#1e3a5f]">Canh bao chat luong du lieu</h3>
            <button onClick={async () => {
              if (latestDate) {
                setAlertsLoading(true);
                const a = await runDataQualityChecks(latestDate);
                setAlerts(a);
                setAlertsLoading(false);
              }
            }} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
              <RefreshCw size={12} /> Kiem tra lai
            </button>
          </div>

          {alertsLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Dang kiem tra...</div>
          ) : alerts.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle size={32} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm text-emerald-600 font-medium">Du lieu tot, khong co canh bao</p>
            </div>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {alerts.slice(0, 20).map(alert => (
                <div key={alert.id} className={`px-4 py-3 flex items-start gap-3 ${
                  alert.level === 'error' ? 'bg-red-50/50' : alert.level === 'warning' ? 'bg-amber-50/50' : ''
                }`}>
                  {alert.level === 'error' && <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />}
                  {alert.level === 'warning' && <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />}
                  {alert.level === 'info' && <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm text-gray-700">{alert.message}</p>
                    {alert.detail && <p className="text-xs text-gray-400 mt-0.5">{alert.detail}</p>}
                  </div>
                </div>
              ))}
              {alerts.length > 20 && (
                <div className="px-4 py-2 text-xs text-gray-400 text-center">
                  Va {alerts.length - 20} canh bao khac...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rate change log */}
      <RateChangeLog />
    </div>
  );
}
