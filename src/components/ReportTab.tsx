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

// Split code helper into 3 columns
const getSplitCodes = (item: LraReportItem): { col1: string; col2: string; col3: string } => {
  if (item.jenis === 'urusan' || item.jenis === 'bidang') {
    return { col1: item.kode, col2: '', col3: '' };
  }
  if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
    return { col1: '', col2: item.kode, col3: '' };
  }
  return { col1: '', col2: '', col3: item.kode };
};

// Calculate pembiayaan 6.1 and 6.2 recursively
const getPembiayaan61And62 = (node: LraReportItem | undefined) => {
  let ang61 = 0, real61 = 0, sisa61 = 0, prog61 = 0;
  let ang62 = 0, real62 = 0, sisa62 = 0, prog62 = 0;

  if (node && node.children) {
    const immediate61 = node.children.find(c => c.kode === '6.1' || c.kode.startsWith('6.1.'));
    const immediate62 = node.children.find(c => c.kode === '6.2' || c.kode.startsWith('6.2.'));

    if (immediate61 && immediate62) {
      ang61 = immediate61.anggaran;
      real61 = immediate61.realisasi;
      sisa61 = immediate61.sisa_anggaran;
      prog61 = immediate61.prognosis !== undefined ? immediate61.prognosis : (immediate61.anggaran - immediate61.realisasi);

      ang62 = immediate62.anggaran;
      real62 = immediate62.realisasi;
      sisa62 = immediate62.sisa_anggaran;
      prog62 = immediate62.prognosis !== undefined ? immediate62.prognosis : (immediate62.anggaran - immediate62.realisasi);
    } else {
      node.children.forEach(c => {
        if (c.kode.startsWith('6.1')) {
          ang61 += c.anggaran;
          real61 += c.realisasi;
          sisa61 += c.sisa_anggaran;
          prog61 += c.prognosis !== undefined ? c.prognosis : (c.anggaran - c.realisasi);
        } else if (c.kode.startsWith('6.2')) {
          ang62 += c.anggaran;
          real62 += c.realisasi;
          sisa62 += c.sisa_anggaran;
          prog62 += c.prognosis !== undefined ? c.prognosis : (c.anggaran - c.realisasi);
        }
      });
    }
  }

  return {
    ang61, real61, sisa61, prog61,
    ang62, real62, sisa62, prog62
  };
};

