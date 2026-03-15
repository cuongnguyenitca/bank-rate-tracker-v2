import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bank, TERM_CODES } from '../lib/types';
import { todayISO, getCurrentMonth, formatDate } from '../lib/utils';
import { Save, Landmark, TrendingUp, FileText, CircleCheck as CheckCircle, Zap, Loader as Loader2, CircleCheck as CheckCircle2, Circle as XCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

type FormTab = 'scrape' | 'deposit' | 'lending_avg' | 'lending_product' | 'weekly';

export default function AdminEntry() {
  const [tab, setTab] = useState<FormTab>('scrape');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('banks').select('*').eq('is_active', true).order('id').then(({ data }) => setBanks(data || []));
  }, []);

  const tabs: { key: FormTab; label: string; icon: any }[] = [
    { key: 'scrape', label: 'Thu thập tự động', icon: Zap },
    { key: 'deposit', label: 'LS Tiền gửi', icon: Landmark },
    { key: 'lending_avg', label: 'LSCV Bình quân', icon: TrendingUp },
    { key: 'lending_product', label: 'LSCV Sản phẩm', icon: TrendingUp },
    { key: 'weekly', label: 'Báo cáo tuần', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Form content */}
      {tab === 'scrape' && <ScrapePanel banks={banks} />}
      {tab === 'deposit' && <DepositRateForm banks={banks} saving={saving} setSaving={setSaving} />}
      {tab === 'lending_avg' && <LendingAvgForm banks={banks} saving={saving} setSaving={setSaving} />}
      {tab === 'lending_product' && <LendingProductForm banks={banks} saving={saving} setSaving={setSaving} />}
      {tab === 'weekly' && <WeeklyReportForm saving={saving} setSaving={setSaving} />}
    </div>
  );
}

