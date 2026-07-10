# Panduan Produksi: Menjalankan & Mengonfigurasi Aplikasi

Dokumen ini menjelaskan langkah-langkah komprehensif untuk mendeploy, mengonfigurasi, dan mengoperasikan aplikasi **LRA Uploader & Rekap** di lingkungan produksi (Production), termasuk integrasi Nginx Reverse Proxy, penanganan subpath (seperti `/semester`), manajemen servis dengan PM2, serta penyelesaian masalah koneksi (*Connection Refused*).

---

## Daftar Isi
1. [Arsitektur Produksi](#1-arsitektur-produksi)
2. [Langkah-Langkah Build & Run di Server Produksi](#2-langkah-langkah-build--run-di-server-produksi)
3. [Manajemen Proses dengan PM2](#3-manajemen-proses-dengan-pm2)
4. [Konfigurasi Subpath / Base Path (`/semester`)](#4-konfigurasi-subpath--base-path-semester)
5. [Konfigurasi Trusted Proxy (Express & Nginx)](#5-konfigurasi-trusted-proxy-express--nginx)
6. [Contoh Konfigurasi Nginx Reverse Proxy](#6-contoh-konfigurasi-nginx-reverse-proxy)
7. [Penyelesaian Masalah (Troubleshooting) "Connection Refused (111)"](#7-penyelesaian-masalah-troubleshooting-connection-refused-111)

---

## 1. Arsitektur Produksi

Aplikasi ini menggunakan arsitektur **Full-Stack (Vite + React di Frontend, Express di Backend)** yang dibundel menjadi satu kesatuan:
*   **Vite/React** dikompilasi menjadi aset statis HTML, CSS, dan JS di direktori `dist/`.
*   **Express Server (`server.ts`)** dikompilasi oleh `esbuild` menjadi file CommonJS tunggal berkinerja tinggi di `dist/server.cjs`.
*   Saat dijalankan di produksi (`npm run start`), Express server bertindak sebagai API server sekaligus penyaji (*static server*) untuk aset statis frontend di `dist/`.
*   **Nginx** ditempatkan di depan Express Server sebagai **Reverse Proxy** untuk menangani SSL (HTTPS), kompresi gzip, dan pembatasan akses luar.

---

## 2. Langkah-Langkah Build & Run di Server Produksi

Lakukan langkah-langkah berikut langsung pada server VPS atau server fisik Anda:

### 1. Persiapan Kloning & Dependensi
Pastikan Node.js (versi 18 atau lebih baru) sudah terinstal.
```bash
# Masuk ke direktori aplikasi
cd /path/to/your/app

# Instal dependensi (termasuk devDependencies untuk proses build)
npm install
```

### 2. Mengompilasi Aplikasi (Build)
Jalankan perintah build untuk mengompilasi frontend dan membundel backend Express:
```bash
npm run build
```
Perintah ini akan menghasilkan:
*   `dist/` yang berisi aset HTML/JS/CSS hasil kompilasi React.
*   `dist/server.cjs` yang merupakan bundel backend server Node Anda.

### 3. Menjalankan Aplikasi Secara Langsung
Untuk menguji apakah aplikasi berjalan lancar di port `3000`:
```bash
npm run start
```
*Catatan: Menjalankan langsung dengan perintah ini akan terhenti jika sesi terminal ditutup. Gunakan PM2 (lihat bagian berikutnya) untuk menjalankannya di latar belakang.*

---

## 3. Manajemen Proses dengan PM2

Untuk memastikan aplikasi terus berjalan di latar belakang, otomatis restart saat server reboot, atau otomatis restart jika terjadi crash, gunakan **PM2 (Process Manager 2)**.

### 1. Instal PM2 Secara Global
```bash
sudo npm install -g pm2
```

### 2. Jalankan Aplikasi dengan PM2
Jalankan file server produksi yang sudah dikompilasi (`dist/server.cjs`):
```bash
pm2 start dist/server.cjs --name "lra-app" --node-args="--env-file=.env"
```
*(Atau cukup `pm2 start dist/server.cjs --name "lra-app"` jika variabel lingkungan sudah dikonfigurasi).*

### 3. Mengatur Auto-Start Saat Server Reboot
Pastikan PM2 otomatis berjalan kembali ketika server fisik/VPS Anda melakukan restart:
```bash
# Hasilkan skrip startup sistem
pm2 startup

# Jalankan perintah yang dihasilkan oleh terminal (biasanya diawali dengan sudo env PATH...)
# Contoh output perintah yang perlu Anda salin dan jalankan:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u sammy --hp /home/sammy

# Simpan daftar proses aktif agar dimuat kembali setelah booting
pm2 save
```

### 4. Perintah Berguna PM2 lainnya:
```bash
pm2 status          # Melihat status jalannya aplikasi
pm2 logs lra-app    # Melihat log runtime (sangat berguna untuk debugging)
pm2 restart lra-app # Merestart aplikasi setelah melakukan perubahan kode/build
pm2 stop lra-app    # Menghentikan sementara aplikasi
```

---

## 4. Konfigurasi Subpath / Base Path (`/semester`)

Jika aplikasi Anda diakses melalui URL subpath seperti `bkad.kedirikab.go.id/semester/` bukan langsung di domain utama (`bkad.kedirikab.go.id/`), Anda **harus** mengonfigurasinya melalui variabel lingkungan agar sistem router React dan Express mengetahui base path yang benar.

Aplikasi ini sudah dilengkapi dengan dukungan dinamis subpath.

### Langkah Konfigurasi:
1.  Buka atau buat file `.env` di direktori utama aplikasi.
2.  Tambahkan baris berikut:
    ```env
    PORT=3000
    NODE_ENV=production
    BASE_PATH=/semester
    GEMINI_API_KEY=your_gemini_api_key_here
    ```
3.  Lakukan **rebuild** aplikasi agar konfigurasi subpath diterapkan ke sisi client-side router:
    ```bash
    npm run build
    pm2 restart lra-app
    ```

---

## 5. Konfigurasi Trusted Proxy (Express & Nginx)

Ketika aplikasi berjalan di belakang Nginx, IP klien asli yang melakukan *request* akan dibungkus oleh Nginx. Agar Express dapat mendeteksi IP asli pengunjung (sangat krusial untuk fitur **Audit Logging** dan **Rate Limiting**), kita menggunakan fitur `trust proxy`.

### Sisi Express (Sudah Terpasang di Kode)
Di dalam `server.ts`, kita sudah menambahkan baris konfigurasi berikut:
```typescript
// server.ts
// Mengizinkan Express mempercayai header dari reverse proxy pertama (Nginx)
app.set('trust proxy', 1);
```
Dengan nilai `1`, Express akan mempercayai proxy hop pertama (Nginx Anda) dan membaca IP klien dari header `X-Forwarded-For`.

### Sisi Nginx (Harus Ditambahkan di Server Block Anda)
Agar Nginx mengirimkan IP asli pengunjung ke Express, Anda wajib menambahkan parameter header berikut di blok `location` konfigurasi Nginx Anda:
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

---

## 6. Contoh Konfigurasi Nginx Reverse Proxy

Berikut adalah contoh lengkap file konfigurasi virtual host Nginx (`/etc/nginx/sites-available/bkad`) yang mendukung subpath `/semester`, SSL (HTTPS), dan menyalurkan IP klien secara aman (*Trusted Proxy*):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name bkad.kedirikab.go.id;

    # Alihkan seluruh HTTP ke HTTPS (Sangat disarankan)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bkad.kedirikab.go.id;

    # Konfigurasi Sertifikat SSL (Sesuaikan path dengan sertifikat Let's Encrypt Anda)
    ssl_certificate /etc/letsencrypt/live/bkad.kedirikab.go.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bkad.kedirikab.go.id/privkey.pem;
    
    # Optimasi Keamanan SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';

    # Log Akses Nginx
    access_log /var/log/nginx/bkad_access.log;
    error_log /var/log/nginx/bkad_error.log;

    # Lokasi Subpath /semester
    location /semester {
        # Alihkan request ke port aplikasi Node backend (port 3000)
        proxy_pass http://127.0.0.1:3000;
        
        # Konfigurasi Trusted Proxy Header (Kirim IP klien asli ke Express)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Konfigurasi WebSockets (Jika diperlukan di masa depan)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Set batas maksimum upload berkas LRA Excel yang besar
        client_max_body_size 50M;

        # Timeout koneksi
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

---

## 7. Penyelesaian Masalah (Troubleshooting) "Connection Refused (111)"

Jika Anda melihat pesan error seperti berikut di log Nginx:
`[error] connect() failed (111: Connection refused) while connecting to upstream, client: ..., upstream: "http://172.16.25.59:3000/semester/"`

Artinya, **Nginx tidak dapat membuat koneksi TCP ke aplikasi Node.js Anda di port 3000.** Masalah ini **bukan** disebabkan oleh konfigurasi `trust proxy`, melainkan salah satu dari penyebab berikut:

### Penyebab 1: Aplikasi Node.js Anda Belum Berjalan
Aplikasi Anda mungkin belum dihidupkan, atau sempat berhenti/crash.
*   **Cara Memeriksa**: Jalankan perintah `pm2 status` atau `ps aux | grep node`.
*   **Solusi**: Jalankan aplikasi kembali menggunakan PM2:
    ```bash
    pm2 start dist/server.cjs --name "lra-app"
    ```

### Penyebab 2: Blokir Firewall (Sangat Sering Terjadi)
Jika Nginx terinstal di mesin server yang berbeda dengan mesin aplikasi Node (`172.16.25.59`), firewall pada mesin aplikasi Node kemungkinan memblokir port `3000`.
*   **Solusi (Untuk OS Ubuntu/Debian pada host Node)**:
    Buka port `3000` agar mesin Nginx dapat mengirimkan trafik:
    ```bash
    sudo ufw allow 3000/tcp
    sudo ufw reload
    ```
*   **Solusi (Untuk OS CentOS/RHEL pada host Node)**:
    ```bash
    sudo firewall-cmd --zone=public --add-port=3000/tcp --permanent
    sudo firewall-cmd --reload
    ```

### Penyebab 3: Nginx Mengarah ke IP yang Salah
Nginx Anda dikonfigurasi untuk meneruskan ke `http://172.16.25.59:3000`. 
*   Jika Nginx dan Node.js berjalan di **satu server/VPS yang sama**, ubah target upstream di konfigurasi Nginx menjadi `http://127.0.0.1:3000` (localhost) untuk performa yang lebih cepat dan aman (tidak perlu terekspos ke IP publik).
    ```nginx
    proxy_pass http://127.0.0.1:3000;
    ```
*   Jangan lupa reload Nginx setelah mengubah konfigurasi:
    ```bash
    sudo nginx -t && sudo systemctl reload nginx
    ```
