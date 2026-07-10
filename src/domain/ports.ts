import { DataLra, DataPrognosisBelanja, DataPrognosisPendapatanPembiayaan, MasterReference, LraReportItem } from '../types';

export interface IMasterRepository {
  getAll(): Promise<MasterReference[]>;
  getByJenis(jenis: MasterReference['jenis']): Promise<MasterReference[]>;
  getSkpdByUraian(uraian: string): Promise<MasterReference | null>;
  getByKodeAndJenis(kode: string, jenis: MasterReference['jenis']): Promise<MasterReference | null>;
  saveMany(records: MasterReference[]): Promise<void>;
  clearAll(): Promise<void>;
}

export interface ILraRepository {
  insertMany(records: DataLra[]): Promise<void>;
  deleteScopeBelanja(tahun: number, bulan: number, kodeSkpd?: string): Promise<void>;
  deleteScopePendapatanPembiayaan(tahun: number, bulan: number, kodeSkpd?: string): Promise<void>;
  getByPeriodAndSkpd(tahun: number, bulan: number, kodeSkpd?: string): Promise<DataLra[]>;
  getLeafRecordsForPrognosisBelanja(tahun: number, bulan: number, kodeSkpd: string): Promise<DataLra[]>;
  getLeafRecordsForPrognosisPendapatanPembiayaan(tahun: number, bulan: number, kodeSkpd: string): Promise<DataLra[]>;
}

export interface IPrognosisRepository {
  getBelanjaBySkpd(kodeSkpd: string): Promise<DataPrognosisBelanja[]>;
  getPendapatanPembiayaanBySkpd(kodeSkpd: string): Promise<DataPrognosisPendapatanPembiayaan[]>;
  getAllBelanja(): Promise<DataPrognosisBelanja[]>;
  getAllPendapatanPembiayaan(): Promise<DataPrognosisPendapatanPembiayaan[]>;
  saveBelanjaMany(records: DataPrognosisBelanja[]): Promise<void>;
  savePendapatanPembiayaanMany(records: DataPrognosisPendapatanPembiayaan[]): Promise<void>;
  updateBelanjaRecord(record: Partial<DataPrognosisBelanja> & { kode_skpd: string, kode_sub_kegiatan: string, kode_rekening: string }): Promise<void>;
  updatePendapatanPembiayaanRecord(record: Partial<DataPrognosisPendapatanPembiayaan> & { kode_skpd: string, kode_rekening: string }): Promise<void>;
  lockUnlockSkpdBelanja(kodeSkpd: string, locked: boolean, status: 'draft' | 'submitted', updatedBy?: string): Promise<void>;
  lockUnlockSkpdPendapatanPembiayaan(kodeSkpd: string, locked: boolean, status: 'draft' | 'submitted', updatedBy?: string): Promise<void>;
}
