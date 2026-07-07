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
          const f_ang = Number(row[5] || 0);
          const h_ang = Number(row[7] || 0);
          const j_ang = Number(row[9] || 0);
          const l_ang = Number(row[11] || 0);
          const anggaran = f_ang + h_ang + j_ang + l_ang;

          // Realisasi = G + I + K + M (indices 6, 8, 10, 12)
          const g_rea = Number(row[6] || 0);
          const i_rea = Number(row[8] || 0);
          const k_rea = Number(row[10] || 0);
          const m_rea = Number(row[12] || 0);
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
      const anggaran = Number(row[2] || 0);
      const realisasi = Number(row[3] || 0);

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
        
        const anggaran = Number(row[colIdx] || 0);
        const realisasi = Number(row[colIdx + 1] || 0);

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
    
    // Aggregate leaf data into a dynamic hierarchy
    return this.buildHierarchicalReport(rawData, masterRef);
  }

  /**
   * Retrieve rekap level Pemda (until level 3)
   */
  async getRekapPemda(tahun: number, bulan: number): Promise<LraReportItem[]> {
    const rawData = await this.lraRepo.getByPeriodAndSkpd(tahun, bulan);
    const masterRef = await this.masterRepo.getAll();

    // Group only by level 3 accounts
    const mapLevel3: { [kode: string]: { uraian: string; anggaran: number; realisasi: number } } = {};

    // Map each leaf account to its level 3 parent
    const getLevel3Parent = (kode: string): { kode: string; uraian: string } | null => {
      if (kode.length < 6) return null;
      const lvl3Kode = kode.substring(0, 6);
      const master = masterRef.find(m => m.kode === lvl3Kode && m.jenis === 'rekening');
      return {
        kode: lvl3Kode,
        uraian: master ? master.uraian : `Rekening Golongan ${lvl3Kode}`
      };
    };

    const getLevel1Parent = (kode: string): { kode: string; uraian: string } | null => {
      const lvl1Kode = kode.substring(0, 1);
      const master = masterRef.find(m => m.kode === lvl1Kode && m.jenis === 'rekening');
      return {
        kode: lvl1Kode,
        uraian: master ? master.uraian : `Kelompok Akun ${lvl1Kode}`
      };
    };

    for (const d of rawData) {
      const parent3 = getLevel3Parent(d.kode_rekening);
      if (!parent3) continue;

      if (!mapLevel3[parent3.kode]) {
        mapLevel3[parent3.kode] = {
          uraian: parent3.uraian,
          anggaran: 0,
          realisasi: 0
        };
      }
      mapLevel3[parent3.kode].anggaran += d.anggaran;
      mapLevel3[parent3.kode].realisasi += d.realisasi;
    }

    const list: LraReportItem[] = Object.keys(mapLevel3).map(kode => {
      const item = mapLevel3[kode];
      const sisa = item.anggaran - item.realisasi;
      const persentase = item.anggaran > 0 ? (item.realisasi / item.anggaran) * 100 : 0;
      return {
        kode,
        uraian: item.uraian,
        jenis: 'rekening',
        anggaran: item.anggaran,
        realisasi: item.realisasi,
        sisa_anggaran: sisa,
        persentase
      };
    });

    // Group under their level 1 parents (4 for Income, 5 for Expense, 6 for Finance)
    const level1Groups: { [kode: string]: LraReportItem } = {};
    for (const item of list) {
      const parent1 = getLevel1Parent(item.kode);
      if (!parent1) continue;

      if (!level1Groups[parent1.kode]) {
        level1Groups[parent1.kode] = {
          kode: parent1.kode,
          uraian: parent1.uraian,
          jenis: 'kelompok_besar',
          anggaran: 0,
          realisasi: 0,
          sisa_anggaran: 0,
          persentase: 0,
          children: []
        };
      }
      const group = level1Groups[parent1.kode];
      group.anggaran += item.anggaran;
      group.realisasi += item.realisasi;
      group.sisa_anggaran += item.sisa_anggaran;
      group.children!.push(item);
    }

    // Recalculate percent for parent groups
    return Object.values(level1Groups).map(g => {
      g.persentase = g.anggaran > 0 ? (g.realisasi / g.anggaran) * 100 : 0;
      g.children!.sort((a, b) => a.kode.localeCompare(b.kode));
      return g;
    });
  }

  private buildHierarchicalReport(rawData: DataLra[], masterRef: MasterReference[]): LraReportItem[] {
    const rootItems: LraReportItem[] = [];

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
          mapUrusan[kdUr] = { kode: kdUr, uraian: nmUr, jenis: 'urusan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, children: [] };
        }
        const urItem = mapUrusan[kdUr];

        // 2. Bidang
        let bidItem = urItem.children!.find(x => x.kode === kdBid);
        if (!bidItem) {
          bidItem = { kode: kdBid, uraian: nmBid, jenis: 'bidang', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, children: [] };
          urItem.children!.push(bidItem);
        }

        // 3. Program
        let prgItem = bidItem.children!.find(x => x.kode === kdPrg);
        if (!prgItem) {
          prgItem = { kode: kdPrg, uraian: nmPrg, jenis: 'program', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, children: [] };
          bidItem.children!.push(prgItem);
        }

        // 4. Kegiatan
        let kegItem = prgItem.children!.find(x => x.kode === kdKeg);
        if (!kegItem) {
          kegItem = { kode: kdKeg, uraian: nmKeg, jenis: 'kegiatan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, children: [] };
          prgItem.children!.push(kegItem);
        }

        // 5. Sub Kegiatan
        let subItem = kegItem.children!.find(x => x.kode === kdSub);
        if (!subItem) {
          subItem = { kode: kdSub, uraian: nmSub, jenis: 'sub_kegiatan', anggaran: 0, realisasi: 0, sisa_anggaran: 0, persentase: 0, children: [] };
          kegItem.children!.push(subItem);
        }

        // 6. Rekening Leaf
        subItem.children!.push({
          kode: d.kode_rekening,
          uraian: d.nama_rekening,
          jenis: 'rekening',
          anggaran: d.anggaran,
          realisasi: d.realisasi,
          sisa_anggaran: d.anggaran - d.realisasi,
          persentase: d.anggaran > 0 ? (d.realisasi / d.anggaran) * 100 : 0
        });
      }

      // Roll up subtotal sums recursively
      const rollup = (item: LraReportItem) => {
        if (!item.children || item.children.length === 0) return;
        
        item.anggaran = 0;
        item.realisasi = 0;
        item.sisa_anggaran = 0;

        for (const child of item.children) {
          rollup(child);
          item.anggaran += child.anggaran;
          item.realisasi += child.realisasi;
          item.sisa_anggaran += child.sisa_anggaran;
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
            children: []
          };
          lvl2Item.children!.push(lvl3Item);
        }

        // Level 4 (Sub Kelompok/Leaf)
        lvl3Item.children!.push({
          kode: d.kode_rekening,
          uraian: d.nama_rekening,
          jenis: 'rekening',
          anggaran: d.anggaran,
          realisasi: d.realisasi,
          sisa_anggaran: d.anggaran - d.realisasi,
          persentase: d.anggaran > 0 ? (d.realisasi / d.anggaran) * 100 : 0
        });
      }

      // Roll up subtotal sums recursively
      const rollup = (item: LraReportItem) => {
        if (!item.children || item.children.length === 0) return;
        
        item.anggaran = 0;
        item.realisasi = 0;
        item.sisa_anggaran = 0;

        for (const child of item.children) {
          rollup(child);
          item.anggaran += child.anggaran;
          item.realisasi += child.realisasi;
          item.sisa_anggaran += child.sisa_anggaran;
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
