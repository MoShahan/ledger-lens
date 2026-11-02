import {
  getRecord,
  listRecords,
  putFile,
  putRecord,
  saveLocalInvoice,
  toInvoice,
  toJob,
  type StoredRecord,
} from './store';
import type {
  DocumentJobResponse,
  InboxItem,
  Invoice,
  InvoiceFields,
  Job,
  SampleKey,
} from './types';
import { fieldText } from './utils';

type ErrorBody = { error?: string; code?: string };

const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ExtractError extends Error {
  code: string;

  constructor(message: string, code = 'EXTRACT_FAILED') {
    super(message);
    this.code = code;
  }
}

function apiPath(path: string) {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiPath(path), { ...options, cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok) {
    const message = data.error || `Request failed (${res.status})`;
    console.error(`[api] ${options.method || 'GET'} ${path}`, res.status, data);
    throw new ExtractError(message, data.code || 'EXTRACT_FAILED');
  }
  return data;
}

export type InboxPage = {
  items: InboxItem[];
  total: number;
  limit: number;
  offset: number;
};

export function fetchInbox(params: { limit?: number; offset?: number } = {}) {
  return listRecords(params);
}

export type { SampleKey };

export type ExtractResult = {
  filename: string;
  status: 'needs_review' | 'ready';
  fields: InvoiceFields;
  issues: Invoice['issues'];
};

export async function startSample(key: SampleKey): Promise<DocumentJobResponse> {
  const id = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const record: StoredRecord = {
    id,
    jobId: id,
    documentId,
    type: 'job',
    status: 'queued',
    filename: `${key}.pdf`,
    source: 'sample',
    sampleKey: key,
    vendor: '',
    createdAt: new Date().toISOString(),
  };
  await putRecord(record);
  return {
    document: { id: documentId, filename: record.filename },
    job: toJob(record),
  };
}

export async function uploadPdf(file: File): Promise<DocumentJobResponse> {
  const id = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const record: StoredRecord = {
    id,
    jobId: id,
    documentId,
    type: 'job',
    status: 'queued',
    filename: file.name,
    source: 'upload',
    vendor: '',
    createdAt: new Date().toISOString(),
  };
  await putFile(documentId, file);
  await putRecord(record);
  return {
    document: { id: documentId, filename: record.filename },
    job: toJob(record),
  };
}

export async function extractPdf(file: Blob): Promise<ExtractResult> {
  const body = new FormData();
  body.append('file', file, file instanceof File ? file.name : 'invoice.pdf');
  return request<ExtractResult>('/api/extract', { method: 'POST', body });
}

export function extractSample(key: SampleKey) {
  return request<ExtractResult>(`/api/extract/samples/${key}`, { method: 'POST' });
}

export async function fetchSamplePdf(key: SampleKey): Promise<Blob> {
  const res = await fetch(apiPath(`/api/samples/${key}`), { cache: 'force-cache' });
  if (!res.ok) {
    throw new ExtractError('Could not load the sample PDF.', 'SAMPLE_MISSING');
  }
  return res.blob();
}

export async function fetchJob(id: string): Promise<Job> {
  const record = await getRecord(id);
  if (!record) {
    throw new Error('Job not found.');
  }
  return toJob(record);
}

export async function retryJob(id: string): Promise<Pick<Job, 'id' | 'status'>> {
  const record = await getRecord(id);
  if (!record) {
    throw new Error('Job not found.');
  }
  const next: StoredRecord = {
    ...record,
    type: 'job',
    status: 'queued',
    errorCode: undefined,
    errorMessage: undefined,
    fields: undefined,
    issues: undefined,
    vendor: '',
  };
  await putRecord(next);
  return { id: next.jobId, status: 'queued' };
}

export async function fetchInvoice(id: string): Promise<Invoice> {
  const record = await getRecord(id);
  if (!record?.fields) {
    throw new Error('Invoice not found.');
  }
  return toInvoice(record);
}

export function saveInvoice(id: string, fields: Partial<Record<keyof InvoiceFields, unknown>>) {
  return saveLocalInvoice(id, fields);
}

export async function markExtractSuccess(id: string, result: ExtractResult): Promise<StoredRecord> {
  const record = await getRecord(id);
  if (!record) {
    throw new Error('Job not found.');
  }
  const updated: StoredRecord = {
    ...record,
    type: 'invoice',
    status: result.status,
    filename: result.filename || record.filename,
    fields: result.fields,
    issues: result.issues,
    vendor: fieldText(result.fields.vendor?.value) || result.filename || record.filename,
    errorCode: undefined,
    errorMessage: undefined,
  };
  await putRecord(updated);
  return updated;
}

export async function markExtractFailure(
  id: string,
  error: { message: string; code?: string },
): Promise<StoredRecord> {
  const record = await getRecord(id);
  if (!record) {
    throw new Error('Job not found.');
  }
  const updated: StoredRecord = {
    ...record,
    type: 'job',
    status: 'failed',
    errorCode: error.code || 'EXTRACT_FAILED',
    errorMessage: error.message,
  };
  await putRecord(updated);
  return updated;
}
