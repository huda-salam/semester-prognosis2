import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, FileText, BarChart2, CheckCircle2, Server, HelpCircle, Activity } from 'lucide-react';
import { Header } from './components/Header';
import { UploadTab } from './components/UploadTab';
import { ReportTab } from './components/ReportTab';
import { PrognosisTab } from './components/PrognosisTab';
import { AdminTab } from './components/AdminTab';

export default function App() {
  const [role, setRole] = useState<'skpd' | 'pemda'>('skpd');
  const [activeTab, setActiveTab] = useState<'upload' | 'report' | 'prognosis' | 'admin'>('upload');
  const [skpdList, setSkpdList] = useState<{ kode: string; uraian: string }[]>([]);
  const [activeSkpd, setActiveSkpd] = useState<string>('');
  const [loadingSkpd, setLoadingSkpd] = useState<boolean>(true);

  // Triggered when any tab completes a successful upload to refresh details
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const fetchSkpds = async () => {
    try {
      setLoadingSkpd(true);
      const res = await fetch('/api/master?jenis=skpd');
      const result = await res.json();
      if (res.ok && result.success) {
        setSkpdList(result.data || []);
        if (result.data && result.data.length > 0) {
          // Default to first SKPD (e.g., DINAS PENDIDIKAN or similar)
          setActiveSkpd(result.data[0].kode);
        }
      }
    } catch (err) {
      console.error('Failed to load SKPDs:', err);
    } finally {
      setLoadingSkpd(false);
    }
  };

  useEffect(() => {
    fetchSkpds();
  }, [refreshTrigger]);

  const activeSkpdUraian = skpdList.find(s => s.kode === activeSkpd)?.uraian || 'SKPD';

  const tabs = [
    { id: 'upload', label: 'Upload Excel LRA', icon: UploadCloud },
    { id: 'report', label: 'Rekapitulasi LRA', icon: FileText },
    { id: 'prognosis', label: 'Prognosis Semester II', icon: BarChart2 },
    ...(role === 'pemda' ? [{ id: 'admin', label: 'Admin & SQL Client', icon: Server }] : [])
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col antialiased">
      
      {/* Simulation Branding & Control Header */}
      <Header
        role={role}
        onChangeRole={(newRole) => {
          setRole(newRole);
          if (newRole === 'skpd' && activeTab === 'admin') {
            setActiveTab('upload');
          }
        }}
        activeSkpd={activeSkpd}
        onChangeActiveSkpd={setActiveSkpd}
        skpdList={skpdList}
      />

      {/* Main Container Wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Dynamic Context Breadcrumbs / Greeting */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200/50 pb-5 gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-950 tracking-tight">
              {activeTab === 'upload' && 'Pusat Integrasi Data LRA'}
              {activeTab === 'report' && 'Laporan Realisasi Anggaran'}
              {activeTab === 'prognosis' && 'Penyusunan Prognosis'}
              {activeTab === 'admin' && 'Sistem Admin & SQL Client'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {activeTab === 'upload' && 'Unggah laporan realisasi belanja, pendapatan, atau data master'}
              {activeTab === 'report' && `Melihat visualisasi laporan realisasi untuk ${activeSkpdUraian}`}
              {activeTab === 'prognosis' && `Kelola prognosis realisasi anggaran belanja dan pendapatan`}
              {activeTab === 'admin' && 'Kelola database master referensi dan jalankan kueri SQL SQLite3 kustom'}
            </p>
          </div>
          
          <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-150 text-xs font-semibold text-gray-600 flex items-center space-x-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Aktif: <strong className="text-gray-900">{activeSkpdUraian}</strong></span>
          </div>
        </div>

        {/* Minimalist Tab Navigation bar */}
        <div className="border-b border-gray-200 mb-8 flex justify-between items-center bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-btn-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gray-950 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[10px] font-mono text-gray-400 uppercase font-bold tracking-wider mr-2 hidden sm:block">
            T.A. 2026 • KAB. KEDIRI
          </div>
        </div>

        {/* Tab Contents Frame with Stagger Animations */}
        <div className="focus:outline-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${activeSkpd}-${role}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'upload' && (
                <UploadTab
                  role={role}
                  activeSkpd={activeSkpd}
                  skpdList={skpdList}
                  onUploadSuccess={() => setRefreshTrigger(p => p + 1)}
                />
              )}

              {activeTab === 'report' && (
                <ReportTab
                  role={role}
                  activeSkpd={activeSkpd}
                  skpdList={skpdList}
                />
              )}

              {activeTab === 'prognosis' && (
                <PrognosisTab
                  role={role}
                  activeSkpd={activeSkpd}
                  skpdList={skpdList}
                />
              )}

              {activeTab === 'admin' && role === 'pemda' && (
                <AdminTab
                  onUploadSuccess={() => setRefreshTrigger(p => p + 1)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      {/* Footer Branding */}
      <footer className="bg-white border-t border-gray-150 py-6 text-center text-xs text-gray-400 mt-12">
        <p className="font-semibold text-gray-500">Badan Pengelolaan Keuangan dan Aset Daerah (BPKAD) Kabupaten Kediri</p>
        <p className="text-[10px] text-gray-400 mt-1">Sistem Uploader & Prognosis Realisasi LRA © 2026</p>
      </footer>

    </div>
  );
}
