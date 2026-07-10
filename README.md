<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e010b213-c077-48d2-8c7f-bb0040316b0d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production Deployment & Configuration

Untuk panduan lengkap cara menjalankan aplikasi di server produksi, konfigurasi Nginx Reverse Proxy, pengaturan Trusted Proxy, penanganan subpath URL (seperti `/semester`), manajemen proses dengan PM2, serta cara mengatasi masalah *Connection Refused*, silakan baca **[Panduan Produksi Komprehensif kami di sini](./docs/PRODUCTION.md)**.

