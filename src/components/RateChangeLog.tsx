import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import { History, Search, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';

interface ChangeLogEntry {
  id: number;
  bank_id: number;
  change_date: string;
  term_code: string;
  old_rate: number | null;
  new_rate: number | null;
  change_amount: number | null;
  rate_type: string;
  detected_at: string;
}

interface Bank {
  id: number;
  code: string;
  name: string;
}

function fmtRate(v: number | null): string {
  if (v === null) return '-';
  return v.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, '');
}

export default function RateChangeLog() {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('');
  const [filterDays, setFilterDays] = useState(30);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loadBanks();
    loadLogs();
  }, [filterBank, filterDays]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('id, code, name').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadLogs() {
    setLoading(true);

    const since = new Date();
    since.setDate(since.getDate() - filterDays);
    const sinceStr = since.toISOString().split('T')[0];

    let query = supabase
      .from('rate_change_log')
      .select('*')
      .gte('change_date', sinceStr)
      .order('detected_at', { ascending: false })
      .limit(200);

    if (filterBank) {
      const bank = banks.find(b => b.code === filterBank);
      if (bank) query = query.eq('bank_id', bank.id);
    }

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  }

  function getBankName(bankId: number): string {
    return banks.find(b => b.id === bankId)?.name || `NH #${bankId}`;
  }

  function getBankCode(bankId: number): string {
    return banks.find(b => b.id === bankId)?.code || '';
  }

  // Group logs by date
  const groupedByDate: Record<string, ChangeLogEntry[]> = {};
  for (const log of logs) {
    if (!groupedByDate[log.change_date]) groupedByDate[log.change_date] = [];
    groupedByDate[log.change_date].push(log);
  }
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2">
            <History size={18} className="text-[#1e3a5f]" />
            <h3 className="font-semibold text-[#1e3a5f]">Log truy vet thay doi lai suat</h3>
            {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </button>
          {logs.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{logs.length} thay doi</span>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Filters */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-gray-400" />
              <select value={filterBank} onChange={e => setFilterBank(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Tat ca ngan hang</option>
                {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select value={filterDays} onChange={e => setFilterDays(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-300">
                <option value={7}>7 ngay</option>
                <option value={14}>14 ngay</option>
                <option value={30}>30 ngay</option>
                <option value={90}>90 ngay</option>
              </select>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Dang tai...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <History size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Chua co thay doi nao trong {filterDays} ngay qua</p>
              <p className="text-xs text-gray-400 mt-1">Log se tu dong ghi khi scraper cap nhat lai suat moi</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {sortedDates.map(date => (
                <div key={date}>
                  {/* Date header */}
                  <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 sticky top-0">
                    <span className="text-xs font-semibold text-gray-500">{formatDate(date)}</span>
                    <span className="text-xs text-gray-400 ml-2">({groupedByDate[date].length} thay doi)</span>
                  </div>

                  {/* Entries for this date */}
                  {groupedByDate[date].map(log => (
                    <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 border-b border-gray-50 hover:bg-blue-50/20 text-sm">
                      {/* Direction icon */}
                      {log.change_amount !== null && log.change_amount > 0 ? (
                        <TrendingUp size={14} className="text-green-500 shrink-0" />
                      ) : (
                        <TrendingDown size={14} className="text-red-500 shrink-0" />
                      )}

                      {/* Bank + term */}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-[#1e3a5f]">{getBankName(log.bank_id)}</span>
                        <span className="text-gray-400 mx-1">—</span>
                        <span className="text-gray-600">{log.term_code}</span>
                        {log.rate_type !== 'standard' && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-600">{log.rate_type}</span>
                        )}
                      </div>

                      {/* Old → New */}
                      <div className="text-right shrink-0">
                        <span className="text-gray-400">{fmtRate(log.old_rate)}%</span>
                        <span className="text-gray-300 mx-1">→</span>
                        <span className="font-medium text-gray-700">{fmtRate(log.new_rate)}%</span>
                      </div>

                      {/* Change amount */}
                      <div className={`text-right shrink-0 font-medium text-xs px-2 py-0.5 rounded ${
                        log.change_amount !== null && log.change_amount > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {log.change_amount !== null && log.change_amount > 0 ? '+' : ''}{fmtRate(log.change_amount)}%
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
