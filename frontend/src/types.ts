export type FieldStatus = 'trusted' | 'needs_review';
export type InvoiceStatus = 'needs_review' | 'ready';
export type JobStatus = 'queued' | 'extracting' | 'needs_review' | 'ready' | 'failed';
export type ChipStatus = FieldStatus | InvoiceStatus | JobStatus;

export type LineItem = {
  description: string;
  qty: string | number;
  amount: string | number;
};

export type ExtractedField<T = string | LineItem[]> = {
  value: T;
  confidence: number;
  sourceSnippet: string;
  status: FieldStatus;
  sourceOfTruth: 'model' | 'user';
};

export type InvoiceFields = {
  vendor: ExtractedField<string>;
  invoiceNumber: ExtractedField<string>;
  invoiceDate: ExtractedField<string>;
  currency: ExtractedField<string>;
  subtotal: ExtractedField<string>;
  tax: ExtractedField<string>;
  total: ExtractedField<string>;
  lineItems: ExtractedField<LineItem[]>;
};

export type FieldKey = keyof InvoiceFields;

export type InvoiceIssue = {
  code: string;
  message: string;
  field?: string;
};

export type SampleKey = 'clean' | 'mismatch' | 'missing' | 'euro' | 'baddate';

export type Job = {
  id: string;
  document_id: string;
  status: JobStatus;
  error_code?: string | null;
  error_message?: string | null;
  invoiceId?: string | null;
};

export type Invoice = {
  id: string;
  document_id: string;
  job_id: string;
  status: InvoiceStatus;
  fields: InvoiceFields;
  issues: InvoiceIssue[];
  filename?: string;
  previewUrl?: string;
  sampleKey?: SampleKey;
};

export type InboxItem = {
  type: 'invoice' | 'job';
  id: string;
  jobId: string;
  status: ChipStatus;
  filename: string;
  source: string;
  vendor: string;
  errorMessage?: string;
  createdAt: string;
};

export type DocumentJobResponse = {
  document: { id: string; filename: string };
  job: Job;
};
