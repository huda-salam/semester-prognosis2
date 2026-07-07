import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { initializeDatabase } from './src/db/knex';
import { createApiRouter } from './src/adapters/controllers/Controllers';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Initialize SQLite Database Schema & Seeds
  try {
    await initializeDatabase();
    console.log('Database successfully initialized.');
  } catch (error) {
    console.error('Critical database initialization failure:', error);
  }

  // 2. Middlewares - increase JSON payload size limit for large base64-encoded excel spreadsheets
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 3. API Router mounting BEFORE Vite
  app.use('/api', createApiRouter());

  // 4. Vite middleware for React Frontend or Production serving
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting development server with Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Starting production server serving built static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` LRA UPLOADER & REKAP RUNNING AT:        `);
    console.log(` http://localhost:${PORT}                `);
    console.log(`=========================================`);
  });
}

startServer();
