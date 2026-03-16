import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, GROUP_LABELS } from '../lib/types';
import { Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface BankRow {
  bank_id: number;
  bank_name: string;
  group_type: string;
  avg_rate_all: string;
  avg_rate_personal: string;
  avg_rate_corporate: string;
  avg_deposit_rate: string;
}

export default function LendingAvgBatchForm() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<BankRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBanks();
  }, []);

  useEffect(() => {
    if (banks.length > 0) loadExistingData();
  }, [banks, month]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadExistingData() {
    setLoading(true);
    // Initialize empty rows for all banks
    const emptyRows: BankRow[] = banks.map(b => ({
      bank_id: b.id,
      bank_name: b.name,
      group_type: b.group_type,
      avg_rate_all: '',
      avg_rate_personal: '',
      avg_rate_corporate: '',
      avg_deposit_rate: '',
    }));

    // Load existing data for selected month
    const { data } = await supabase
      .from('lending_rates_avg')
      .select('*')
      .eq('report_month', month);

    if (data) {
      for (const record of data) {
        const row = emptyRows.find(r => r.bank_id === record.bank_id);
        if (row) {
          row.avg_rate_all = record.avg_rate_all !== null ? String(record.avg_rate_all) : '';
          row.avg_rate_personal = record.avg_rate_personal !== null ? String(record.avg_rate_personal) : '';
          row.avg_rate_corporate = record.avg_rate_corporate !== null ? String(record.avg_rate_corporate) : '';
          row.avg_deposit_rate = record.avg_deposit_rate !== null ? String(record.avg_deposit_rate) : '';
        }
      }
    }

    setRows(emptyRows);
    setLoading(false);
  }

  function updateRow(bankId: number, field: keyof BankRow, value: string) {
    setRows(prev => prev.map(r =>
      r.bank_id === bankId ? { ...r, [field]: value } : r
    ));
  }

  function parseVal(s: string): number | null {
    if (!s || s.trim() === '') return null;
    const num = parseFloat(s.replace(',', '.'));
    return isNaN(num) ? null : num;
  }

  async function handleSave() {
    // Filter rows that have at least 1 value
    const toSave = rows.filter(r =>
      r.avg_rate_all || r.avg_rate_personal || r.avg_rate_corporate || r.avg_deposit_rate
    );

    if (toSave.length === 0) {
      toast.error('Chưa nhập dữ liệu nào');
      return;
    }

    setSaving(true);
    let saved = 0;
    let errors = 0;

    for (const row of toSave) {
      const record = {
        bank_id: row.bank_id,
        report_month: month,
        avg_rate_all: parseVal(row.avg_rate_all),
        avg_rate_personal: parseVal(row.avg_rate_personal),
        avg_rate_corporate: parseVal(row.avg_rate_corporate),
        avg_deposit_rate: parseVal(row.avg_deposit_rate),
      };

      const { error } = await supabase
        .from('lending_rates_avg')
        .upsert(record, { onConflict: 'bank_id,report_month' });

      if (error) {
        console.error(`Lỗi lưu ${row.bank_name}:`, error.message);
        errors++;
      } else {
        saved++;
      }
    }

    setSaving(false);

    if (errors === 0) {
      toast.success(`Đã lưu ${saved} ngân hàng thành công!`);
    } else {
      toast.error(`Lưu ${saved} thành công, ${errors} lỗi`);
    }
  }

  // Group banks for display
  const groups = [
    { key: 'NHTMNN', label: GROUP_LABELS['NHTMNN'] },
    { key: 'NHTMCP_LON', label: GROUP_LABELS['NHTMCP_LON'] },
    { key: 'NHTMCP_TB', label: GROUP_LABELS['NHTMCP_TB'] },
  ];

  const monthDisplay = (() => {
    const [y, m] = month.split('-');
    return `Tháng ${parseInt(m)}/${y}`;
  })();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-[#1e3a5f] text-lg">Nhập LSCV bình quân — {monthDisplay}</h3>
          <p className="text-xs text-gray-400 mt-1">Nhập dữ liệu công bố LSCV bình quân/LSHĐ bình quân theo tháng. Ô trống = chưa công bố.</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng báo cáo</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-transparent mb-1">.</label>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50 transition-colors">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Đang lưu...</> : <><Save size={16} /> Lưu tất cả</>}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Đang tải dữ liệu...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="px-3 py-2.5 text-center font-medium w-10">STT</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[140px]">Tên ngân hàng</th>
                <th className="px-3 py-2.5 text-center font-medium min-w-[120px]">LSCV BQ Chung (%)</th>
                <th className="px-3 py-2.5 text-center font-medium min-w-[120px]">LSCV BQ KHCN (%)</th>
                <th className="px-3 py-2.5 text-center font-medium min-w-[120px]">LSCV BQ KHDN (%)</th>
                <th className="px-3 py-2.5 text-center font-medium min-w-[120px]">LSHĐ BQ (%)</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const groupRows = rows.filter(r => r.group_type === group.key);
                let stt = 0;
                return (
                  <>
                    <tr key={group.key} className="bg-gray-100">
                      <td colSpan={6} className="px-3 py-2 font-bold text-[#1e3a5f] text-xs uppercase">
                        {group.label}
                      </td>
                    </tr>
                    {groupRows.map(row => {
                      stt++;
                      const globalIdx = rows.findIndex(r => r.bank_id === row.bank_id);
                      return (
                        <tr key={row.bank_id} className={`border-t ${globalIdx % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-blue-50/20`}>
                          <td className="px-3 py-1.5 text-center text-gray-500 text-xs">{stt}</td>
                          <td className="px-3 py-1.5 font-medium text-[#1e3a5f]">{row.bank_name}</td>
                          {(['avg_rate_all', 'avg_rate_personal', 'avg_rate_corporate', 'avg_deposit_rate'] as const).map(field => (
                            <td key={field} className="px-1.5 py-1">
                              <input
                                type="text"
                                value={row[field]}
                                onChange={e => updateRow(row.bank_id, field, e.target.value)}
                                placeholder="0,00"
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
