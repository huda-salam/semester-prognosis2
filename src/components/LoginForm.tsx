import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Shield, UserCircle, Key, Lock, Mail, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [showDemoHelp, setShowDemoHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Harap masukkan Username/Email dan Password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
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

  const setDemoCredentials = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        
        {/* Logo & Header */}
        <div className="flex flex-col items-center">
          <div className="bg-gray-900 text-white p-3 rounded-2xl shadow-md">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900 tracking-tight uppercase">
            Uploader & Rekap LRA
          </h2>
          <p className="mt-2 text-center text-xs text-gray-500 font-bold tracking-wider uppercase">
            PEMDA KABUPATEN KEDIRI
          </p>
          <div className="mt-1.5 h-1 w-12 bg-emerald-500 rounded-full" />
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

          {/* Demo account quick credentials drawer */}
          <div className="mt-8 border-t border-gray-100 pt-6">
            <button
              id="demo-help-toggle"
              type="button"
              onClick={() => setShowDemoHelp(!showDemoHelp)}
              className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-800 transition-colors py-1 cursor-pointer font-bold uppercase tracking-wider"
            >
              <span className="flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-500" />
                <span>Bantuan Akun Demo & Admin</span>
              </span>
              {showDemoHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDemoHelp && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 space-y-2.5 text-[11px] leading-relaxed overflow-hidden text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-150"
              >
                <p className="font-semibold text-gray-700">Silakan gunakan salah satu akun di bawah untuk pengujian cepat:</p>
                <div className="space-y-2">
                  <div className="border-b border-gray-200/50 pb-2">
                    <span className="font-bold text-amber-700 uppercase tracking-wider text-[9px] block mb-0.5">ADMIN PEMDA (AKSES PENUH):</span>
                    <button
                      id="demo-credential-admin"
                      type="button"
                      onClick={() => setDemoCredentials('akuntansi.bpkadkdr@gmail.com', '123456')}
                      className="w-full text-left bg-white border border-gray-200/80 hover:bg-emerald-50 hover:border-emerald-200 rounded px-2.5 py-1.5 font-mono text-[10px] text-gray-800 transition-all flex items-center justify-between cursor-pointer"
                    >
                      <span>
                        U: <strong className="text-gray-900">akuntansi.bpkadkdr@gmail.com</strong><br />
                        P: <strong className="text-gray-900">123456</strong>
                      </span>
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide font-sans">Pilih</span>
                    </button>
                  </div>

                  <div>
                    <span className="font-bold text-emerald-700 uppercase tracking-wider text-[9px] block mb-0.5">USER SKPD (LOCKED TO ACC):</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id="demo-credential-pendidikan"
                        type="button"
                        onClick={() => setDemoCredentials('pendidikan', '123456')}
                        className="text-left bg-white border border-gray-200/80 hover:bg-emerald-50 hover:border-emerald-200 rounded px-2.5 py-1.5 font-mono text-[10px] text-gray-800 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span>
                          U: <strong className="text-gray-900">pendidikan</strong><br />
                          P: <strong className="text-gray-900">123456</strong>
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold font-sans">»</span>
                      </button>
                      <button
                        id="demo-credential-kesehatan"
                        type="button"
                        onClick={() => setDemoCredentials('kesehatan', '123456')}
                        className="text-left bg-white border border-gray-200/80 hover:bg-emerald-50 hover:border-emerald-200 rounded px-2.5 py-1.5 font-mono text-[10px] text-gray-800 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span>
                          U: <strong className="text-gray-900">kesehatan</strong><br />
                          P: <strong className="text-gray-900">123456</strong>
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold font-sans">»</span>
                      </button>
                    </div>
                    <p className="mt-1.5 text-[9px] text-gray-400 italic">Mendukung semua username dari spreadsheet excel, password semuanya 123456.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
