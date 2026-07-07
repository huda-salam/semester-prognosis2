import React from 'react';
import { Shield, Building2, UserCircle, Settings } from 'lucide-react';

interface HeaderProps {
  role: 'skpd' | 'pemda';
  onChangeRole: (role: 'skpd' | 'pemda') => void;
  activeSkpd: string;
  onChangeActiveSkpd: (kode: string) => void;
  skpdList: { kode: string; uraian: string }[];
}

export const Header: React.FC<HeaderProps> = ({
  role,
  onChangeRole,
  activeSkpd,
  onChangeActiveSkpd,
  skpdList
}) => {
  const currentSkpdName = skpdList.find(s => s.kode === activeSkpd)?.uraian || 'Pilih SKPD';

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
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
            
            {/* Role Switcher */}
            <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
              <button
                id="role-skpd-btn"
                onClick={() => onChangeRole('skpd')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  role === 'skpd'
                    ? 'bg-white text-gray-950 shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:text-gray-950'
                }`}
              >
                <UserCircle className="w-3.5 h-3.5" />
                <span>SKPD</span>
              </button>
              <button
                id="role-pemda-btn"
                onClick={() => onChangeRole('pemda')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  role === 'pemda'
                    ? 'bg-white text-gray-950 shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:text-gray-950'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>PEMDA</span>
              </button>
            </div>

            {/* SKPD Context Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-gray-400 uppercase font-bold">SKPD:</span>
              <select
                id="active-skpd-select"
                value={activeSkpd}
                onChange={(e) => onChangeActiveSkpd(e.target.value)}
                className="bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-medium px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-950 max-w-[240px] truncate"
              >
                {skpdList.map((skpd) => (
                  <option key={skpd.kode} value={skpd.kode} className="text-xs">
                    {skpd.uraian}
                  </option>
                ))}
              </select>
            </div>

            {/* Badge Indicator */}
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${
              role === 'pemda' 
                ? 'bg-amber-50 text-amber-700 border-amber-100' 
                : 'bg-blue-50 text-blue-700 border-blue-100'
            }`}>
              {role === 'pemda' ? 'PEMDA (ADMIN)' : 'SKPD USER'}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