// Calculate all needed LRA summary rows
const getLraCalculations = (data: LraReportItem[]) => {
  const pNode = data.find(item => item.kode === '4');
  const bNode = data.find(item => item.kode === '5');
  const fNode = data.find(item => item.kode === '6');

  const pendapatan = pNode ? { ...pNode } : {
    kode: '4',
    uraian: 'PENDAPATAN DAERAH',
    jenis: 'kelompok_besar',
    anggaran: 0,
    realisasi: 0,
    sisa_anggaran: 0,
    persentase: 0,
    prognosis: 0
  };

  const belanja = bNode ? { ...bNode } : {
    kode: '5',
    uraian: 'BELANJA DAERAH',
    jenis: 'kelompok_besar',
    anggaran: 0,
    realisasi: 0,
    sisa_anggaran: 0,
    persentase: 0,
    prognosis: 0
  };

  const p6162 = getPembiayaan61And62(fNode);
  const pembiayaanNetto = {
    kode: '',
    uraian: 'PEMBIAYAAN NETTO',
    jenis: 'summary_row',
    anggaran: p6162.ang61 - p6162.ang62,
    realisasi: p6162.real61 - p6162.real62,
    sisa_anggaran: (p6162.ang61 - p6162.ang62) - (p6162.real61 - p6162.real62),
    persentase: 0,
    prognosis: p6162.prog61 - p6162.prog62
  };
  pembiayaanNetto.persentase = pembiayaanNetto.anggaran !== 0 
    ? (pembiayaanNetto.realisasi / pembiayaanNetto.anggaran) * 100 
    : 0;

  const pembiayaan = fNode ? {
    ...fNode,
    anggaran: pembiayaanNetto.anggaran,
    realisasi: pembiayaanNetto.realisasi,
    sisa_anggaran: pembiayaanNetto.sisa_anggaran,
    persentase: pembiayaanNetto.persentase,
    prognosis: pembiayaanNetto.prognosis
  } : {
    kode: '6',
    uraian: 'PEMBIAYAAN DAERAH',
    jenis: 'kelompok_besar',
    anggaran: 0,
    realisasi: 0,
    sisa_anggaran: 0,
    persentase: 0,
    prognosis: 0
  };

  const surplusDefisit = {
    kode: '',
    uraian: 'SURPLUS / DEFISIT LRA',
    jenis: 'summary_row',
    anggaran: pendapatan.anggaran - belanja.anggaran,
    realisasi: pendapatan.realisasi - belanja.realisasi,
    sisa_anggaran: (pendapatan.anggaran - belanja.anggaran) - (pendapatan.realisasi - belanja.realisasi),
    persentase: 0,
    prognosis: (pendapatan.prognosis !== undefined ? pendapatan.prognosis : (pendapatan.anggaran - pendapatan.realisasi)) - 
               (belanja.prognosis !== undefined ? belanja.prognosis : (belanja.anggaran - belanja.realisasi))
  };
  surplusDefisit.persentase = surplusDefisit.anggaran !== 0 
    ? (surplusDefisit.realisasi / surplusDefisit.anggaran) * 100 
    : 0;

  const silpa = {
    kode: '',
    uraian: 'SISA LEBIH PEMBIAYAAN ANGGARAN TAHUN BERKENAAN (SiLPA)',
    jenis: 'summary_row',
    anggaran: surplusDefisit.anggaran + pembiayaanNetto.anggaran,
    realisasi: surplusDefisit.realisasi + pembiayaanNetto.realisasi,
    sisa_anggaran: surplusDefisit.sisa_anggaran + pembiayaanNetto.sisa_anggaran,
    persentase: 0,
    prognosis: surplusDefisit.prognosis + pembiayaanNetto.prognosis
  };
  silpa.persentase = silpa.anggaran !== 0 
    ? (silpa.realisasi / silpa.anggaran) * 100 
    : 0;

  return {
    pendapatan,
    belanja,
    surplusDefisit,
    pembiayaan,
    pembiayaanNetto,
    silpa,
    hasPembiayaan: !!fNode
  };
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
    const headers = reportType === 'skpd' ? [
      'Kode Urusan / Bidang',
      'Kode Program / Kegiatan / Sub Kegiatan',
      'Kode Rekening',
      'Uraian Nama Rekening / Program',
      'Anggaran',
      'Realisasi',
      'Sisa Anggaran',
      'Persentase (%)',
      'Prognosis 6 (Enam) Bulan Berikutnya'
    ] : [
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

    const calcs = getLraCalculations(reportData);

    const pushExcelItem = (
      item: LraReportItem,
      depth: number,
      activeUrusanBidang: string = '',
      activeProgramKegiatanSubkeg: string = ''
    ) => {
      const indentation = '  '.repeat(depth);
      const pct = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
      const prog = item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi);

      if (reportType === 'skpd') {
        let col1 = '';
        let col2 = '';
        let col3 = '';

        if (item.jenis === 'urusan' || item.jenis === 'bidang') {
          col1 = item.kode;
        } else if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
          col1 = activeUrusanBidang;
          col2 = item.kode;
        } else {
          col1 = activeUrusanBidang;
          col2 = activeProgramKegiatanSubkeg;
          col3 = item.kode;
        }

        data.push([
          col1,
          col2,
          col3,
          indentation + item.uraian,
          item.anggaran,
          item.realisasi,
          item.sisa_anggaran,
          Number(pct.toFixed(1)),
          prog
        ]);
      } else {
        data.push([
          item.kode,
          indentation + item.uraian,
          item.anggaran,
          item.realisasi,
          item.sisa_anggaran,
          Number(pct.toFixed(1)),
          prog
        ]);
      }
    };

    const pushExcelSummary = (item: any) => {
      if (reportType === 'skpd') {
        data.push([
          '',
          '',
          '',
          item.uraian,
          item.anggaran,
          item.realisasi,
          item.sisa_anggaran,
          Number(item.persentase.toFixed(1)),
          item.prognosis
        ]);
      } else {
        data.push([
          '',
          item.uraian,
          item.anggaran,
          item.realisasi,
          item.sisa_anggaran,
          Number(item.persentase.toFixed(1)),
          item.prognosis
        ]);
      }
    };

    const pushExcelEmpty = () => {
      if (reportType === 'skpd') {
        data.push(['', '', '', '', '', '', '', '', '']);
      } else {
        data.push(['', '', '', '', '', '', '']);
      }
    };

    const flattenTree = (
      item: LraReportItem,
      depth: number,
      activeUrusanBidang: string = '',
      activeProgramKegiatanSubkeg: string = ''
    ) => {
      let nextUrusanBidang = activeUrusanBidang;
      let nextProgramKegiatanSubkeg = activeProgramKegiatanSubkeg;

      if (item.jenis === 'urusan' || item.jenis === 'bidang') {
        nextUrusanBidang = item.kode;
      } else if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
        nextProgramKegiatanSubkeg = item.kode;
      }

      pushExcelItem(item, depth, activeUrusanBidang, activeProgramKegiatanSubkeg);
      item.children?.forEach(c => flattenTree(c, depth + 1, nextUrusanBidang, nextProgramKegiatanSubkeg));
    };

    // 1. Pendapatan (4)
    const pNode = reportData.find(item => item.kode === '4');
    if (pNode) {
      flattenTree(pNode, 0);
    }

    pushExcelEmpty();

    // 2. Belanja (5)
    const bNode = reportData.find(item => item.kode === '5');
    if (bNode) {
      flattenTree(bNode, 0);
    }

    pushExcelEmpty();

    // 3. Surplus / Defisit
    pushExcelSummary(calcs.surplusDefisit);

    pushExcelEmpty();

    // 4. Pembiayaan (6)
    if (calcs.hasPembiayaan) {
      const fNode = reportData.find(item => item.kode === '6');
      if (fNode) {
        const modifiedRoot = { ...fNode, ...calcs.pembiayaan };
        pushExcelItem(modifiedRoot, 0);
        fNode.children?.forEach(c => flattenTree(c, 1));
      }
    }

    if (calcs.hasPembiayaan) {
      pushExcelEmpty();
      // 5. Pembiayaan Netto
      pushExcelSummary(calcs.pembiayaanNetto);
      pushExcelEmpty();
    }

    // 6. SiLPA
    pushExcelSummary(calcs.silpa);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    const wscols = reportType === 'skpd' ? [
      { wch: 15 }, // Kode Urusan/Bidang
      { wch: 18 }, // Kode Prog/Keg/Subkeg
      { wch: 15 }, // Kode Rekening
      { wch: 45 }, // Uraian
      { wch: 16 }, // Anggaran
      { wch: 16 }, // Realisasi
      { wch: 16 }, // Sisa Anggaran
      { wch: 12 }, // Persentase
      { wch: 25 }, // Prognosis
    ] : [
      { wch: 18 }, // Kode Rekening
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

  // Renders a single row of the tree table using 3 split code columns (for SKPD)
  const renderTreeRow = (
    item: LraReportItem,
    depth: number = 0,
    activeUrusanBidang: string = '',
    activeProgramKegiatanSubkeg: string = ''
  ) => {
    const isExpanded = !!expandedKeys[item.kode];
    const hasChildren = item.children && item.children.length > 0;
    const sisaRatio = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;

    let col1 = '';
    let col2 = '';
    let col3 = '';

    if (item.jenis === 'urusan' || item.jenis === 'bidang') {
      col1 = item.kode;
    } else if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
      col1 = activeUrusanBidang;
      col2 = item.kode;
    } else {
      col1 = activeUrusanBidang;
      col2 = activeProgramKegiatanSubkeg;
      col3 = item.kode;
    }

    let nextUrusanBidang = activeUrusanBidang;
    let nextProgramKegiatanSubkeg = activeProgramKegiatanSubkeg;

    if (item.jenis === 'urusan' || item.jenis === 'bidang') {
      nextUrusanBidang = item.kode;
    } else if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
      nextProgramKegiatanSubkeg = item.kode;
    }

    // Different backgrounds per depth level to establish clean visual rhythm
    const depthBgClass = 
      depth === 0 
        ? 'bg-gray-100/90 font-bold border-b border-gray-200 text-gray-950' 
        : depth === 1 
        ? 'bg-gray-50/70 font-semibold border-b border-gray-150 text-gray-900' 
        : 'hover:bg-gray-50/40 border-b border-gray-100 text-gray-800';

    return (
      <React.Fragment key={`${item.kode}-${item.jenis}`}>
        <tr className={`text-xs ${depthBgClass} transition-colors`}>
          {/* Column 1: Urusan/Bidang */}
          <td className="py-2.5 px-4 font-mono font-medium text-gray-600 whitespace-nowrap border-r border-gray-100/50">
            {col1}
          </td>
          {/* Column 2: Program/Kegiatan/Sub-Kegiatan */}
          <td className="py-2.5 px-4 font-mono font-medium text-gray-600 whitespace-nowrap border-r border-gray-100/50">
            {col2}
          </td>
          {/* Column 3: Rekening */}
          <td className="py-2.5 px-4 font-mono font-medium text-gray-600 whitespace-nowrap border-r border-gray-100/50">
            {col3}
          </td>
          <td className="py-2.5 px-4 max-w-md">
            <div className="flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.kode)}
                  className="mr-1.5 p-1 rounded hover:bg-gray-200 cursor-pointer text-gray-500 print:hidden"
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
              <span className={depth === 0 ? 'text-gray-950 font-bold uppercase text-[11px] tracking-wide' : 'text-gray-800'}>
                {item.uraian}
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
            <span className="font-mono font-semibold text-[11px] text-gray-800 w-12 text-right">
              {sisaRatio.toFixed(1)}%
            </span>
          </td>
          <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
            {formatRupiah(item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi))}
          </td>
        </tr>
        
        {/* Render children if expanded */}
        {hasChildren && isExpanded && item.children!.map(child => renderTreeRow(child, depth + 1, nextUrusanBidang, nextProgramKegiatanSubkeg))}
      </React.Fragment>
    );
  };

  // Renders a single row of the tree table for Pemda (only 1 code column, recursively)
  const renderPemdaRow = (item: LraReportItem, depth: number = 0) => {
    const isExpanded = !!expandedKeys[item.kode];
    const hasChildren = item.children && item.children.length > 0;
    const sisaRatio = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;

    // Background colors matching depth
    const depthBgClass = 
      depth === 0 
        ? 'bg-gray-100/90 font-bold border-b border-gray-200 text-gray-950' 
        : depth === 1 
        ? 'bg-gray-50/70 font-semibold border-b border-gray-150 text-gray-900' 
        : depth === 2
        ? 'bg-white/50 hover:bg-gray-50/30 border-b border-gray-100 text-gray-800'
        : 'bg-white/30 hover:bg-gray-50/45 border-b border-gray-100/50 text-gray-700 italic';

    return (
      <React.Fragment key={`${item.kode}-${item.jenis}`}>
        <tr className={`text-xs ${depthBgClass} transition-colors`}>
          {/* Column 1: Single Code Column for Rekening */}
          <td className="py-2.5 px-4 font-mono font-medium text-gray-700 whitespace-nowrap border-r border-gray-100/50">
            {item.kode}
          </td>
          {/* Column 2: Uraian Nama Rekening */}
          <td className="py-2.5 px-4 max-w-md">
            <div className="flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(item.kode)}
                  className="mr-1.5 p-1 rounded hover:bg-gray-200 cursor-pointer text-gray-500 print:hidden"
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
              <span className={depth === 0 ? 'text-gray-950 font-bold uppercase text-[11px] tracking-wide' : 'text-gray-800'}>
                {item.uraian}
              </span>
            </div>
          </td>
          {/* Financial columns */}
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
            <span className="font-mono font-semibold text-[11px] text-gray-800 w-12 text-right">
              {sisaRatio.toFixed(1)}%
            </span>
          </td>
          <td className="py-2.5 px-4 text-right font-mono font-medium text-gray-900">
            {formatRupiah(item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi))}
          </td>
        </tr>
        
        {/* Render children recursively if expanded */}
        {hasChildren && isExpanded && item.children!.map(child => renderPemdaRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  const renderSummaryRow = (item: any, labelClass = "text-emerald-950") => {
    return (
      <tr className="bg-emerald-50/50 font-bold text-xs border-b border-emerald-100 text-gray-950">
        {reportType === 'skpd' ? (
          <>
            <td className="py-3 px-4 border-r border-gray-100/50"></td>
            <td className="py-3 px-4 border-r border-gray-100/50"></td>
            <td className="py-3 px-4 border-r border-gray-100/50"></td>
          </>
        ) : (
          <td className="py-3 px-4 border-r border-gray-100/50"></td>
        )}
        <td className={`py-3 px-4 uppercase tracking-wide ${labelClass}`}>
          {item.uraian}
        </td>
        <td className="py-3 px-4 text-right font-mono">{formatRupiah(item.anggaran)}</td>
        <td className="py-3 px-4 text-right font-mono">{formatRupiah(item.realisasi)}</td>
        <td className={`py-3 px-4 text-right font-mono ${item.sisa_anggaran < 0 ? 'text-rose-600' : ''}`}>
          {formatRupiah(item.sisa_anggaran)}
        </td>
        <td className="py-3 px-4 text-right font-mono">
          {item.persentase.toFixed(1)}%
        </td>
        <td className="py-3 px-4 text-right font-mono">
          {formatRupiah(item.prognosis)}
        </td>
      </tr>
    );
  };

  const renderEmptyRow = () => {
    return (
      <tr className="h-6 bg-white border-b border-gray-100/30 print:h-8">
        <td colSpan={reportType === 'pemda' ? 7 : 9} className="py-2 px-4"></td>
      </tr>
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
                <tr className="bg-gray-100 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  {reportType === 'skpd' ? (
                    <>
                      <th className="py-3 px-4 font-semibold w-24">Urusan/Bidang</th>
                      <th className="py-3 px-4 font-semibold w-40">Prog/Keg/Subkeg</th>
                      <th className="py-3 px-4 font-semibold w-28">Rekening</th>
                    </>
                  ) : (
                    <th className="py-3 px-4 font-semibold w-40">Kode Rekening</th>
                  )}
                  <th className="py-3 px-4 font-semibold">Uraian Nama Rekening / Program</th>
                  <th className="py-3 px-4 font-semibold text-right w-36">Anggaran</th>
                  <th className="py-3 px-4 font-semibold text-right w-36">Realisasi</th>
                  <th className="py-3 px-4 font-semibold text-right w-36">Sisa Anggaran</th>
                  <th className="py-3 px-4 font-semibold text-right w-24">Persentase</th>
                  <th className="py-3 px-4 font-semibold text-right w-44">Prognosis 6 (Enam) Bulan Berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const calcs = getLraCalculations(reportData);
                  const pNode = filteredReportData.find(item => item.kode === '4');
                  const bNode = filteredReportData.find(item => item.kode === '5');
                  const fNode = filteredReportData.find(item => item.kode === '6');

                  if (reportType === 'skpd') {
                    return (
                      <>
                        {/* 1. Pendapatan */}
                        {calcs.pendapatan && (pNode || !searchQuery) && renderTreeRow(pNode || calcs.pendapatan)}
                        
                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 2. Belanja */}
                        {calcs.belanja && (bNode || !searchQuery) && renderTreeRow(bNode || calcs.belanja)}

                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 3. Surplus / Defisit */}
                        {!searchQuery && renderSummaryRow(calcs.surplusDefisit, "text-amber-800")}

                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 4. Pembiayaan */}
                        {calcs.hasPembiayaan && (fNode || !searchQuery) && renderTreeRow(fNode ? { ...fNode, ...calcs.pembiayaan } : calcs.pembiayaan)}

                        {/* Space */}
                        {calcs.hasPembiayaan && !searchQuery && renderEmptyRow()}

                        {/* 5. Pembiayaan Netto */}
                        {calcs.hasPembiayaan && !searchQuery && renderSummaryRow(calcs.pembiayaanNetto, "text-blue-900")}

                        {/* Space */}
                        {calcs.hasPembiayaan && !searchQuery && renderEmptyRow()}

                        {/* 6. SiLPA */}
                        {!searchQuery && renderSummaryRow(calcs.silpa, "text-emerald-950")}
                      </>
                    );
                  } else {
                    return (
                      <>
                        {/* 1. Pendapatan */}
                        {pNode && renderPemdaRow(pNode)}
                        
                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 2. Belanja */}
                        {bNode && renderPemdaRow(bNode)}

                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 3. Surplus / Defisit */}
                        {!searchQuery && renderSummaryRow(calcs.surplusDefisit, "text-amber-800")}

                        {/* Space */}
                        {!searchQuery && renderEmptyRow()}

                        {/* 4. Pembiayaan */}
                        {calcs.hasPembiayaan && fNode && renderPemdaRow({ ...fNode, ...calcs.pembiayaan })}

                        {/* Space */}
                        {calcs.hasPembiayaan && !searchQuery && renderEmptyRow()}

                        {/* 5. Pembiayaan Netto */}
                        {calcs.hasPembiayaan && !searchQuery && renderSummaryRow(calcs.pembiayaanNetto, "text-blue-900")}

                        {/* Space */}
                        {calcs.hasPembiayaan && !searchQuery && renderEmptyRow()}

                        {/* 6. SiLPA */}
                        {!searchQuery && renderSummaryRow(calcs.silpa, "text-emerald-950")}
                      </>
                    );
                  }
                })()}
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
