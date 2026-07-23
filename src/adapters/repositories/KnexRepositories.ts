import { db } from '../../db/knex';
import { IMasterRepository, ILraRepository, IPrognosisRepository } from '../../domain/ports';
import { DataLra, DataPrognosisBelanja, DataPrognosisPendapatanPembiayaan, MasterReference } from '../../types';

// Normalization function to compare SKPD names robustly
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toString()
    .replace(/[\xa0\s]+/g, ' ') // replace non-breaking space & double spaces
    .trim()
    .toUpperCase()
    .replace(/^PEMERINTAH KABUPATEN KEDIRI\s*/i, '')
    .replace(/^(DINAS|BADAN|KANTOR|BAGIAN|KECAMATAN)\s+/i, '')
    .trim();
}

export class KnexMasterRepository implements IMasterRepository {
  async getAll(): Promise<MasterReference[]> {
    return await db<MasterReference>('master_referensi').select('*');
  }

  async getByJenis(jenis: MasterReference['jenis']): Promise<MasterReference[]> {
    return await db<MasterReference>('master_referensi').where({ jenis }).select('*');
  }

  async getSkpdByUraian(uraian: string): Promise<MasterReference | null> {
    const skpds = await this.getByJenis('skpd');
    const targetNorm = normalizeName(uraian);
    
    // First try: exact normalized match
    let match = skpds.find(s => normalizeName(s.uraian) === targetNorm);
    if (match) return match;

    // Second try: fuzzy containment match
    match = skpds.find(s => {
      const sNorm = normalizeName(s.uraian);
      return sNorm.includes(targetNorm) || targetNorm.includes(sNorm);
    });

    return match || null;
  }

  async getByKodeAndJenis(kode: string, jenis: MasterReference['jenis']): Promise<MasterReference | null> {
    const row = await db<MasterReference>('master_referensi')
      .where({ kode, jenis })
      .first();
    return row || null;
  }

  async saveMany(records: MasterReference[]): Promise<void> {
    // SQLite can handle batch upserts via onConflict
    await db.transaction(async (trx) => {
      // Chunk insertions because SQLite has limit on variable bindings (999 or 32766)
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await trx('master_referensi')
          .insert(chunk)
          .onConflict(['kode', 'jenis'])
          .merge();
      }
    });
  }

  async clearAll(): Promise<void> {
    await db('master_referensi').truncate();
  }
}

export class KnexLraRepository implements ILraRepository {
  async insertMany(records: DataLra[]): Promise<void> {
    await db.transaction(async (trx) => {
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await trx('data_lra').insert(chunk);
      }
    });
  }

  async deleteScopeBelanja(tahun: number, bulan: number, kodeSkpd?: string): Promise<void> {
    const query = db('data_lra')
      .where('tahun', tahun)
      .where('bulan', bulan)
      .where('kode_rekening', 'like', '5%');
    
    if (kodeSkpd) {
      query.where('kode_skpd', kodeSkpd);
    }
    
    await query.delete();
  }

  async deleteScopePendapatanPembiayaan(tahun: number, bulan: number, kodeSkpd?: string): Promise<void> {
    const query = db('data_lra')
      .where('tahun', tahun)
      .where('bulan', bulan)
      .where((qb) => {
        qb.where('kode_rekening', 'like', '4%')
          .orWhere('kode_rekening', 'like', '6%');
      });
    
    if (kodeSkpd) {
      query.where('kode_skpd', kodeSkpd);
    }
    
    await query.delete();
  }

  async getByPeriodAndSkpd(tahun: number, bulan: number, kodeSkpd?: string): Promise<DataLra[]> {
    const query = db<DataLra>('data_lra')
      .where('tahun', tahun)
      .where('bulan', bulan);
    
    if (kodeSkpd) {
      query.where('kode_skpd', kodeSkpd);
    }
    
    return await query.select('*');
  }

  async getLeafRecordsForPrognosisBelanja(tahun: number, bulan: number, kodeSkpd: string): Promise<DataLra[]> {
    return await db<DataLra>('data_lra')
      .where('tahun', tahun)
      .where('bulan', bulan)
      .where('kode_skpd', kodeSkpd)
      .where('kode_rekening', 'like', '5%')
      .select('*');
  }

  async getLeafRecordsForPrognosisPendapatanPembiayaan(tahun: number, bulan: number, kodeSkpd: string): Promise<DataLra[]> {
    return await db<DataLra>('data_lra')
      .where('tahun', tahun)
      .where('bulan', bulan)
      .where('kode_skpd', kodeSkpd)
      .where((qb) => {
        qb.where('kode_rekening', 'like', '4%')
          .orWhere('kode_rekening', 'like', '6%');
      })
      .select('*');
  }
}

