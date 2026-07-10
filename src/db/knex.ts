import knex from 'knex';
import path from 'path';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load env variables
dotenv.config();

// Local SQLite database file location
const dbPath = path.resolve(process.cwd(), 'data.db');

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/i.test(value);
}

async function migrateUserPasswordsToHash() {
  const users = await db('users').select('username', 'password');

  for (const user of users) {
    const storedPassword = String(user.password ?? '');
    if (!storedPassword || isBcryptHash(storedPassword)) continue;

    const hashedPassword = bcrypt.hashSync(storedPassword, 12);
    await db('users').where({ username: user.username }).update({ password: hashedPassword });
  }
}

const dbClient = process.env.DB_CLIENT || 'sqlite3';

let knexConfig: any;

if (dbClient === 'pg' || dbClient === 'postgresql' || dbClient === 'postgres') {
  console.log('Database Client Configured to PostgreSQL');
  knexConfig = {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'prognosis',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    },
    pool: { min: 2, max: 10 }
  };
} else if (dbClient === 'mysql' || dbClient === 'mysql2') {
  console.log('Database Client Configured to MySQL');
  knexConfig = {
    client: 'mysql2',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'prognosis',
      decimalNumbers: true, // Ensure decimal types are returned as numbers
    },
    pool: { min: 2, max: 10 }
  };
} else {
  console.log('Database Client Configured to SQLite:', dbPath);
  knexConfig = {
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
  };
}

export const db = knex(knexConfig);

/**
 * Initializes the database tables if they do not exist.
 * This runs on app startup to guarantee tables are ready without manual migration commands.
 */
