import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LayoutDashboard, Landmark, TrendingUp, FileText, Settings, Menu, Building2, LogOut } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deposit-rates', icon: Landmark, label: 'LS Tiền gửi' },
  { to: '/lending-rates', icon: TrendingUp, label: 'LS Cho vay' },
  { to: '/weekly-reports', icon: FileText, label: 'Báo cáo tuần' },
  { to: '/admin', icon: Settings, label: 'Nhập liệu' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="min-h-screen flex">
      {/* Overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#1e3a5f] text-white transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col`}>
        <div className="p-4 border-b border-white/20">
          <div className="flex items-center gap-3">
            <Building2 size={32} className="text-yellow-400" />
            <div>
              <h1 className="font-bold text-sm leading-tight">HỆ THỐNG THEO DÕI</h1>
              <h2 className="font-bold text-sm leading-tight text-yellow-400">LÃI SUẤT NGÂN HÀNG</h2>
            </div>
          </div>
          <p className="text-xs text-blue-200 mt-2">{today}</p>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-white/20 text-yellow-400 font-semibold'
                    : 'text-blue-100 hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info & logout */}
        <div className="p-3 border-t border-white/20">
          {user && (
            <div className="mb-2 px-3">
              <p className="text-xs text-blue-200 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-300 hover:bg-white/10 w-full transition-colors"
          >
            <LogOut size={18} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 hover:bg-gray-100 rounded">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-semibold text-[#1e3a5f]">Hệ thống theo dõi lãi suất Ngân hàng</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
