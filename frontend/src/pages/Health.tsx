import { useCallback, useEffect, useState } from 'react';

import { fetchGeminiHealth, fetchHealth, geminiHealthUrl, healthUrl } from '../api';
import { errorMessage } from '../utils';

type CheckView =
  | { state: 'checking' }
  | { state: 'up'; ms: number; detail?: string }
  | { state: 'down'; message: string };

function chipClass(view: CheckView) {
  if (view.state === 'up') return 'chip chip-ready';
  if (view.state === 'down') return 'chip chip-failed';
  return 'chip chip-extracting';
}

function chipLabel(view: CheckView) {
  if (view.state === 'up') return 'Up';
  if (view.state === 'down') return 'Down';
  return 'Checking';
}

function CheckCard({
  title,
  headingUp,
  headingDown,
  headingWait,
  bodyUp,
  bodyDown,
  bodyWait,
  endpoint,
  view,
}: {
  title: string;
  headingUp: string;
  headingDown: string;
  headingWait: string;
  bodyUp: string;
  bodyDown: string;
  bodyWait: string;
  endpoint: string;
  view: CheckView;
}) {
  return (
    <section className="empty health-card">
      <div className="health-card-head">
        <p className="eyebrow">{title}</p>
        <span className={chipClass(view)}>{chipLabel(view)}</span>
      </div>
      <h2>{view.state === 'up' ? headingUp : view.state === 'down' ? headingDown : headingWait}</h2>
      <p className="health-card-copy">
        {view.state === 'up' ? bodyUp : view.state === 'down' ? bodyDown : bodyWait}
      </p>
      {view.state === 'down' ? <p className="banner error">{view.message}</p> : null}
      {view.state === 'up' ? <p className="banner ok">Responded in {view.ms} ms.</p> : null}
      {view.state === 'checking' ? (
        <p className="banner health-banner-placeholder">Checking…</p>
      ) : null}
      <dl className="health-facts">
        <div>
          <dt>Endpoint</dt>
          <dd>{endpoint}</dd>
        </div>
        <div>
          <dt>Detail</dt>
          <dd>{view.state === 'up' && view.detail ? view.detail : '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function Health() {
  const [api, setApi] = useState<CheckView>({ state: 'checking' });
  const [gemini, setGemini] = useState<CheckView>({ state: 'checking' });
  const [checkedAt, setCheckedAt] = useState('');

  const check = useCallback(() => {
    setApi({ state: 'checking' });
    setGemini({ state: 'checking' });
    setCheckedAt(new Date().toLocaleString());

    void fetchHealth()
      .then((result) => {
        setApi({ state: 'up', ms: result.ms, detail: result.service });
      })
      .catch((err: unknown) => {
        setApi({ state: 'down', message: errorMessage(err) });
      });

    void fetchGeminiHealth()
      .then((result) => {
        setGemini({ state: 'up', ms: result.ms, detail: result.model });
      })
      .catch((err: unknown) => {
        setGemini({ state: 'down', message: errorMessage(err) });
      });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const checking = api.state === 'checking' || gemini.state === 'checking';
  const allUp = api.state === 'up' && gemini.state === 'up';
  const allDown = api.state === 'down' && gemini.state === 'down';
  const headerChip = checking
    ? 'chip chip-extracting'
    : allUp
      ? 'chip chip-ready'
      : allDown
        ? 'chip chip-failed'
        : 'chip chip-needs_review';
  const headerLabel = checking ? 'Checking' : allUp ? 'All good' : allDown ? 'Down' : 'Degraded';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Status</p>
          <h1>API health</h1>
          <p className="lede">
            Two checks: whether the extract API is up, and whether this server can call Gemini.
          </p>
        </div>
        <span className={headerChip}>{headerLabel}</span>
      </header>

      <div className="health-grid">
        <CheckCard
          title="Extract API"
          headingUp="Extract API is running"
          headingDown="Extract API is down"
          headingWait="Checking the extract API…"
          bodyUp="The invoice parser is online. You can upload a PDF or run a sample from the inbox."
          bodyDown="The UI is up, but the API did not respond. If this is the free Render instance, wait a minute and check again — it sleeps when idle."
          bodyWait="A sleeping free instance can take 30–50 seconds to wake up."
          endpoint={healthUrl()}
          view={api}
        />
        <CheckCard
          title="Gemini"
          headingUp="Gemini key is working"
          headingDown="Cannot reach Gemini"
          headingWait="Checking Gemini…"
          bodyUp="The server can reach Gemini with this API key. Invoice extraction can use the model."
          bodyDown="The API key is missing, invalid, or Gemini did not respond. Invoice extracts will fail until this is fixed."
          bodyWait="Checking that the server key can reach Gemini."
          endpoint={geminiHealthUrl()}
          view={gemini}
        />
      </div>

      <p className="muted health-checked">Last check: {checkedAt || '—'}</p>
      <button type="button" className="primary" onClick={check} disabled={checking}>
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}