export async function initializeDatabase() {
  console.log('Initializing database schema...');

  // 1. Table: master_referensi
  const hasMasterTable = await db.schema.hasTable('master_referensi');
  if (!hasMasterTable) {
    await db.schema.createTable('master_referensi', (table) => {
      table.string('kode').notNullable();
      table.string('jenis').notNullable(); // urusan, bidang, skpd, program, kegiatan, sub_kegiatan, rekening
      table.string('uraian', 1000).notNullable();
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
      table.string('nama_skpd', 1000).notNullable();
      
      table.string('kode_urusan').nullable();
      table.string('nama_urusan', 1000).nullable();
      table.string('kode_bidang').nullable();
      table.string('nama_bidang', 1000).nullable();
      table.string('kode_program').nullable();
      table.string('nama_program', 1000).nullable();
      table.string('kode_kegiatan').nullable();
      table.string('nama_kegiatan', 1000).nullable();
      table.string('kode_sub_kegiatan').nullable();
      table.string('nama_sub_kegiatan', 1000).nullable();
      
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

  // 5. Table: users
  const hasUsersTable = await db.schema.hasTable('users');
  if (!hasUsersTable) {
    await db.schema.createTable('users', (table) => {
      table.string('username').primary();
      table.string('password').notNullable();
      table.string('role').notNullable(); // skpd, pemda
      table.string('kode_skpd').nullable();
      table.string('nama_skpd').nullable();
    });
    console.log('Created table users');
  }

  // 6. Table: user_skpd
  const hasUserSkpdTable = await db.schema.hasTable('user_skpd');
  if (!hasUserSkpdTable) {
    await db.schema.createTable('user_skpd', (table) => {
      table.increments('id').primary();
      table.string('username').notNullable().references('username').inTable('users').onDelete('CASCADE');
      table.string('kode_skpd').notNullable();
    });
    console.log('Created table user_skpd');
  }

  // Migrate legacy/plaintext user passwords to bcrypt hashes
  await migrateUserPasswordsToHash();

  // Seed default master data if empty, so user doesn't face an empty system
  await seedDefaultMasterData();
  // Seed users if empty
  await seedUsers();
}

/**
 * Seeds user accounts and SKPD mappings from the Google Sheet.
 */
async function seedUsers() {
  const skpdCount = await db('user_skpd').count('* as cnt').first();
  const count = skpdCount ? Number(skpdCount.cnt) : 0;
  
  if (count === 0) {
    console.log('Seeding initial users and user_skpd from sheet...');
    try {
      // Fetch sheet
      const url = 'https://docs.google.com/spreadsheets/d/1p7ofuXLB0iQZJ91eFuebUTHv-DrEGb6Q/export?format=xlsx';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      
      // Parse username sheet
      const usernameSheet = workbook.Sheets['username'];
      const usernameRows = XLSX.utils.sheet_to_json<any>(usernameSheet);
      
      // Parse user_skpd sheet
      const userSkpdSheet = workbook.Sheets['user_skpd'];
      const userSkpdRows = XLSX.utils.sheet_to_json<any[]>(userSkpdSheet, { header: 1 });
      
      // Clear tables
      await db('user_skpd').del();
      await db('users').del();
      
      const defaultSaltRounds = 10;
      
      // Insert Admin user
      await db('users').insert({
        username: 'akuntansi.bpkadkdr@gmail.com',
        password: bcrypt.hashSync('123456', defaultSaltRounds),
        role: 'pemda',
        kode_skpd: null,
        nama_skpd: null
      });

      const usersToInsert: any[] = [];
      const userSet = new Set<string>();
      userSet.add('akuntansi.bpkadkdr@gmail.com');

      usernameRows.forEach(row => {
        const username = String(row.username || '').trim();
        const password = String(row.password || '123456').trim();
        if (username && username.toLowerCase() !== 'username' && !userSet.has(username)) {
          userSet.add(username);
          usersToInsert.push({
            username,
            password: bcrypt.hashSync(password, defaultSaltRounds),
            role: 'skpd',
            kode_skpd: null,
            nama_skpd: null
          });
        }
      });

      // Insert users first (to satisfy Foreign Key constraints)
      const chunkSize = 50;
      for (let i = 0; i < usersToInsert.length; i += chunkSize) {
        await db('users').insert(usersToInsert.slice(i, i + chunkSize));
      }

      const mappingsToInsert: any[] = [];
      userSkpdRows.forEach(row => {
        const u = String(row[0] || '').trim();
        const kode = String(row[1] || '').trim();
        
        if (u && kode && u.toLowerCase() !== 'username' && u.toLowerCase() !== 'user_skpd' && kode.toLowerCase() !== 'kode_skpd') {
          // If the username from mapping isn't in users table, insert it
          if (!userSet.has(u)) {
            userSet.add(u);
            usersToInsert.push({
              username: u,
              password: bcrypt.hashSync('123456', defaultSaltRounds),
              role: 'skpd',
              kode_skpd: null,
              nama_skpd: null
            });
          }
          mappingsToInsert.push({
            username: u,
            kode_skpd: kode
          });
        }
      });

      // Insert any extra users found only in the user_skpd mapping sheet
      const extraUsers = usersToInsert.filter(x => x.username && !usernameRows.some(r => String(r.username || '').trim() === x.username));
      for (let i = 0; i < extraUsers.length; i += chunkSize) {
        await db('users').insert(extraUsers.slice(i, i + chunkSize)).onConflict('username').ignore();
      }

      // Insert mappings
      for (let i = 0; i < mappingsToInsert.length; i += chunkSize) {
        await db('user_skpd').insert(mappingsToInsert.slice(i, i + chunkSize));
      }

      console.log(`Successfully seeded ${userSet.size} user accounts and ${mappingsToInsert.length} user_skpd records.`);
    } catch (err) {
      console.error('Failed to seed users from Google Sheet. Using fallback list...', err);
      await seedUsersFallback();
    }
  }
}

/**
 * Offline fallback seeding function.
 */
async function seedUsersFallback() {
  await db('user_skpd').del();
  await db('users').del();

  const defaultSaltRounds = 10;

  // Admin user
  await db('users').insert({
    username: 'akuntansi.bpkadkdr@gmail.com',
    password: bcrypt.hashSync('123456', defaultSaltRounds),
    role: 'pemda',
    kode_skpd: null,
    nama_skpd: null
  });

  // Pendidikan
  await db('users').insert({
    username: 'pendidikan',
    password: bcrypt.hashSync('123456', defaultSaltRounds),
    role: 'skpd',
    kode_skpd: null,
    nama_skpd: null
  });
  await db('user_skpd').insert({
    username: 'pendidikan',
    kode_skpd: '1.01.2.19.0.00.01.0000'
  });

  // Kesehatan
  await db('users').insert({
    username: 'kesehatan',
    password: bcrypt.hashSync('123456', defaultSaltRounds),
    role: 'skpd',
    kode_skpd: null,
    nama_skpd: null
  });
  await db('user_skpd').insert([
    { username: 'kesehatan', kode_skpd: '1.02.0.00.0.00.02.0000' },
    { username: 'kesehatan', kode_skpd: '1.02.0.00.0.00.02.0003' },
    { username: 'kesehatan', kode_skpd: '1.02.0.00.0.00.02.0004' },
    { username: 'kesehatan', kode_skpd: '1.02.0.00.0.00.02.0005' }
  ]);
  
  console.log('Successfully seeded fallback users and mappings.');
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
