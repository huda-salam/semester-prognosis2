import React from 'react';
import { Shield, Building2, UserCircle, LogOut } from 'lucide-react';
import { SkpdAutocomplete } from './SkpdAutocomplete';

interface HeaderProps {
  role: 'skpd' | 'pemda';
  onChangeRole: (role: 'skpd' | 'pemda') => void;
  activeSkpd: string;
  onChangeActiveSkpd: (kode: string) => void;
  skpdList: { kode: string; uraian: string }[];
  currentUser: {
    username: string;
    role: 'skpd' | 'pemda';
    kode_skpd: string | null;
    nama_skpd: string | null;
    allowed_skpds?: { kode: string; nama: string }[];
  } | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  role,
  onChangeRole,
  activeSkpd,
  onChangeActiveSkpd,
  skpdList,
  currentUser,
  onLogout
}) => {
  const selectableSkpds = React.useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'pemda') {
      return skpdList;
    }
    if (currentUser.allowed_skpds && currentUser.allowed_skpds.length > 0) {
      const allowedCodes = new Set(currentUser.allowed_skpds.map((s: any) => s.kode));
      const filtered = skpdList.filter(s => allowedCodes.has(s.kode));
      if (filtered.length > 0) return filtered;
      return currentUser.allowed_skpds.map(s => ({ kode: s.kode, uraian: s.nama }));
    }
    if (currentUser.kode_skpd) {
      const match = skpdList.find(s => s.kode === currentUser.kode_skpd);
      if (match) return [match];
      return [{ kode: currentUser.kode_skpd, uraian: currentUser.nama_skpd || 'SKPD' }];
    }
    return skpdList;
  }, [currentUser, skpdList]);

  const showAutocomplete = currentUser?.role === 'pemda' || (selectableSkpds.length > 1);

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="bg-gray-900 text-white p-2 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-gray-950 uppercase">
                Uploader & Rekap LRA
              </h1>
              <p className="text-[10px] text-gray-500 font-medium tracking-wider">
                PEMDA KABUPATEN KEDIRI • TA 2026
              </p>
            </div>
          </div>
          
          {/* User simulation context panel */}
          <div className="flex items-center space-x-4">
            
            {/* SKPD Context Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-gray-400 uppercase font-bold">SKPD:</span>
              <SkpdAutocomplete
                options={selectableSkpds}
                selectedValue={activeSkpd}
                onChange={onChangeActiveSkpd}
                disabled={!showAutocomplete}
              />
            </div>

            {/* User Info & Badge Indicator */}
            {currentUser && (
              <div className="flex items-center space-x-3 pl-2 border-l border-gray-200">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-gray-900 truncate max-w-[150px]">
                    {currentUser.username}
                  </div>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">
                    {currentUser.role === 'pemda' ? 'PEMDA (ADMIN)' : 'SKPD USER'}
                  </div>
                </div>

                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                  currentUser.role === 'pemda' 
                    ? 'bg-amber-50 text-amber-700 border-amber-100' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}>
                  {currentUser.role === 'pemda' ? 'PEMDA' : 'SKPD'}
                </div>

                {/* Logout Button */}
                <button
                  id="logout-button"
                  onClick={onLogout}
                  title="Keluar"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
