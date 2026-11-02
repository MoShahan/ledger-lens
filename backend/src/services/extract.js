import { GoogleGenerativeAI } from '@google/generative-ai';

const FIELD_KEYS = [
  'vendor',
  'invoiceNumber',
  'invoiceDate',
  'currency',
  'subtotal',
  'tax',
  'total',
  'lineItems',
];

function unwrapLeaf(value, depth = 0) {
  if (depth > 5 || value == null) return value ?? '';
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  if ('value' in value) return unwrapLeaf(value.value, depth + 1);
  return '';
}

function snippetText(value) {
  const leaf = unwrapLeaf(value);
  return typeof leaf === 'string' ? leaf : '';
}

function toField(value, confidence, sourceSnippet) {
  const conf = Number.isFinite(confidence) ? confidence : 0.5;
  return {
    value: value ?? '',
    confidence: conf,
    sourceSnippet: snippetText(sourceSnippet),
    status: conf >= 0.8 ? 'trusted' : 'needs_review',
    sourceOfTruth: 'model',
  };
}

function normalizeExtract(raw) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const item = raw?.[key] && typeof raw[key] === 'object' ? raw[key] : { value: raw?.[key] };
    if (key === 'lineItems') {
      const rawLines = unwrapLeaf(item.value);
      const lines = Array.isArray(rawLines) ? rawLines : [];
      fields.lineItems = toField(
        lines.map((line) => ({
          description: unwrapLeaf(line.description) || '',
          qty: unwrapLeaf(line.qty) ?? '',
          amount: unwrapLeaf(line.amount) ?? '',
        })),
        Number(unwrapLeaf(item.confidence)),
        item.sourceSnippet,
      );
    } else {
      fields[key] = toField(
        unwrapLeaf(item.value ?? raw?.[key]),
        Number(unwrapLeaf(item.confidence)),
        item.sourceSnippet,
      );
    }
  }
  return fields;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('Gemini timed out');
      error.code = 'TIMEOUT';
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function classifyGeminiError(err, modelId) {
  if (err.code === 'TIMEOUT' || err.code === 'BAD_JSON' || err.code === 'NO_API_KEY') {
    return err;
  }

  const status = err.status;
  const message = String(err.message || err);

  if (status === 429 || message.includes('429') || message.toLowerCase().includes('quota')) {
    const error = new Error('Gemini rate limit reached. Try again in a minute.');
    error.code = 'RATE_LIMIT';
    error.retryable = true;
    return error;
  }

  if (
    status === 503 ||
    message.includes('503') ||
    /high demand|overloaded|unavailable|try again later/i.test(message)
  ) {
    const error = new Error('Gemini is busy right now. Wait a few seconds and retry.');
    error.code = 'MODEL_OVERLOADED';
    error.retryable = true;
    return error;
  }

  if (status === 404 || message.includes('404') || message.toLowerCase().includes('not found')) {
    const error = new Error(
      `Gemini model "${modelId}" was not found. Set GEMINI_MODEL to a current Flash id (default gemini-3.8-flash).`,
    );
    error.code = 'MODEL_NOT_FOUND';
    return error;
  }

  return err;
}

