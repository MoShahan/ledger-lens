import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ExtractError,
  extractPdf,
  extractSample,
  fetchSamplePdf,
  markExtractFailure,
  markExtractSuccess,
  retryJob,
} from '../api';
import { getFile, getRecord, putFile, toJob, type StoredRecord } from '../store';
import { useToast } from '../toast';
import type { Job } from '../types';
import { errorMessage, estimateProgress, progressLabel } from '../utils';

const extracts = new Map<string, Promise<StoredRecord>>();

function isTerminal(job: Job) {
  return (
    job.status === 'failed' ||
    (Boolean(job.invoiceId) && (job.status === 'needs_review' || job.status === 'ready'))
  );
}

function extractError(err: unknown): { message: string; code: string } {
  if (err instanceof ExtractError) {
    return { message: err.message, code: err.code };
  }
  return { message: errorMessage(err), code: 'EXTRACT_FAILED' };
}

async function runExtractForRecord(record: StoredRecord): Promise<StoredRecord> {
  let result;
  if (record.sampleKey) {
    result = await extractSample(record.sampleKey);
    try {
      const pdf = await fetchSamplePdf(record.sampleKey);
      await putFile(record.documentId, pdf);
    } catch (err) {
      console.warn('[job] sample PDF preview skipped', err);
    }
  } else {
    const file = await getFile(record.documentId);
    if (!file) {
      throw new ExtractError('The PDF is no longer in this browser.', 'NO_FILE');
    }
    result = await extractPdf(file);
  }
  return markExtractSuccess(record.id, result);
}

export default function JobWait() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [percent, setPercent] = useState(1);

  useEffect(() => {
    if (!jobId) return undefined;

    let cancelled = false;

    async function run() {
      try {
        const record = await getRecord(jobId as string);
        if (cancelled) return;
        if (!record) {
          setError('Job not found.');
          return;
        }

        setJob(toJob(record));
        setError('');

        if (record.type === 'invoice') {
          toastRef.current.success(
            record.status === 'needs_review' ? 'Extracted - needs review' : 'Extracted and ready',
          );
          navigate(`/invoices/${record.id}`, { replace: true });
          return;
        }

        if (record.status === 'failed') {
          return;
        }

        setJob((current) => (current ? { ...current, status: 'extracting' } : current));

        const key = `${jobId}:${attempt}`;
        let pending = extracts.get(key);
        if (!pending) {
          pending = runExtractForRecord(record).catch(async (err: unknown) => {
            extracts.delete(key);
            const info = extractError(err);
            const failed = await markExtractFailure(jobId as string, info);
            throw Object.assign(err instanceof Error ? err : new Error(info.message), {
              record: failed,
            });
          });
          extracts.set(key, pending);
        }

        const updated = await pending;
        if (cancelled) return;
        toastRef.current.success(
          updated.status === 'needs_review' ? 'Extracted - needs review' : 'Extracted and ready',
        );
        navigate(`/invoices/${updated.id}`, { replace: true });
      } catch (err) {
        if (cancelled) return;
        const failed = (err as { record?: StoredRecord }).record;
        if (failed) {
          setJob(toJob(failed));
          setError('');
          return;
        }
        const message = errorMessage(err);
        setError(message);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [attempt, jobId, navigate]);

  const jobStatus = job?.status;
  const jobDone = job ? isTerminal(job) : false;

  useEffect(() => {
    if (!jobStatus || jobDone) return undefined;
    const started = Date.now();
    setPercent(estimateProgress(jobStatus === 'queued' ? 'extracting' : jobStatus, 0));
    const tick = window.setInterval(() => {
      setPercent(
        estimateProgress(jobStatus === 'queued' ? 'extracting' : jobStatus, Date.now() - started),
      );
    }, 120);
    return () => window.clearInterval(tick);
  }, [attempt, jobStatus, jobDone]);

  async function onRetry() {
    if (!jobId) return;
    try {
      await retryJob(jobId);
      toast.info('Retrying extraction…');
      setJob((current) =>
        current ? { ...current, status: 'queued', error_code: null, error_message: null } : current,
      );
      setAttempt((n) => n + 1);
    } catch (err) {
      console.error('[job] retry failed', err);
      const message = errorMessage(err);
      setError(message);
      toast.error(message);
    }
  }

  if (error && !job) {
    return <p className="banner error">{error}</p>;
  }

  if (job?.status === 'failed') {
    const title =
      job.error_code === 'MODEL_OVERLOADED'
        ? 'Gemini is busy'
        : job.error_code === 'RATE_LIMIT'
          ? 'Rate limited'
          : 'Extraction failed';
    return (
      <div className="empty empty-fail">
        <p className="eyebrow">Something went wrong</p>
        <h2>{title}</h2>
        <p>{job.error_message || 'Something went wrong.'}</p>
        {job.error_code ? <p className="muted">Code: {job.error_code}</p> : null}
        {error ? <p className="banner error">{error}</p> : null}
        <button type="button" className="primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="empty empty-wait">
      <h2>{progressLabel(percent)}</h2>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Extraction progress"
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-pct">{percent}%</p>
      <p>This usually takes a few seconds. We will open the review screen when it is ready.</p>
    </div>
  );
}
