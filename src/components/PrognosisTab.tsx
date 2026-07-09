import React, { useState, useEffect } from 'react';
import { HelpCircle, RefreshCw, Lock, Unlock, AlertCircle, Save, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { DataPrognosisBelanja, DataPrognosisPendapatanPembiayaan } from '../types';

interface PrognosisTabProps {
  role: 'skpd' | 'pemda';
  activeSkpd: string;
  skpdList: { kode: string; uraian: string }[];
}

const formatRupiah = (num: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num);
};

export const PrognosisTab: React.FC<PrognosisTabProps> = ({ role, activeSkpd, skpdList }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  
  // Enriched local states with anggaran, realisasi, names
  const [belanjaList, setBelanjaList] = useState<any[]>([]);
  const [pendPembList, setPendPembList] = useState<any[]>([]);
  
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [showGuide, setShowGuide] = useState<boolean>(true);

  // Collapsed state for subkegiatan grouping
  const [collapsedGroups, setCollapsedGroups] = useState<{ [kode: string]: boolean }>({});
  
  const isExpanded = (kode: string) => !collapsedGroups[kode];
  const toggleGroup = (kode: string) => {
    setCollapsedGroups(prev => ({ ...prev, [kode]: !prev[kode] }));
  };

  // Group belanjaList by subkegiatan
  const groupedBelanja = React.useMemo(() => {
    const groups: { [key: string]: {
      kode: string;
      nama: string;
      items: { item: any; originalIndex: number }[];
      totalAnggaran: number;
      totalRealisasi: number;
      totalPrognosis: number;
    }} = {};

    belanjaList.forEach((item, index) => {
      const key = item.kode_sub_kegiatan;
      if (!groups[key]) {
        groups[key] = {
          kode: item.kode_sub_kegiatan,
          nama: item.nama_sub_kegiatan,
          items: [],
          totalAnggaran: 0,
          totalRealisasi: 0,
          totalPrognosis: 0
        };
      }
      groups[key].items.push({ item, originalIndex: index });
      groups[key].totalAnggaran += item.anggaran || 0;
      groups[key].totalRealisasi += item.realisasi || 0;
      groups[key].totalPrognosis += item.nilai_prognosis || 0;
    });

    return Object.values(groups);
  }, [belanjaList]);

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const newCollapsed: { [kode: string]: boolean } = {};
    groupedBelanja.forEach(g => {
      newCollapsed[g.kode] = true;
    });
    setCollapsedGroups(newCollapsed);
  };

  const activeSkpdName = skpdList.find(s => s.kode === activeSkpd)?.uraian || 'SKPD';

  const fetchPrognosis = async () => {
    setLoading(true);
    setSaveStatus('');
    try {
      const res = await fetch(`/api/prognosis?kode_skpd=${activeSkpd}&tahun=2026`);
      const result = await res.json();
      if (res.ok && result.success) {
        setBelanjaList(result.data.belanja || []);
        setPendPembList(result.data.pendapatanPembiayaan || []);
        
        // Check if locked
        const lockedBelanja = (result.data.belanja || []).some((b: any) => b.locked);
        const lockedPend = (result.data.pendapatanPembiayaan || []).some((p: any) => p.locked);
        setIsLocked(lockedBelanja || lockedPend);
      } else {
        setBelanjaList([]);
        setPendPembList([]);
        setIsLocked(false);
      }
    } catch (err) {
      console.error('Failed to load prognosis data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrognosis();
  }, [activeSkpd]);

  // Handle dropdown option changes
  const handleOptionChange = async (
    type: 'belanja' | 'pend_pemb',
    index: number,
    newOpsi: 'sisa' | 'tambah_kurang' | 'fix'
  ) => {
    if (isLocked) return;

    setSaveStatus('Menyimpan draf...');

    if (type === 'belanja') {
      const updated = [...belanjaList];
      const item = updated[index];
      item.opsi_input = newOpsi;
      
      // Reset values or compute on dropdown select
      if (newOpsi === 'sisa') {
        item.nilai = 0;
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi);
      } else if (newOpsi === 'tambah_kurang') {
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi + item.nilai);
      } else if (newOpsi === 'fix') {
        item.nilai_prognosis = item.nilai;
      }
      
      setBelanjaList(updated);
      await saveDraftBelanja(item);
    } else {
      const updated = [...pendPembList];
      const item = updated[index];
      item.opsi_input = newOpsi;

      if (newOpsi === 'sisa') {
        item.nilai = 0;
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi);
      } else if (newOpsi === 'tambah_kurang') {
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi + item.nilai);
      } else if (newOpsi === 'fix') {
        item.nilai_prognosis = item.nilai;
      }

      setPendPembList(updated);
      await saveDraftPendPemb(item);
    }
  };

  // Handle dynamic numerical inputs
  const handleValueChange = (
    type: 'belanja' | 'pend_pemb',
    index: number,
    valStr: string
  ) => {
    if (isLocked) return;

    const val = Number(valStr);
    
    if (type === 'belanja') {
      const updated = [...belanjaList];
      const item = updated[index];
      item.nilai = val;
      
      if (item.opsi_input === 'tambah_kurang') {
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi + val);
      } else if (item.opsi_input === 'fix') {
        item.nilai_prognosis = val;
      }
      
      setBelanjaList(updated);
    } else {
      const updated = [...pendPembList];
      const item = updated[index];
      item.nilai = val;

      if (item.opsi_input === 'tambah_kurang') {
        item.nilai_prognosis = Math.max(0, item.anggaran - item.realisasi + val);
      } else if (item.opsi_input === 'fix') {
        item.nilai_prognosis = val;
      }

      setPendPembList(updated);
    }
  };

  const handleBlurSave = async (type: 'belanja' | 'pend_pemb', index: number) => {
    if (isLocked) return;
    setSaveStatus('Menyimpan draf...');
    
    if (type === 'belanja') {
      await saveDraftBelanja(belanjaList[index]);
    } else {
      await saveDraftPendPemb(pendPembList[index]);
    }
  };

  const saveDraftBelanja = async (item: any) => {
    try {
      const res = await fetch('/api/prognosis/update-belanja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: activeSkpd,
          kode_sub_kegiatan: item.kode_sub_kegiatan,
          kode_rekening: item.kode_rekening,
          opsi_input: item.opsi_input,
          nilai: item.nilai,
          anggaran: item.anggaran,
          realisasi: item.realisasi,
          user: role === 'pemda' ? 'PEMDA Admin' : activeSkpdName
        })
      });
      if (res.ok) {
        setSaveStatus('Draf otomatis disimpan.');
      } else {
        setSaveStatus('Gagal menyimpan draf.');
      }
    } catch {
      setSaveStatus('Koneksi terganggu.');
    }
  };

  const saveDraftPendPemb = async (item: any) => {
    try {
      const res = await fetch('/api/prognosis/update-pend-pemb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: activeSkpd,
          kode_rekening: item.kode_rekening,
          opsi_input: item.opsi_input,
          nilai: item.nilai,
          anggaran: item.anggaran,
          realisasi: item.realisasi,
          user: role === 'pemda' ? 'PEMDA Admin' : activeSkpdName
        })
      });
      if (res.ok) {
        setSaveStatus('Draf otomatis disimpan.');
      } else {
        setSaveStatus('Gagal menyimpan draf.');
      }
    } catch {
      setSaveStatus('Koneksi terganggu.');
    }
  };

  // Lock and submit
  const handleSubmitPrognosis = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/prognosis/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: activeSkpd,
          user: activeSkpdName
        })
      });
      if (res.ok) {
        setIsLocked(true);
        setSaveStatus('Sukses mengirim berkas prognosis!');
        await fetchPrognosis();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Unlock (Admin/Pemda role only)
  const handleUnlockPrognosis = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/prognosis/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: activeSkpd,
          user: 'PEMDA Admin'
        })
      });
      if (res.ok) {
        setIsLocked(false);
        setSaveStatus('Prognosis dibuka kunci oleh Admin.');
        await fetchPrognosis();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const isBelanjaEmpty = belanjaList.length === 0;
  const isPendEmpty = pendPembList.length === 0;

  return (
    <div className="space-y-6">
      
      {/* Prognosis Controls Header Panel */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div>
          <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wide flex items-center space-x-2">
            <span>Workspace Prognosis Semester II</span>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${
              isLocked 
                ? 'bg-rose-50 text-rose-700 border-rose-100' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-100'
            }`}>
              {isLocked ? 'TERKUNCI / SUBMITTED' : 'DRAFT'}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Mengatur target prognosis realisasi LRA Semester II berdasarkan data historis realisasi Semester I (Bulan Juni).
          </p>
        </div>

        {/* Lock / Unlock Submission Actions */}
        <div className="flex items-center space-x-3">
          {saveStatus && (
            <span className="text-[11px] text-gray-500 font-mono italic animate-pulse">
              {saveStatus}
            </span>
          )}

          {!isLocked && (!isBelanjaEmpty || !isPendEmpty) && (
            <button
              id="submit-prognosis-btn"
              disabled={submitting}
              onClick={handleSubmitPrognosis}
              className="flex items-center space-x-1.5 bg-gray-950 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm cursor-pointer transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Validasi & Kirim Prognosis</span>
            </button>
          )}

          {isLocked && role === 'pemda' && (
            <button
              id="unlock-prognosis-btn"
              disabled={submitting}
              onClick={handleUnlockPrognosis}
              className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-400 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm cursor-pointer transition-all"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Buka Kunci (Admin Only)</span>
            </button>
          )}
        </div>

      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white rounded-xl border border-gray-100 shadow-sm">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Mengkonsolidasi workspace prognosis SKPD...</p>
        </div>
      ) : isBelanjaEmpty && isPendEmpty ? (
        <div className="py-20 text-center bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
          <AlertCircle className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-800">
            Sumber Data Semester I Tidak Ditemukan
          </p>
          <p className="text-xs text-gray-400 max-w-sm mt-1 leading-relaxed">
            Workspace prognosis memerlukan data transaksi LRA periode **Bulan Juni** (Semester I) sebagai basis kalkulasi. Silakan unggah LRA format 1 & format 2 terlebih dahulu.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Petunjuk Pengisian Accordion */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full px-5 py-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center space-x-2 text-gray-700">
                <HelpCircle className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold uppercase tracking-wider">Petunjuk Pengisian & Aturan Formula Perhitungan Prognosis</span>
              </div>
              {showGuide ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
            
            {showGuide && (
              <div className="p-6 border-t border-gray-100 bg-white space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Penyusunan prognosis Semester II dihitung secara otomatis berdasarkan pilihan metode pengisian untuk masing-masing kode rekening belanja maupun pendapatan/pembiayaan. Pilih metode yang sesuai untuk masing-masing komponen rekening:
                </p>
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-400 font-bold text-[10px] uppercase tracking-wider">
                        <th className="pb-2 w-48 font-semibold">Metode Opsi Input</th>
                        <th className="pb-2 font-semibold">Formula Perhitungan Matematika</th>
                        <th className="pb-2 font-semibold">Deskripsi Kasus Penggunaan</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600 leading-relaxed">
                      <tr className="border-b border-gray-100">
                        <td className="py-2.5 font-semibold text-gray-800">Sisa Anggaran</td>
                        <td className="py-2.5 font-mono text-indigo-600 font-semibold">Anggaran - Realisasi</td>
                        <td className="py-2.5 text-gray-500">Digunakan jika realisasi Semester II diprediksi akan menyerap seluruh sisa anggaran yang tersisa secara penuh.</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2.5 font-semibold text-gray-800">Tambah/Kurang</td>
                        <td className="py-2.5 font-mono text-indigo-600 font-semibold">Anggaran - Realisasi + Delta</td>
                        <td className="py-2.5 text-gray-500">Digunakan untuk penyesuaian parsial (tambah positif atau kurangi negatif) dari sisa sisa anggaran Semester I.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-semibold text-gray-800">Fix Angka</td>
                        <td className="py-2.5 font-mono text-indigo-600 font-semibold">Target Nilai Mutlak</td>
                        <td className="py-2.5 text-gray-500">Menetapkan nilai target realisasi Semester II secara eksplisit mutlak bebas tanpa memperhitungkan selisih sisa anggaran.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
          {/* SECTION 1: PROGNOSIS BELANJA */}
          {!isBelanjaEmpty && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Prognosis Belanja Daerah (Format 1)
                </h4>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={expandAll}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    Buka Semua
                  </button>
                  <button
                    onClick={collapseAll}
                    className="text-[10px] font-bold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200/80 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    Tutup Semua
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold w-48">Kode Rekening</th>
                      <th className="py-3 px-4 font-semibold">Nama Rekening Belanja</th>
                      <th className="py-3 px-4 font-semibold text-right w-36">Anggaran (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-right w-36">Realisasi (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-center w-36">Metode Prognosis</th>
                      <th className="py-3 px-4 font-semibold text-center w-36">Input Nilai (+/- / Fix)</th>
                      <th className="py-3 px-4 font-semibold text-right w-40">Hasil Prognosis Sms II</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedBelanja.map((group) => {
                      const expanded = isExpanded(group.kode);
                      return (
                        <React.Fragment key={`group-frag-${group.kode}`}>
                          {/* Group Header Row */}
                          <tr className="bg-gray-50/95 border-b border-gray-200">
                            <td colSpan={7} className="p-3.5 align-middle">
                              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 w-full">
                                <div className="flex items-start space-x-3 min-w-0 flex-1">
                                  {/* Toggle Expand/Collapse */}
                                  <button
                                    onClick={() => toggleGroup(group.kode)}
                                    className="mt-0.5 p-1 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded transition-colors cursor-pointer flex-shrink-0"
                                  >
                                    {expanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                                        Sub-Kegiatan: {group.kode}
                                      </span>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-150">
                                        {group.items.length} Belanja
                                      </span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-900 whitespace-normal break-words leading-relaxed select-text">
                                      {group.nama}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Aggregated Totals under this subkegiatan */}
                                <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-gray-150 shadow-xs flex-shrink-0">
                                  <div className="text-right">
                                    <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider animate-none">Anggaran</span>
                                    <span className="font-mono text-[11px] font-bold text-gray-600">{formatRupiah(group.totalAnggaran)}</span>
                                  </div>
                                  <div className="h-6 w-px bg-gray-150" />
                                  <div className="text-right">
                                    <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider animate-none">Realisasi</span>
                                    <span className="font-mono text-[11px] font-bold text-gray-600">{formatRupiah(group.totalRealisasi)}</span>
                                  </div>
                                  <div className="h-6 w-px bg-gray-150" />
                                  <div className="text-right">
                                    <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider animate-none">Prognosis Sms II</span>
                                    <span className="font-mono text-[11px] font-extrabold text-emerald-700">{formatRupiah(group.totalPrognosis)}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Child Rows (Belanja Items) */}
                          {expanded && group.items.map(({ item, originalIndex }) => {
                            return (
                              <tr 
                                key={`${item.kode_sub_kegiatan}-${item.kode_rekening}`} 
                                className="text-xs hover:bg-gray-50/50 border-b border-gray-100 transition-colors"
                              >
                                <td className="py-3 px-4 font-mono text-gray-500 select-all whitespace-nowrap pl-7 flex items-center space-x-1">
                                  <span className="text-gray-300 font-bold text-xs select-none">↳</span>
                                  <span className="font-semibold text-[11px]">{item.kode_rekening}</span>
                                </td>
                                <td className="py-3 px-4 whitespace-normal break-words max-w-[280px]">
                                  <div className="font-medium text-gray-800 leading-relaxed select-text">
                                    {item.nama_rekening}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-gray-700">
                                  {formatRupiah(item.anggaran)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-gray-700">
                                  {formatRupiah(item.realisasi)}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <select
                                    id={`opsi-belanja-${originalIndex}`}
                                    disabled={isLocked}
                                    value={item.opsi_input}
                                    onChange={(e) => handleOptionChange('belanja', originalIndex, e.target.value as any)}
                                    className="bg-white border border-gray-250 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer"
                                  >
                                    <option value="sisa">Sisa Anggaran</option>
                                    <option value="tambah_kurang">Tambah/Kurang</option>
                                    <option value="fix">Fix Angka</option>
                                  </select>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <input
                                    type="number"
                                    id={`nilai-belanja-${originalIndex}`}
                                    disabled={isLocked || item.opsi_input === 'sisa'}
                                    value={item.nilai}
                                    onChange={(e) => handleValueChange('belanja', originalIndex, e.target.value)}
                                    onBlur={() => handleBlurSave('belanja', originalIndex)}
                                    placeholder={item.opsi_input === 'sisa' ? 'N/A' : '0'}
                                    className="w-28 bg-white border border-gray-250 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 bg-gray-50/30">
                                  {formatRupiah(item.nilai_prognosis)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 2: PROGNOSIS PENDAPATAN & PEMBIAYAAN */}
          {!isPendEmpty && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Prognosis Pendapatan & Pembiayaan (Format 2 / 3)
                </h4>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold w-48">Kode Rekening</th>
                      <th className="py-3 px-4 font-semibold">Nama Rekening</th>
                      <th className="py-3 px-4 font-semibold text-right w-44">Anggaran (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-right w-44">Realisasi (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-center w-40">Metode Prognosis</th>
                      <th className="py-3 px-4 font-semibold text-center w-40">Input Nilai (+/- / Fix)</th>
                      <th className="py-3 px-4 font-semibold text-right w-44">Hasil Prognosis Sms II</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendPembList.map((item, index) => {
                      const sisaSms1 = item.anggaran - item.realisasi;
                      return (
                        <tr key={item.kode_rekening} className="text-xs hover:bg-gray-50/30 border-b border-gray-100">
                          <td className="py-3 px-4 font-mono text-gray-500 select-all whitespace-nowrap">
                            {item.kode_rekening}
                          </td>
                          <td className="py-3 px-4 whitespace-normal break-words max-w-[280px]">
                            <p className="font-semibold text-gray-800 leading-relaxed" title={item.nama_rekening}>{item.nama_rekening}</p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.anggaran)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.realisasi)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              id={`opsi-pend-${index}`}
                              disabled={isLocked}
                              value={item.opsi_input}
                              onChange={(e) => handleOptionChange('pend_pemb', index, e.target.value as any)}
                              className="bg-white border border-gray-250 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer"
                            >
                              <option value="sisa">Sisa Anggaran</option>
                              <option value="tambah_kurang">Tambah/Kurang</option>
                              <option value="fix">Fix Angka</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              id={`nilai-pend-${index}`}
                              disabled={isLocked || item.opsi_input === 'sisa'}
                              value={item.nilai}
                              onChange={(e) => handleValueChange('pend_pemb', index, e.target.value)}
                              onBlur={() => handleBlurSave('pend_pemb', index)}
                              placeholder={item.opsi_input === 'sisa' ? 'N/A' : '0'}
                              className="w-32 bg-white border border-gray-250 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 bg-gray-50/30">
                            {formatRupiah(item.nilai_prognosis)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Petunjuk pengisian dipindahkan ke bagian atas */}

        </div>
      )}

    </div>
  );
};
