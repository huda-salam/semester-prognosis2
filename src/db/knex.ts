import knex from 'knex';
import path from 'path';

// Local SQLite database file location
const dbPath = path.resolve(process.cwd(), 'data.db');

export const db = knex({
  client: 'sqlite3',
  connection: {
    filename: dbPath,
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn: any, cb: any) => {
      // Enable foreign keys for SQLite
      conn.run('PRAGMA foreign_keys = ON', cb);
    }
  }
});

/**
 * Initializes the database tables if they do not exist.
 * This runs on app startup to guarantee tables are ready without manual migration commands.
 */
export async function initializeDatabase() {
  console.log('Initializing database schema at:', dbPath);

  // 1. Table: master_referensi
  const hasMasterTable = await db.schema.hasTable('master_referensi');
  if (!hasMasterTable) {
    await db.schema.createTable('master_referensi', (table) => {
      table.string('kode').notNullable();
      table.string('jenis').notNullable(); // urusan, bidang, skpd, program, kegiatan, sub_kegiatan, rekening
      table.string('uraian').notNullable();
      table.integer('level').nullable();
      table.string('parent').nullable();
      table.primary(['kode', 'jenis']);
    });
    console.log('Created table master_referensi');
  }

  // 2. Table: data_lra
  const hasLraTable = await db.schema.hasTable('data_lra');
  if (!hasLraTable) {
    await db.schema.createTable('data_lra', (table) => {
      table.increments('id').primary();
      table.integer('tahun').notNullable();
      table.integer('bulan').notNullable();
      table.string('kode_skpd').notNullable();
      table.string('nama_skpd').notNullable();
      
      table.string('kode_urusan').nullable();
      table.string('nama_urusan').nullable();
      table.string('kode_bidang').nullable();
      table.string('nama_bidang').nullable();
      table.string('kode_program').nullable();
      table.string('nama_program').nullable();
      table.string('kode_kegiatan').nullable();
      table.string('nama_kegiatan').nullable();
      table.string('kode_sub_kegiatan').nullable();
      table.string('nama_sub_kegiatan').nullable();
      
      table.string('kode_rekening').notNullable();
      table.string('nama_rekening').notNullable();
      
      table.decimal('anggaran', 20, 2).notNullable();
      table.decimal('realisasi', 20, 2).notNullable();
      
      table.string('sumber_format').notNullable(); // format1, format2, format3
      table.string('uploaded_by').nullable();
      table.string('uploaded_at').notNullable();
      table.string('source_filename').nullable();

      // Indexes for performance
      table.index(['tahun', 'bulan', 'kode_skpd']);
      table.index(['tahun', 'bulan', 'kode_rekening']);
    });
    console.log('Created table data_lra');
  }

  // 3. Table: data_prognosis_belanja
  const hasPrognosisBelanjaTable = await db.schema.hasTable('data_prognosis_belanja');
  if (!hasPrognosisBelanjaTable) {
    await db.schema.createTable('data_prognosis_belanja', (table) => {
      table.string('kode_skpd').notNullable();
      table.string('kode_sub_kegiatan').notNullable();
      table.string('kode_rekening').notNullable();
      table.string('opsi_input').notNullable(); // sisa, tambah_kurang, fix
      table.decimal('nilai', 20, 2).notNullable();
      table.decimal('nilai_prognosis', 20, 2).notNullable();
      table.string('status').notNullable(); // draft, submitted
      table.boolean('locked').defaultTo(false);
      table.string('updated_by').nullable();
      table.string('updated_at').notNullable();
      table.primary(['kode_skpd', 'kode_sub_kegiatan', 'kode_rekening']);
    });
    console.log('Created table data_prognosis_belanja');
  }

  // 4. Table: data_prognosis_pendapatan_pembiayaan
  const hasPrognosisPendTable = await db.schema.hasTable('data_prognosis_pendapatan_pembiayaan');
  if (!hasPrognosisPendTable) {
    await db.schema.createTable('data_prognosis_pendapatan_pembiayaan', (table) => {
      table.string('kode_skpd').notNullable();
      table.string('kode_rekening').notNullable();
      table.string('opsi_input').notNullable(); // sisa, tambah_kurang, fix
      table.decimal('nilai', 20, 2).notNullable();
      table.decimal('nilai_prognosis', 20, 2).notNullable();
      table.string('status').notNullable(); // draft, submitted
      table.boolean('locked').defaultTo(false);
      table.string('updated_by').nullable();
      table.string('updated_at').notNullable();
      table.primary(['kode_skpd', 'kode_rekening']);
    });
    console.log('Created table data_prognosis_pendapatan_pembiayaan');
  }

  // Seed default master data if empty, so user doesn't face an empty system
  await seedDefaultMasterData();
}

