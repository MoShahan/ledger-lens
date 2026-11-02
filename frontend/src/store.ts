import type { InboxItem, Invoice, InvoiceFields, Job, JobStatus, SampleKey } from './types';
import { fieldText } from './utils';
import { applyUserEdits } from './validate';

const DB_NAME = 'ledger-lens';
const DB_VERSION = 1;

export type StoredRecord = {
  id: string;
  jobId: string;
  documentId: string;
  type: 'invoice' | 'job';
  status: InboxItem['status'];
  filename: string;
  source: 'upload' | 'sample';
  sampleKey?: SampleKey;
  vendor: string;
  errorMessage?: string;
  errorCode?: string;
  createdAt: string;
  fields?: InvoiceFields;
  issues?: Invoice['issues'];
};

type FileRow = {
  id: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) {
        db.createObjectStore('records', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open local storage.'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Local storage request failed.'));
  });
}

export async function putRecord(record: StoredRecord): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction('records', 'readwrite').objectStore('records').put(record));
}

export async function getRecord(id: string): Promise<StoredRecord | null> {
  const db = await openDb();
  const row = await requestToPromise(db.transaction('records').objectStore('records').get(id));
  return row ?? null;
}

export async function putFile(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const row: FileRow = { id, blob };
  await requestToPromise(db.transaction('files', 'readwrite').objectStore('files').put(row));
}

export async function getFile(id: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await requestToPromise<FileRow | undefined>(
    db.transaction('files').objectStore('files').get(id),
  );
  return row?.blob ?? null;
}

export async function listRecords(params: { limit?: number; offset?: number } = {}): Promise<{
  items: InboxItem[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 10));
  const offset = Math.max(0, params.offset ?? 0);
  const db = await openDb();
  const rows = (await requestToPromise(
    db.transaction('records').objectStore('records').getAll(),
  )) as StoredRecord[];
  const sorted = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const page = sorted.slice(offset, offset + limit);
  return {
    items: page.map(toInboxItem),
    total: sorted.length,
    limit,
    offset,
  };
}

export function toInboxItem(record: StoredRecord): InboxItem {
  return {
    type: record.type,
    id: record.id,
    jobId: record.jobId,
    status: record.status,
    filename: record.filename,
    source: record.source,
    vendor: record.vendor,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
  };
}

export function toJob(record: StoredRecord): Job {
  return {
    id: record.jobId,
    document_id: record.documentId,
    status: record.status as JobStatus,
    error_code: record.errorCode ?? null,
    error_message: record.errorMessage ?? null,
    invoiceId: record.type === 'invoice' ? record.id : null,
  };
}

export function toInvoice(record: StoredRecord, previewUrl?: string): Invoice {
  if (!record.fields) {
    throw new Error('Invoice not found.');
  }
  return {
    id: record.id,
    document_id: record.documentId,
    job_id: record.jobId,
    status: record.status === 'ready' ? 'ready' : 'needs_review',
    fields: record.fields,
    issues: record.issues || [],
    filename: record.filename,
    previewUrl,
    sampleKey: record.sampleKey,
  };
}

export async function saveLocalInvoice(
  id: string,
  fields: Partial<Record<keyof InvoiceFields, unknown>>,
): Promise<Invoice> {
  const record = await getRecord(id);
  if (!record?.fields) {
    throw new Error('Invoice not found.');
  }
  const { fields: next, issues, invoiceStatus } = applyUserEdits(record.fields, fields);
  const updated: StoredRecord = {
    ...record,
    type: 'invoice',
    status: invoiceStatus,
    fields: next,
    issues,
    vendor: fieldText(next.vendor?.value) || record.filename,
  };
  await putRecord(updated);
  return toInvoice(updated);
}
