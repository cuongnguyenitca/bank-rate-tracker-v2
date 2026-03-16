import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, GROUP_LABELS } from '../lib/types';
import { todayISO } from '../lib/utils';
import { Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface NNRow {
  bank_id: number;
  bank_name: string;
  r6m: string;
  r12m: string;
  r18m: string;
}

interface CPRow {
  bank_id: number;
  bank_name: string;
  short_min: string;
  short_max: string;
  long_min: string;
  long_max: string;
}

export default function LendingProductBatchForm() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [date, setDate] = useState(todayISO());
  const [nnRows, setNnRows] = useState<NNRow[]>([]);
  const [cpRows, setCpRows] = useState<CPRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBanks(); }, []);
  useEffect(() => { if (banks.length > 0) loadExisting(); }, [banks, date]);

  async function loadBanks() {
    const { data } = await supabase.from('banks').select('*').eq('is_active', true).order('id');
    setBanks(data || []);
  }

  async function loadExisting() {
    setLoading(true);
    const nnBanks = banks.filter(b => b.group_type === 'NHTMNN');
    const cpBanks = banks.filter(b => b.group_type !== 'NHTMNN');

    // Init rows
    const nn: NNRow[] = nnBanks.map(b => ({ bank_id: b.id, bank_name: b.name, r6m: '', r12m: '', r18m: '' }));
    const cp: CPRow[] = cpBanks.map(b => ({ bank_id: b.id, bank_name: b.name, short_min: '', short_max: '', long_min: '', long_max: '' }));

    // Load existing
    const { data } = await supabase.from('lending_rates_product').select('*').eq('report_date', date);
    if (data) {
      for (const r of data) {
        // NHTMNN fixed rates
        const nnRow = nn.find(n => n.bank_id === r.bank_id);
        if (nnRow) {
          if (r.fixed_period === '06 tháng đầu') nnRow.r6m = r.rate_min !== null && r.rate_max !== null ? `${r.rate_min}-${r.rate_max}` : String(r.rate_min || r.rate_max || '');
          if (r.fixed_period === '12 tháng đầu') nnRow.r12m = r.rate_min !== null && r.rate_max !== null ? `${r.rate_min}-${r.rate_max}` : String(r.rate_min || r.rate_max || '');
          if (r.fixed_period === '18 tháng đầu') nnRow.r18m = r.rate_min !== null && r.rate_max !== null ? `${r.rate_min}-${r.rate_max}` : String(r.rate_min || r.rate_max || '');
        }
        // NHTMCP short/long term
        const cpRow = cp.find(c => c.bank_id === r.bank_id);
        if (cpRow) {
          if (r.loan_type === 'short_term') {
            cpRow.short_min = r.rate_min !== null ? String(r.rate_min) : '';
            cpRow.short_max = r.rate_max !== null ? String(r.rate_max) : '';
          }
          if (r.loan_type === 'long_term') {
            cpRow.long_min = r.rate_min !== null ? String(r.rate_min) : '';
            cpRow.long_max = r.rate_max !== null ? String(r.rate_max) : '';
          }
        }
      }
    }

    setNnRows(nn);
    setCpRows(cp);
    setLoading(false);
  }

  function parseMinMax(input: string): { min: number | null; max: number | null } {
    if (!input || input.trim() === '') return { min: null, max: null };
    const cleaned = input.replace(/,/g, '.').replace(/\s/g, '');
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-');
      return { min: parseFloat(parts[0]) || null, max: parseFloat(parts[1]) || null };
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? { min: null, max: null } : { min: val, max: val };
  }

  function parseVal(s: string): number | null {
    if (!s || s.trim() === '') return null;
    const num = parseFloat(s.replace(',', '.'));
    return isNaN(num) ? null : num;
  }

  async function handleSave() {
    setSaving(true);
    let saved = 0;
    let errors = 0;

    // Save NHTMNN fixed rates
    for (const row of nnRows) {
      const periods = [
        { period: '06 tháng đầu', value: row.r6m },
        { period: '12 tháng đầu', value: row.r12m },
        { period: '18 tháng đầu', value: row.r18m },
      ];

      for (const { period, value } of periods) {
        if (!value) continue;
        const { min, max } = parseMinMax(value);
        if (min === null && max === null) continue;

        const { error } = await supabase.from('lending_rates_product').upsert({
          bank_id: row.bank_id,
          report_date: date,
          loan_type: 'fixed_rate',
          fixed_period: period,
          rate_min: min,
          rate_max: max,
        }, { onConflict: 'bank_id,report_date,loan_type,fixed_period' });

        if (error) {
          // If upsert fails due to no unique constraint, try insert
          const { error: insertErr } = await supabase.from('lending_rates_product').insert({
            bank_id: row.bank_id,
            report_date: date,
            loan_type: 'fixed_rate',
            fixed_period: period,
            rate_min: min,
            rate_max: max,
          });
          if (insertErr) errors++;
          else saved++;
        } else {
          saved++;
        }
      }
    }

    // Save NHTMCP short/long term
    for (const row of cpRows) {
      const types = [
        { type: 'short_term', min: row.short_min, max: row.short_max },
        { type: 'long_term', min: row.long_min, max: row.long_max },
      ];

      for (const { type, min, max } of types) {
        const minVal = parseVal(min);
        const maxVal = parseVal(max);
        if (minVal === null && maxVal === null) continue;

        const { error } = await supabase.from('lending_rates_product').upsert({
          bank_id: row.bank_id,
          report_date: date,
          loan_type: type,
          fixed_period: null,
          rate_min: minVal,
          rate_max: maxVal,
        }, { onConflict: 'bank_id,report_date,loan_type,fixed_period' });

        if (error) {
          const { error: insertErr } = await supabase.from('lending_rates_product').insert({
            bank_id: row.bank_id,
            report_date: date,
            loan_type: type,
            fixed_period: null,
            rate_min: minVal,
            rate_max: maxVal,
          });
          if (insertErr) errors++;
          else saved++;
        } else {
          saved++;
        }
      }
    }

    setSaving(false);
    if (errors === 0) toast.success(`Đã lưu ${saved} mức LSCV thành công!`);
    else toast.error(`Lưu ${saved} thành công, ${errors} lỗi`);
  }

  if (loading) return <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-semibold text-[#1e3a5f] text-lg">Nhập LSCV theo sản phẩm/chính sách</h3>
            <p className="text-xs text-gray-400 mt-1">Đơn vị: %/năm. Nhập dạng "min-max" (VD: 8,2-9,7) hoặc số đơn (VD: 7,8)</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ngày báo cáo</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
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
      </div>

      {/* NHTMNN: Cố định lãi suất trung dài hạn */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h4 className="font-semibold text-[#1e3a5f]">Chính sách cho vay trung dài hạn cố định LS — Nhóm NHTMNN</h4>
          <p className="text-xs text-gray-400">Nhập dạng "min-max" (VD: 8,2-9,7) hoặc số đơn</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="px-3 py-2.5 text-left font-medium min-w-[120px]">Cố định LS</th>
                {nnRows.map(r => (
                  <th key={r.bank_id} className="px-3 py-2.5 text-center font-medium min-w-[130px]">{r.bank_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: '06 tháng đầu', field: 'r6m' as const },
                { label: '12 tháng đầu', field: 'r12m' as const },
                { label: '18 tháng đầu', field: 'r18m' as const },
              ].map(({ label, field }) => (
                <tr key={field} className="border-t hover:bg-blue-50/20">
                  <td className="px-3 py-2 font-medium text-gray-700">{label}</td>
                  {nnRows.map(row => (
                    <td key={row.bank_id} className="px-1.5 py-1">
                      <input type="text" value={row[field]}
                        onChange={e => setNnRows(prev => prev.map(r => r.bank_id === row.bank_id ? { ...r, [field]: e.target.value } : r))}
                        placeholder="0,0-0,0"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NHTMCP: Ngắn hạn / Trung dài hạn */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h4 className="font-semibold text-[#1e3a5f]">Lãi suất cho vay — Nhóm NHTMCP</h4>
          <p className="text-xs text-gray-400">Nhập mức thấp nhất và cao nhất theo lãi suất cơ sở</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="px-3 py-2.5 text-center font-medium w-10">STT</th>
                <th className="px-3 py-2.5 text-left font-medium min-w-[130px]">Ngân hàng</th>
                <th className="px-3 py-2.5 text-center font-medium" colSpan={2}>Ngắn hạn (%)</th>
                <th className="px-3 py-2.5 text-center font-medium" colSpan={2}>Trung, dài hạn (%)</th>
              </tr>
              <tr className="bg-gray-100 text-gray-600 text-xs">
                <th></th>
                <th></th>
                <th className="px-2 py-1 text-center">Min</th>
                <th className="px-2 py-1 text-center">Max</th>
                <th className="px-2 py-1 text-center">Min</th>
                <th className="px-2 py-1 text-center">Max</th>
              </tr>
            </thead>
            <tbody>
              {cpRows.map((row, i) => (
                <tr key={row.bank_id} className={`border-t ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-blue-50/20`}>
                  <td className="px-3 py-1.5 text-center text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-[#1e3a5f]">{row.bank_name}</td>
                  {(['short_min', 'short_max', 'long_min', 'long_max'] as const).map(field => (
                    <td key={field} className="px-1.5 py-1">
                      <input type="text" value={row[field]}
                        onChange={e => setCpRows(prev => prev.map(r => r.bank_id === row.bank_id ? { ...r, [field]: e.target.value } : r))}
                        placeholder="0,00"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500">
          (*) Mức lãi suất tham khảo theo biểu LSCV cơ sở trên website. NHTMCP xác định LSCV = LSCV cơ sở + Biên độ (3-4%/năm).
        </div>
      </div>
    </div>
  );
}
