import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Terminal, 
  UploadCloud, 
  FileSpreadsheet, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  Copy, 
  Download, 
  Info,
  BookOpen,
  LayoutGrid,
  Lock,
  Unlock,
  Search,
  Check,
  ShieldCheck,
  ShieldAlert,
  X
} from 'lucide-react';

interface AdminTabProps {
  onUploadSuccess: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ onUploadSuccess }) => {
  // Active Admin Sub Tab state
  const [activeSubTab, setActiveSubTab] = useState<'validation' | 'upload' | 'sql'>('validation');

  // Database Summary state
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // SQL Client state
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM master_referensi LIMIT 10;');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string>('');
  const [runningQuery, setRunningQuery] = useState<boolean>(false);
  const [enablePaging, setEnablePaging] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // SKPD Validation status state
  const [skpdStatusList, setSkpdStatusList] = useState<any[]>([]);
  const [loadingValidation, setLoadingValidation] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'validated' | 'draft'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Master upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    count?: number;
  }>({ type: 'idle', message: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Summary statistics
  const fetchDbSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/admin/master-summary');
      const result = await res.json();
      if (res.ok && result.success) {
        setSummary(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch DB summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Fetch validation status list
  const fetchValidationStatus = async () => {
    setLoadingValidation(true);
    setValidationError('');
    try {
      const res = await fetch('/api/admin/skpd-validation-status');
      const result = await res.json();
      if (res.ok && result.success) {
        setSkpdStatusList(result.data || []);
      } else {
        setValidationError(result.error || 'Gagal memuat status validasi SKPD.');
      }
    } catch (err: any) {
      setValidationError(err.message || 'Gagal memuat data.');
    } finally {
      setLoadingValidation(false);
    }
  };

  useEffect(() => {
    fetchDbSummary();
    fetchValidationStatus();
  }, []);

  const handleCancelValidation = async (kodeSkpd: string) => {
    if (actionInProgress) return;
    setActionInProgress(kodeSkpd);
    try {
      const res = await fetch('/api/prognosis/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: kodeSkpd,
          user: 'PEMDA Admin'
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchValidationStatus();
        await fetchDbSummary();
        onUploadSuccess();
      } else {
        alert(result.error || 'Gagal membatalkan validasi.');
      }
    } catch (err: any) {
      alert(err.message || 'Koneksi terputus.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApplyValidation = async (kodeSkpd: string) => {
    if (actionInProgress) return;
    setActionInProgress(kodeSkpd);
    try {
      const res = await fetch('/api/prognosis/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_skpd: kodeSkpd,
          user: 'PEMDA Admin'
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchValidationStatus();
        await fetchDbSummary();
        onUploadSuccess();
      } else {
        alert(result.error || 'Gagal memvalidasi.');
      }
    } catch (err: any) {
      alert(err.message || 'Koneksi terputus.');
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredSkpdStatus = React.useMemo(() => {
    let list = skpdStatusList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        item.kode.toLowerCase().includes(q) || 
        item.uraian.toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'validated') {
      list = list.filter(item => item.locked === 1);
    } else if (filterStatus === 'draft') {
      list = list.filter(item => item.locked === 0);
    }
    return list;
  }, [skpdStatusList, searchQuery, filterStatus]);

  // Execute custom SQL query
  const handleExecuteSql = async (customSql?: string) => {
    const sqlToRun = customSql || sqlQuery;
    if (!sqlToRun.trim()) return;

    setRunningQuery(true);
    setQueryError('');
    setQueryResult(null);
    setCurrentPage(1);

    try {
      const res = await fetch('/api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlToRun })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setQueryResult(result.data);
        // If query was modifying data, refresh the stats summary!
        if (!/^\s*select/i.test(sqlToRun)) {
          fetchDbSummary();
          onUploadSuccess();
        }
      } else {
        setQueryError(result.error || 'Terjadi kesalahan eksekusi SQL.');
      }
    } catch (err: any) {
      setQueryError(err.message || 'Koneksi terputus.');
    } finally {
      setRunningQuery(false);
    }
  };

  // Upload master references excel handler
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
      setUploadStatus({ type: 'idle', message: '' });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadStatus({ type: 'idle', message: '' });
    }
  };

  const handleUploadMaster = async () => {
    if (!file) return;

    setUploading(true);
    setUploadStatus({ type: 'idle', message: 'Membaca berkas master referensi...' });

    try {
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

          const response = await fetch('/api/upload-master', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64, user: 'PEMDA Admin' })
          });

          const result = await response.json();

          if (response.ok && result.success) {
            setUploadStatus({
              type: 'success',
              message: `Sukses memperbarui referensi! Berhasil mengunggah ${result.count || 0} entitas ke dalam sistem.`,
              count: result.count
            });
            setFile(null);
            fetchDbSummary();
            onUploadSuccess();
          } else {
            setUploadStatus({
              type: 'error',
              message: result.error || 'Gagal memvalidasi berkas master referensi.'
            });
          }
        } catch (err: any) {
          setUploadStatus({ type: 'error', message: `Gagal membaca file: ${err.message}` });
        } finally {
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setUploadStatus({ type: 'error', message: `Gagal memproses file: ${err.message}` });
      setUploading(false);
    }
  };

  // Helper to copy sql results as CSV
  const handleCopyAsCsv = () => {
    if (!queryResult || !Array.isArray(queryResult) || queryResult.length === 0) return;
    const headers = Object.keys(queryResult[0]);
    const csvContent = [
      headers.join(','),
      ...queryResult.map(row => headers.map(h => {
        const val = row[h];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','))
    ].join('\n');

    navigator.clipboard.writeText(csvContent);
    alert('Data hasil query berhasil disalin ke clipboard sebagai format CSV!');
  };

  // Pre-configured Query Buttons helper
  const presets = [
    { label: 'Master Referensi', query: 'SELECT * FROM master_referensi LIMIT 20;' },
    { label: 'Daftar SKPD', query: "SELECT kode, uraian FROM master_referensi WHERE jenis = 'skpd' ORDER BY kode;" },
    { label: 'Data Realisasi LRA', query: 'SELECT * FROM data_lra LIMIT 20;' },
    { label: 'Draf Prognosis Belanja', query: 'SELECT * FROM data_prognosis_belanja LIMIT 20;' },
    { label: 'Draf Prognosis Pendapatan', query: 'SELECT * FROM data_prognosis_pendapatan_pembiayaan LIMIT 20;' },
    { label: 'Group Referensi', query: 'SELECT jenis, COUNT(*) as jumlah FROM master_referensi GROUP BY jenis;' }
  ];

  // Helper to safely render SQL query output
  const renderResultTable = () => {
    if (!queryResult) return null;

    // SQLite response on raw SQL can be an array of rows or an empty structure
    const rows = Array.isArray(queryResult) ? queryResult : [];
    if (rows.length === 0) {
      return (
        <div className="p-5 bg-gray-50 border border-gray-100 rounded-lg text-center text-xs text-gray-500">
          Query berhasil dijalankan tanpa mengembalikan baris data (Command Sukses).
        </div>
      );
    }

    const columns = Object.keys(rows[0]);

    // Handle paging
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const displayedRows = enablePaging
      ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : rows;

    const startIdx = enablePaging ? (currentPage - 1) * pageSize + 1 : 1;
    const endIdx = enablePaging ? Math.min(currentPage * pageSize, totalRows) : totalRows;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
          {enablePaging ? (
            <span>Menampilkan {startIdx}-{endIdx} dari {totalRows} baris hasil query</span>
          ) : (
            <span>Menampilkan {totalRows} baris hasil query</span>
          )}
          <button
            onClick={handleCopyAsCsv}
            className="flex items-center space-x-1.5 text-[11px] text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded px-2.5 py-1 bg-white cursor-pointer"
          >
            <Copy className="w-3 h-3" />
            <span>Salin Format CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 no-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 font-mono text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-200 sticky top-0">
                {columns.map(col => (
                  <th key={col} className="py-2.5 px-4 font-semibold border-r border-gray-200 bg-gray-100">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 border-b border-gray-100 font-mono text-gray-700">
                  {columns.map(col => {
                    const val = row[col];
                    return (
                      <td key={col} className="py-2 px-4 border-r border-gray-150 max-w-xs truncate select-all" title={String(val)}>
                        {val === null || val === undefined ? (
                          <span className="text-gray-300 italic">NULL</span>
                        ) : typeof val === 'number' ? (
                          <span className="text-blue-600">{val}</span>
                        ) : typeof val === 'boolean' ? (
                          <span className="text-emerald-600">{val ? 'TRUE' : 'FALSE'}</span>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paging controller */}
        {enablePaging && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs bg-white">
            <div className="text-gray-500">
              Halaman {currentPage} dari {totalPages}
            </div>
            <div className="flex items-center space-x-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Pertama
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Sebelumnya
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Berikutnya
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                Terakhir
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      
      {/* 1. Database Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total SKPD Master</p>
            <p className="text-xl font-extrabold text-gray-900 mt-0.5">
              {loadingSummary ? '...' : (summary?.references?.find((r: any) => r.jenis === 'skpd')?.count || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-sky-50 rounded-lg text-sky-600">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rekening Master</p>
            <p className="text-xl font-extrabold text-gray-900 mt-0.5">
              {loadingSummary ? '...' : (summary?.references?.find((r: any) => r.jenis === 'rekening')?.count || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Leaf Transaksi LRA</p>
            <p className="text-xl font-extrabold text-gray-900 mt-0.5">
              {loadingSummary ? '...' : (summary?.lraCount || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data Prognosis</p>
            <p className="text-xl font-extrabold text-gray-900 mt-0.5">
              {loadingSummary ? '...' : ((summary?.prognosisBelanjaCount || 0) + (summary?.prognosisPendCount || 0))}
            </p>
          </div>
        </div>

      </div>

      {/* 2. Sub-tab switcher */}
      <div className="flex border-b border-gray-200 gap-1.5 pb-0 bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setActiveSubTab('validation')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'validation'
              ? 'bg-gray-950 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          Daftar Validasi SKPD
        </button>
        <button
          onClick={() => setActiveSubTab('upload')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'upload'
              ? 'bg-gray-950 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          Upload Master Referensi
        </button>
        <button
          onClick={() => setActiveSubTab('sql')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'sql'
              ? 'bg-gray-950 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          SQL Client Console
        </button>
      </div>

      {/* 3. Sub-tab contents */}
      {activeSubTab === 'validation' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wide flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Daftar Validasi Prognosis SKPD</span>
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Kelola status pengiriman, penguncian, dan validasi draf laporan prognosis seluruh SKPD Kabupaten Kediri.
              </p>
            </div>
            
            <button
              onClick={() => fetchValidationStatus()}
              disabled={loadingValidation}
              className="flex items-center space-x-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingValidation ? 'animate-spin' : ''}`} />
              <span>Segarkan Status</span>
            </button>
          </div>

          {/* Filters and Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-150">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari kode atau nama SKPD..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Segmented Buttons */}
            <div className="flex items-center space-x-1.5 text-xs">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filterStatus === 'all'
                    ? 'bg-gray-950 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-900'
                }`}
              >
                Semua ({skpdStatusList.length})
              </button>
              <button
                onClick={() => setFilterStatus('validated')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filterStatus === 'validated'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:text-emerald-600'
                }`}
              >
                Validasi / Terkunci ({skpdStatusList.filter(item => item.locked === 1).length})
              </button>
              <button
                onClick={() => setFilterStatus('draft')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filterStatus === 'draft'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:text-amber-600'
                }`}
              >
                Draft / Belum Validasi ({skpdStatusList.filter(item => item.locked === 0).length})
              </button>
            </div>
          </div>

          {/* Validation List Table */}
          {loadingValidation && skpdStatusList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              <p className="text-xs font-semibold">Memuat status validasi SKPD...</p>
            </div>
          ) : validationError ? (
            <div className="py-8 text-center text-xs font-semibold text-rose-600 bg-rose-50/50 border border-rose-100 rounded-xl">
              {validationError}
            </div>
          ) : filteredSkpdStatus.length === 0 ? (
            <div className="py-12 text-center text-xs font-semibold text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              Tidak ada SKPD yang cocok dengan filter atau kueri pencarian Anda.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-150 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-150 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Kode SKPD</th>
                    <th className="py-3 px-4 font-bold">Nama SKPD / Instansi</th>
                    <th className="py-3 px-4 font-bold text-center">Jumlah Rekod</th>
                    <th className="py-3 px-4 font-bold text-center">Status Validasi</th>
                    <th className="py-3 px-4 font-bold text-center">Aksi / Kontrol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSkpdStatus.map((skpd) => {
                    const isLocked = skpd.locked === 1;
                    const isProcessing = actionInProgress === skpd.kode;
                    
                    return (
                      <tr key={skpd.kode} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-gray-500 text-[11px] whitespace-nowrap">
                          {skpd.kode}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-gray-800">
                          {skpd.uraian}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            skpd.total_records > 0 
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {skpd.total_records} Rekod
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isLocked ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
                              <Lock className="w-3 h-3" />
                              <span>Tervalidasi / Terkunci</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide">
                              <Unlock className="w-3 h-3" />
                              <span>Draft / Belum Validasi</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center">
                            {isLocked ? (
                              <button
                                onClick={() => handleCancelValidation(skpd.kode)}
                                disabled={!!actionInProgress}
                                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:text-white hover:bg-rose-600 disabled:opacity-40 transition-all font-bold text-[11px] cursor-pointer shadow-sm"
                              >
                                {isProcessing ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                                <span>Batal Validasi</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApplyValidation(skpd.kode)}
                                disabled={!!actionInProgress || skpd.total_records === 0}
                                title={skpd.total_records === 0 ? "Belum ada data prognosis untuk divalidasi" : "Validasi data prognosis SKPD"}
                                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-200 disabled:hover:text-gray-500 transition-all font-bold text-[11px] cursor-pointer"
                              >
                                {isProcessing ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Lock className="w-3 h-3" />
                                )}
                                <span>Kunci & Validasi</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'upload' && (
        <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wide flex items-center space-x-1.5">
              <UploadCloud className="w-4 h-4 text-gray-950" />
              <span>Upload Master Referensi</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Perbarui atau unggah daftar SKPD, rekening, dan sub-kegiatan menggunakan berkas format referensi resmi.
            </p>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragging 
                ? 'border-gray-900 bg-gray-50' 
                : file 
                ? 'border-emerald-300 bg-emerald-50/10' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <FileSpreadsheet className={`w-10 h-10 mb-3 ${file ? 'text-emerald-600' : 'text-gray-400'}`} />
            {file ? (
              <div>
                <p className="text-xs font-semibold text-gray-950 truncate max-w-[280px]">{file.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-800">Pilih atau Seret Excel ke sini</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Mendukung format .xlsx & .xls</p>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={handleUploadMaster}
              disabled={uploading}
              className="w-full flex items-center justify-center space-x-1.5 bg-gray-950 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold text-xs py-2.5 rounded-lg shadow-sm cursor-pointer transition-all"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses Berkas...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Proses Upload Referensi</span>
                </>
              )}
            </button>
          )}

          {/* Upload Status Alert */}
          {uploadStatus.type !== 'idle' && (
            <div className={`p-4 rounded-lg text-xs border ${
              uploadStatus.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}>
              <p className="font-semibold">{uploadStatus.type === 'success' ? 'Sukses!' : 'Gagal'}</p>
              <p className="mt-1 opacity-95">{uploadStatus.message}</p>
            </div>
          )}

          {/* Quick template guide card */}
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 space-y-2 text-xs">
            <h4 className="font-bold text-gray-800 flex items-center space-x-1">
              <BookOpen className="w-3.5 h-3.5 text-gray-500" />
              <span>Format Kolom Excel Referensi</span>
            </h4>
            <p className="text-gray-500 leading-relaxed">
              Pastikan berkas Excel Anda memiliki kolom berikut pada Sheet pertama:
            </p>
            <ul className="list-disc pl-4 font-mono text-[10px] text-gray-600 space-y-1 bg-white p-2 rounded border border-gray-150">
              <li><strong>kode</strong>: Kode entitas (SKPD/Rekening)</li>
              <li><strong>uraian</strong>: Nama/Keterangan entitas</li>
              <li><strong>jenis</strong>: 'skpd' atau 'rekening'</li>
              <li><strong>level</strong>: Jenjang angka (opsional)</li>
              <li><strong>parent</strong>: Kode induk (opsional)</li>
            </ul>
          </div>
        </div>
      )}

      {activeSubTab === 'sql' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wide flex items-center space-x-1.5">
                <Terminal className="w-4 h-4 text-gray-900" />
                <span>Konsol SQL Client (SQLite3)</span>
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Jalankan perintah SQL kustom langsung ke dalam basis data SQLite lokal untuk kebutuhan audit dan debugging cepat.
              </p>
            </div>
            
            <button
              onClick={() => fetchDbSummary()}
              className="self-start sm:self-center flex items-center space-x-1 text-xs font-semibold text-gray-500 hover:text-gray-900 bg-gray-50 px-3 py-1.5 border border-gray-200 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Stats</span>
            </button>
          </div>

          {/* SQL Presets */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preset Query Cepat:</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSqlQuery(p.query);
                    handleExecuteSql(p.query);
                  }}
                  className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2.5 py-1 text-[10px] font-mono text-gray-600 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* SQL Editor Area */}
          <div className="space-y-2">
            <div className="relative">
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full bg-gray-900 font-mono text-xs text-emerald-400 p-4 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-950 placeholder-gray-600 leading-relaxed shadow-inner"
                placeholder="Tulis query SQL di sini (contoh: SELECT * FROM data_lra;)"
              />
              <button
                onClick={() => handleExecuteSql()}
                disabled={runningQuery}
                className="absolute right-3 bottom-4 flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 text-white font-semibold text-[11px] px-3.5 py-1.5 rounded-lg shadow cursor-pointer"
              >
                {runningQuery ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Jalankan</span>
              </button>
            </div>
          </div>

          {/* Paging Toggle option */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 border border-gray-150 rounded-xl px-4 py-3 text-xs">
            <label className="flex items-center space-x-2 font-bold text-gray-700 cursor-pointer select-none">
              <input
                id="toggle-paging-checkbox"
                type="checkbox"
                checked={enablePaging}
                onChange={(e) => {
                  setEnablePaging(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <span>Aktifkan Pagination (Paging)</span>
            </label>
            {enablePaging && (
              <div className="flex items-center space-x-2">
                <span className="text-gray-500 font-medium">Baris Per Halaman:</span>
                <select
                  id="page-size-selector"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={5}>5 baris</option>
                  <option value={10}>10 baris</option>
                  <option value={20}>20 baris</option>
                  <option value={50}>50 baris</option>
                  <option value={100}>100 baris</option>
                </select>
              </div>
            )}
          </div>

          {/* Query Output Display Area */}
          <div className="space-y-3">
            {queryError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-mono space-y-1">
                <p className="font-bold uppercase tracking-wider flex items-center space-x-1">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Kesalahan Basis Data (SQLite Error):</span>
                </p>
                <p className="opacity-95 leading-relaxed pl-5">{queryError}</p>
              </div>
            )}

            {queryResult && renderResultTable()}
          </div>

        </div>
      )}

    </div>
  );
};
