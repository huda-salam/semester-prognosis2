import PDFDocument from 'pdfkit-table';
import { Response } from 'express';
import { LraReportItem } from '../types';

// Helper to format currency into Indonesian Rupiah format (with parentheses for negative values)
function formatCurrency(num: number): string {
  if (num === null || num === undefined) return '0';
  if (num === 0) return '0';
  const isNegative = num < 0;
  const absVal = Math.abs(num).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return isNegative ? `(${absVal})` : absVal;
}

// Re-map month names
const MONTHS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' }
];

interface SkpdReportData {
  kodeSkpd: string;
  namaSkpd: string;
  items: LraReportItem[];
}

// Split code helper (similar to the frontend)
const getSplitCodes = (item: LraReportItem): { col1: string; col2: string; col3: string } => {
  if (item.jenis === 'urusan' || item.jenis === 'bidang') {
    return { col1: item.kode, col2: '', col3: '' };
  }
  if (item.jenis === 'program' || item.jenis === 'kegiatan' || item.jenis === 'sub_kegiatan') {
    return { col1: '', col2: item.kode, col3: '' };
  }
  return { col1: '', col2: '', col3: item.kode };
};

// Split financing calculations (similar to frontend)
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

// Get LRA calculation results
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

  const hasPembiayaan = !!fNode;

  return {
    pendapatan,
    belanja,
    surplusDefisit,
    pembiayaan,
    pembiayaanNetto,
    silpa,
    hasPembiayaan
  };
};

// Word wrap utility that preserves indentation for all wrapped lines
function wrapTextWithIndent(text: string, maxLen: number, indent: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = indent;

  for (const word of words) {
    if (!word) continue;
    const addedLength = currentLine === indent ? word.length : word.length + 1;
    if (currentLine.length + addedLength > maxLen) {
      lines.push(currentLine);
      currentLine = indent + word;
    } else {
      if (currentLine === indent) {
        currentLine += word;
      } else {
        currentLine += ' ' + word;
      }
    }
  }
  if (currentLine !== indent) {
    lines.push(currentLine);
  }
  return lines.join('\n');
}

// Flatten LraReportItem recursively
function flattenReportItem(item: LraReportItem, depth: number = 0, list: any[] = []) {
  const sisaRatio = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
  
  const formattedAnggaran = formatCurrency(item.anggaran);
  const formattedRealisasi = formatCurrency(item.realisasi);
  const formattedSisa = formatCurrency(item.sisa_anggaran);
  const formattedPersen = sisaRatio.toFixed(2);
  const prognosisValue = item.prognosis !== undefined ? item.prognosis : (item.anggaran - item.realisasi);
  const formattedPrognosis = formatCurrency(prognosisValue);

  // Indent with non-breaking spaces for professional typesetting in PDF
  const indent = '  '.repeat(depth);
  const rawUraian = depth === 0 ? item.uraian.toUpperCase() : item.uraian;
  const displayUraian = wrapTextWithIndent(rawUraian, 65, indent);

  const isCategory = depth === 0 || item.jenis === 'kelompok_besar' || item.jenis === 'jenis';

  list.push({
    kode: item.kode,
    uraian: displayUraian,
    anggaran: formattedAnggaran,
    realisasi: formattedRealisasi,
    sisa_anggaran: formattedSisa,
    persentase: formattedPersen,
    prognosis: formattedPrognosis,
    isBold: isCategory,
    isSummary: false
  });

  if (item.children && item.children.length > 0) {
    for (const child of item.children) {
      flattenReportItem(child, depth + 1, list);
    }
  }
  return list;
}