export async function extractInvoiceFields(pdfText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not set');
    error.code = 'NO_API_KEY';
    throw error;
  }

  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);
  const maxChars = Number(process.env.GEMINI_MAX_CHARS || 8000);
  const clipped =
    pdfText.length > maxChars
      ? `${pdfText.slice(0, maxChars)}\n[truncated ${pdfText.length - maxChars} chars]`
      : pdfText;
  if (clipped !== pdfText) {
    console.warn(`[gemini] clipped PDF text ${pdfText.length} -> ${maxChars} chars`);
  }

  const modelIds = [
    ...new Set([
      process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-flash-latest')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ]),
  ];

  const prompt = `Extract invoice fields from this PDF text. Return JSON only, matching this shape:
{
  "vendor": { "value": string, "confidence": number 0-1, "sourceSnippet": string },
  "invoiceNumber": { "value": string, "confidence": number, "sourceSnippet": string },
  "invoiceDate": { "value": string (ISO or readable date), "confidence": number, "sourceSnippet": string },
  "currency": { "value": "USD" | "EUR" | other ISO 4217, "confidence": number, "sourceSnippet": string },
  "subtotal": { "value": string number, "confidence": number, "sourceSnippet": string },
  "tax": { "value": string number, "confidence": number, "sourceSnippet": string },
  "total": { "value": string number, "confidence": number, "sourceSnippet": string },
  "lineItems": { "value": [{ "description": string, "qty": string|number, "amount": string number }], "confidence": number, "sourceSnippet": string }
}
Use the document's numbers even if they look inconsistent. Do not invent a matching total.
Text:
${clipped}`;

  console.log(`[gemini] prompt ${prompt.length} chars, models ${modelIds.join(' -> ')}`);
  const client = new GoogleGenerativeAI(apiKey);
  const retries = Number(process.env.GEMINI_RETRIES || 4);
  const retryMs = Number(process.env.GEMINI_RETRY_MS || 2500);
  let lastError;

  for (const modelId of modelIds) {
    const model = client.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });
    console.log(`[gemini] using model ${modelId}`);

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const result = await withTimeout(model.generateContent(prompt), timeoutMs);
        const text = result.response.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const error = new Error('Gemini returned invalid JSON');
          error.code = 'BAD_JSON';
          throw error;
        }
        return normalizeExtract(parsed);
      } catch (err) {
        const classified = classifyGeminiError(err, modelId);
        lastError = classified;
        if (classified.code === 'MODEL_NOT_FOUND') {
          console.warn(`[gemini] ${modelId} not found, trying next model`);
          break;
        }
        // 429/quota: further retries and fallback models burn the free-tier budget.
        if (classified.code === 'RATE_LIMIT') {
          console.warn(`[gemini] RATE_LIMIT on ${modelId}, failing without more attempts`);
          throw classified;
        }
        const canRetry = classified.retryable && attempt < retries;
        if (!canRetry) {
          if (classified.retryable) {
            console.warn(`[gemini] ${classified.code} on ${modelId}, trying next model`);
            break;
          }
          console.error(
            '[gemini] extract failed',
            classified.code || classified.name,
            classified.message,
          );
          throw classified;
        }
        const wait =
          classified.code === 'MODEL_OVERLOADED' ? retryMs * attempt * 2 : retryMs * attempt;
        console.warn(
          `[gemini] ${classified.code} attempt ${attempt}/${retries}, retry in ${wait}ms`,
        );
        await sleep(wait);
      }
    }
  }

  console.error('[gemini] extract failed', lastError?.code || lastError?.name, lastError?.message);
  throw lastError;
}

export async function pingGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not set on the server.');
    error.code = 'NO_API_KEY';
    throw error;
  }

  const timeoutMs = Number(process.env.GEMINI_PING_TIMEOUT_MS || 15000);
  const modelId = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}?key=${encodeURIComponent(apiKey)}`;

  try {
    console.log(`[gemini] ping ${modelId}`);
    const response = await withTimeout(fetch(url), timeoutMs);
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      const error = new Error('Gemini rejected the API key.');
      error.code = 'INVALID_API_KEY';
      throw error;
    }
    if (response.status === 404) {
      const error = new Error(
        `Gemini model "${modelId}" was not found. Set GEMINI_MODEL to a current Flash id.`,
      );
      error.code = 'MODEL_NOT_FOUND';
      throw error;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(body || `Gemini ping failed (${response.status})`);
      error.status = response.status;
      throw classifyGeminiError(error, modelId);
    }
    return { ok: true, model: modelId };
  } catch (err) {
    if (err.code) throw err;
    throw classifyGeminiError(err, modelId);
  }
}

export { normalizeExtract };
