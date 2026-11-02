import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import multer from 'multer';

import { repoRoot } from '../env.js';
import { SAMPLE_KEYS } from '../samples.js';
import { publicError, runExtract } from '../services/runExtract.js';

const router = express.Router();
const sampleDir = path.join(repoRoot, 'sample-docs');
const maxMb = Number(process.env.MAX_UPLOAD_MB || 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(Object.assign(new Error('Only PDF files are accepted.'), { code: 'BAD_TYPE' }));
      return;
    }
    cb(null, true);
  },
});

function sendExtractError(res, error) {
  const { code, message, status } = publicError(error);
  console.error('[extract] failed', code, error.message || error);
  res.status(status).json({ error: message, code });
}

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: `File is too large. Max ${maxMb}MB.`, code: 'TOO_LARGE' });
        return;
      }
      if (err.code === 'BAD_TYPE') {
        res.status(400).json({ error: err.message, code: 'BAD_TYPE' });
        return;
      }
      res.status(400).json({ error: 'Upload failed.', code: 'UPLOAD_FAILED' });
      return;
    }
    next();
  });
}

router.post('/extract', handleUpload, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Choose a PDF to upload.', code: 'NO_FILE' });
    return;
  }
  try {
    console.log(`[extract] upload ${req.file.originalname} ${req.file.size} bytes`);
    const result = await runExtract(req.file.buffer);
    res.json({
      filename: req.file.originalname,
      status: result.invoiceStatus,
      fields: result.fields,
      issues: result.issues,
    });
  } catch (error) {
    sendExtractError(res, error);
  }
});

router.post('/extract/samples/:key', async (req, res) => {
  const { key } = req.params;
  if (!SAMPLE_KEYS.includes(key)) {
    res.status(404).json({ error: 'Unknown sample.', code: 'UNKNOWN_SAMPLE' });
    return;
  }
  const src = path.join(sampleDir, `${key}.pdf`);
  if (!fs.existsSync(src)) {
    res.status(500).json({ error: 'Sample PDF is missing from the repo.', code: 'SAMPLE_MISSING' });
    return;
  }
  try {
    const buffer = fs.readFileSync(src);
    console.log(`[extract] sample ${key} ${buffer.length} bytes`);
    const result = await runExtract(buffer);
    res.json({
      filename: `${key}.pdf`,
      status: result.invoiceStatus,
      fields: result.fields,
      issues: result.issues,
    });
  } catch (error) {
    sendExtractError(res, error);
  }
});

router.get('/samples/:key', (req, res) => {
  const { key } = req.params;
  if (!SAMPLE_KEYS.includes(key)) {
    res.status(404).json({ error: 'Unknown sample.', code: 'UNKNOWN_SAMPLE' });
    return;
  }
  const src = path.join(sampleDir, `${key}.pdf`);
  if (!fs.existsSync(src)) {
    res.status(500).json({ error: 'Sample PDF is missing from the repo.', code: 'SAMPLE_MISSING' });
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(src);
});

export default router;