export class KnexPrognosisRepository implements IPrognosisRepository {
  async getBelanjaBySkpd(kodeSkpd: string): Promise<DataPrognosisBelanja[]> {
    return await db<DataPrognosisBelanja>('data_prognosis_belanja')
      .where('kode_skpd', kodeSkpd)
      .select('*');
  }

  async getPendapatanPembiayaanBySkpd(kodeSkpd: string): Promise<DataPrognosisPendapatanPembiayaan[]> {
    return await db<DataPrognosisPendapatanPembiayaan>('data_prognosis_pendapatan_pembiayaan')
      .where('kode_skpd', kodeSkpd)
      .select('*');
  }

  async getAllBelanja(): Promise<DataPrognosisBelanja[]> {
    return await db<DataPrognosisBelanja>('data_prognosis_belanja').select('*');
  }

  async getAllPendapatanPembiayaan(): Promise<DataPrognosisPendapatanPembiayaan[]> {
    return await db<DataPrognosisPendapatanPembiayaan>('data_prognosis_pendapatan_pembiayaan').select('*');
  }

  async findBelanjaBySkpdAndSubKegiatanAndRekening(
    kodeSkpd: string,
    kodeSubKegiatan: string,
    kodeRekening: string
  ): Promise<DataPrognosisBelanja | null> {
    const row = await db<DataPrognosisBelanja>('data_prognosis_belanja')
      .where({
        kode_skpd: kodeSkpd,
        kode_sub_kegiatan: kodeSubKegiatan,
        kode_rekening: kodeRekening
      })
      .first();
    return row || null;
  }

  async findPendapatanPembiayaanBySkpdAndRekening(
    kodeSkpd: string,
    kodeRekening: string
  ): Promise<DataPrognosisPendapatanPembiayaan | null> {
    const row = await db<DataPrognosisPendapatanPembiayaan>('data_prognosis_pendapatan_pembiayaan')
      .where({
        kode_skpd: kodeSkpd,
        kode_rekening: kodeRekening
      })
      .first();
    return row || null;
  }

  async saveBelanjaMany(records: DataPrognosisBelanja[]): Promise<void> {
    await db.transaction(async (trx) => {
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await trx('data_prognosis_belanja')
          .insert(chunk)
          .onConflict(['kode_skpd', 'kode_sub_kegiatan', 'kode_rekening'])
          .merge();
      }
    });
  }

  async savePendapatanPembiayaanMany(records: DataPrognosisPendapatanPembiayaan[]): Promise<void> {
    await db.transaction(async (trx) => {
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await trx('data_prognosis_pendapatan_pembiayaan')
          .insert(chunk)
          .onConflict(['kode_skpd', 'kode_rekening'])
          .merge();
      }
    });
  }

  async updateBelanjaRecord(record: Partial<DataPrognosisBelanja> & { kode_skpd: string, kode_sub_kegiatan: string, kode_rekening: string }): Promise<void> {
    const { kode_skpd, kode_sub_kegiatan, kode_rekening, ...rest } = record;
    await db('data_prognosis_belanja')
      .where({ kode_skpd, kode_sub_kegiatan, kode_rekening })
      .update(rest);
  }

  async updatePendapatanPembiayaanRecord(record: Partial<DataPrognosisPendapatanPembiayaan> & { kode_skpd: string, kode_rekening: string }): Promise<void> {
    const { kode_skpd, kode_rekening, ...rest } = record;
    await db('data_prognosis_pendapatan_pembiayaan')
      .where({ kode_skpd, kode_rekening })
      .update(rest);
  }

  async lockUnlockSkpdBelanja(kodeSkpd: string, locked: boolean, status: 'draft' | 'submitted', updatedBy?: string): Promise<void> {
    await db('data_prognosis_belanja')
      .where('kode_skpd', kodeSkpd)
      .update({
        locked: locked ? 1 : 0,
        status,
        updated_by: updatedBy || null,
        updated_at: new Date().toISOString()
      });
  }

  async lockUnlockSkpdPendapatanPembiayaan(kodeSkpd: string, locked: boolean, status: 'draft' | 'submitted', updatedBy?: string): Promise<void> {
    await db('data_prognosis_pendapatan_pembiayaan')
      .where('kode_skpd', kodeSkpd)
      .update({
        locked: locked ? 1 : 0,
        status,
        updated_by: updatedBy || null,
        updated_at: new Date().toISOString()
      });
  }
}
