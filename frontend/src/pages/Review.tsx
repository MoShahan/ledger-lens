import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchInvoice, fetchSamplePdf, saveInvoice } from '../api';
import FieldRow from '../components/FieldRow';
import StatusChip from '../components/StatusChip';
import { getFile, putFile } from '../store';
import { useToast } from '../toast';
import type { FieldKey, Invoice, InvoiceFields } from '../types';
import { errorMessage, fieldText } from '../utils';

const FIELD_LABELS: [FieldKey, string, boolean][] = [
  ['vendor', 'Vendor', false],
  ['invoiceNumber', 'Invoice #', false],
  ['invoiceDate', 'Invoice date', false],
  ['currency', 'Currency', false],
  ['subtotal', 'Subtotal', false],
  ['tax', 'Tax', false],
  ['total', 'Total', false],
  ['lineItems', 'Line items', true],
];

export default function Review() {
  const { id } = useParams();
  const toast = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<InvoiceFields | null>(null);
  const [dirty, setDirty] = useState<Set<FieldKey>>(() => new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchInvoice(id)
      .then((data) => {
        setInvoice(data);
        setDraft(data.fields);
        setDirty(new Set());
        setSaved(false);
      })
      .catch((err: unknown) => {
        console.error('[review] load failed', err);
        const message = errorMessage(err);
        setError(message);
        toast.error(message);
      });
  }, [id, toast]);

  useEffect(() => {
    if (!invoice?.document_id) return undefined;
    const documentId = invoice.document_id;
    const sampleKey = invoice.sampleKey;
    let url = '';
    let cancelled = false;

    (async () => {
      let blob = await getFile(documentId);
      if (!blob && sampleKey) {
        try {
          blob = await fetchSamplePdf(sampleKey);
          await putFile(documentId, blob);
        } catch (err) {
          console.warn('[review] sample PDF missing', err);
        }
      }
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [invoice?.document_id, invoice?.sampleKey]);

  const mismatch = useMemo(
    () => (invoice?.issues || []).find((issue) => issue.code === 'TOTAL_MISMATCH'),
    [invoice],
  );

  function markDirty(key: FieldKey) {
    setDirty((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setSaved(false);
  }

  function onChange(key: FieldKey, value: unknown) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: { ...current[key], value },
      };
    });
    markDirty(key);
  }

  function onAccept(key: FieldKey) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: {
          ...current[key],
          sourceOfTruth: 'user',
          status: 'trusted',
        },
      };
    });
    markDirty(key);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!id || !draft) return;
    if (dirty.size === 0) {
      toast.info('Accept or edit at least one field, then save.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fields: Partial<Record<FieldKey, unknown>> = {};
      for (const key of dirty) {
        fields[key] = draft[key].value;
      }
      const updated = await saveInvoice(id, fields);
      setInvoice(updated);
      setDraft(updated.fields);
      setDirty(new Set());
      setSaved(true);
      if (updated.status === 'ready') {
        toast.success('Saved. Invoice is ready.');
      } else {
        toast.success('Saved. Some fields still need review.');
      }
    } catch (err) {
      console.error('[review] save failed', err);
      const message = errorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !invoice) {
    return <p className="banner error">{error}</p>;
  }

  if (!invoice || !draft) {
    return <p className="muted">Loading invoice…</p>;
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/">Invoices</Link>
            <span className="crumb-sep">/</span>
            {fieldText(draft.invoiceNumber?.value) || invoice.filename}
          </p>
          <h1>Review extract</h1>
          <p className="lede">
            Accept a prefilled value with Looks correct, or edit it. Only fields you touch are saved
            — others stay Needs review.
          </p>
        </div>
        <StatusChip status={invoice.status} />
      </header>

      {mismatch ? <p className="banner warn">{mismatch.message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}
      {saved ? (
        <p className="banner ok">
          {invoice.status === 'ready'
            ? 'Saved. Invoice is ready.'
            : 'Saved. Some fields still need review.'}
        </p>
      ) : null}

      <div className="review-grid">
        <section className="preview-card">
          <div className="card-label">Source document</div>
          {previewUrl ? (
            <iframe title="Invoice PDF" src={previewUrl} />
          ) : (
            <p className="muted">PDF preview is stored in this browser only.</p>
          )}
        </section>
        <form className="fields-card" onSubmit={onSave}>
          <div className="card-label">Extracted fields</div>
          {FIELD_LABELS.map(([key, label, isJson]) => (
            <FieldRow
              key={key}
              label={label}
              fieldKey={key}
              field={draft[key]}
              isJson={isJson}
              onChange={onChange}
              onAccept={onAccept}
            />
          ))}
          <div className="actions">
            <Link to="/" className="ghost">
              Skip for now
            </Link>
            <button type="submit" className="primary" disabled={saving || dirty.size === 0}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
