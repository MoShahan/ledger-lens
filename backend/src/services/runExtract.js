import { extractInvoiceFields } from './extract.js';
import { extractPdfText } from './pdfText.js';
import { validate } from './validate.js';

export function publicError(err) {
  const map = {
    TIMEOUT: 'Extraction timed out. You can retry.',
    BAD_JSON: 'The extractor returned unreadable data. You can retry.',
    RATE_LIMIT: 'The extractor is rate-limited. Wait a moment and retry.',
    MODEL_OVERLOADED: 'Gemini is busy right now. Wait a few seconds and retry.',
    NO_API_KEY: 'The server is missing GEMINI_API_KEY.',
    MODEL_NOT_FOUND: 'Gemini model not found. Update GEMINI_MODEL.',
    EMPTY_TEXT: 'This PDF has no readable text. Digital PDFs only - not scans.',
    UNREADABLE: 'We could not read this PDF.',
  };
  const code = err.code || 'EXTRACT_FAILED';
  const known = Boolean(map[code] || err.code);
  return {
    code,
    message: map[code] || 'Extraction failed. You can retry.',
    status: known ? 422 : 500,
  };
}

export async function runExtract(buffer) {
  let text;
  try {
    text = await extractPdfText(buffer);
  } catch (parseErr) {
    console.error('[extract] PDF text failed', parseErr);
    const error = new Error('unreadable');
    error.code = 'UNREADABLE';
    throw error;
  }

  console.log(`[extract] extracted ${text.length} chars of text`);
  if (!text) {
    const error = new Error('empty');
    error.code = 'EMPTY_TEXT';
    throw error;
  }

  const rawFields = await extractInvoiceFields(text);
  const result = validate(rawFields);
  console.log(`[extract] validated status=${result.invoiceStatus} issues=${result.issues.length}`);
  return result;
}
