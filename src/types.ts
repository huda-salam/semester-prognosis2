/**
 * Shared Type Definitions for LRA Uploader and Prognosis
 */

export interface MasterReference {
  kode: string;
  uraian: string;
  jenis: 'urusan' | 'bidang' | 'skpd' | 'program' | 'kegiatan' | 'sub_kegiatan' | 'rekening';
  level?: number;
  parent?: string | null;
}

export interface DataLra {
  id?: number;
  tahun: number;
  bulan: number;
  kode_skpd: string;
  nama_skpd: string;
  kode_urusan?: string | null;
  nama_urusan?: string | null;
  kode_bidang?: string | null;
  nama_bidang?: string | null;
  kode_program?: string | null;
  nama_program?: string | null;
  kode_kegiatan?: string | null;
  nama_kegiatan?: string | null;
  kode_sub_kegiatan?: string | null;
  nama_sub_kegiatan?: string | null;
  kode_rekening: string;
  nama_rekening: string;
  anggaran: number;
  realisasi: number;
  sumber_format: 'format1' | 'format2' | 'format3';
  uploaded_by?: string | null;
  uploaded_at: string;
  source_filename?: string | null;
}

export interface DataPrognosisBelanja {
  kode_skpd: string;
  kode_sub_kegiatan: string;
  kode_rekening: string;
  opsi_input: 'sisa' | 'tambah_kurang' | 'fix';
  nilai: number;
  nilai_prognosis: number;
  status: 'draft' | 'submitted';
  locked: boolean;
  updated_by?: string | null;
  updated_at: string;
}

export interface DataPrognosisPendapatanPembiayaan {
  kode_skpd: string;
  kode_rekening: string;
  opsi_input: 'sisa' | 'tambah_kurang' | 'fix';
  nilai: number;
  nilai_prognosis: number;
  status: 'draft' | 'submitted';
  locked: boolean;
  updated_by?: string | null;
  updated_at: string;
}

export type OpsiInputPrognosis = 'sisa' | 'tambah_kurang' | 'fix';

export interface LraReportItem {
  kode: string;
  uraian: string;
  jenis: string;
  anggaran: number;
  realisasi: number;
  sisa_anggaran: number;
  persentase: number;
  children?: LraReportItem[];
}
