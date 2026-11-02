import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import './env.js';
import extractRouter from './routes/extract.js';
import { pingGemini } from './services/extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT || 3001);

function applyCors(req, res, next) {
  const extra = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', ...extra]);
  const origin = req.headers.origin;
  const allowAny = allowed.has('*') || extra.length === 0;
  if (origin && (allowed.has(origin) || allowAny)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

app.use(applyCors);
app.use(express.json());

function health(_req, res) {
  res.json({ ok: true, service: 'ledger-lens-api' });
}

app.get('/health', health);
app.get('/api/health', health);
app.get('/api/health/gemini', async (_req, res) => {
  try {
    const result = await pingGemini();
    res.json(result);
  } catch (err) {
    const code = err.code || 'GEMINI_UNREACHABLE';
    const message = err.message || 'Could not reach Gemini.';
    console.error('[health] gemini', code, message);
    res.status(503).json({ ok: false, code, error: message });
  }
});

app.use('/api', extractRouter);

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

const server = app.listen(port, () => {
  console.log(`Ledger Lens listening on ${port}`);
});
server.timeout = 120000;
server.requestTimeout = 120000;
