import React, { useState, useEffect } from 'react';
import { HelpCircle, RefreshCw, Lock, Unlock, AlertCircle, Save, CheckCircle2 } from 'lucide-react';
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
          
          {/* SECTION 1: PROGNOSIS BELANJA */}
          {!isBelanjaEmpty && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Prognosis Belanja Daerah (Format 1)
                </h4>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold w-40">Sub Kegiatan</th>
                      <th className="py-3 px-4 font-semibold w-40">Kode Rekening</th>
                      <th className="py-3 px-4 font-semibold">Nama Rekening</th>
                      <th className="py-3 px-4 font-semibold text-right w-36">Anggaran (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-right w-36">Realisasi (Sms I)</th>
                      <th className="py-3 px-4 font-semibold text-center w-36">Metode Prognosis</th>
                      <th className="py-3 px-4 font-semibold text-center w-36">Input Nilai (+/- / Fix)</th>
                      <th className="py-3 px-4 font-semibold text-right w-40">Hasil Prognosis Sms II</th>
                    </tr>
                  </thead>
                  <tbody>
                    {belanjaList.map((item, index) => {
                      const sisaSms1 = item.anggaran - item.realisasi;
                      return (
                        <tr key={`${item.kode_sub_kegiatan}-${item.kode_rekening}`} className="text-xs hover:bg-gray-50/30 border-b border-gray-100">
                          <td className="py-2.5 px-4 font-mono text-gray-500 select-all truncate max-w-[150px]" title={item.kode_sub_kegiatan}>
                            {item.kode_sub_kegiatan}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-gray-500 select-all whitespace-nowrap">
                            {item.kode_rekening}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="max-w-[220px]">
                              <p className="font-semibold text-gray-800 truncate" title={item.nama_rekening}>{item.nama_rekening}</p>
                              <p className="text-[10px] text-gray-400 truncate mt-0.5" title={item.nama_sub_kegiatan}>{item.nama_sub_kegiatan}</p>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.anggaran)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.realisasi)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <select
                              id={`opsi-belanja-${index}`}
                              disabled={isLocked}
                              value={item.opsi_input}
                              onChange={(e) => handleOptionChange('belanja', index, e.target.value as any)}
                              className="bg-white border border-gray-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <option value="sisa">Sisa Anggaran</option>
                              <option value="tambah_kurang">Tambah/Kurang</option>
                              <option value="fix">Fix Angka</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <input
                              type="number"
                              id={`nilai-belanja-${index}`}
                              disabled={isLocked || item.opsi_input === 'sisa'}
                              value={item.nilai}
                              onChange={(e) => handleValueChange('belanja', index, e.target.value)}
                              onBlur={() => handleBlurSave('belanja', index)}
                              placeholder={item.opsi_input === 'sisa' ? 'N/A' : '0'}
                              className="w-28 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900 bg-gray-50/50">
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
                          <td className="py-2.5 px-4 font-mono text-gray-500 select-all whitespace-nowrap">
                            {item.kode_rekening}
                          </td>
                          <td className="py-2.5 px-4">
                            <p className="font-semibold text-gray-800 truncate max-w-xs" title={item.nama_rekening}>{item.nama_rekening}</p>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.anggaran)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-gray-700">
                            {formatRupiah(item.realisasi)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <select
                              id={`opsi-pend-${index}`}
                              disabled={isLocked}
                              value={item.opsi_input}
                              onChange={(e) => handleOptionChange('pend_pemb', index, e.target.value as any)}
                              className="bg-white border border-gray-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <option value="sisa">Sisa Anggaran</option>
                              <option value="tambah_kurang">Tambah/Kurang</option>
                              <option value="fix">Fix Angka</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <input
                              type="number"
                              id={`nilai-pend-${index}`}
                              disabled={isLocked || item.opsi_input === 'sisa'}
                              value={item.nilai}
                              onChange={(e) => handleValueChange('pend_pemb', index, e.target.value)}
                              onBlur={() => handleBlurSave('pend_pemb', index)}
                              placeholder={item.opsi_input === 'sisa' ? 'N/A' : '0'}
                              className="w-32 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900 bg-gray-50/50">
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

          {/* Formulas Explanations Guidelines */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-6">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5 mb-3">
              <HelpCircle className="w-4 h-4 text-gray-400" />
              <span>Aturan Formula Perhitungan Prognosis Semester II</span>
            </h4>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                    <th className="pb-2 w-48">Metode Opsi Input</th>
                    <th className="pb-2">Formula Perhitungan Matematika</th>
                    <th className="pb-2">Deskripsi Kasus Penggunaan</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600 leading-relaxed">
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-semibold text-gray-850">Sisa Anggaran</td>
                    <td className="py-2 font-mono text-gray-950">Anggaran - Realisasi</td>
                    <td className="py-2">Digunakan jika realisasi Semester II diprediksi akan menyerap seluruh sisa anggaran yang tersisa secara penuh.</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-semibold text-gray-850">Tambah/Kurang</td>
                    <td className="py-2 font-mono text-gray-950">Anggaran - Realisasi + Delta</td>
                    <td className="py-2">Digunakan untuk penyesuaian parsial (tambah positif atau kurangi negatif) dari sisa sisa anggaran Semester I.</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold text-gray-850">Fix Angka</td>
                    <td className="py-2 font-mono text-gray-950">Target Nilai Mutlak</td>
                    <td className="py-2">Menetapkan nilai target realisasi Semester II secara eksplisit mutlak bebas tanpa memperhitungkan selisih sisa anggaran.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
