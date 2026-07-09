import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { initializeDatabase } from './src/db/knex';
import { createApiRouter } from './src/adapters/controllers/Controllers';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for correct client IP detection behind reverse proxy
  app.set('trust proxy', 1);

  // 1. Initialize SQLite Database Schema & Seeds
  try {
    await initializeDatabase();
    console.log('Database successfully initialized.');
  } catch (error) {
    console.error('Critical database initialization failure:', error);
  }

  // 2. Middlewares - increase JSON payload size limit for large base64-encoded excel spreadsheets
  app.use(cookieParser());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Request Audit Logging Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const user = (req as any).user ? (req as any).user.username : 'anonymous';
      console.log(`[AUDIT] ${new Date().toISOString()} | User: ${user} | ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms | IP: ${req.ip}`);
    });
    next();
  });

  // 3. Normalise and parse BASE_PATH or VITE_BASE_PATH
  let BASE_PATH = (process.env.BASE_PATH || process.env.VITE_BASE_PATH || '').trim();
  if (BASE_PATH && !BASE_PATH.startsWith('/')) {
    BASE_PATH = '/' + BASE_PATH;
  }
  if (BASE_PATH.endsWith('/')) {
    BASE_PATH = BASE_PATH.slice(0, -1);
  }

  // 4. Rate Limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit.'
    }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 30, // Limit login attempts to prevent brute-forcing
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Terlalu banyak percobaan masuk, silakan coba lagi setelah 15 menit.'
    }
  });

  if (BASE_PATH) {
    app.use(`${BASE_PATH}/api/login`, authLimiter);
    app.use(`${BASE_PATH}/api/`, generalLimiter);
  }
  app.use('/api/login', authLimiter);
  app.use('/api/', generalLimiter);

  // 5. API Router mounting BEFORE Vite
  if (BASE_PATH) {
    app.use(`${BASE_PATH}/api`, createApiRouter());
  }
  app.use('/api', createApiRouter());

  // 6. Vite middleware for React Frontend or Production serving
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting development server with Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log(`Starting production server serving built static assets under subpath [${BASE_PATH || '/'}]...`);
    const distPath = path.join(process.cwd(), 'dist');
    
    if (BASE_PATH) {
      app.use(BASE_PATH, express.static(distPath));
      app.get(`${BASE_PATH}/*`, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Fallback standard root serving
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` LRA UPLOADER & REKAP RUNNING AT:        `);
    console.log(` http://localhost:${PORT}${BASE_PATH}    `);
    console.log(`=========================================`);
  });
}

startServer();
