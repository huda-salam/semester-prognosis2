import XLSX from 'xlsx';
import { IMasterRepository, ILraRepository, IPrognosisRepository } from './ports';
import { DataLra, DataPrognosisBelanja, DataPrognosisPendapatanPembiayaan, MasterReference, LraReportItem } from '../types';
import { normalizeName } from '../adapters/repositories/KnexRepositories';

// Helper to extract Indonesian month index (1-12)
export function extractBulanAkhir(periodText: string): number {
  if (!periodText) return 6; // June as fallback
  const normalized = periodText.toLowerCase();
  const months = [
    'januari', 'februari', 'maret', 'april', 'mei', 'juni',
    'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
  ];
  for (let i = months.length - 1; i >= 0; i--) {
    if (normalized.includes(months[i])) {
      return i + 1;
    }
  }
  return 6; // default to June (Semester 1)
}

// Helper to parse Indonesian numeric strings into standard JavaScript numbers safely
export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  let str = String(val).trim();
  
  // Remove currency prefixes (Rp., Rp, IDR) and spaces
  str = str.replace(/Rp\.?/gi, '').replace(/IDR/gi, '').replace(/\s/g, '');
  
  // Handle parenthesis formatting for negative numbers, e.g. (1.200.000)
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.substring(1, str.length - 1);
  }

  if (!str) return 0;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Standard Indonesian format with both thousands dot and decimal comma
    str = str.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma) {
    // Only comma is present, treat it as decimal point
    str = str.replace(/,/g, '.');
  } else if (hasDot) {
    // Only dot is present. Determine if it is a thousands separator or decimal dot
    const parts = str.split('.');
    if (parts.length > 2) {
      // Multiple dots -> thousands separator
      str = str.replace(/\./g, '');
    } else {
      // Single dot -> check if followed by exactly 3 digits (very common for thousands in Indonesian LRA data)
      const afterDot = parts[1];
      if (afterDot && afterDot.length === 3) {
        str = str.replace(/\./g, '');
      }
      // If it's not 3 digits, e.g. "12.5" or "12.50", treat as decimal dot and leave it alone
    }
  }

  const num = Number(str);
  const result = isNaN(num) ? 0 : num;
  return isNegative ? -result : result;
}

export class MasterUseCase {
  constructor(private masterRepo: IMasterRepository) {}

  async getAllMasterReferences() {
    return await this.masterRepo.getAll();
  }

  async parseAndSaveMasterExcel(fileBuffer: Buffer): Promise<{ success: boolean; count: number; errors: string[] }> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const records: MasterReference[] = [];
    const errors: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
      
      if (rows.length < 2) continue;

      // Find Kode and Uraian/Nama column indices
      const headerRow = rows[0] || [];
      let kodeIdx = -1;
      let uraianIdx = -1;

      for (let i = 0; i < headerRow.length; i++) {
        const hVal = String(headerRow[i] || '').toUpperCase().trim();
        if (hVal === 'KODE' || hVal.includes('KODE REKENING') || hVal.includes('KODE SKPD') || hVal.includes('KD_REK') || hVal === 'KD_SKPD') {
          kodeIdx = i;
        }
        if (hVal === 'URAIAN' || hVal.includes('NAMA REKENING') || hVal.includes('NAMA SKPD') || hVal === 'NAMA' || hVal.includes('NM_REK') || hVal === 'NM_SKPD') {
          uraianIdx = i;
        }
      }

      // Fallback if headers not matched precisely
      if (kodeIdx === -1) kodeIdx = 0;
      if (uraianIdx === -1) uraianIdx = headerRow.length > 1 ? 1 : 0;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const kode = String(row[kodeIdx] || '').trim();
        const uraian = String(row[uraianIdx] || '').trim();

        if (!kode || !uraian || kode === 'undefined' || uraian === 'undefined') continue;

        // Auto detect jenis and level from code format and length
        let jenis: MasterReference['jenis'] = 'rekening';
        let level = 1;
        let parent: string | null = null;

        // Clean dots
        const dotCount = (kode.match(/\./g) || []).length;
        const cleanKode = kode;

        if (cleanKode.includes('00.0') || cleanKode.length >= 20 || dotCount >= 6) {
          // SKPD code format
          jenis = 'skpd';
          level = 1;
        } else {
          // It's a hierarchy item or rekening
          const len = cleanKode.length;
          if (len === 1) {
            jenis = cleanKode === '4' || cleanKode === '5' || cleanKode === '6' ? 'rekening' : 'urusan';
            level = 1;
          } else if (len === 4) {
            jenis = 'bidang';
            level = 2;
            parent = cleanKode.substring(0, 1);
          } else if (len === 7) {
            jenis = 'program';
            level = 3;
            parent = cleanKode.substring(0, 4);
          } else if (len === 12) {
            jenis = 'kegiatan';
            level = 4;
            parent = cleanKode.substring(0, 7);
          } else if (len === 17) {
            jenis = 'sub_kegiatan';
            level = 5;
            parent = cleanKode.substring(0, 12);
          } else {
            // Rekening
            jenis = 'rekening';
            if (len === 3) {
              level = 2; // E.g., 5.1
              parent = cleanKode.substring(0, 1);
            } else if (len === 6) {
              level = 3; // E.g., 5.1.02
              parent = cleanKode.substring(0, 3);
            } else if (len === 9) {
              level = 4; // E.g., 5.1.02.01
              parent = cleanKode.substring(0, 6);
            } else if (len === 13) {
              level = 5; // E.g., 5.1.02.01.001
              parent = cleanKode.substring(0, 9);
            } else if (len === 19) {
              level = 6; // E.g., 5.1.02.01.001.00026 (leaf level)
              parent = cleanKode.substring(0, 13);
            }
          }
        }

