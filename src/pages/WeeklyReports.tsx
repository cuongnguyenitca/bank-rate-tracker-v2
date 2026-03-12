import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { WeeklyReport } from '../lib/types';
import { formatDate } from '../lib/utils';
import { TableSkeleton } from '../components/Skeleton';
import { FileText, ChevronLeft, AlertCircle } from 'lucide-react';

export default function WeeklyReports() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WeeklyReport | null>(null);

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    const { data } = await supabase
      .from('weekly_reports')
      .select('*')
      .order('report_date', { ascending: false });
    setReports(data || []);
    setLoading(false);
  }

  if (loading) return <TableSkeleton rows={5} cols={4} />;

  // Detail view
  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
          <ChevronLeft size={16} /> Quay lại danh sách
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="border-b border-gray-100 pb-4 mb-4">
            <h2 className="text-xl font-bold text-[#1e3a5f]">Báo cáo tuần</h2>
            <p className="text-sm text-gray-500">
              Tuần từ {formatDate(selected.week_start)} đến {formatDate(selected.week_end)}
            </p>
          </div>

          {selected.deposit_summary && (
            <div className="mb-6">
              <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Lãi suất huy động
              </h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {selected.deposit_summary}
              </div>
            </div>
          )}

          {selected.lending_summary && (
            <div className="mb-6">
              <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Lãi suất cho vay
              </h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {selected.lending_summary}
              </div>
            </div>
          )}

          {selected.forecast && (
            <div>
              <h3 className="font-semibold text-[#1e3a5f] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Dự báo
              </h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-amber-50 p-4 rounded-lg border border-amber-100">
                {selected.forecast}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-[#1e3a5f]">Danh sách báo cáo tuần</h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-semibold text-gray-500">Chưa có báo cáo tuần</h3>
            <p className="text-sm text-gray-400 mt-1">Vào trang Nhập liệu để tạo báo cáo tuần mới</p>
          </div>
        ) : (
          <div className="divide-y">
            {reports.map(r => (
              <div
                key={r.id}
                onClick={() => setSelected(r)}
                className="p-4 flex items-center gap-4 hover:bg-blue-50/30 cursor-pointer transition-colors"
              >
                <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
                  <FileText size={20} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[#1e3a5f]">
                    Báo cáo tuần {formatDate(r.week_start)} - {formatDate(r.week_end)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Ngày tạo: {formatDate(r.report_date)}</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Đã hoàn thành</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
