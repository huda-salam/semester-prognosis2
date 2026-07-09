import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle, AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../utils/api';

interface UploadTabProps {
  role: 'skpd' | 'pemda';
  activeSkpd: string;
  skpdList: { kode: string; uraian: string }[];
  onUploadSuccess: () => void;
}

export const UploadTab: React.FC<UploadTabProps> = ({
  role,
  activeSkpd,
  skpdList,
  onUploadSuccess
}) => {
  const [tahun, setTahun] = useState<number>(2026);
  const [bulan, setBulan] = useState<number>(6); // Default to June (Semester I)
  const [formatType, setFormatType] = useState<string>('format1');
  
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    insertedCount?: number;
    errors?: string[];
  }>({ type: 'idle', message: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const months = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni (Sms I)' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember (Sms II)' },
  ];

  const activeSkpdName = skpdList.find(s => s.kode === activeSkpd)?.uraian || 'SKPD';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setStatus({ type: 'idle', message: '' });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus({ type: 'idle', message: '' });
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatus({ type: 'idle', message: 'Membaca dan memproses berkas...' });

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);

          // Prepare payload
          let url = '/api/upload-lra';
          let payload: any = {
            fileBase64: base64,
            filename: file.name,
            tahun,
            user: role === 'pemda' ? 'PEMDA Admin' : activeSkpdName
          };

          if (formatType === 'master') {
            url = '/api/upload-master';
          } else {
            payload = {
              ...payload,
              sumber_format: formatType,
              bulan,
              role,
              kode_skpd_uploader: activeSkpd
            };
          }

          const response = await fetch(getApiUrl(url), {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (response.ok && result.success) {
            setStatus({
              type: 'success',
              message: formatType === 'master' 
                ? `Berhasil memperbarui data master referensi! Memuat ${result.count} data baru.`
                : `Berhasil mengunggah LRA!`,
              insertedCount: result.insertedCount || result.count
            });
            setFile(null);
            onUploadSuccess();
          } else {
            setStatus({
              type: 'error',
              message: result.error || 'Terjadi kesalahan validasi data.',
              errors: result.errors || []
            });
          }
        } catch (err: any) {
          setStatus({ type: 'error', message: `Gagal membaca file: ${err.message}` });
        } finally {
          setUploading(false);
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setStatus({ type: 'error', message: `Terjadi kegagalan upload: ${err.message}` });
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Configuration Header Grid */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Year Selector */}
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2">Tahun Anggaran</label>
          <select
            id="tahun-select"
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-950"
          >
            <option value={2026}>Tahun Anggaran 2026</option>
            <option value={2025}>Tahun Anggaran 2025</option>
          </select>
        </div>

        {/* Month Selector */}
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2">Periode Pelaporan / Bulan</label>
          <select
            id="bulan-select"
            value={bulan}
            onChange={(e) => setBulan(Number(e.target.value))}
            disabled={formatType === 'format2' || formatType === 'master'}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-950 disabled:bg-gray-100 disabled:text-gray-400"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {formatType === 'format2' && (
            <p className="text-[10px] text-gray-400 mt-1">Bulan dideteksi otomatis dari isi berkas (sel B5).</p>
          )}
        </div>

        {/* Format Selector */}
        <div className="md:col-span-2">
          <label className="block text-[11px] font-bold text-gray-400 uppercase mb-2">Format Berkas Excel</label>
          <select
            id="format-select"
            value={formatType}
            onChange={(e) => setFormatType(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-950"
          >
            <option value="format1">Format 1: Belanja {role === 'skpd' ? `(${activeSkpdName})` : '(Konsolidasi Se-Pemda atau SKPD)'}</option>
            <option value="format2">Format 2: Pendapatan & Pembiayaan per SKPD (Periode B5)</option>
            {role === 'pemda' && (
              <option value="format3">Format 3: Pendapatan & Pembiayaan Se-Pemda (Wide Table)</option>
            )}
            {role === 'pemda' && (
              <option value="master">⚙️ Excel Data Master Referensi (SKPD & Rekening)</option>
            )}
          </select>
        </div>

      </div>

      {/* Main Upload Area */}
      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
        
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={`w-full max-w-2xl border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragging
              ? 'border-gray-900 bg-gray-50'
              : file
              ? 'border-gray-300 bg-gray-50/50'
              : 'border-gray-200 hover:border-gray-400 bg-white'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx, .xls"
            className="hidden"
          />

          <UploadCloud className={`w-12 h-12 mb-4 transition-transform ${dragging ? 'scale-110 text-gray-900' : 'text-gray-400'}`} />

          {file ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900 flex items-center justify-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>{file.name}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                Pilih atau seret berkas LRA Excel ke sini
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Format yang didukung: .xlsx, .xls
              </p>
            </div>
          )}
        </div>

        {/* Upload Action Button */}
        {file && (
          <button
            id="execute-upload-btn"
            disabled={uploading}
            onClick={handleUpload}
            className="mt-6 flex items-center justify-center space-x-2 bg-gray-950 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold text-xs px-6 py-3 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Sedang Mengunggah & Memproses...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Unggah dan Simpan ke Database</span>
              </>
            )}
          </button>
        )}

      </div>

      {/* Upload Feedback Status */}
      {status.type !== 'idle' && (
        <div className={`p-5 rounded-xl border ${
          status.type === 'success' 
            ? 'bg-emerald-50/70 border-emerald-100 text-emerald-800' 
            : 'bg-rose-50/70 border-rose-100 text-rose-800'
        }`}>
          <div className="flex items-start space-x-3">
            {status.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mt-0.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 mt-0.5 text-rose-600" />
            )}
            <div className="flex-1">
              <h4 className="text-sm font-semibold tracking-tight">
                {status.type === 'success' ? 'Proses Unggah Berhasil' : 'Unggah Gagal / Ditolak'}
              </h4>
              <p className="text-xs mt-1 leading-relaxed opacity-90">{status.message}</p>

              {status.type === 'success' && status.insertedCount !== undefined && (
                <p className="text-xs font-mono font-semibold mt-2 bg-white/50 px-2 py-1 rounded inline-block text-emerald-950">
                  + {status.insertedCount} Baris Leaf Transaksi Berhasil Disimpan
                </p>
              )}

              {/* Show granular mapping validation errors */}
              {status.errors && status.errors.length > 0 && (
                <div className="mt-3 bg-white/70 rounded-lg p-3 border border-rose-100 max-h-48 overflow-y-auto no-scrollbar">
                  <p className="text-[11px] font-bold text-rose-950 uppercase mb-1">Daftar Kesalahan Validasi Master:</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs font-mono text-rose-900">
                    {status.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Informative Guidelines (Swiss minimal card) */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-6">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5 mb-3">
          <HelpCircle className="w-4 h-4 text-gray-400" />
          <span>Panduan Pengunggahan Berkas LRA</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-gray-600">
          <div>
            <p className="font-semibold text-gray-900">Format 1: Laporan Belanja</p>
            <p className="mt-1">
              Memuat data Belanja per SKPD atau Gabungan Pemda. Baris transaksi diidentifikasi dari kolom D dengan panjang kode tepat 19 karakter. Hanya baris level leaf detail yang disimpan.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Format 2 & 3: Pendapatan & Pembiayaan</p>
            <p className="mt-1">
              Format 2 diunggah per SKPD (membaca nama SKPD di sel B2). Format 3 diunggah sekaligus se-Kabupaten (konsolidasi antar kolom). Seluruh data belanja pada format ini dilewati (diabaikan).
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
