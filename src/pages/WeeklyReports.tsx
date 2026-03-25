import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import { VALID_TERMS, TERM_SHORT } from '../lib/termMapping';
import { compareWeeklyRates, generateWeeklyCommentary, getAvailableDates } from '../lib/weeklyAnalysis';
import type { WeeklyComparison, BankSummary } from '../lib/weeklyAnalysis';
import { TableSkeleton } from '../components/Skeleton';
import { FileText, ChevronLeft, AlertCircle, TrendingUp, TrendingDown, Minus, Zap, Save, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtNum(n: number): string {
  const abs = Math.abs(n);
  return abs.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

function fmtChange(n: number): string {
  if (n === 0) return '0';
  const prefix = n > 0 ? '+' : '-';
  return `${prefix}${fmtNum(n)}`;
}

export default function WeeklyReports() {
  const [tab, setTab] = useState<'create' | 'history'>('create');
  const [availDates, setAvailDates] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [comparison, setComparison] = useState<WeeklyComparison | null>(null);
  const [commentary, setCommentary] = useState({ deposit_summary: '', nn_commentary: '', cp_commentary: '' });
  const [forecast, setForecast] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [editSummary, setEditSummary] = useState('');
  const [editNN, setEditNN] = useState('');
  const [editCP, setEditCP] = useState('');
  const [editForecast, setEditForecast] = useState('');

  // History
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  useEffect(() => {
    loadDates();
    loadReports();
  }, []);

  async function loadDates() {
    const dates = await getAvailableDates(30);
    setAvailDates(dates);
    if (dates.length >= 2) {
      setDateEnd(dates[0]);
      // Find date ~7 days before
      const endDate = new Date(dates[0]);
      let startIdx = dates.findIndex(d => {
        const diff = (endDate.getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 6;
      });
      if (startIdx === -1) startIdx = Math.min(dates.length - 1, 6);
      setDateStart(dates[startIdx]);
    }
  }

  async function loadReports() {
    const { data } = await supabase
      .from('weekly_reports')
      .select('*')
      .order('report_date', { ascending: false });
    setReports(data || []);
  }

  async function runComparison() {
    if (!dateStart || !dateEnd) {
      toast.error('Chon ngay bat dau va ket thuc');
      return;
    }
    setLoading(true);
    setComparison(null);

    const result = await compareWeeklyRates(dateStart, dateEnd, 'CN');
    if (result) {
      setComparison(result);
      const auto = generateWeeklyCommentary(result);
      setCommentary(auto);
      setEditSummary(auto.deposit_summary);
      setEditNN(auto.nn_commentary);
      setEditCP(auto.cp_commentary);
      setEditForecast('');
    } else {
      toast.error('Khong du du lieu de so sanh');
    }
    setLoading(false);
  }

  async function saveReport() {
    if (!dateStart || !dateEnd) return;
    setSaving(true);

    const depositSummary = `- Khoi NHTMNN:\n${editNN}\n\n- Khoi NHTMCP:\n${editCP}`;

    const { error } = await supabase.from('weekly_reports').insert({
      report_date: new Date().toISOString().split('T')[0],
      week_start: dateStart,
      week_end: dateEnd,
      deposit_summary: depositSummary,
      lending_summary: editSummary,
      forecast: editForecast || null,
    });

    setSaving(false);
    if (error) {
      toast.error('Loi luu: ' + error.message);
    } else {
      toast.success('Da luu bao cao tuan!');
      loadReports();
    }
  }

  const tabs = [
    { key: 'create' as const, label: 'Tao bao cao tuan' },
    { key: 'history' as const, label: 'Lich su bao cao' },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelectedReport(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: Tao bao cao ===== */}
      {tab === 'create' && (
        <>
          {/* Date selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-[#1e3a5f] mb-3">Chon khoang thoi gian so sanh</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ngay dau tuan</label>
                <select value={dateStart} onChange={e => setDateStart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">-- Chon --</option>
                  {availDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ngay cuoi tuan</label>
                <select value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">-- Chon --</option>
                  {availDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
                </select>
              </div>
              <button onClick={runComparison} disabled={loading}
                className="flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50 transition-colors">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Dang phan tich...</> : <><Zap size={16} /> Phan tich bien dong</>}
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && <TableSkeleton rows={5} cols={4} />}

          {/* Results */}
          {comparison && !loading && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
                  <p className="text-2xl font-bold text-[#1e3a5f]">{comparison.total_banks}</p>
                  <p className="text-xs text-gray-500">NH khao sat</p>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{comparison.banks_up.length}</p>
                  <p className="text-xs text-green-600">NH tang LS</p>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{comparison.banks_down.length}</p>
                  <p className="text-xs text-red-600">NH giam LS</p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-600">{comparison.banks_unchanged.length}</p>
                  <p className="text-xs text-gray-500">NH khong doi</p>
                </div>
              </div>

              {/* Change detail table */}
              {(comparison.banks_up.length + comparison.banks_down.length + comparison.banks_mixed.length) > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-[#1e3a5f]">Chi tiet ngan hang dieu chinh lai suat</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#1e3a5f] text-white">
                          <th className="px-3 py-2 text-left font-medium min-w-[120px]">Ngan hang</th>
                          <th className="px-3 py-2 text-center font-medium w-16">Xu huong</th>
                          {VALID_TERMS.map(t => (
                            <th key={t} className="px-2 py-2 text-center font-medium min-w-[70px]">{TERM_SHORT[t]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...comparison.banks_up, ...comparison.banks_down, ...comparison.banks_mixed].map(bank => (
                          <tr key={bank.bank_id} className="border-t hover:bg-blue-50/20">
                            <td className="px-3 py-2 font-medium text-[#1e3a5f]">{bank.bank_name}</td>
                            <td className="px-3 py-2 text-center">
                              {bank.direction === 'up' && <TrendingUp size={16} className="text-green-600 mx-auto" />}
                              {bank.direction === 'down' && <TrendingDown size={16} className="text-red-600 mx-auto" />}
                              {bank.direction === 'mixed' && <RefreshCw size={16} className="text-amber-600 mx-auto" />}
                            </td>
                            {VALID_TERMS.map(t => {
                              const c = bank.changes.find(ch => ch.term_code === t);
                              if (!c || c.change === 0) return <td key={t} className="px-2 py-2 text-center text-gray-300">-</td>;
                              return (
                                <td key={t} className={`px-2 py-2 text-center text-xs font-medium ${
                                  c.change > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                                }`}>
                                  {fmtChange(c.change)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Group comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h4 className="font-semibold text-[#1e3a5f] text-sm mb-2">Khoi NHTMNN</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Tang: {comparison.nn_summary.up} | Giam: {comparison.nn_summary.down} | Khong doi: {comparison.nn_summary.unchanged}</p>
                    {comparison.nn_summary.avg_12m_end !== null && (
                      <p>LS BQ 12T: <span className="font-semibold">{fmtNum(comparison.nn_summary.avg_12m_end)}%</span>
                        {comparison.nn_summary.avg_12m_change !== null && comparison.nn_summary.avg_12m_change !== 0 && (
                          <span className={comparison.nn_summary.avg_12m_change > 0 ? 'text-green-600' : 'text-red-600'}>
                            {' '}({fmtChange(comparison.nn_summary.avg_12m_change)}%)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h4 className="font-semibold text-[#1e3a5f] text-sm mb-2">Khoi NHTMCP</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Tang: {comparison.cp_summary.up} | Giam: {comparison.cp_summary.down} | Khong doi: {comparison.cp_summary.unchanged}</p>
                    {comparison.cp_summary.avg_12m_end !== null && (
                      <p>LS BQ 12T: <span className="font-semibold">{fmtNum(comparison.cp_summary.avg_12m_end)}%</span>
                        {comparison.cp_summary.avg_12m_change !== null && comparison.cp_summary.avg_12m_change !== 0 && (
                          <span className={comparison.cp_summary.avg_12m_change > 0 ? 'text-green-600' : 'text-red-600'}>
                            {' '}({fmtChange(comparison.cp_summary.avg_12m_change)}%)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Auto-generated commentary (editable) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-[#1e3a5f] mb-1">Nhan xet tu dong</h3>
                <p className="text-xs text-gray-400 mb-4">He thong goi y dua tren bien dong. Ban co the chinh sua truoc khi luu.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tom tat chung</label>
                    <textarea rows={3} value={editSummary} onChange={e => setEditSummary(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Khoi NHTMNN</label>
                    <textarea rows={4} value={editNN} onChange={e => setEditNN(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Khoi NHTMCP</label>
                    <textarea rows={4} value={editCP} onChange={e => setEditCP(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Du bao (nhap tay)</label>
                    <textarea rows={4} value={editForecast} onChange={e => setEditForecast(e.target.value)}
                      placeholder="Nhap du bao xu huong lai suat..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={saveReport} disabled={saving}
                    className="flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50 transition-colors">
                    {saving ? <><Loader2 size={16} className="animate-spin" /> Dang luu...</> : <><Save size={16} /> Luu bao cao tuan</>}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* No comparison yet */}
          {!comparison && !loading && (
            <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
              <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-semibold text-gray-500">Chon khoang thoi gian va nhan "Phan tich bien dong"</h3>
              <p className="text-sm text-gray-400 mt-1">He thong se so sanh lai suat giua 2 ngay va tu dong sinh nhan xet</p>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: Lich su ===== */}
      {tab === 'history' && (
        <>
          {selectedReport ? (
            <div className="space-y-4">
              <button onClick={() => setSelectedReport(null)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
                <ChevronLeft size={16} /> Quay lai danh sach
              </button>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="border-b border-gray-100 pb-4 mb-4">
                  <h2 className="text-xl font-bold text-[#1e3a5f]">Bao cao tuan</h2>
                  <p className="text-sm text-gray-500">
                    Tuan tu {formatDate(selectedReport.week_start)} den {formatDate(selectedReport.week_end)}
                  </p>
                </div>

                {selectedReport.deposit_summary && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> Lai suat huy dong
                    </h3>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                      {selectedReport.deposit_summary}
                    </div>
                  </div>
                )}

                {selectedReport.lending_summary && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Tom tat
                    </h3>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                      {selectedReport.lending_summary}
                    </div>
                  </div>
                )}

                {selectedReport.forecast && (
                  <div>
                    <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Du bao
                    </h3>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-amber-50 p-4 rounded-lg border border-amber-100">
                      {selectedReport.forecast}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#1e3a5f]">Danh sach bao cao tuan</h3>
              </div>
              {reports.length === 0 ? (
                <div className="p-8 text-center">
                  <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">Chua co bao cao tuan</p>
                </div>
              ) : (
                <div className="divide-y">
                  {reports.map(r => (
                    <div key={r.id} onClick={() => setSelectedReport(r)}
                      className="p-4 flex items-center gap-4 hover:bg-blue-50/30 cursor-pointer transition-colors">
                      <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-[#1e3a5f]">
                          Tuan {formatDate(r.week_start)} - {formatDate(r.week_end)}
                        </p>
                        <p className="text-xs text-gray-400">Ngay tao: {formatDate(r.report_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
