import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Building2, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu');
      return;
    }
    setError('');
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    if (authError) {
      setError('Email hoặc mật khẩu không đúng');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] via-[#2a4f7f] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-400 rounded-2xl mb-4 shadow-lg">
            <Building2 size={32} className="text-[#1e3a5f]" />
          </div>
          <h1 className="text-2xl font-bold text-white">HỆ THỐNG THEO DÕI</h1>
          <h2 className="text-xl font-bold text-yellow-400">LÃI SUẤT NGÂN HÀNG</h2>
          <p className="text-blue-200 text-sm mt-2">Đăng nhập để tiếp tục</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] text-white py-3 rounded-lg font-medium text-sm hover:bg-[#2a4f7f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  Đăng nhập
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-200 text-xs mt-6">
          © 2026 - Hệ thống theo dõi lãi suất Ngân hàng
        </p>
      </div>
    </div>
  );
}