        records.push({
          kode: cleanKode,
          uraian,
          jenis,
          level,
          parent
        });
      }
    }

    if (records.length > 0) {
      await this.masterRepo.saveMany(records);
    }

    return {
      success: true,
      count: records.length,
      errors
    };
  }
}

export class LraUseCase {
  constructor(
    private lraRepo: ILraRepository,
    private masterRepo: IMasterRepository,
    private prognosisRepo: IPrognosisRepository
  ) {}

  /**
   * Parse Format 1 Excel: Belanja, per SKPD or se-Pemda
   */
  async parseFormat1(
    fileBuffer: Buffer,
    tahun: number,
    bulan: number,
    role: 'skpd' | 'pemda',
    uploaderSkpdKode?: string,
    filename?: string,
    uploadedBy?: string
  ): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Parse as 2D array
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    const errors: string[] = [];
    const recordsToInsert: DataLra[] = [];

    // Context tracking for hierarchal structure
    const context = {
      kode_urusan: '', nama_urusan: '',
      kode_bidang: '', nama_bidang: '',
      kode_skpd: '', nama_skpd: '',
      kode_program: '', nama_program: '',
      kode_kegiatan: '', nama_kegiatan: '',
      kode_sub_kegiatan: '', nama_sub_kegiatan: ''
    };

    // Rows start from index 9 (row 10)
    for (let r = 9; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const a = String(row[0] || '').trim(); // Urusan/Bidang
      const b = String(row[1] || '').trim(); // SKPD
      const c = String(row[2] || '').trim(); // Prog/Keg/SubKeg
      const d = String(row[3] || '').trim(); // Rekening
      const uraian = String(row[4] || '').trim(); // Nama Uraian

      if (!a && !b && !c && !d && !uraian) continue;

      if (d) {
        // Baris rekening (level 3-6)
        if (d.length === 19) {
          // Leaf -> parsed as a transaction record
          // Anggaran = F + H + J + L (indices 5, 7, 9, 11)
          const f_ang = parseIndonesianNumber(row[5]);
          const h_ang = parseIndonesianNumber(row[7]);
          const j_ang = parseIndonesianNumber(row[9]);
          const l_ang = parseIndonesianNumber(row[11]);
          const anggaran = f_ang + h_ang + j_ang + l_ang;

          // Realisasi = G + I + K + M (indices 6, 8, 10, 12)
          const g_rea = parseIndonesianNumber(row[6]);
          const i_rea = parseIndonesianNumber(row[8]);
          const k_rea = parseIndonesianNumber(row[10]);
          const m_rea = parseIndonesianNumber(row[12]);
          const realisasi = g_rea + i_rea + k_rea + m_rea;

          // If role is SKPD, ensure records only belong to uploaderSkpdKode
          if (role === 'skpd' && uploaderSkpdKode && context.kode_skpd !== uploaderSkpdKode) {
            continue; // Skip SKPD that belongs to someone else
          }

          recordsToInsert.push({
            tahun,
            bulan,
            kode_skpd: context.kode_skpd || uploaderSkpdKode || 'UNKNOWN',
            nama_skpd: context.nama_skpd || 'UNKNOWN SKPD',
            kode_urusan: context.kode_urusan || null,
            nama_urusan: context.nama_urusan || null,
            kode_bidang: context.kode_bidang || null,
            nama_bidang: context.nama_bidang || null,
            kode_program: context.kode_program || null,
            nama_program: context.nama_program || null,
            kode_kegiatan: context.kode_kegiatan || null,
            nama_kegiatan: context.nama_kegiatan || null,
            kode_sub_kegiatan: context.kode_sub_kegiatan || null,
            nama_sub_kegiatan: context.nama_sub_kegiatan || null,
            kode_rekening: d,
            nama_rekening: uraian,
            anggaran,
            realisasi,
            sumber_format: 'format1',
            uploaded_by: uploadedBy,
            uploaded_at: new Date().toISOString(),
            source_filename: filename
          });
        }
      } else if (c) {
        // Hierarchical Program/Kegiatan/Sub-Kegiatan update context
        const len_c = c.length;
        if (len_c === 7) {
          context.kode_program = c;
          context.nama_program = uraian;
          context.kode_kegiatan = '';
          context.nama_kegiatan = '';
          context.kode_sub_kegiatan = '';
          context.nama_sub_kegiatan = '';
        } else if (len_c === 12) {
          context.kode_kegiatan = c;
          context.nama_kegiatan = uraian;
          context.kode_sub_kegiatan = '';
          context.nama_sub_kegiatan = '';
        } else if (len_c === 17) {
          context.kode_sub_kegiatan = c;
          context.nama_sub_kegiatan = uraian;
        }
      } else if (b) {
        // SKPD level context
        context.kode_skpd = b;
        context.nama_skpd = uraian;
        context.kode_program = '';
        context.nama_program = '';
        context.kode_kegiatan = '';
        context.nama_kegiatan = '';
        context.kode_sub_kegiatan = '';
        context.nama_sub_kegiatan = '';
      } else if (a) {
        const len_a = a.length;
        if (len_a === 1) {
          context.kode_urusan = a;
          context.nama_urusan = uraian;
          context.kode_bidang = '';
          context.nama_bidang = '';
          context.kode_skpd = '';
          context.nama_skpd = '';
          context.kode_program = '';
          context.nama_program = '';
          context.kode_kegiatan = '';
          context.nama_kegiatan = '';
          context.kode_sub_kegiatan = '';
          context.nama_sub_kegiatan = '';
        } else if (len_a === 4) {
          context.kode_bidang = a;
          context.nama_bidang = uraian;
          context.kode_skpd = '';
          context.nama_skpd = '';
          context.kode_program = '';
          context.nama_program = '';
          context.kode_kegiatan = '';
          context.nama_kegiatan = '';
          context.kode_sub_kegiatan = '';
          context.nama_sub_kegiatan = '';
        }
      }
    }

