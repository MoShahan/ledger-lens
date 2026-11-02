import type { ExtractedField, InvoiceFields, InvoiceIssue, InvoiceStatus } from './types';

type FieldMap = Record<keyof InvoiceFields, ExtractedField>;

export function parseMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function asMap(fields: InvoiceFields): FieldMap {
  return fields as unknown as FieldMap;
}

function flag(
  fields: InvoiceFields,
  issues: InvoiceIssue[],
  key: keyof InvoiceFields,
  code: string,
  message: string,
) {
  const map = asMap(fields);
  const current = map[key];
  if (current?.sourceOfTruth === 'user') {
    return;
  }
  if (current) {
    map[key] = { ...current, status: 'needs_review' };
  }
  issues.push({ code, message, field: key });
}

export function validate(inputFields: InvoiceFields): {
  fields: InvoiceFields;
  issues: InvoiceIssue[];
  invoiceStatus: InvoiceStatus;
} {
  const fields = structuredClone(inputFields);
  const issues: InvoiceIssue[] = [];

  if (!fields.invoiceNumber?.value || !String(fields.invoiceNumber.value).trim()) {
    flag(fields, issues, 'invoiceNumber', 'MISSING_INVOICE_NUMBER', 'Invoice number is missing.');
  }

  const date = fields.invoiceDate?.value;
  if (!date || Number.isNaN(Date.parse(String(date)))) {
    flag(fields, issues, 'invoiceDate', 'BAD_DATE', 'Invoice date is missing or unparseable.');
  }

  const currency = fields.currency?.value;
  if (!currency || !/^[A-Z]{3}$/.test(String(currency).trim())) {
    flag(fields, issues, 'currency', 'BAD_CURRENCY', 'Currency is missing or not a 3-letter code.');
  }

  const lines = Array.isArray(fields.lineItems?.value) ? fields.lineItems.value : [];
  const sum = lines.reduce((acc, line) => acc + (parseMoney(line?.amount) || 0), 0);
  const total = parseMoney(fields.total?.value);

  if (total == null) {
    flag(fields, issues, 'total', 'BAD_TOTAL', 'Total is missing or unparseable.');
  } else if (Math.abs(sum - total) > 0.01) {
    flag(
      fields,
      issues,
      'total',
      'TOTAL_MISMATCH',
      `Line items sum to ${sum.toFixed(2)} but total is ${total.toFixed(2)}.`,
    );
  }

  const anyReview = Object.values(fields).some((field) => field && field.status === 'needs_review');
  const invoiceStatus: InvoiceStatus = issues.length || anyReview ? 'needs_review' : 'ready';

  return { fields, issues, invoiceStatus };
}

export function applyUserEdits(
  fields: InvoiceFields,
  edits: Partial<Record<keyof InvoiceFields, unknown>>,
) {
  const next = structuredClone(fields);
  const map = asMap(next);

  for (const [key, value] of Object.entries(edits || {})) {
    const fieldKey = key as keyof InvoiceFields;
    const current = map[fieldKey];
    if (!current) continue;
    map[fieldKey] = {
      ...current,
      value: value as ExtractedField['value'],
      sourceOfTruth: 'user',
      status: 'trusted',
    };
  }

  return validate(next);
}
