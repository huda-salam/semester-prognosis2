import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, UserCircle, Lock, AlertCircle } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface LoginFormProps {
  onLoginSuccess: (user: {
    username: string;
    role: 'skpd' | 'pemda';
    kode_skpd: string | null;
    nama_skpd: string | null;
  }) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Harap masukkan Username/Email dan Password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        if (result.token) {
          localStorage.setItem('token', result.token);
        }
        onLoginSuccess(result.user);
      } else {
        setError(result.error || 'Username atau password salah.');
      }
    } catch (err: any) {
      setError('Koneksi ke server gagal. Harap coba lagi.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        
        {/* Logo & Header */}
        <div className="flex flex-col items-center">
          <div className="bg-gray-900 text-white p-3 rounded-2xl shadow-md">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="mt-5 text-center text-base font-extrabold text-gray-900 tracking-tight leading-snug px-4">
            Aplikasi Laporan Realisasi APBD Semester I<br />dan Prognosis 6 (Enam) Bulan Berikutnya
          </h2>
          <p className="mt-2 text-center text-xs text-gray-600 font-bold tracking-wider uppercase">
            Pemerintah Daerah Kabupaten Kediri
          </p>
          <p className="mt-1 text-center text-[11px] text-gray-500 font-bold uppercase tracking-widest">
            Tahun Anggaran 2026
          </p>
          <div className="mt-3 h-1 w-12 bg-emerald-500 rounded-full" />
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-gray-100/80">
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-50 p-4 border border-red-100 flex items-start space-x-3 text-red-700 text-xs leading-relaxed"
                id="error-alert"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="font-semibold">{error}</span>
              </motion.div>
            )}

            {/* Username field */}
            <div>
              <label htmlFor="username" className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Username / Email Admin
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <UserCircle className="w-4 h-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all"
                  placeholder="Masukkan username atau email"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Password
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Submit button */}
            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl text-xs font-bold text-white bg-gray-950 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? 'Memverifikasi...' : 'MASUK KE SISTEM'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
