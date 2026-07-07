import { Request, Response, Router } from 'express';
import { db } from '../../db/knex';
import { KnexMasterRepository, KnexLraRepository, KnexPrognosisRepository } from '../repositories/KnexRepositories';
import { MasterUseCase, LraUseCase, PrognosisUseCase } from '../../domain/usecases';

export function createApiRouter(): Router {
  const router = Router();

  // Instantiate Repositories
  const masterRepo = new KnexMasterRepository();
  const lraRepo = new KnexLraRepository();
  const prognosisRepo = new KnexPrognosisRepository();

  // Instantiate Use Cases
  const masterUseCase = new MasterUseCase(masterRepo);
  const lraUseCase = new LraUseCase(lraRepo, masterRepo, prognosisRepo);
  const prognosisUseCase = new PrognosisUseCase(prognosisRepo, lraRepo);

  /**
   * GET /api/master
   * Get all master references
   */
  router.get('/master', async (req: Request, res: Response): Promise<void> => {
    try {
      const { jenis } = req.query;
      let data;
      if (jenis) {
        data = await masterRepo.getByJenis(jenis as any);
      } else {
        data = await masterUseCase.getAllMasterReferences();
      }
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/upload-master
   * Upload master reference data from Excel
   */
  router.post('/upload-master', async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) {
        res.status(400).json({ success: false, error: 'File data is required (base64)' });
        return;
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const result = await masterUseCase.parseAndSaveMasterExcel(buffer);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/upload-lra
   * Upload LRA Excel based on format 1, 2, or 3
   */
  router.post('/upload-lra', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        fileBase64,
        filename,
        sumber_format, // format1 | format2 | format3
        tahun,
        bulan,
        role, // skpd | pemda
        kode_skpd_uploader,
        user
      } = req.body;

      if (!fileBase64) {
        res.status(400).json({ success: false, error: 'File Excel (base64) wajib diunggah' });
        return;
      }
      if (!tahun || !sumber_format) {
        res.status(400).json({ success: false, error: 'Tahun dan Format wajib ditentukan' });
        return;
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const yr = Number(tahun);
      const mth = Number(bulan || 6); // default to June if not provided

      let result;

      if (sumber_format === 'format1') {
        result = await lraUseCase.parseFormat1(
          buffer,
          yr,
          mth,
          role || 'pemda',
          kode_skpd_uploader,
          filename,
          user || 'system'
        );
      } else if (sumber_format === 'format2') {
        result = await lraUseCase.parseFormat2(
          buffer,
          yr,
          role || 'pemda',
          kode_skpd_uploader,
          filename,
          user || 'system'
        );
      } else if (sumber_format === 'format3') {
        result = await lraUseCase.parseFormat3(
          buffer,
          yr,
          mth,
          filename,
          user || 'system'
        );
      } else {
        res.status(400).json({ success: false, error: 'Format sumber tidak dikenal' });
        return;
      }

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: `Gagal memproses berkas Excel: ${error.message}` });
    }
  });

  /**
   * GET /api/report/skpd
   * Fetch hierarchical report for an SKPD
   */
  router.get('/report/skpd', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tahun, bulan, kode_skpd } = req.query;
      if (!tahun || !bulan || !kode_skpd) {
        res.status(400).json({ success: false, error: 'tahun, bulan, dan kode_skpd wajib diisi' });
        return;
      }

      const report = await lraUseCase.getReportPerSkpd(
        Number(tahun),
        Number(bulan),
        kode_skpd as string
      );
      res.json({ success: true, data: report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/report/pemda
   * Fetch level Pemda rekap report (aggregated at level 3)
   */
  router.get('/report/pemda', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tahun, bulan } = req.query;
      if (!tahun || !bulan) {
        res.status(400).json({ success: false, error: 'tahun dan bulan wajib diisi' });
        return;
      }

      const report = await lraUseCase.getRekapPemda(Number(tahun), Number(bulan));
      res.json({ success: true, data: report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/prognosis
   * Fetch prognosis workspace for SKPD
   */
  router.get('/prognosis', async (req: Request, res: Response): Promise<void> => {
    try {
      const { kode_skpd, tahun } = req.query;
      if (!kode_skpd || !tahun) {
        res.status(400).json({ success: false, error: 'kode_skpd dan tahun wajib diisi' });
        return;
      }

      const data = await prognosisUseCase.getPrognosisData(kode_skpd as string, Number(tahun));
      
      // Fetch June (month=6) LRA records to join the base values
      const juneBelanja = await lraRepo.getLeafRecordsForPrognosisBelanja(Number(tahun), 6, kode_skpd as string);
      const junePendPemb = await lraRepo.getLeafRecordsForPrognosisPendapatanPembiayaan(Number(tahun), 6, kode_skpd as string);

      // Create maps for quick O(1) matching
      const mapBelanja = new Map<string, typeof juneBelanja[0]>();
      for (const b of juneBelanja) {
        mapBelanja.set(`${b.kode_sub_kegiatan}-${b.kode_rekening}`, b);
      }

      const mapPendPemb = new Map<string, typeof junePendPemb[0]>();
      for (const p of junePendPemb) {
        mapPendPemb.set(p.kode_rekening, p);
      }

      // Join
      const enrichedBelanja = data.belanja.map(b => {
        const base = mapBelanja.get(`${b.kode_sub_kegiatan}-${b.kode_rekening}`);
        return {
          ...b,
          nama_rekening: base?.nama_rekening || 'Rekening Belanja',
          nama_sub_kegiatan: base?.nama_sub_kegiatan || 'Sub Kegiatan',
          anggaran: base?.anggaran || 0,
          realisasi: base?.realisasi || 0
        };
      });

      const enrichedPendPemb = data.pendapatanPembiayaan.map(p => {
        const base = mapPendPemb.get(p.kode_rekening);
        return {
          ...p,
          nama_rekening: base?.nama_rekening || 'Rekening',
          anggaran: base?.anggaran || 0,
          realisasi: base?.realisasi || 0
        };
      });

      res.json({
        success: true,
        data: {
          belanja: enrichedBelanja,
          pendapatanPembiayaan: enrichedPendPemb
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/prognosis/update-belanja
   */
  router.post('/prognosis/update-belanja', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        kode_skpd,
        kode_sub_kegiatan,
        kode_rekening,
        opsi_input,
        nilai,
        anggaran,
        realisasi,
        user
      } = req.body;

      if (!kode_skpd || !kode_sub_kegiatan || !kode_rekening || !opsi_input) {
        res.status(400).json({ success: false, error: 'Missing parameters' });
        return;
      }

      // Check if prognosis is locked before updating
      const saved = await prognosisRepo.getBelanjaBySkpd(kode_skpd);
      const isLocked = saved.some(s => s.kode_sub_kegiatan === kode_sub_kegiatan && s.kode_rekening === kode_rekening && s.locked);
      if (isLocked) {
        res.status(403).json({ success: false, error: 'Data prognosis sudah dikirim dan dikunci' });
        return;
      }

      await prognosisUseCase.updateBelanjaPrognosis(
        kode_skpd,
        kode_sub_kegiatan,
        kode_rekening,
        opsi_input,
        Number(nilai || 0),
        Number(anggaran || 0),
        Number(realisasi || 0),
        user || 'system'
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/prognosis/update-pend-pemb
   */
  router.post('/prognosis/update-pend-pemb', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        kode_skpd,
        kode_rekening,
        opsi_input,
        nilai,
        anggaran,
        realisasi,
        user
      } = req.body;

      if (!kode_skpd || !kode_rekening || !opsi_input) {
        res.status(400).json({ success: false, error: 'Missing parameters' });
        return;
      }

      // Check if locked
      const saved = await prognosisRepo.getPendapatanPembiayaanBySkpd(kode_skpd);
      const isLocked = saved.some(s => s.kode_rekening === kode_rekening && s.locked);
      if (isLocked) {
        res.status(403).json({ success: false, error: 'Data prognosis sudah dikirim dan dikunci' });
        return;
      }

      await prognosisUseCase.updatePendapatanPembiayaanPrognosis(
        kode_skpd,
        kode_rekening,
        opsi_input,
        Number(nilai || 0),
        Number(anggaran || 0),
        Number(realisasi || 0),
        user || 'system'
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/prognosis/submit
   * Locks the prognosis for SKPD
   */
  router.post('/prognosis/submit', async (req: Request, res: Response): Promise<void> => {
    try {
      const { kode_skpd, user } = req.body;
      if (!kode_skpd) {
        res.status(400).json({ success: false, error: 'kode_skpd wajib diisi' });
        return;
      }

      await prognosisUseCase.submitPrognosis(kode_skpd, user || 'system');
      res.json({ success: true, message: 'Prognosis berhasil dikirim dan dikunci' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/prognosis/unlock
   * Admin/Pemda unlocks the prognosis for SKPD
   */
  router.post('/prognosis/unlock', async (req: Request, res: Response): Promise<void> => {
    try {
      const { kode_skpd, user } = req.body;
      if (!kode_skpd) {
        res.status(400).json({ success: false, error: 'kode_skpd wajib diisi' });
        return;
      }

      await prognosisUseCase.unlockPrognosis(kode_skpd, user || 'system');
      res.json({ success: true, message: 'Prognosis berhasil dibuka kembali' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/master-summary
   * Retrieve total record counts in database for admin overview
   */
  router.get('/admin/master-summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const referenceCounts = await db('master_referensi')
        .select('jenis')
        .count('* as count')
        .groupBy('jenis');

      const lraCountRes = await db('data_lra').count('* as count').first();
      const prognosisBelanjaCountRes = await db('data_prognosis_belanja').count('* as count').first();
      const prognosisPendCountRes = await db('data_prognosis_pendapatan_pembiayaan').count('* as count').first();

      res.json({
        success: true,
        data: {
          references: referenceCounts,
          lraCount: lraCountRes ? Number(lraCountRes.count) : 0,
          prognosisBelanjaCount: prognosisBelanjaCountRes ? Number(prognosisBelanjaCountRes.count) : 0,
          prognosisPendCount: prognosisPendCountRes ? Number(prognosisPendCountRes.count) : 0
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/query
   * SQL client query runner for Pemda Admin
   */
  router.post('/admin/query', async (req: Request, res: Response): Promise<void> => {
    try {
      const { sql } = req.body;
      if (!sql || typeof sql !== 'string') {
        res.status(400).json({ success: false, error: 'Query SQL wajib diisi' });
        return;
      }

      const isDangerous = /drop\s+database/i.test(sql);
      if (isDangerous) {
        res.status(400).json({ success: false, error: 'Maaf, perintah DROP DATABASE tidak diperbolehkan.' });
        return;
      }

      const result = await db.raw(sql);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  return router;
}