    if (recordsToInsert.length === 0) {
      return { success: false, insertedCount: 0, errors: ['File Excel kosong atau tidak sesuai dengan Format 1 Belanja'] };
    }

    // Run within validation & execution scope (Delete then Insert)
    if (role === 'skpd' && uploaderSkpdKode) {
      await this.lraRepo.deleteScopeBelanja(tahun, bulan, uploaderSkpdKode);
    } else {
      // Pemda role deletes all belanja for that month
      await this.lraRepo.deleteScopeBelanja(tahun, bulan);
    }

    await this.lraRepo.insertMany(recordsToInsert);

    // Bootstrap prognosis records for belanja
    await this.initializePrognosisRecordsForBelanja(tahun, bulan, recordsToInsert);

    return { success: true, insertedCount: recordsToInsert.length, errors };
  }

  /**
   * Parse Format 2 Excel: Pendapatan & Pembiayaan, per SKPD
   */
  async parseFormat2(
    fileBuffer: Buffer,
    tahun: number,
    role: 'skpd' | 'pemda',
    uploaderSkpdKode?: string,
    filename?: string,
    uploadedBy?: string
  ): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    const errors: string[] = [];

    if (rows.length < 10) {
      return { success: false, insertedCount: 0, errors: ['File Excel terlalu pendek untuk Format 2'] };
    }

    // SKPD name is in B2 (row index 1, col index 1)
    const skpdCell = rows[1] ? rows[1][1] : '';
    if (!skpdCell) {
      return { success: false, insertedCount: 0, errors: ['Format 2 error: Nama SKPD di sel B2 tidak ditemukan'] };
    }

    // Lookup SKPD code from master using SKPD name
    const matchedSkpd = await this.masterRepo.getSkpdByUraian(String(skpdCell));
    if (!matchedSkpd) {
      return { success: false, insertedCount: 0, errors: [`SKPD dengan nama "${skpdCell}" tidak ditemukan di database referensi master`] };
    }

    const targetSkpdKode = matchedSkpd.kode;
    const targetSkpdNama = matchedSkpd.uraian;

    if (role === 'skpd' && uploaderSkpdKode && targetSkpdKode !== uploaderSkpdKode) {
      return { success: false, insertedCount: 0, errors: [`Anda mengunggah data untuk SKPD "${targetSkpdNama}", sedangkan akun Anda terdaftar untuk SKPD lain.`] };
    }

    // Period text is in B5 (row index 4, col index 1)
    const periodCell = rows[4] ? rows[4][1] : '';
    const bulan = extractBulanAkhir(String(periodCell));

    const recordsToInsert: DataLra[] = [];

    // Rows start from row index 9 (row 10)
    for (let r = 9; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const kode = String(row[0] || '').trim();
      const uraian = String(row[1] || '').trim();
      const anggaran = parseIndonesianNumber(row[2]);
      const realisasi = parseIndonesianNumber(row[3]);

      if (!kode || kode === 'undefined') continue;
      if (kode.startsWith('5')) continue; // Skip Belanja section
      if (kode.length !== 19) continue; // Skip subtotal

      recordsToInsert.push({
        tahun,
        bulan,
        kode_skpd: targetSkpdKode,
        nama_skpd: targetSkpdNama,
        kode_rekening: kode,
        nama_rekening: uraian,
        anggaran,
        realisasi,
        sumber_format: 'format2',
        uploaded_by: uploadedBy,
        uploaded_at: new Date().toISOString(),
        source_filename: filename
      });
    }

    if (recordsToInsert.length === 0) {
      return { success: false, insertedCount: 0, errors: ['File Excel Format 2 kosong atau tidak berisi rekening leaf pendapatan/pembiayaan'] };
    }

    // Delete then Insert for this SKPD, month, and Pendapatan/Pembiayaan
    await this.lraRepo.deleteScopePendapatanPembiayaan(tahun, bulan, targetSkpdKode);
    await this.lraRepo.insertMany(recordsToInsert);

    // Bootstrap prognosis records for Pendapatan/Pembiayaan
    await this.initializePrognosisRecordsForPendapatanPembiayaan(tahun, recordsToInsert);

    return { success: true, insertedCount: recordsToInsert.length, errors };
  }

  /**
   * Parse Format 3 Excel: Pendapatan & Pembiayaan, se-Pemda (wide table)
   */
  async parseFormat3(
    fileBuffer: Buffer,
    tahun: number,
    bulan: number,
    filename?: string,
    uploadedBy?: string
  ): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    const errors: string[] = [];

    if (rows.length < 3) {
      return { success: false, insertedCount: 0, errors: ['File Excel terlalu pendek untuk Format 3'] };
    }

    // Row 1 contains the raw SKPD names
    // Columns with SKPD data start from column E (col index 4), step 2
    const skpdRow = rows[0] || [];
    const headerSkpd: { [colIndex: number]: { kode: string; nama: string } } = {};

    for (let c = 4; c < skpdRow.length; c += 2) {
      const cellVal = String(skpdRow[c] || '').trim();
      if (!cellVal || cellVal.toUpperCase() === 'KONSOLIDASI' || cellVal.toUpperCase() === 'JUMLAH') {
        continue; // skip Consolidation column
      }

      const matched = await this.masterRepo.getSkpdByUraian(cellVal);
      if (!matched) {
        errors.push(`SKPD tidak ditemukan di master referensi: "${cellVal}" (kolom index ${c})`);
        continue;
      }

      headerSkpd[c] = {
        kode: matched.kode,
        nama: matched.uraian
      };
    }

    if (errors.length > 0) {
      return { success: false, insertedCount: 0, errors };
    }

    const recordsToInsert: DataLra[] = [];

    // Rows start from index 2 (row 3)
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const kode = String(row[0] || '').trim();
      const uraian = String(row[1] || '').trim();

      if (!kode || kode === 'undefined') continue;
      if (kode.startsWith('5')) continue; // Skip Belanja
      if (kode.length !== 19) continue; // Skip subtotal

      for (const colIdxStr of Object.keys(headerSkpd)) {
        const colIdx = Number(colIdxStr);
        const skpdInfo = headerSkpd[colIdx];
        
        const anggaran = parseIndonesianNumber(row[colIdx]);
        const realisasi = parseIndonesianNumber(row[colIdx + 1]);

        if (anggaran === 0 && realisasi === 0) continue; // skip zero lines for space optimization

        recordsToInsert.push({
          tahun,
          bulan,
          kode_skpd: skpdInfo.kode,
          nama_skpd: skpdInfo.nama,
          kode_rekening: kode,
          nama_rekening: uraian,
          anggaran,
          realisasi,
          sumber_format: 'format3',
          uploaded_by: uploadedBy,
          uploaded_at: new Date().toISOString(),
          source_filename: filename
        });
      }
    }

    if (recordsToInsert.length === 0) {
      return { success: false, insertedCount: 0, errors: ['File Excel Format 3 kosong atau tidak berisi rekening leaf'] };
    }

    // Delete scope Pendapatan/Pembiayaan for ALL SKPDs in this month
    await this.lraRepo.deleteScopePendapatanPembiayaan(tahun, bulan);
    await this.lraRepo.insertMany(recordsToInsert);

    // Bootstrap prognosis records
    await this.initializePrognosisRecordsForPendapatanPembiayaan(tahun, recordsToInsert);

    return { success: true, insertedCount: recordsToInsert.length, errors };
  }

  /**
   * Automatically initializes prognosis records for new uploaded Belanja leaf-level rows
   */
  private async initializePrognosisRecordsForBelanja(tahun: number, bulan: number, lraRecords: DataLra[]) {
    // We only prognosis Semester 2 (using June as base cumulative data, where month = 6)
    if (bulan !== 6) return;

    const prognosisRecords: DataPrognosisBelanja[] = lraRecords.map(rec => {
      const sisa = Math.max(0, rec.anggaran - rec.realisasi);
      return {
        kode_skpd: rec.kode_skpd,
        kode_sub_kegiatan: rec.kode_sub_kegiatan || 'UNKNOWN_SUB_KEG',
        kode_rekening: rec.kode_rekening,
        opsi_input: 'sisa',
        nilai: 0,
        nilai_prognosis: sisa,
        status: 'draft',
        locked: false,
        updated_at: new Date().toISOString()
      };
    });

    if (prognosisRecords.length > 0) {
      await this.prognosisRepo.saveBelanjaMany(prognosisRecords);
    }
  }

  /**
   * Automatically initializes prognosis records for new uploaded Pendapatan/Pembiayaan rows
   */
  private async initializePrognosisRecordsForPendapatanPembiayaan(tahun: number, lraRecords: DataLra[]) {
    const prognosisRecords: DataPrognosisPendapatanPembiayaan[] = lraRecords.map(rec => {
      const sisa = Math.max(0, rec.anggaran - rec.realisasi);
      return {
        kode_skpd: rec.kode_skpd,
        kode_rekening: rec.kode_rekening,
        opsi_input: 'sisa',
        nilai: 0,
        nilai_prognosis: sisa,
        status: 'draft',
        locked: false,
        updated_at: new Date().toISOString()
      };
    });

    if (prognosisRecords.length > 0) {
      await this.prognosisRepo.savePendapatanPembiayaanMany(prognosisRecords);
    }
  }

  /**
   * Retrieve hierarchical LRA report items
   */
  async getReportPerSkpd(tahun: number, bulan: number, kodeSkpd: string): Promise<LraReportItem[]> {
    const rawData = await this.lraRepo.getByPeriodAndSkpd(tahun, bulan, kodeSkpd);
    const masterRef = await this.masterRepo.getAll();
    const savedBelanja = await this.prognosisRepo.getBelanjaBySkpd(kodeSkpd);
    const savedPendPemb = await this.prognosisRepo.getPendapatanPembiayaanBySkpd(kodeSkpd);
    
    // Aggregate leaf data into a dynamic hierarchy
    return this.buildHierarchicalReport(rawData, masterRef, savedBelanja, savedPendPemb);
  }

  /**
   * Retrieve rekap level Pemda (until level 3)
   */
  async getRekapPemda(tahun: number, bulan: number): Promise<LraReportItem[]> {
    const rawData = await this.lraRepo.getByPeriodAndSkpd(tahun, bulan);
    const masterRef = await this.masterRepo.getAll();
    const savedBelanja = await this.prognosisRepo.getAllBelanja();
    const savedPendPemb = await this.prognosisRepo.getAllPendapatanPembiayaan();

    const mapBelanjaPrognosis = new Map<string, number>();
    for (const b of savedBelanja) {
      mapBelanjaPrognosis.set(`${b.kode_skpd}-${b.kode_sub_kegiatan}-${b.kode_rekening}`, b.nilai_prognosis);
    }
    const mapPendPembPrognosis = new Map<string, number>();
    for (const p of savedPendPemb) {
      mapPendPembPrognosis.set(`${p.kode_skpd}-${p.kode_rekening}`, p.nilai_prognosis);
    }

    const mapMaster = new Map(masterRef.map(m => [`${m.kode}-${m.jenis}`, m]));
    const getHierarchyName = (kode: string, level: number): string => {
      const lvlKode = kode.substring(0, level === 1 ? 1 : level === 2 ? 3 : level === 3 ? 6 : level === 4 ? 9 : 13);
      const ref = mapMaster.get(`${lvlKode}-rekening`);
      return ref ? ref.uraian : `Kelompok Akun ${lvlKode}`;
    };

    const level1Map = new Map<string, LraReportItem>();
    const level2Map = new Map<string, LraReportItem>();
    const level3Map = new Map<string, LraReportItem>();
    const level4Map = new Map<string, LraReportItem>();

    for (const d of rawData) {
      if (d.kode_rekening.length < 6) continue;

      const l1 = d.kode_rekening.substring(0, 1);
      const l2 = d.kode_rekening.substring(0, 3);
      const l3 = d.kode_rekening.substring(0, 6);
      const is42 = d.kode_rekening.startsWith('4.2');
      const l4 = is42 && d.kode_rekening.length >= 9 ? d.kode_rekening.substring(0, 9) : null;

      // Find prognosis
      let recordPrognosis = d.anggaran - d.realisasi;
      if (d.kode_rekening.startsWith('5')) {
        const key = `${d.kode_skpd}-${d.kode_sub_kegiatan || 'UNKNOWN'}-${d.kode_rekening}`;
        if (mapBelanjaPrognosis.has(key)) {
          recordPrognosis = mapBelanjaPrognosis.get(key)!;
        }
      } else {
        const key = `${d.kode_skpd}-${d.kode_rekening}`;
        if (mapPendPembPrognosis.has(key)) {
          recordPrognosis = mapPendPembPrognosis.get(key)!;
        }
      }

      // Aggregate L1
      if (!level1Map.has(l1)) {
        level1Map.set(l1, {
          kode: l1,
          uraian: l1 === '4' ? 'PENDAPATAN DAERAH' : l1 === '5' ? 'BELANJA DAERAH' : 'PEMBIAYAAN DAERAH',
          jenis: 'kelompok_besar',
          anggaran: 0,
          realisasi: 0,
          sisa_anggaran: 0,
          persentase: 0,
          prognosis: 0,
          children: []
        });
      }
      const node1 = level1Map.get(l1)!;
      node1.anggaran += d.anggaran;
      node1.realisasi += d.realisasi;
      node1.prognosis = (node1.prognosis || 0) + recordPrognosis;

      // Aggregate L2
      if (!level2Map.has(l2)) {
        level2Map.set(l2, {
          kode: l2,
          uraian: getHierarchyName(l2, 2),
          jenis: 'rekening_level2',
          anggaran: 0,
          realisasi: 0,
          sisa_anggaran: 0,
          persentase: 0,
          prognosis: 0,
          children: []
        });
      }
      const node2 = level2Map.get(l2)!;
      node2.anggaran += d.anggaran;
      node2.realisasi += d.realisasi;
      node2.prognosis = (node2.prognosis || 0) + recordPrognosis;

      // Aggregate L3
      if (!level3Map.has(l3)) {
        level3Map.set(l3, {
          kode: l3,
          uraian: getHierarchyName(l3, 3),
          jenis: 'rekening_level3',
          anggaran: 0,
          realisasi: 0,
          sisa_anggaran: 0,
          persentase: 0,
          prognosis: 0,
          children: []
        });
      }
      const node3 = level3Map.get(l3)!;
      node3.anggaran += d.anggaran;
      node3.realisasi += d.realisasi;
      node3.prognosis = (node3.prognosis || 0) + recordPrognosis;

      // Aggregate L4 if applicable
      if (l4) {
        if (!level4Map.has(l4)) {
          level4Map.set(l4, {
            kode: l4,
            uraian: getHierarchyName(l4, 4),
            jenis: 'rekening',
            anggaran: 0,
            realisasi: 0,
            sisa_anggaran: 0,
            persentase: 0,
            prognosis: 0
          });
        }
        const node4 = level4Map.get(l4)!;
        node4.anggaran += d.anggaran;
        node4.realisasi += d.realisasi;
        node4.prognosis = (node4.prognosis || 0) + recordPrognosis;
      }
    }

    // 1. Link Level 4 to Level 3
    for (const [l4, node4] of level4Map.entries()) {
      const l3 = l4.substring(0, 6);
      const parent3 = level3Map.get(l3);
      if (parent3) {
        if (!parent3.children) parent3.children = [];
        parent3.children.push(node4);
      }
    }

    // 2. Link Level 3 to Level 2
    for (const [l3, node3] of level3Map.entries()) {
      const l2 = l3.substring(0, 3);
      const parent2 = level2Map.get(l2);
      if (parent2) {
        if (!parent2.children) parent2.children = [];
        parent2.children.push(node3);
      }
    }

    // 3. Link Level 2 to Level 1
    for (const [l2, node2] of level2Map.entries()) {
      const l1 = l2.substring(0, 1);
      const parent1 = level1Map.get(l1);
      if (parent1) {
        if (!parent1.children) parent1.children = [];
        parent1.children.push(node2);
      }
    }

    const finalizeNode = (node: LraReportItem) => {
      node.sisa_anggaran = node.anggaran - node.realisasi;
      node.persentase = node.anggaran > 0 ? (node.realisasi / node.anggaran) * 100 : 0;
      if (node.children) {
        node.children.forEach(finalizeNode);
        node.children.sort((a, b) => a.kode.localeCompare(b.kode));
      }
    };

    const finalRoots: LraReportItem[] = [];
    for (const l1 of ['4', '5', '6']) {
      const node = level1Map.get(l1);
      if (node) {
        finalizeNode(node);
        finalRoots.push(node);
      }
    }

    return finalRoots;
  }

  private buildHierarchicalReport(
    rawData: DataLra[], 
    masterRef: MasterReference[],
    savedBelanja: DataPrognosisBelanja[] = [],
    savedPendPemb: DataPrognosisPendapatanPembiayaan[] = []
  ): LraReportItem[] {
    const rootItems: LraReportItem[] = [];

    const mapBelanjaPrognosis = new Map<string, number>();
    for (const b of savedBelanja) {
      mapBelanjaPrognosis.set(`${b.kode_sub_kegiatan}-${b.kode_rekening}`, b.nilai_prognosis);
    }
    const mapPendPembPrognosis = new Map<string, number>();
    for (const p of savedPendPemb) {
      mapPendPembPrognosis.set(p.kode_rekening, p.nilai_prognosis);
    }

    // Separate Belanja (rekening 5) vs Pendapatan/Pembiayaan (4, 6)
    const belanjaData = rawData.filter(r => r.kode_rekening.startsWith('5'));
    const nonBelanjaData = rawData.filter(r => r.kode_rekening.startsWith('4') || r.kode_rekening.startsWith('6'));

    // Process Belanja hierarchy (Urusan -> Bidang -> Program -> Kegiatan -> Sub Kegiatan -> Rekening)
    if (belanjaData.length > 0) {
      const belanjaRoot: LraReportItem = {
        kode: '5',
        uraian: 'BELANJA DAERAH',
        jenis: 'kelompok_besar',
        anggaran: 0,
        realisasi: 0,
        sisa_anggaran: 0,
        persentase: 0,
        prognosis: 0,
        children: []
      };

      const mapUrusan: { [kode: string]: LraReportItem } = {};

      for (const d of belanjaData) {
        const kdUr = d.kode_urusan || '0';
        const nmUr = d.nama_urusan || 'Urusan Lainnya';
        const kdBid = d.kode_bidang || '0.00';
        const nmBid = d.nama_bidang || 'Bidang Lainnya';
        const kdPrg = d.kode_program || '0.00.00';
        const nmPrg = d.nama_program || 'Program Lainnya';
        const kdKeg = d.kode_kegiatan || '0.00.00.0.00';
        const nmKeg = d.nama_kegiatan || 'Kegiatan Lainnya';
        const kdSub = d.kode_sub_kegiatan || '0.00.00.0.00.0000';
        const nmSub = d.nama_sub_kegiatan || 'Sub Kegiatan Lainnya';

        // 1. Urusan
        if (!mapUrusan[kdUr]) {
          mapUrusan[kdUr] = { kode: kdUr, uraian: nmUr, jenis: 'urusan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, prognosis: 0, children: [] };
        }
        const urItem = mapUrusan[kdUr];

        // 2. Bidang
        let bidItem = urItem.children!.find(x => x.kode === kdBid);
        if (!bidItem) {
          bidItem = { kode: kdBid, uraian: nmBid, jenis: 'bidang', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, prognosis: 0, children: [] };
          urItem.children!.push(bidItem);
        }

        // 3. Program
        let prgItem = bidItem.children!.find(x => x.kode === kdPrg);
        if (!prgItem) {
          prgItem = { kode: kdPrg, uraian: nmPrg, jenis: 'program', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, prognosis: 0, children: [] };
          bidItem.children!.push(prgItem);
        }

        // 4. Kegiatan
        let kegItem = prgItem.children!.find(x => x.kode === kdKeg);
        if (!kegItem) {
          kegItem = { kode: kdKeg, uraian: nmKeg, jenis: 'kegiatan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, prognosis: 0, children: [] };
          prgItem.children!.push(kegItem);
        }

        // 5. Sub Kegiatan
        let subItem = kegItem.children!.find(x => x.kode === kdSub);
        if (!subItem) {
          subItem = { kode: kdSub, uraian: nmSub, jenis: 'sub_kegiatan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, prognosis: 0, children: [] };
          kegItem.children!.push(subItem);
        }

        // 6. Rekening Leaf
        const key = `${kdSub}-${d.kode_rekening}`;
        const progVal = mapBelanjaPrognosis.has(key) ? mapBelanjaPrognosis.get(key)! : d.anggaran - d.realisasi;

        subItem.children!.push({
          kode: d.kode_rekening,
          uraian: d.nama_rekening,
          jenis: 'rekening',
          anggaran: d.anggaran,
          realisasi: d.realisasi,
          sisa_anggaran: d.anggaran - d.realisasi,
          persentase: d.anggaran > 0 ? (d.realisasi / d.anggaran) * 100 : 0,
          prognosis: progVal
        });
      }

      // Roll up subtotal sums recursively
      const rollup = (item: LraReportItem) => {
        if (!item.children || item.children.length === 0) return;
        
        item.anggaran = 0;
        item.realisasi = 0;
        item.sisa_anggaran = 0;
        item.prognosis = 0;

        for (const child of item.children) {
          rollup(child);
          item.anggaran += child.anggaran;
          item.realisasi += child.realisasi;
          item.sisa_anggaran += child.sisa_anggaran;
          item.prognosis += (child.prognosis || 0);
        }
        item.persentase = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
      };

      belanjaRoot.children = Object.values(mapUrusan);
      rollup(belanjaRoot);
      rootItems.push(belanjaRoot);
    }

    // Process Pendapatan & Pembiayaan hierarchy (flat or level 3 account rollups)
    if (nonBelanjaData.length > 0) {
      const groupRoots: { [kode: string]: LraReportItem } = {};

      const mapMaster = new Map(masterRef.map(m => [`${m.kode}-${m.jenis}`, m]));

      const getHierarchyName = (kode: string, level: number): string => {
        const lvlKode = kode.substring(0, level === 1 ? 1 : level === 2 ? 3 : level === 3 ? 6 : level === 4 ? 9 : 13);
        const ref = mapMaster.get(`${lvlKode}-rekening`);
        return ref ? ref.uraian : `Kelompok Akun ${lvlKode}`;
      };

      for (const d of nonBelanjaData) {
        const rootKode = d.kode_rekening.substring(0, 1); // 4 or 6
        if (!groupRoots[rootKode]) {
          groupRoots[rootKode] = {
            kode: rootKode,
            uraian: rootKode === '4' ? 'PENDAPATAN DAERAH' : 'PEMBIAYAAN DAERAH',
            jenis: 'kelompok_besar',
            anggaran: 0,
            realisasi: 0,
            sisa_anggaran: 0,
            persentase: 0,
            prognosis: 0,
            children: []
          };
        }
        const groupRoot = groupRoots[rootKode];

        // Level 2 (Jenis)
        const lvl2Kode = d.kode_rekening.substring(0, 3);
        let lvl2Item = groupRoot.children!.find(x => x.kode === lvl2Kode);
        if (!lvl2Item) {
          lvl2Item = {
            kode: lvl2Kode,
            uraian: getHierarchyName(d.kode_rekening, 2),
            jenis: 'rekening_level2',
            anggaran: 0,
            realisasi: 0,
            sisa_anggaran: 0,
            persentase: 0,
            prognosis: 0,
            children: []
          };
          groupRoot.children!.push(lvl2Item);
        }

        // Level 3 (Kelompok)
        const lvl3Kode = d.kode_rekening.substring(0, 6);
        let lvl3Item = lvl2Item.children!.find(x => x.kode === lvl3Kode);
        if (!lvl3Item) {
          lvl3Item = {
            kode: lvl3Kode,
            uraian: getHierarchyName(d.kode_rekening, 3),
            jenis: 'rekening_level3',
            anggaran: 0,
            realisasi: 0,
            sisa_anggaran: 0,
            persentase: 0,
            prognosis: 0,
            children: []
          };
          lvl2Item.children!.push(lvl3Item);
        }

        // Level 4 (Sub Kelompok/Leaf)
        const key = d.kode_rekening;
        const progVal = mapPendPembPrognosis.has(key) ? mapPendPembPrognosis.get(key)! : d.anggaran - d.realisasi;

        lvl3Item.children!.push({
          kode: d.kode_rekening,
          uraian: d.nama_rekening,
          jenis: 'rekening',
          anggaran: d.anggaran,
          realisasi: d.realisasi,
          sisa_anggaran: d.anggaran - d.realisasi,
          persentase: d.anggaran > 0 ? (d.realisasi / d.anggaran) * 100 : 0,
          prognosis: progVal
        });
      }

      // Roll up subtotal sums recursively
      const rollup = (item: LraReportItem) => {
        if (!item.children || item.children.length === 0) return;
        
        item.anggaran = 0;
        item.realisasi = 0;
        item.sisa_anggaran = 0;
        item.prognosis = 0;

        for (const child of item.children) {
          rollup(child);
          item.anggaran += child.anggaran;
          item.realisasi += child.realisasi;
          item.sisa_anggaran += child.sisa_anggaran;
          item.prognosis += (child.prognosis || 0);
        }
        item.persentase = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
      };

      for (const k of Object.keys(groupRoots)) {
        const root = groupRoots[k];
        rollup(root);
        rootItems.push(root);
      }
    }

    return rootItems;
  }
}

export class PrognosisUseCase {
  constructor(
    private prognosisRepo: IPrognosisRepository,
    private lraRepo: ILraRepository
  ) {}

  /**
   * Fetch detailed prognosis table for an SKPD
   */
  async getPrognosisData(kodeSkpd: string, tahun: number): Promise<{
    belanja: DataPrognosisBelanja[];
    pendapatanPembiayaan: DataPrognosisPendapatanPembiayaan[];
  }> {
    // 1. Get already saved prognosis values
    let savedBelanja = await this.prognosisRepo.getBelanjaBySkpd(kodeSkpd);
    let savedPendPemb = await this.prognosisRepo.getPendapatanPembiayaanBySkpd(kodeSkpd);

    // 2. If prognosis is empty, pull base cumulative values from June (month = 6) LRA to populate
    if (savedBelanja.length === 0) {
      const juneBelanja = await this.lraRepo.getLeafRecordsForPrognosisBelanja(tahun, 6, kodeSkpd);
      savedBelanja = juneBelanja.map(rec => {
        const sisa = Math.max(0, rec.anggaran - rec.realisasi);
        return {
          kode_skpd: rec.kode_skpd,
          kode_sub_kegiatan: rec.kode_sub_kegiatan || 'UNKNOWN',
          kode_rekening: rec.kode_rekening,
          opsi_input: 'sisa',
          nilai: 0,
          nilai_prognosis: sisa,
          status: 'draft',
          locked: false,
          updated_at: new Date().toISOString()
        };
      });
      if (savedBelanja.length > 0) {
        await this.prognosisRepo.saveBelanjaMany(savedBelanja);
      }
    }

    if (savedPendPemb.length === 0) {
      const junePendPemb = await this.lraRepo.getLeafRecordsForPrognosisPendapatanPembiayaan(tahun, 6, kodeSkpd);
      savedPendPemb = junePendPemb.map(rec => {
        const sisa = Math.max(0, rec.anggaran - rec.realisasi);
        return {
          kode_skpd: rec.kode_skpd,
          kode_rekening: rec.kode_rekening,
          opsi_input: 'sisa',
          nilai: 0,
          nilai_prognosis: sisa,
          status: 'draft',
          locked: false,
          updated_at: new Date().toISOString()
        };
      });
      if (savedPendPemb.length > 0) {
        await this.prognosisRepo.savePendapatanPembiayaanMany(savedPendPemb);
      }
    }

    return {
      belanja: savedBelanja,
      pendapatanPembiayaan: savedPendPemb
    };
  }

  /**
   * Save draft changes of prognosis record for Belanja
   */
  async updateBelanjaPrognosis(
    kodeSkpd: string,
    kodeSubKegiatan: string,
    kodeRekening: string,
    opsiInput: 'sisa' | 'tambah_kurang' | 'fix',
    nilai: number,
    anggaran: number,
    realisasi: number,
    user: string
  ): Promise<void> {
    // Recalculate based on formula
    let nilaiPrognosis = 0;
    if (opsiInput === 'sisa') {
      nilaiPrognosis = anggaran - realisasi;
    } else if (opsiInput === 'tambah_kurang') {
      nilaiPrognosis = anggaran - realisasi + nilai;
    } else if (opsiInput === 'fix') {
      nilaiPrognosis = nilai;
    }

    await this.prognosisRepo.updateBelanjaRecord({
      kode_skpd: kodeSkpd,
      kode_sub_kegiatan: kodeSubKegiatan,
      kode_rekening: kodeRekening,
      opsi_input: opsiInput,
      nilai,
      nilai_prognosis: Math.max(0, nilaiPrognosis), // prevent negative values
      updated_by: user,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Save draft changes of prognosis record for Pendapatan/Pembiayaan
   */
  async updatePendapatanPembiayaanPrognosis(
    kodeSkpd: string,
    kodeRekening: string,
    opsiInput: 'sisa' | 'tambah_kurang' | 'fix',
    nilai: number,
    anggaran: number,
    realisasi: number,
    user: string
  ): Promise<void> {
    let nilaiPrognosis = 0;
    if (opsiInput === 'sisa') {
      nilaiPrognosis = anggaran - realisasi;
    } else if (opsiInput === 'tambah_kurang') {
      nilaiPrognosis = anggaran - realisasi + nilai;
    } else if (opsiInput === 'fix') {
      nilaiPrognosis = nilai;
    }

    await this.prognosisRepo.updatePendapatanPembiayaanRecord({
      kode_skpd: kodeSkpd,
      kode_rekening: kodeRekening,
      opsi_input: opsiInput,
      nilai,
      nilai_prognosis: Math.max(0, nilaiPrognosis),
      updated_by: user,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Lock & Submit SKPD prognosis
   */
  async submitPrognosis(kodeSkpd: string, user: string): Promise<void> {
    await this.prognosisRepo.lockUnlockSkpdBelanja(kodeSkpd, true, 'submitted', user);
    await this.prognosisRepo.lockUnlockSkpdPendapatanPembiayaan(kodeSkpd, true, 'submitted', user);
  }

  /**
   * Unlock SKPD prognosis (only for Admin/Pemda role)
   */
  async unlockPrognosis(kodeSkpd: string, user: string): Promise<void> {
    await this.prognosisRepo.lockUnlockSkpdBelanja(kodeSkpd, false, 'draft', user);
    await this.prognosisRepo.lockUnlockSkpdPendapatanPembiayaan(kodeSkpd, false, 'draft', user);
  }
}
