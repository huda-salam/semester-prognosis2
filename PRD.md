# Product Requirement Document (PRD)
## Laporan Semester dan Prognosis — BPKAD Kabupaten Kediri

---

### 1. Deskripsi Umum
Aplikasi **Laporan Semester dan Prognosis** adalah platform web terintegrasi yang dirancang khusus untuk Badan Pengelolaan Keuangan dan Aset Daerah (BPKA) Kabupaten Kediri. Sistem ini mempermudah proses pengunggahan Laporan Realisasi Anggaran (LRA) bulanan/semesteran oleh Satuan Kerja Perangkat Daerah (SKPD), memfasilitasi penginputan proyeksi/prognosis realisasi anggaran semester berikutnya, serta menyediakan rekapitulasi pelaporan terkonsolidasi di tingkat Pemerintah Daerah (Pemda).

Sistem mendukung alur otorisasi berjenjang (Role-Based Access Control) yang memisahkan tanggung jawab antara operator SKPD dan administrator BPKAD Pemda.

---

### 2. Arsitektur & Teknologi Utama
Sistem ini dibangun dengan arsitektur modern full-stack yang efisien, aman, dan fleksibel:
- **Frontend**: React 18+, Vite, Tailwind CSS, Lucide React (ikon), dan Framer Motion (animasi interaktif).
- **Backend**: Node.js dengan kerangka Express.
- **Database Engine**: Knex.js query builder dengan kemampuan multi-dialect dinamis. Mendukung tiga pilihan database (bisa dikonfigurasi via `.env`):
  1. **SQLite3**: Sangat cocok untuk pengujian lokal, portabilitas, dan pengembangan cepat.
  2. **PostgreSQL**: Untuk lingkungan produksi berskala enterprise dengan keandalan tinggi.
  3. **MySQL / MariaDB**: Alternatif relational database berkinerja tinggi yang populer di lingkungan instansi.
- **Otentikasi & Keamanan**: JWT (JSON Web Token) dengan penyimpanan token lokal, perlindungan API menggunakan Rate Limiting, serta enkripsi password satu arah menggunakan algoritma **bcrypt**.

---

### 3. Struktur & Skema Database (Schema)
Database diinisialisasi secara otomatis saat aplikasi dijalankan (`initializeDatabase`). Berikut adalah lima tabel utama sistem:

#### a. `users`
Menyimpan akun pengguna, tingkat otoritas (role), dan penugasan kode SKPD.
- `username` (Primary Key, String)
- `password` (String, dienkripsi dengan bcrypt)
- `role` (String: `'skpd'` atau `'pemda'`)
- `kode_skpd` (String, Nullable)
- `nama_skpd` (String, Nullable)

#### b. `user_skpd`
Relasi pemetaan (mapping) satu pengguna ke satu atau beberapa kode SKPD.
- `id` (Auto-Increment, Primary Key)
- `username` (Foreign Key referencing `users.username`)
- `kode_skpd` (String)

#### c. `master_referensi`
Menyimpan data master urusan, bidang, SKPD, program, kegiatan, sub-kegiatan, dan kode rekening belanja/pendapatan.
- `kode` (String, Composite PK)
- `jenis` (String, Composite PK: `'urusan'`, `'bidang'`, `'skpd'`, `'program'`, `'kegiatan'`, `'sub_kegiatan'`, atau `'rekening'`)
- `uraian` (String, panjang maksimum 1000 karakter)
- `level` (Integer, Nullable)
- `parent` (String, Nullable)

#### d. `data_lra`
Data transaksi Laporan Realisasi Anggaran yang diunggah dari file Excel.
- `id` (Auto-Increment, Primary Key)
- `tahun` (Integer)
- `bulan` (Integer)
- `kode_skpd` & `nama_skpd` (String)
- Struktur hirarki: `kode_urusan`, `nama_urusan`, `kode_bidang`, `nama_bidang`, `kode_program`, `nama_program`, `kode_kegiatan`, `nama_kegiatan`, `kode_sub_kegiatan`, `nama_sub_kegiatan`
- `kode_rekening` & `nama_rekening` (String)
- `anggaran` (Decimal 20,2)
- `realisasi` (Decimal 20,2)
- `sumber_format` (String: `'format1'`, `'format2'`, atau `'format3'`)
- Metadata: `uploaded_by`, `uploaded_at`, `source_filename`

