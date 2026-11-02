# Decisions

1. **Gemini instead of ChatGPT / OpenAI.** ChatGPT Plus is a chat app, not an API - it does not run our extract calls. OpenAI’s API is paid (a key is free, usage is not). Gemini’s free tier from AI Studio is enough for this demo. The key stays on the server. If we hit rate limits, we show a failed job and retry.

2. **Railway.** We need one public URL. Express serves the React build and the API from a single Railway service, with their Postgres addon. Splitting Vercel + an API means two deploys and CORS. Free Render apps sleep, which looks broken to a reviewer.

3. **AI extract, not a PDF parser.** The brief is messy / unstructured invoices, not one known layout. Regex or template parsers break when vendors change field order, repeat “total,” or dump text in a weird sequence. We still pull PDF text first, then Gemini fills a fixed JSON schema; our validator and Review screen decide what to trust. A parser-only path would only look strong on two samples we wrote ourselves.

4. **ESLint, Prettier, and two GitHub Actions.** Import groups/order plus Prettier keep the repo teammate-readable. Two workflows (`lint.yml`, `test.yml`) fail the PR if format, lint, or tests break. Skipped husky/lint-staged - CI is the gate.

5. **Gemini model `gemini-2.0-flash`.** Free-tier Flash is enough for structured JSON. Overridable with `GEMINI_MODEL`. If this id is retired, swap in env - new entry if we change the default.

6. **unpdf instead of pdf-parse.** pdf-parse’s old pdf.js throws `bad XRef entry` on our pdfkit samples, so clean uploads looked unreadable. unpdf still only pulls text for Gemini - not a field parser.

7. **TypeScript on the frontend only.** The UI is the product surface; types on invoices/jobs catch field-shape bugs. Backend stays JS so we do not spend the week migrating Express.

8. **Default model `gemini-flash-latest`.** `gemini-2.0-flash` is shut down and returned 404. The `latest` alias tracks the current Flash model so we do not pin another retired id. Override with `GEMINI_MODEL` if needed.

9. **Husky pre-commit ESLint.** Decision 4 left lint to CI so we would not add hooks at first. Commits were still able to land with ESLint errors and only fail later on GitHub. Husky + lint-staged now runs `eslint` on staged JS/TS before commit; CI still runs the full repo lint. `prepare` no-ops if `.git` is missing so `npm install` does not break on a fresh unzip.

10. **Four GitHub Actions instead of two.** Combined `lint.yml` / `test.yml` hid which side failed. Checks are now Frontend lint, Frontend tests, Backend lint, and Backend tests. Frontend had no test runner, so we added Vitest for helper unit tests; backend keeps `node --test`. Typecheck stays on the frontend lint job.

11. **Retry Gemini 503, do not call it EXTRACT_FAILED.** The clean sample PDF text extracted fine; `gemini-flash-latest` returned 503 high demand and we stored a generic failure. 503/429 are transient, so we retry a few times with backoff, then fail as `MODEL_OVERLOADED` / `RATE_LIMIT` with Retry. We did not switch the default model.

12. **Default model `gemini-3.8-flash`.** Repeated clean-sample failures were not oversized input - `clean.pdf` is 1.6KB / 278 chars. A ping to `gemini-flash-latest` still 503s; `gemini-2.0-flash` and `gemini-2.5-flash` 404. The same ping on `gemini-3.8-flash` returned JSON. We pin that id, fall back if it 503s, and clip PDF text at 8k chars so a large upload cannot dump a 10MB prompt.

13. **Five sample invoices, not two.** Clean + mismatch only showed one review path. Added missing invoice #, a EUR vendor, and an unparseable date so Inbox can demo the other validator flags without uploading a file. Still invoices-only digital PDFs.

14. **Inbox infinite scroll, not a full dump.** Recent loaded every invoice and failed job in one response. `/api/inbox` now takes `limit`/`offset` (10 per page) and the list fetches the next page when you scroll to the bottom. No search filters.

15. **ARCHITECTURE.md.** Reviewers need one place for system shape, pipeline, API, and deploy without reading the whole repo. The architecture doc points at ERD and decisions; it is not a changelog.

16. **Railway build is `npm run build` only.** Nixpacks already runs `npm ci` in install and mounts a cache at `node_modules/.cache`. Putting `npm ci` in `buildCommand` again made the second clean install hit `EBUSY` on that mount. `nixpacks.toml` installs with `--include=dev` so Vite/TypeScript (frontend `devDependencies`) are present for the build, then runs `npm run build`.

17. **Stable toasts; fail fast on RATE_LIMIT.** JobWait depended on a toast API recreated every render, so a failed job toast re-ran the poll effect and stacked identical errors / constant `/api/jobs/:id` fetches. Toast context is memoized, duplicates are skipped, and failed jobs rely on the page UI (no toast). Poll no longer lists `toast` as an effect dep (ref instead) and clears the interval on terminal status. Gemini 429 no longer retries or walks fallback models - that only burned free-tier quota.

18. **Live URL.** Production UI is https://ledger-lens-demo.vercel.app/ and the API is https://ledger-lens-api-ui6w.onrender.com/ - linked from the README so reviewers do not need the dashboards. (Was one Railway URL; that host expired.)

19. **Job wait progress must not reset on every poll.** Progress effect depended on the whole `job` object, so each 1.5s poll reset percent to ~1 and the label flipped between “Reading PDF” and “Pulling text.” Restart only on status/attempt; keep previous job state when the poll payload is unchanged. API fetches use `cache: 'no-store'` (and job GET sends `Cache-Control: no-store`) so browsers stop answering polls with 304. Transient poll failures (nodemon restart / proxy ECONNRESET → client 500) only toast after 3 misses so a brief API bounce does not look like a hard failure.

20. **Per-field “Looks correct,” not blanket Confirm & save.** Saving every field as user cleared the whole invoice even when only one value was accepted. Needs-review rows get a Looks correct button; Save only PATCHes touched fields (accepted or edited). Validator still skips `sourceOfTruth: 'user'`, so one accepted field can clear its flag while another keeps Needs review on Inbox.

21. **No Postgres; Vercel UI + Render API.** Railway expired. The inbox does not need a shared database - each person keeps extracts in their own browser (IndexedDB). Express only extracts (unpdf + Gemini + validate) and returns JSON. That split is deployable: static SPA on Vercel (`VITE_API_URL`), stateless Node on Render (`GEMINI_API_KEY`, `CORS_ORIGIN`). We accepted Render sleep on the free API and per-browser data (clearing the cache empties the inbox).

22. **One CI workflow, four jobs.** Decision 10 split lint/test into four workflow files so a red check named the side. Four files duplicated checkout/setup and cluttered Actions. They now share `ci.yml`; the four jobs still run in parallel and still fail independently.

23. **Vercel deploy notify.** Preview and production deploys should show up in Discord/Telegram without opening the Vercel dashboard. `vercel-deploy-notify.yml` listens for Vercel GitHub `repository_dispatch` events, skips pending/canceled, and treats preview `ready` as success (production waits for `success` so we do not double-ping). Secrets are optional: missing Discord/Telegram config (or a failed send) falls back to a commit comment so the job stays green. The file must live on the default branch.