// ==========================================
// Form: Deposit Rates
// ==========================================
function DepositRateForm({ banks, saving, setSaving }: { banks: Bank[]; saving: boolean; setSaving: (v: boolean) => void }) {
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number>(0);
  const [customerType, setCustomerType] = useState<'CN' | 'TCKT'>('CN');
  const [rateType, setRateType] = useState<'standard' | 'policy' | 'online' | 'vip' | 'promotional'>('standard');
  const [productName, setProductName] = useState('');
  const [channel, setChannel] = useState<'counter' | 'online'>('counter');
  const [minDeposit, setMinDeposit] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [isPromotional, setIsPromotional] = useState(false);
  const [rates, setRates] = useState<Record<string, { min: string; max: string }>>({});

  useEffect(() => {
    const init: Record<string, { min: string; max: string }> = {};
    TERM_CODES.forEach(t => { init[t] = { min: '', max: '' }; });
    setRates(init);
  }, [bankId]);

  async function handleSave() {
    if (!bankId) { toast.error('Vui lòng chọn ngân hàng'); return; }
    setSaving(true);
    try {
      const records = TERM_CODES
        .filter(t => rates[t]?.min || rates[t]?.max)
        .map(t => ({
          bank_id: bankId,
          report_date: date,
          customer_type: customerType,
          term_code: t,
          rate_min: rates[t].min ? parseFloat(rates[t].min.replace(',', '.')) : null,
          rate_max: rates[t].max ? parseFloat(rates[t].max.replace(',', '.')) : null,
          rate_type: rateType,
          source: rateType === 'standard' ? 'cafef' : 'manual',
          product_name: rateType === 'standard' ? null : (productName || null),
          channel: channel,
          min_deposit: minDeposit ? parseInt(minDeposit) : null,
          is_promotional: isPromotional,
          effective_date: effectiveDate || null,
        }));

      if (records.length === 0) { toast.error('Vui lòng nhập ít nhất 1 kỳ hạn'); setSaving(false); return; }

      const { error } = await supabase.from('deposit_rates').upsert(records, {
        onConflict: 'bank_id,report_date,customer_type,term_code,rate_type,channel',
      });
      if (error) throw error;
      toast.success(`Đã lưu ${records.length} mức lãi suất!`);
      const init: Record<string, { min: string; max: string }> = {};
      TERM_CODES.forEach(t => { init[t] = { min: '', max: '' }; });
      setRates(init);
      setProductName('');
      setMinDeposit('');
      setEffectiveDate('');
      setIsPromotional(false);
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  }

  const showAdditionalFields = rateType !== 'standard';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-[#1e3a5f] mb-4">Nhập lãi suất tiền gửi</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngân hàng *</label>
          <select value={bankId} onChange={e => setBankId(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
            <option value={0}>-- Chọn ngân hàng --</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngày báo cáo</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Đối tượng KH</label>
          <select value={customerType} onChange={e => setCustomerType(e.target.value as 'CN' | 'TCKT')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
            <option value="CN">Cá nhân (CN)</option>
            <option value="TCKT">Tổ chức kinh tế (TCKT)</option>
          </select>
        </div>
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <label className="block text-xs font-medium text-gray-600 mb-3">Loại lãi suất *</label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { value: 'standard', label: 'Niêm yết thông thường' },
            { value: 'policy', label: 'Theo chính sách sản phẩm' },
            { value: 'online', label: 'Gửi online' },
            { value: 'vip', label: 'VIP/Ưu tiên' },
            { value: 'promotional', label: 'Khuyến mại' }
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="rateType" value={opt.value} checked={rateType === opt.value}
                onChange={e => setRateType(e.target.value as any)}
                className="w-4 h-4" />
              <span className="text-xs">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {showAdditionalFields && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-medium text-[#1e3a5f] mb-4">Thông tin bổ sung</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên chương trình/sản phẩm</label>
              <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="VD: Gửi Online Plus"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kênh gửi</label>
              <select value={channel} onChange={e => setChannel(e.target.value as 'counter' | 'online')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                <option value="counter">Tại quầy</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền gửi tối thiểu (triệu đồng)</label>
              <input type="number" value={minDeposit} onChange={e => setMinDeposit(e.target.value)}
                placeholder="VD: 100"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ngày hiệu lực</label>
              <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="checkbox" id="isPromo" checked={isPromotional} onChange={e => setIsPromotional(e.target.checked)}
              className="w-4 h-4" />
            <label htmlFor="isPromo" className="text-xs font-medium text-gray-600">Là lãi suất khuyến mại</label>
          </div>
        </div>
      )}

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-600">Kỳ hạn</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">LS thấp nhất (%)</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">LS cao nhất (%)</th>
            </tr>
          </thead>
          <tbody>
            {TERM_CODES.map(t => (
              <tr key={t} className="border-t">
                <td className="px-3 py-2 font-medium">{t}</td>
                <td className="px-3 py-1.5">
                  <input type="text" placeholder="0,00"
                    value={rates[t]?.min || ''}
                    onChange={e => setRates(prev => ({ ...prev, [t]: { ...prev[t], min: e.target.value } }))}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="text" placeholder="0,00"
                    value={rates[t]?.max || ''}
                    onChange={e => setRates(prev => ({ ...prev, [t]: { ...prev[t], max: e.target.value } }))}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-center text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50 transition-colors">
        {saving ? '...' : <><Save size={16} /> Lưu lãi suất</>}
      </button>
    </div>
  );
}

// ==========================================
// Form: Lending Average Rates
// ==========================================
function LendingAvgForm({ banks, saving, setSaving }: { banks: Bank[]; saving: boolean; setSaving: (v: boolean) => void }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [bankId, setBankId] = useState<number>(0);
  const [avgAll, setAvgAll] = useState('');
  const [avgPersonal, setAvgPersonal] = useState('');
  const [avgCorp, setAvgCorp] = useState('');
  const [avgDeposit, setAvgDeposit] = useState('');

  async function handleSave() {
    if (!bankId) { toast.error('Vui lòng chọn ngân hàng'); return; }
    setSaving(true);
    try {
      const record = {
        bank_id: bankId,
        report_month: month,
        avg_rate_all: avgAll ? parseFloat(avgAll.replace(',', '.')) : null,
        avg_rate_personal: avgPersonal ? parseFloat(avgPersonal.replace(',', '.')) : null,
        avg_rate_corporate: avgCorp ? parseFloat(avgCorp.replace(',', '.')) : null,
        avg_deposit_rate: avgDeposit ? parseFloat(avgDeposit.replace(',', '.')) : null,
      };
      const { error } = await supabase.from('lending_rates_avg').upsert(record, { onConflict: 'bank_id,report_month' });
      if (error) throw error;
      toast.success('Đã lưu LSCV bình quân!');
      setAvgAll(''); setAvgPersonal(''); setAvgCorp(''); setAvgDeposit('');
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-[#1e3a5f] mb-4">Nhập LSCV bình quân</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngân hàng *</label>
          <select value={bankId} onChange={e => setBankId(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300">
            <option value={0}>-- Chọn --</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tháng</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'LSCV BQ Chung (%)', value: avgAll, set: setAvgAll },
          { label: 'LSCV BQ KHCN (%)', value: avgPersonal, set: setAvgPersonal },
          { label: 'LSCV BQ KHDN (%)', value: avgCorp, set: setAvgCorp },
          { label: 'LSHĐ BQ (%)', value: avgDeposit, set: setAvgDeposit },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
            <input type="text" placeholder="0,00" value={f.value} onChange={e => f.set(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50">
        {saving ? '...' : <><Save size={16} /> Lưu</>}
      </button>
    </div>
  );
}

// ==========================================
// Form: Lending Product Rates
// ==========================================
function LendingProductForm({ banks, saving, setSaving }: { banks: Bank[]; saving: boolean; setSaving: (v: boolean) => void }) {
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number>(0);
  const [loanType, setLoanType] = useState('short_term');
  const [fixedPeriod, setFixedPeriod] = useState('');
  const [rateMin, setRateMin] = useState('');
  const [rateMax, setRateMax] = useState('');
  const [note, setNote] = useState('');

  async function handleSave() {
    if (!bankId) { toast.error('Vui lòng chọn ngân hàng'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('lending_rates_product').insert({
        bank_id: bankId,
        report_date: date,
        loan_type: loanType,
        fixed_period: fixedPeriod || null,
        rate_min: rateMin ? parseFloat(rateMin.replace(',', '.')) : null,
        rate_max: rateMax ? parseFloat(rateMax.replace(',', '.')) : null,
        note: note || null,
      });
      if (error) throw error;
      toast.success('Đã lưu LSCV sản phẩm!');
      setRateMin(''); setRateMax(''); setNote('');
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-[#1e3a5f] mb-4">Nhập LSCV theo sản phẩm</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngân hàng *</label>
          <select value={bankId} onChange={e => setBankId(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300">
            <option value={0}>-- Chọn --</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngày</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Loại cho vay</label>
          <select value={loanType} onChange={e => setLoanType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300">
            <option value="short_term">Ngắn hạn</option>
            <option value="long_term">Trung, dài hạn</option>
            <option value="real_estate">Bất động sản</option>
            <option value="production">Sản xuất kinh doanh</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cố định LS (kỳ)</label>
          <input type="text" placeholder="VD: 06 tháng đầu" value={fixedPeriod} onChange={e => setFixedPeriod(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">LS thấp nhất (%)</label>
          <input type="text" placeholder="0,00" value={rateMin} onChange={e => setRateMin(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">LS cao nhất (%)</label>
          <input type="text" placeholder="0,00" value={rateMax} onChange={e => setRateMax(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50">
        {saving ? '...' : <><Save size={16} /> Lưu</>}
      </button>
    </div>
  );
}

// ==========================================
// Form: Weekly Report
// ==========================================
function WeeklyReportForm({ saving, setSaving }: { saving: boolean; setSaving: (v: boolean) => void }) {
  const [reportDate, setReportDate] = useState(todayISO());
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [depositSummary, setDepositSummary] = useState('');
  const [lendingSummary, setLendingSummary] = useState('');
  const [forecast, setForecast] = useState('');

  async function handleSave() {
    if (!weekStart || !weekEnd) { toast.error('Vui lòng nhập tuần báo cáo'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('weekly_reports').insert({
        report_date: reportDate,
        week_start: weekStart,
        week_end: weekEnd,
        deposit_summary: depositSummary || null,
        lending_summary: lendingSummary || null,
        forecast: forecast || null,
      });
      if (error) throw error;
      toast.success('Đã lưu báo cáo tuần!');
      setDepositSummary(''); setLendingSummary(''); setForecast('');
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-[#1e3a5f] mb-4">Viết báo cáo tuần</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ngày báo cáo</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tuần từ ngày</label>
          <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
          <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tổng hợp lãi suất huy động</label>
          <textarea rows={5} value={depositSummary} onChange={e => setDepositSummary(e.target.value)}
            placeholder="Nhập nội dung tổng hợp LS huy động trong tuần..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tổng hợp lãi suất cho vay</label>
          <textarea rows={5} value={lendingSummary} onChange={e => setLendingSummary(e.target.value)}
            placeholder="Nhập nội dung tổng hợp LS cho vay trong tuần..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Dự báo</label>
          <textarea rows={4} value={forecast} onChange={e => setForecast(e.target.value)}
            placeholder="Nhập dự báo xu hướng lãi suất..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y" />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] disabled:opacity-50">
        {saving ? '...' : <><Save size={16} /> Lưu báo cáo tuần</>}
      </button>
    </div>
  );
}

// ==========================================
// Panel: Thu thập tự động (tất cả 17 NH)
// ==========================================
const ALL_BANKS_SCRAPE = [
  { code: 'AGR', name: 'Agribank', group: 'NHTMNN' },
  { code: 'BIDV', name: 'BIDV', group: 'NHTMNN' },
  { code: 'VCB', name: 'Vietcombank', group: 'NHTMNN' },
  { code: 'CTG', name: 'VietinBank', group: 'NHTMNN' },
  { code: 'ACB', name: 'ACB', group: 'NHTMCP' },
  { code: 'TCB', name: 'Techcombank', group: 'NHTMCP' },
  { code: 'STB', name: 'Sacombank', group: 'NHTMCP' },
  { code: 'SHB', name: 'SHB', group: 'NHTMCP' },
  { code: 'VPB', name: 'VPBank', group: 'NHTMCP' },
  { code: 'MBB', name: 'MBBank', group: 'NHTMCP' },
  { code: 'LPB', name: 'LPBank', group: 'NHTMCP' },
  { code: 'MSB', name: 'MSB', group: 'NHTMCP' },
  { code: 'EIB', name: 'Eximbank', group: 'NHTMCP' },
  { code: 'VIB', name: 'VIB', group: 'NHTMCP' },
  { code: 'ABB', name: 'ABBank', group: 'NHTMCP' },
  { code: 'HDB', name: 'HDBank', group: 'NHTMCP' },
  { code: 'SSB', name: 'SeABank', group: 'NHTMCP' },
];

interface BankStatus {
  code: string;
  latestDate: string | null;
  rateCount: number;
}

function ScrapePanel({ banks }: { banks: Bank[] }) {
  const [statuses, setStatuses] = useState<BankStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkStatuses(); }, [banks]);

  async function checkStatuses() {
    setLoading(true);
    const results: BankStatus[] = [];

    for (const b of banks) {
      const { data } = await supabase
        .from('deposit_rates')
        .select('report_date')
        .eq('bank_id', b.id)
        .order('report_date', { ascending: false })
        .limit(1);

      const { count } = await supabase
        .from('deposit_rates')
        .select('*', { count: 'exact', head: true })
        .eq('bank_id', b.id)
        .eq('report_date', data?.[0]?.report_date || '');

      results.push({
        code: b.code,
        latestDate: data?.[0]?.report_date || null,
        rateCount: count || 0,
      });
    }
    setStatuses(results);
    setLoading(false);
  }

  const today = new Date().toLocaleDateString('vi-VN');
  const githubUrl = 'https://github.com/cuongnguyenitca/bank-rate-tracker-v2/actions/workflows/scrape.yml';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-semibold text-[#1e3a5f] text-lg flex items-center gap-2">
              <Zap size={20} className="text-yellow-500" />
              Thu thập lãi suất tự động — 17 Ngân hàng
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Hệ thống sử dụng trình duyệt tự động (Playwright) để truy cập website từng ngân hàng và đọc bảng lãi suất mỗi ngày.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
                ⏰ Tự động chạy lúc 08:00 sáng (giờ VN) mỗi ngày
              </span>
              <span className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
                🏦 17/17 ngân hàng
              </span>
            </div>
          </div>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a4f7f] transition-colors shadow-sm"
          >
            <Zap size={16} /> Chạy thu thập ngay
          </a>
        </div>
      </div>

      {/* Hướng dẫn chạy thủ công */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="font-medium text-[#1e3a5f] mb-3">Cách chạy thu thập thủ công</h4>
        <div className="space-y-2 text-sm text-gray-600">
          <p>1. Nhấn nút <strong>"Chạy thu thập ngay"</strong> ở trên (sẽ mở trang GitHub)</p>
          <p>2. Nhấn nút <strong>"Run workflow"</strong> (nút màu xanh bên phải)</p>
          <p>3. Có thể nhập mã ngân hàng cụ thể (VD: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">BIDV</code>) hoặc <strong>để trống</strong> để chạy tất cả</p>
          <p>4. Nhấn <strong>"Run workflow"</strong> → Đợi 5-10 phút → Dữ liệu sẽ tự động cập nhật vào bảng</p>
        </div>
      </div>

      {/* Trạng thái từng ngân hàng */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-medium text-[#1e3a5f]">Trạng thái dữ liệu từng ngân hàng</h4>
          <button onClick={checkStatuses} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50">
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang kiểm tra...</div>
        ) : (
          <div className="divide-y">
            {ALL_BANKS_SCRAPE.map(bank => {
              const status = statuses.find(s => s.code === bank.code);
              const hasData = status?.latestDate;
              const isToday = status?.latestDate === new Date().toISOString().split('T')[0];

              return (
                <div key={bank.code} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    {isToday ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : hasData ? (
                      <CheckCircle2 size={18} className="text-yellow-500" />
                    ) : (
                      <XCircle size={18} className="text-gray-300" />
                    )}
                    <div>
                      <span className="font-medium text-sm text-[#1e3a5f]">{bank.name}</span>
                      <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${
                        bank.group === 'NHTMNN' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}>{bank.group}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    {isToday ? (
                      <span className="text-xs text-emerald-600 font-medium">
                        ✅ Hôm nay — {status?.rateCount} kỳ hạn
                      </span>
                    ) : hasData ? (
                      <span className="text-xs text-yellow-600">
                        Cập nhật: {formatDate(status!.latestDate!)} ({status?.rateCount} kỳ hạn)
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Chưa có dữ liệu</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chú thích */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-medium text-amber-800 text-sm">Lưu ý</h4>
        <ul className="text-xs text-amber-700 mt-2 space-y-1">
          <li>• <span className="text-emerald-600">🟢</span> = Đã thu thập hôm nay | <span className="text-yellow-600">🟡</span> = Có dữ liệu cũ | <span className="text-gray-400">⚪</span> = Chưa có dữ liệu</li>
          <li>• Thu thập tự động chạy mỗi ngày lúc 8:00 sáng. Nếu cần cập nhật ngay, nhấn "Chạy thu thập ngay".</li>
          <li>• Nếu ngân hàng nào liên tục không thu thập được, website có thể đã thay đổi cấu trúc — cần cập nhật module scraping.</li>
          <li>• Dữ liệu thu thập tự động là lãi suất niêm yết cơ bản (CN). Lãi suất CSKH/phụ trội cần nhập thủ công.</li>
        </ul>
      </div>
    </div>
  );
}