#### e. `data_prognosis_belanja` & `data_prognosis_pendapatan_pembiayaan`
Penyimpanan rancangan draf dan data final proyeksi (prognosis) semester berikutnya.
- Kunci Utama: Komposit (`kode_skpd`, `kode_sub_kegiatan`, `kode_rekening` untuk belanja; `kode_skpd`, `kode_rekening` untuk pendapatan/pembiayaan).
- `opsi_input` (String: `'sisa'`, `'tambah_kurang'`, atau `'fix'`).
- `nilai` (Decimal 20,2 - Nilai penyesuaian atau masukan manual).
- `nilai_prognosis` (Decimal 20,2 - Hasil kalkulasi proyeksi akhir).
- `status` (String: `'draft'` atau `'submitted'`).
- `locked` (Boolean, default `false`).
- Metadata: `updated_by`, `updated_at`.

---

### 4. Peran & Alur Kerja Pengguna (Roles & Workflows)

#### 1. Peran SKPD (Operator SKPD)
- **Otentikasi**: Masuk melalui form login menggunakan kredensial SKPD masing-masing.
- **Unggah LRA**: Mengunggah data laporan realisasi anggaran bulanan menggunakan format templat excel (*Format 1*, *Format 2*, atau *Format 3*). Sistem akan otomatis membaca, mencocokkan kode referensi, dan menyimpan data anggaran serta realisasinya.
- **Penginputan Prognosis**: Menyusun rancangan prognosis (prakiraan realisasi 6 bulan ke depan) untuk kelompok Belanja serta Pendapatan & Pembiayaan. Operator diberikan 3 opsi kemudahan input:
  - **Sisa**: Otomatis memproyeksikan sisa anggaran (Anggaran dikurangi Realisasi) sebagai angka prognosis.
  - **Tambah/Kurang**: Menyesuaikan prognosis dengan menambahkan atau mengurangi angka tertentu secara dinamis.
  - **Fix**: Mengisi angka prognosis dengan nilai bulat tertentu secara manual.
- **Penguncian & Kirim**: Mengirimkan draf prognosis ke Pemda (`submitted`). Begitu dikirim, draf akan otomatis terkunci (`locked = true`) untuk menjaga integritas data selama proses verifikasi.

#### 2. Peran PEMDA (BPKAD Admin)
- **Otentikasi**: Akses administrator Pemda menggunakan akun utama (contoh: `akuntansi.bpkadkdr@gmail.com`).
- **Dashboard Summary**: Memantau ringkasan jumlah data master referensi, data LRA yang diunggah, serta status verifikasi dari seluruh SKPD se-Kabupaten Kediri.
- **Kontrol Validasi**: Admin memiliki kendali penuh untuk menyetujui, mengunci, atau membuka kembali kunci draf prognosis (`unlock`) milik SKPD jika terdapat revisi atau perbaikan data.
- **Manajemen Database & Eksekusi Query**: Menu khusus untuk mengeksekusi perintah SQL secara langsung (terproteksi) guna pemeliharaan basis data secara dinamis.
- **Unggah Master Referensi**: Mengimpor data kode rekening dan referensi organisasi (SKPD) terbaru secara terpusat.
- **Laporan Terkonsolidasi**: Mengunduh dan memvisualisasikan rekapitulasi LRA dan Prognosis tingkat Pemda secara menyeluruh.

---

### 5. Fitur Unggulan & Optimasi Terbaru
Sistem ini telah dilengkapi dengan peningkatan teknis terbaru untuk penyesuaian infrastruktur dinamis:
1. **Dynamic Subpath / Base Path Routing**: Mendukung konfigurasi variabel lingkungan `BASE_PATH` (misalnya `/semester` atau `/prognosis`), yang memungkinkan seluruh aplikasi frontend dan backend berjalan di bawah subdirektori URL tertentu pada web server tanpa mematahkan pustaka aset statis dan rute API.
2. **Flexible Database Adaptability**: Dukungan driver PostgreSQL (`pg`) dan MySQL (`mysql2`) secara native yang dikendalikan melalui berkas konfigurasi `.env`.
3. **Decimal Numeric Precision**: Menjamin presisi nilai numerik desimal pada database MySQL/Postgres dikonversi secara tepat ke tipe data angka (`decimalNumbers: true`), sehingga kalkulasi persentase dan selisih anggaran tetap akurat.
4. **Pristine Secure Login Screen**: Tampilan form login yang bersih, modern, dan profesional, dengan menghapus instruksi bantuan akun demo bawaan demi meningkatkan aspek keamanan produksi.
5. **Auto-Hashed Password Migrator**: Skrip otomatis pada startup untuk memigrasikan password lama berformat teks biasa (plaintext) menjadi hash aman standar Bcrypt secara transparan tanpa mengganggu akses masuk pengguna.
