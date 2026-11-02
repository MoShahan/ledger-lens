# Ledger Lens

Turn messy vendor invoices into structured data you can review and trust.

Upload a PDF (or try a sample). We pull the text, Gemini fills a fixed schema, a validator flags mismatches, and you confirm or edit. Your edit is the source of truth.

Extracts stay **in this browser**. They are not saved on the server and other people cannot see them.

Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

Data model: [ERD.md](./ERD.md)

**Live:** [https://ledger-lens-demo.vercel.app/](https://ledger-lens-demo.vercel.app/)  
**API:** [https://ledger-lens-api-ui6w.onrender.com/health](https://ledger-lens-api-ui6w.onrender.com/health)

## Screenshots

### Inbox - samples, upload, and Recent

![Inbox with sample actions and recent invoices](docs/screenshots/inbox.png)

### Review

PDF on the left, fields on the right. Use **Looks correct** on a flagged field, or edit it, then **Save changes**.

![Review screen](docs/screenshots/review.png)

## Local setup

You need Node 20+ and a free [Gemini API key](https://aistudio.google.com/).

```bash
cp .env.example .env
# put GEMINI_API_KEY in .env
npm install
npm run generate:samples
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)  
API: [http://localhost:3001/health](http://localhost:3001/health)

## Scripts

| Command                       | What it does                              |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | Vite + Express                            |
| `npm test`                    | Frontend Vitest + backend validator tests |
| `npm run test:frontend`       | Frontend Vitest                           |
| `npm run test:backend`        | Backend validator + user-edit-wins tests  |
| `npm run lint`                | ESLint (including import order/groups)    |
| `npm run lint:frontend`       | ESLint on `frontend/`                     |
| `npm run lint:backend`        | ESLint on `backend/`                      |
| pre-commit (husky)            | ESLint on staged JS/TS via lint-staged    |
| `npm run typecheck`           | Frontend TypeScript                       |
| `npm run format`              | Prettier                                  |
| `npm run build` / `npm start` | Optional: Express also serves `frontend/dist` |

## Where data lives

The extract API is stateless. Your inbox, PDFs, and edits are stored in IndexedDB in **your** browser.

| Store       | What it is                                      |
| ----------- | ----------------------------------------------- |
| `records`   | Jobs and invoices (fields, issues, your edits)  |
| `files`     | PDF bytes for preview and retry                 |

Clearing site data wipes the list. A second computer will not see the first computer’s invoices.

## Deploy: Render (API) + Vercel (UI)

### 1. Render - extract API

1. New **Web Service** from this GitHub repo (or use `render.yaml`).
2. Build `npm ci`, start `npm start`, health check `/health`.
3. Environment:
   - `GEMINI_API_KEY` — required
   - `GEMINI_MODEL` — `gemini-3.8-flash`
   - `CORS_ORIGIN` — `https://ledger-lens-demo.vercel.app` (empty allows any origin)
4. Confirm [https://ledger-lens-api-ui6w.onrender.com/health](https://ledger-lens-api-ui6w.onrender.com/health) returns `{ "ok": true }`.

The free instance sleeps when idle; the first extract after that can take ~30–50 seconds.

### 2. Vercel - UI

1. Import the same GitHub repo.
2. `vercel.json` already sets install/build/output. Leave **Root Directory** empty (repo root), not `frontend`. If the dashboard has Output Directory set, use `dist`.
3. Environment (needed **at build time**):
   - `VITE_API_URL` — `https://ledger-lens-api-ui6w.onrender.com` (no trailing slash)
4. Deploy.
5. Put `https://ledger-lens-demo.vercel.app` into Render `CORS_ORIGIN` and redeploy the API if you restricted origins.

### 3. Deploy notifications

`.github/workflows/vercel-deploy-notify.yml` pings when a Vercel deploy succeeds or fails (pending/canceled are ignored). Optional GitHub secrets:

| Secret | Where it goes |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Telegram bot |

If neither is set (or both sends fail), the workflow comments on the commit instead. Needs the Vercel GitHub integration, and the file must be on the default branch.

### 4. Try it

Open [https://ledger-lens-demo.vercel.app/](https://ledger-lens-demo.vercel.app/), run the **Clean** sample, wait for Review. That invoice exists only in your browser.

## What to try

1. **Clean** - should land Ready
2. **Totals mismatch** - **Looks correct** on the total, or change it to `1284.60`, then save
3. **Missing invoice #** / **Bad date** - accept or fix only that field; Inbox stays Needs review until every flagged field is handled
4. **Euro vendor** - different vendor and EUR
5. Upload a non-PDF or a huge file - human error, no stack trace
