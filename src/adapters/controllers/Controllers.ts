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
   * GET /api/admin/skpd-validation-status
   * Retrieve validation status for all SKPDs
   */
  router.get('/admin/skpd-validation-status', async (req: Request, res: Response): Promise<void> => {
    try {
      const skpds = await db('master_referensi')
        .where({ jenis: 'skpd' })
        .orderBy('kode', 'asc');

      const belanjaStatus = await db('data_prognosis_belanja')
        .select('kode_skpd', 'status', 'locked')
        .groupBy('kode_skpd', 'status', 'locked');

      const pendStatus = await db('data_prognosis_pendapatan_pembiayaan')
        .select('kode_skpd', 'status', 'locked')
        .groupBy('kode_skpd', 'status', 'locked');

      const belanjaCounts = await db('data_prognosis_belanja')
        .select('kode_skpd')
        .count('* as count')
        .groupBy('kode_skpd');

      const pendCounts = await db('data_prognosis_pendapatan_pembiayaan')
        .select('kode_skpd')
        .count('* as count')
        .groupBy('kode_skpd');

      const statusMap = new Map<string, { status: string; locked: boolean }>();
      const countMap = new Map<string, number>();

      for (const b of belanjaStatus) {
        if (b.locked) {
          statusMap.set(b.kode_skpd, { status: 'submitted', locked: true });
        } else if (!statusMap.has(b.kode_skpd)) {
          statusMap.set(b.kode_skpd, { status: b.status, locked: false });
        }
      }

      for (const p of pendStatus) {
        if (p.locked) {
          statusMap.set(p.kode_skpd, { status: 'submitted', locked: true });
        } else if (!statusMap.has(p.kode_skpd)) {
          statusMap.set(p.kode_skpd, { status: p.status, locked: false });
        }
      }

      for (const b of belanjaCounts) {
        countMap.set(b.kode_skpd, (countMap.get(b.kode_skpd) || 0) + Number(b.count));
      }

      for (const p of pendCounts) {
        countMap.set(p.kode_skpd, (countMap.get(p.kode_skpd) || 0) + Number(p.count));
      }

      const result = skpds.map(s => {
        const cached = statusMap.get(s.kode) || { status: 'draft', locked: false };
        return {
          kode: s.kode,
          uraian: s.uraian,
          status: cached.status,
          locked: cached.locked ? 1 : 0,
          total_records: countMap.get(s.kode) || 0
        };
      });

      res.json({
        success: true,
        data: result
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

  /**
   * Helper function to match a username to an SKPD from master reference data
   */
  function findMatchingSkpd(username: string, skpds: any[]): { kode: string; uraian: string } | null {
    const uLower = username.toLowerCase().replace(/_/g, ' ').trim();
    
    // 1. Exact match
    let match = skpds.find(s => s.uraian.toLowerCase() === uLower);
    if (match) return { kode: match.kode, uraian: match.uraian };

    // 2. Map abbreviations to standard words for fuzzy matching
    const searchTerms: string[] = [uLower];
    if (uLower === 'pendidikan') searchTerms.push('dinas pendidikan');
    if (uLower === 'kesehatan') searchTerms.push('dinas kesehatan');
    if (uLower === 'dpupr') searchTerms.push('pekerjaan umum', 'pupr');
    if (uLower === 'dperkim') searchTerms.push('perumahan rakyat', 'kawasan permukiman', 'perkim');
    if (uLower === 'satpolpp') searchTerms.push('satuan polisi pamong praja', 'satpol', 'pp');
    if (uLower === 'bpbd') searchTerms.push('penanggulangan bencana', 'bpbd');
    if (uLower === 'dinsos') searchTerms.push('sosial', 'dinsos');
    if (uLower === 'disnaker') searchTerms.push('tenaga kerja', 'disnaker');
    if (uLower === 'dlh') searchTerms.push('lingkungan hidup', 'dlh');
    if (uLower === 'dispendukcapil') searchTerms.push('kependudukan', 'catatan sipil', 'dispenduk');
    if (uLower === 'dishub') searchTerms.push('perhubungan', 'dishub');
    if (uLower === 'kominfo') searchTerms.push('komunikasi', 'informatika', 'kominfo');
    if (uLower === 'dpmptsp') searchTerms.push('penanaman modal', 'dpmptsp');
    if (uLower === 'bappeda') searchTerms.push('perencanaan pembangunan', 'bappeda');
    if (uLower === 'bkad') searchTerms.push('keuangan dan aset', 'bkad');
    if (uLower === 'bapenda') searchTerms.push('pendapatan daerah', 'bapenda');
    if (uLower === 'bkpsdm') searchTerms.push('kepegawaian', 'bkpsdm');
    if (uLower === 'inspektorat') searchTerms.push('inspektorat');
    if (uLower === 'bakesbangpol') searchTerms.push('kesatuan bangsa', 'politik', 'bakesbangpol');
    
    // PKM mapping
    if (uLower.startsWith('pkm ')) {
      const pkmName = uLower.replace('pkm ', '').trim();
      searchTerms.push(`puskesmas ${pkmName}`);
    } else if (uLower.startsWith('pkm_')) {
      const pkmName = uLower.replace('pkm_', '').trim();
      searchTerms.push(`puskesmas ${pkmName}`);
    }

    // 3. Search substring
    for (const term of searchTerms) {
      match = skpds.find(s => {
        const sLower = s.uraian.toLowerCase();
        return sLower.includes(term) || term.includes(sLower);
      });
      if (match) return { kode: match.kode, uraian: match.uraian };
    }

    // 4. Fallback search on individual words
    const words = uLower.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      for (const word of words) {
        match = skpds.find(s => s.uraian.toLowerCase().includes(word));
        if (match) return { kode: match.kode, uraian: match.uraian };
      }
    }

    return null;
  }

  /**
   * POST /api/login
   * Authenticate a user and resolve role and associated SKPD if applicable
   */
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ success: false, error: 'Username dan Password wajib diisi' });
        return;
      }

      // Special check: Only the user's email can login as Admin/Pemda
      const user = await db('users').where({ username }).first();
      if (!user) {
        res.status(401).json({ success: false, error: 'Username tidak terdaftar' });
        return;
      }

      if (user.password !== password) {
        res.status(401).json({ success: false, error: 'Password salah' });
        return;
      }

      // Check admin rule constraint: "untuk admin cuma bisa login dari email saya"
      // User's email: akuntansi.bpkadkdr@gmail.com
      // If someone else somehow is role 'pemda' in users, double verify they are the designated email
      if (user.role === 'pemda' && username !== 'akuntansi.bpkadkdr@gmail.com') {
        res.status(403).json({ success: false, error: 'Akses Pemda ditolak. Hanya email pengembang/admin yang diizinkan.' });
        return;
      }

      // If user is SKPD, resolve their associated SKPD code dynamically from user_skpd mapping table
      let allowedSkpds: { kode: string; nama: string }[] = [];
      let matchedKode = user.kode_skpd;
      let matchedNama = user.nama_skpd;

      if (user.role === 'skpd') {
        const userMappings = await db('user_skpd').where({ username: user.username });
        const mappedCodes = userMappings.map(m => m.kode_skpd);
        
        if (mappedCodes.length > 0) {
          const skpdRefs = await db('master_referensi')
            .where({ jenis: 'skpd' })
            .whereIn('kode', mappedCodes);
          allowedSkpds = skpdRefs.map(s => ({ kode: s.kode, nama: s.uraian }));
          
          if (allowedSkpds.length > 0) {
            matchedKode = allowedSkpds[0].kode;
            matchedNama = allowedSkpds[0].nama;
          }
        }

        // As fallback only, if no hard mapping exists, use fuzzy match
        if (allowedSkpds.length === 0) {
          const skpds = await db('master_referensi').where({ jenis: 'skpd' });
          const match = findMatchingSkpd(username, skpds);
          if (match) {
            matchedKode = match.kode;
            matchedNama = match.uraian;
            allowedSkpds = [{ kode: match.kode, nama: match.uraian }];
            
            // Cache in user record
            await db('users').where({ username }).update({
              kode_skpd: matchedKode,
              nama_skpd: matchedNama
            });
          }
        }
      }

      res.json({
        success: true,
        user: {
          username: user.username,
          role: user.role,
          kode_skpd: matchedKode,
          nama_skpd: matchedNama,
          allowed_skpds: allowedSkpds
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
