import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { initSchema, pool } from './db.js';
import { repoRoot } from './env.js';
import documentsRouter from './routes/documents.js';
import inboxRouter from './routes/inbox.js';
import invoicesRouter from './routes/invoices.js';
import jobsRouter from './routes/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(repoRoot, 'uploads'));
fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/documents', documentsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/inbox', inboxRouter);

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  await initSchema();
  app.listen(port, () => {
    console.log(`Ledger Lens listening on ${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
