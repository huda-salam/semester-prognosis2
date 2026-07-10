import React, { useState, useEffect } from 'react';
import { Search, Folder, ChevronRight, ChevronDown, Table, FileText, Download, ListFilter, AlertCircle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LraReportItem } from '../types';
import { getApiUrl } from '../utils/api';

interface ReportTabProps {
  role: 'skpd' | 'pemda';
  activeSkpd: string;
  skpdList: { kode: string; uraian: string }[];
}

// Custom format function for Indonesian Rupiah (without Rp prefix)
const formatRupiah = (num: number): string => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

export const ReportTab: React.FC<ReportTabProps> = ({ role, activeSkpd, skpdList }) => {
  const [reportType, setReportType] = useState<'skpd' | 'pemda'>('skpd');
  const [tahun, setTahun] = useState<number>(2026);
  const [bulan, setBulan] = useState<number>(6); // June default
  const [loading, setLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<LraReportItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Set of expanded item codes in tree view
  const [expandedKeys, setExpandedKeys] = useState<{ [kode: string]: boolean }>({
    '4': true, '5': true, '6': true // Default expand root types
  });

  const months = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni (Semester I)' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember (Semester II)' },
  ];

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = '';
      if (reportType === 'skpd') {
        url = `/api/report/skpd?tahun=${tahun}&bulan=${bulan}&kode_skpd=${activeSkpd}`;
      } else {
        url = `/api/report/pemda?tahun=${tahun}&bulan=${bulan}`;
      }

      const res = await fetch(getApiUrl(url), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setReportData(result.data);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Failed to fetch LRA report:', err);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, tahun, bulan, activeSkpd]);

  const toggleExpand = (kode: string) => {
    setExpandedKeys(prev => ({
      ...prev,
      [kode]: !prev[kode]
    }));
  };

  const expandAll = (data: LraReportItem[], value: boolean) => {
    const keys: { [kode: string]: boolean } = {};
    const recurse = (item: LraReportItem) => {
      keys[item.kode] = value;
      if (item.children) {
        item.children.forEach(recurse);
      }
    };
    data.forEach(recurse);
    setExpandedKeys(keys);
  };

  // Filter list of report items based on search query
  const filterTree = (data: LraReportItem[], query: string): LraReportItem[] => {
    if (!query) return data;
    const lowerQuery = query.toLowerCase();

    return data
      .map(item => {
        // Match query directly
        const selfMatches = item.kode.toLowerCase().includes(lowerQuery) || item.uraian.toLowerCase().includes(lowerQuery);
        
        // Match children recursively
        let filteredChildren: LraReportItem[] = [];
        if (item.children) {
          filteredChildren = filterTree(item.children, query);
        }

        if (selfMatches || filteredChildren.length > 0) {
          // If query matched, expand this item
          expandedKeys[item.kode] = true;
          return {
            ...item,
            children: filteredChildren.length > 0 ? filteredChildren : item.children
          };
        }
        return null;
      })
      .filter(item => item !== null) as LraReportItem[];
  };

  const activeSkpdName = skpdList.find(s => s.kode === activeSkpd)?.uraian || 'SKPD';

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const headers = [
      'Kode Rekening',
      'Uraian Nama Rekening / Program',
      'Anggaran',
      'Realisasi',
      'Sisa Anggaran',
      'Persentase (%)',
      'Prognosis 6 (Enam) Bulan Berikutnya'
    ];
    
    const data: any[][] = [
      ['PEMERINTAH KABUPATEN KEDIRI'],
      [reportType === 'skpd' ? 'LAPORAN REALISASI ANGGARAN (LRA) SKPD' : 'LAPORAN REALISASI KONSOLIDASI APBD'],
      [`Tahun Anggaran: ${tahun}`],
      [`SKPD: ${reportType === 'skpd' ? activeSkpdName : 'KABUPATEN KEDIRI (KONSOLIDASI)'}`],
      [`Periode: s.d. ${months.find(m => m.value === bulan)?.label.replace(' (Semester I)', '').replace(' (Semester II)', '')} ${tahun}`],
      [], // Empty row
      headers
    ];

    const targetList = filterTree(reportData, searchQuery);

    if (reportType === 'skpd') {
      const flattenItem = (item: LraReportItem, depth: number) => {
        const indentation = '  '.repeat(depth);
        const sisa = item.sisa_anggaran;
        const pct = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
        const prog = item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi);

        data.push([
          item.kode,
          indentation + item.uraian,
          item.anggaran,
          item.realisasi,
          sisa,
          Number(pct.toFixed(1)),
          prog
        ]);

        if (item.children) {
          item.children.forEach(child => flattenItem(child, depth + 1));
        }
      };
      targetList.forEach(item => flattenItem(item, 0));
    } else {
      // pemda
      targetList.forEach(group => {
        const groupPct = group.anggaran > 0 ? (group.realisasi / group.anggaran) * 100 : 0;
        const groupProg = group.prognosis !== undefined ? group.prognosis : (group.anggaran - group.realisasi);
        data.push([
          group.kode,
          group.uraian.toUpperCase(),
          group.anggaran,
          group.realisasi,
          group.sisa_anggaran,
          Number(groupPct.toFixed(1)),
          groupProg
        ]);

        group.children?.forEach(item => {
          const itemPct = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
          const itemProg = item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi);
          data.push([
            item.kode,
            '  ' + item.uraian,
            item.anggaran,
            item.realisasi,
            item.sisa_anggaran,
            Number(itemPct.toFixed(1)),
            itemProg
          ]);
        });
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    const wscols = [
      { wch: 18 }, // Kode
      { wch: 45 }, // Uraian
      { wch: 16 }, // Anggaran
      { wch: 16 }, // Realisasi
      { wch: 16 }, // Sisa Anggaran
      { wch: 12 }, // Persentase
      { wch: 25 }, // Prognosis
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'LRA Report');
    
    const labelBulan = months.find(m => m.value === bulan)?.label
      .replace(' (Semester I)', '')
      .replace(' (Semester II)', '')
      .replace(/[^a-zA-Z0-9]/g, '_') || '';
    
    const filename = `LRA_${reportType === 'skpd' ? activeSkpdName.replace(/[^a-zA-Z0-9]/g, '_') : 'KONSOLIDASI'}_${labelBulan}_${tahun}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Renders a single row of the tree table
  const renderTreeRow = (item: LraReportItem, depth: number = 0) => {
    const isExpanded = !!expandedKeys[item.kode];
    const hasChildren = item.children && item.children.length > 0;
    const sisaRatio = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;

    // Different backgrounds per depth level to establish clean visual rhythm
    const depthBgClass = 
      depth === 0 
        ? 'bg-gray-100/80 font-bold border-b border-gray-200' 
        : depth === 1 
        ? 'bg-gray-50/50 font-semibold border-b border-gray-150' 
        : 'hover:bg-gray-50/40 border-b border-gray-100';

    return (
      <React.Fragment key={`${item.kode}-${item.jenis}`}>
        <tr className={`text-xs ${depthBgClass} transition-colors`}>
          <td className="py-2.5 px-4 font-mono font-medium text-gray-500 whitespace-nowrap">
            {item.kode}
          </td>
          <td className="py-2.5 px-4 max-w-md">
            <div className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.kode)}
                  className="mr-1.5 p-1 rounded hover:bg-gray-250 cursor-pointer text-gray-500 print:hidden"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-5 print:hidden" />
              )}
              <span className={depth === 0 ? 'text-gray-950 uppercase text-[11px] tracking-wide' : 'text-gray-800'}>
                {item.uraian}
              </span>
              <span className="ml-2 text-[9px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded uppercase print:hidden">
                {item.jenis === 'kelompok_besar' ? 'ROOT' : item.jenis}
              </span>
            </div>
          </td>
          <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
            {formatRupiah(item.anggaran)}
          </td>
          <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
            {formatRupiah(item.realisasi)}
          </td>
          <td className={`py-2.5 px-4 text-right font-mono font-medium ${item.sisa_anggaran < 0 ? 'text-rose-600' : 'text-gray-950'}`}>
            {formatRupiah(item.sisa_anggaran)}
          </td>
          <td className="py-2.5 px-4 text-right">
            <div className="flex items-center justify-end space-x-2">
              {/* Micro-progress indicator */}
              <div className="w-12 bg-gray-100 rounded-full h-1.5 hidden sm:block overflow-hidden border border-gray-200/50 print:hidden">
                <div
                  className={`h-full rounded-full ${sisaRatio > 100 ? 'bg-rose-500' : 'bg-gray-900'}`}
                  style={{ width: `${Math.min(100, sisaRatio)}%` }}
                />
              </div>
              <span className="font-mono font-semibold text-[11px] text-gray-800 w-12 text-right">
                {sisaRatio.toFixed(1)}%
              </span>
            </div>
          </td>
          <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
            {formatRupiah(item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi))}
          </td>
        </tr>
        
        {/* Render children if expanded */}
        {hasChildren && isExpanded && item.children!.map(child => renderTreeRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  const filteredReportData = filterTree(reportData, searchQuery);

  return (
    <div className="space-y-6">
      
      {/* Top Filter and Report Scope Toggles */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        
        <div className="flex items-center space-x-3">
          <button
            id="report-skpd-tab"
            onClick={() => setReportType('skpd')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              reportType === 'skpd'
                ? 'bg-gray-950 text-white border-gray-950 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:text-gray-950'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>LRA SKPD</span>
          </button>
          
          {role === 'pemda' && (
            <button
              id="report-pemda-tab"
              onClick={() => setReportType('pemda')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                reportType === 'pemda'
                  ? 'bg-gray-950 text-white border-gray-950 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:text-gray-950'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Rekapitulasi Pemda (Level 3)</span>
            </button>
          )}
        </div>

        {/* Month Picker */}
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase">Periode:</span>
          <select
            id="report-month-select"
            value={bulan}
            onChange={(e) => setBulan(Number(e.target.value))}
            className="bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-950"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Main Report Window */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:border-none print:shadow-none print:overflow-visible">
        
        {/* Formal Government Print Header */}
        <div className="hidden print:block text-center border-b-2 border-double border-gray-900 pb-4 mb-6">
          <h1 className="text-sm font-bold tracking-wide uppercase text-gray-900">Pemerintah Kabupaten Kediri</h1>
          <h2 className="text-base font-extrabold tracking-wider uppercase text-gray-900 mt-1">
            {reportType === 'skpd' ? 'Laporan Realisasi Anggaran (LRA) SKPD' : 'Laporan Realisasi Anggaran (LRA) Kabupaten Kediri (Konsolidasi)'}
          </h2>
          <p className="text-xs text-gray-700 font-semibold mt-1">
            Tahun Anggaran {tahun}
          </p>
          <div className="mt-4 text-left grid grid-cols-2 text-xs text-gray-800 font-medium leading-relaxed">
            <div>
              <span className="inline-block w-20">SKPD</span>: {reportType === 'skpd' ? activeSkpdName : 'KABUPATEN KEDIRI (KONSOLIDASI)'}
            </div>
            <div className="text-right">
              <span className="inline-block w-20">Periode</span>: s.d. {months.find(m => m.value === bulan)?.label.replace(' (Semester I)', '').replace(' (Semester II)', '')} {tahun}
            </div>
          </div>
        </div>

        {/* Table Toolbar controls */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 print:hidden">
          
          <div className="flex items-center space-x-2 max-w-sm flex-1">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode rekening, program, atau uraian..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-950"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {reportType === 'skpd' && (
              <>
                <button
                  onClick={() => expandAll(reportData, true)}
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-950 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  Expand All
                </button>
                <button
                  onClick={() => expandAll(reportData, false)}
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-950 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  Collapse All
                </button>
              </>
            )}
            <button
              onClick={exportToExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center space-x-1 border border-emerald-600"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="bg-white border border-gray-200 hover:border-gray-300 text-gray-800 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center space-x-1"
            >
              <Download className="w-3 h-3" />
              <span>Cetak / PDF</span>
            </button>
          </div>

        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-xs text-gray-500 font-medium">Memproses rekapitulasi data...</p>
          </div>
        ) : filteredReportData.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-800">
              Data LRA Kosong / Belum Diunggah
            </p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 leading-relaxed">
              {reportType === 'skpd' 
                ? `Belum ada berkas LRA diunggah untuk SKPD "${activeSkpdName}" pada periode ${months.find(m => m.value === bulan)?.label} ${tahun}.`
                : `Belum ada berkas LRA diunggah untuk Kabupaten Kediri pada periode ${months.find(m => m.value === bulan)?.label} ${tahun}.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <th className="py-3 px-4 font-semibold w-32">Kode Rekening</th>
                  <th className="py-3 px-4 font-semibold">Uraian Nama Rekening / Program</th>
                  <th className="py-3 px-4 font-semibold text-right w-44">Anggaran</th>
                  <th className="py-3 px-4 font-semibold text-right w-44">Realisasi</th>
                  <th className="py-3 px-4 font-semibold text-right w-44">Sisa Anggaran</th>
                  <th className="py-3 px-4 font-semibold text-right w-36">Persentase</th>
                  <th className="py-3 px-4 font-semibold text-right w-44">Prognosis 6 (Enam) Bulan Berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {reportType === 'skpd' 
                  ? filteredReportData.map(item => renderTreeRow(item))
                  : filteredReportData.map(group => (
                      <React.Fragment key={group.kode}>
                        {/* Parent Group Header (Level 1) */}
                        <tr className="bg-gray-100 text-[11px] font-bold border-b border-gray-200">
                          <td className="py-2.5 px-4 font-mono text-gray-950">{group.kode}</td>
                          <td className="py-2.5 px-4 text-gray-950 uppercase tracking-wide">{group.uraian}</td>
                          <td className="py-2.5 px-4 text-right text-gray-950">{formatRupiah(group.anggaran)}</td>
                          <td className="py-2.5 px-4 text-right text-gray-950">{formatRupiah(group.realisasi)}</td>
                          <td className="py-2.5 px-4 text-right text-gray-950">{formatRupiah(group.sisa_anggaran)}</td>
                          <td className="py-2.5 px-4 text-right text-gray-950 font-mono font-bold">
                            {group.persentase.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-4 text-right text-gray-950">{formatRupiah(group.prognosis !== undefined ? group.prognosis : (group.anggaran - group.realisasi))}</td>
                        </tr>
                        
                        {/* Children Rows (Level 3) */}
                        {group.children?.map(item => {
                          const sisaRatio = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
                          return (
                            <tr key={item.kode} className="text-xs hover:bg-gray-50/50 border-b border-gray-100">
                              <td className="py-2 px-4 font-mono text-gray-500 pl-6">{item.kode}</td>
                              <td className="py-2 px-4 text-gray-800">{item.uraian}</td>
                              <td className="py-2 px-4 text-right font-mono text-gray-700">{formatRupiah(item.anggaran)}</td>
                              <td className="py-2 px-4 text-right font-mono text-gray-700">{formatRupiah(item.realisasi)}</td>
                              <td className="py-2 px-4 text-right font-mono text-gray-700">{formatRupiah(item.sisa_anggaran)}</td>
                              <td className="py-2 px-4 text-right">
                                <span className="font-mono font-semibold text-gray-800">
                                  {sisaRatio.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-gray-700">{formatRupiah(item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi))}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                }
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};

// Simple spinner helper import
const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