// Generate the beautiful PDF
export function generateReportsPdf(
  res: Response,
  data: SkpdReportData[],
  tahun: number,
  bulan: number,
  isAllSkpd: boolean,
  reportTitle?: string
) {
  // Use custom size: F4 landscape is 330mm x 215mm = [935 pt, 610 pt]
  const doc = new PDFDocument({
    size: [935, 610],
    margins: { top: 30, bottom: 40, left: 30, right: 30 },
    autoFirstPage: false
  });

  // Stream directly to HTTP response
  doc.pipe(res);

  const monthLabel = MONTHS.find(m => m.value === bulan)?.label || '';

  // Process each SKPD
  data.forEach((skpd, idx) => {
    doc.addPage();

    // 1. Draw Government Header per page
    if (bulan === 6 && !reportTitle) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('PEMERINTAH KABUPATEN KEDIRI', { align: 'center' });
      doc.fontSize(12).text('LAPORAN REALISASI SEMESTER I APBD DAN PROGNOSIS 6 (ENAM) BULAN BERIKUTNYA', { align: 'center' });
      doc.fontSize(10).text(`TAHUN ANGGARAN ${tahun}`, { align: 'center' });
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('PEMERINTAH KABUPATEN KEDIRI', { align: 'center' });
      const docTitle = reportTitle || (isAllSkpd 
        ? 'LAPORAN REALISASI ANGGARAN (LRA) SKPD PER SUBRINCIAN OBJEK' 
        : 'LAPORAN REALISASI ANGGARAN (LRA) SUBRINCIAN OBJEK');
      doc.fontSize(12).text(docTitle, { align: 'center' });
      doc.fontSize(10).text(`TAHUN ANGGARAN ${tahun}`, { align: 'center' });
    }
    
    doc.moveDown(0.5);
    
    // Draw horizontal dividing line
    doc.moveTo(30, doc.y).lineTo(905, doc.y).lineWidth(1.5).stroke('#000000');
    doc.moveDown(0.5);

    // SKPD Detail Metadata rows
    const currentY = doc.y;
    if (bulan === 6 && !reportTitle) {
      doc.font('Helvetica-Bold').fontSize(9).text('SKPD/Unit SKPD', 35, currentY);
      doc.font('Helvetica').text(`: ${skpd.kodeSkpd}   ${skpd.namaSkpd.toUpperCase()}`, 130, currentY);
    } else {
      doc.font('Helvetica-Bold').fontSize(9).text('SKPD', 35, currentY);
      doc.font('Helvetica').text(`: [${skpd.kodeSkpd}] ${skpd.namaSkpd.toUpperCase()}`, 110, currentY);
      
      doc.font('Helvetica-Bold').text('PERIODE', 650, currentY);
      doc.font('Helvetica').text(`: s.d. ${monthLabel} ${tahun}`, 720, currentY);
    }

    doc.moveDown(1.2);

    // Check if report has items
    if (!skpd.items || skpd.items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666666').text(
        `Belum ada berkas LRA diunggah untuk SKPD "${skpd.namaSkpd}" pada periode ini.`,
        30,
        doc.y + 20,
        { align: 'center' }
      );
      return;
    }

    // 2. Perform LRA calculations and assemble table rows
    const calcs = getLraCalculations(skpd.items);
    const pNode = skpd.items.find(item => item.kode === '4');
    const bNode = skpd.items.find(item => item.kode === '5');
    const fNode = skpd.items.find(item => item.kode === '6');

    const tableRows: any[] = [];

    // Append Pendapatan
    if (pNode) {
      flattenReportItem(pNode, 0, tableRows);
      // Empty row spacer
      tableRows.push({ kode: '', uraian: '', anggaran: '', realisasi: '', sisa_anggaran: '', persentase: '', prognosis: '', isBold: false, isEmptySpacer: true });
    }

    // Append Belanja
    if (bNode) {
      flattenReportItem(bNode, 0, tableRows);
      tableRows.push({ kode: '', uraian: '', anggaran: '', realisasi: '', sisa_anggaran: '', persentase: '', prognosis: '', isBold: false, isEmptySpacer: true });
    }

    // Append Surplus Defisit Summary Row
    tableRows.push({
      kode: '',
      uraian: calcs.surplusDefisit.uraian,
      anggaran: formatCurrency(calcs.surplusDefisit.anggaran),
      realisasi: formatCurrency(calcs.surplusDefisit.realisasi),
      sisa_anggaran: formatCurrency(calcs.surplusDefisit.sisa_anggaran),
      persentase: calcs.surplusDefisit.persentase.toFixed(2),
      prognosis: formatCurrency(calcs.surplusDefisit.prognosis),
      isBold: true,
      isSummary: true,
      summaryColor: '#78350f' // Amber tint for Surplus/Defisit
    });
    tableRows.push({ kode: '', uraian: '', anggaran: '', realisasi: '', sisa_anggaran: '', persentase: '', prognosis: '', isBold: false, isEmptySpacer: true });

    // Append Pembiayaan Netto if exists
    if (calcs.hasPembiayaan && fNode) {
      flattenReportItem({ ...fNode, ...calcs.pembiayaan }, 0, tableRows);
      tableRows.push({ kode: '', uraian: '', anggaran: '', realisasi: '', sisa_anggaran: '', persentase: '', prognosis: '', isBold: false, isEmptySpacer: true });

      tableRows.push({
        kode: '',
        uraian: calcs.pembiayaanNetto.uraian,
        anggaran: formatCurrency(calcs.pembiayaanNetto.anggaran),
        realisasi: formatCurrency(calcs.pembiayaanNetto.realisasi),
        sisa_anggaran: formatCurrency(calcs.pembiayaanNetto.sisa_anggaran),
        persentase: calcs.pembiayaanNetto.persentase.toFixed(2),
        prognosis: formatCurrency(calcs.pembiayaanNetto.prognosis),
        isBold: true,
        isSummary: true,
        summaryColor: '#1e3a8a' // Blue tint for Pembiayaan Netto
      });
      tableRows.push({ kode: '', uraian: '', anggaran: '', realisasi: '', sisa_anggaran: '', persentase: '', prognosis: '', isBold: false, isEmptySpacer: true });
    }

    // Append SiLPA Final Summary Row
    tableRows.push({
      kode: '',
      uraian: calcs.silpa.uraian,
      anggaran: formatCurrency(calcs.silpa.anggaran),
      realisasi: formatCurrency(calcs.silpa.realisasi),
      sisa_anggaran: formatCurrency(calcs.silpa.sisa_anggaran),
      persentase: calcs.silpa.persentase.toFixed(2),
      prognosis: formatCurrency(calcs.silpa.prognosis),
      isBold: true,
      isSummary: true,
      summaryColor: '#064e3b' // Emerald tint for SiLPA
    });

    // 3. Define Table options and headers with vertical grid line renderer
    const rawHeaders = [
      { label: 'KODE REKENING', property: 'kode', width: 110, align: 'left', headerColor: '#f3f4f6' },
      { label: 'URAIAN NAMA REKENING / PROGRAM', property: 'uraian', width: 335, align: 'left', headerColor: '#f3f4f6' },
      { label: 'ANGGARAN', property: 'anggaran', width: 90, align: 'right', headerColor: '#f3f4f6' },
      { label: 'REALISASI', property: 'realisasi', width: 90, align: 'right', headerColor: '#f3f4f6' },
      { label: 'SISA ANGGARAN', property: 'sisa_anggaran', width: 90, align: 'right', headerColor: '#f3f4f6' },
      { label: '%', property: 'persentase', width: 45, align: 'right', headerColor: '#f3f4f6' },
      { label: 'PROGNOSIS', property: 'prognosis', width: 95, align: 'right', headerColor: '#f3f4f6' }
    ];

    const tableHeaders = rawHeaders.map((h, colIdx) => ({
      ...h,
      renderer: (val: any, indexColumn: number, indexRow: number, row: any, rectRow: any, rectCell: any) => {
        if (rectCell && rectCell.width > 0 && rectCell.height > 0) {
          doc.lineWidth(0.5).strokeColor('#000000');
          if (colIdx === 0) {
            doc.moveTo(rectCell.x, rectCell.y).lineTo(rectCell.x, rectCell.y + rectCell.height).stroke();
          }
          doc.moveTo(rectCell.x + rectCell.width, rectCell.y).lineTo(rectCell.x + rectCell.width, rectCell.y + rectCell.height).stroke();
        }
        return val;
      }
    }));

    const tableData = {
      headers: tableHeaders,
      datas: tableRows
    };

    // Reset X position before rendering the table to ensure it is aligned correctly
    doc.x = 35;

    // Render table
    doc.table(tableData, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000'),
      prepareRow: (row: any, indexColumn: number, indexRow: number, rectRow: any, rectCell: any) => {
        if (rectCell && rectCell.width > 0 && rectCell.height > 0) {
          doc.lineWidth(0.5).strokeColor('#cccccc');
          if (indexColumn === 0) {
            doc.moveTo(rectCell.x, rectCell.y).lineTo(rectCell.x, rectCell.y + rectCell.height).stroke();
          }
          doc.moveTo(rectCell.x + rectCell.width, rectCell.y).lineTo(rectCell.x + rectCell.width, rectCell.y + rectCell.height).stroke();
        }

        const item = tableRows[indexRow];
        if (item) {
          if (item.isEmptySpacer) {
            // Draw thin line row
            doc.font('Helvetica').fontSize(1);
          } else if (item.isSummary) {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(item.summaryColor || '#000000');
            // Give summary rows a light background tint
            if (rectCell) {
              doc.addBackground(rectCell, item.summaryColor || '#000000', 0.05);
            }
          } else if (item.isBold) {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000');
          } else {
            doc.font('Helvetica').fontSize(7).fillColor('#333333');
          }
        }
      }
    });
  });

  // Finalize PDF Generation
  doc.end();
}