/**
 * Seeds basic SKPDs and accounts to ensure the app works out-of-the-box,
 * while allowing full master uploads.
 */
async function seedDefaultMasterData() {
  const masterCount = await db('master_referensi').count('* as cnt').first();
  const count = masterCount ? Number(masterCount.cnt) : 0;
  
  if (count === 0) {
    console.log('Seeding initial master referensi...');
    
    // Core SKPD list from Kediri Pemda guidelines
    const initialSkpds = [
      { kode: '1.01.0.00.0.00.01.0000', uraian: 'DINAS PENDIDIKAN', jenis: 'skpd', level: 1 },
      { kode: '1.02.0.00.0.00.01.0000', uraian: 'DINAS KESEHATAN', jenis: 'skpd', level: 1 },
      { kode: '1.03.0.00.0.00.01.0000', uraian: 'DINAS PEKERJAAN UMUM DAN PENATAAN RUANG', jenis: 'skpd', level: 1 },
      { kode: '2.16.0.00.0.00.01.0000', uraian: 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH', jenis: 'skpd', level: 1 },
      { kode: '2.18.0.00.0.00.01.0000', uraian: 'DINAS KOMUNIKASI DAN INFORMATIKA', jenis: 'skpd', level: 1 },
      { kode: '5.02.0.00.0.00.01.0000', uraian: 'KECAMATAN NGASEM', jenis: 'skpd', level: 1 },
    ];

    // Core high level accounts
    const initialAccounts = [
      // Pendapatan
      { kode: '4', uraian: 'PENDAPATAN DAERAH', jenis: 'rekening', level: 1, parent: null },
      { kode: '4.1', uraian: 'PENDAPATAN ASLI DAERAH (PAD)', jenis: 'rekening', level: 2, parent: '4' },
      { kode: '4.1.01', uraian: 'Pajak Daerah', jenis: 'rekening', level: 3, parent: '4.1' },
      { kode: '4.1.02', uraian: 'Retribusi Daerah', jenis: 'rekening', level: 3, parent: '4.1' },
      
      // Belanja
      { kode: '5', uraian: 'BELANJA DAERAH', jenis: 'rekening', level: 1, parent: null },
      { kode: '5.1', uraian: 'BELANJA OPERASI', jenis: 'rekening', level: 2, parent: '5' },
      { kode: '5.1.01', uraian: 'Belanja Pegawai', jenis: 'rekening', level: 3, parent: '5.1' },
      { kode: '5.1.02', uraian: 'Belanja Barang dan Jasa', jenis: 'rekening', level: 3, parent: '5.1' },
      { kode: '5.2', uraian: 'BELANJA MODAL', jenis: 'rekening', level: 2, parent: '5' },
      { kode: '5.2.01', uraian: 'Belanja Modal Tanah', jenis: 'rekening', level: 3, parent: '5.2' },
      { kode: '5.2.02', uraian: 'Belanja Modal Peralatan dan Mesin', jenis: 'rekening', level: 3, parent: '5.2' },
      
      // Pembiayaan
      { kode: '6', uraian: 'PEMBIAYAAN DAERAH', jenis: 'rekening', level: 1, parent: null },
      { kode: '6.1', uraian: 'Penerimaan Pembiayaan', jenis: 'rekening', level: 2, parent: '6' },
      { kode: '6.2', uraian: 'Pengeluaran Pembiayaan', jenis: 'rekening', level: 2, parent: '6' },
    ];

    await db('master_referensi').insert([
      ...initialSkpds.map(s => ({ ...s, parent: null })),
      ...initialAccounts
    ]);
    console.log('Finished seeding initial master references.');
  }
}
