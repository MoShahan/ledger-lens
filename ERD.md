# Ledger Lens storage diagram

Invoices live in **this browser** (IndexedDB), not Postgres. Another user, device, or a cleared cache starts empty.

```mermaid
erDiagram
    direction LR

    RECORDS ||--o| FILES : "documentId"

    RECORDS {
      string id PK
      string jobId
      string documentId FK
      string type "invoice or job"
      string status
      string filename
      string source "upload or sample"
      string sampleKey
      string vendor
      string errorCode
      json fields
      json issues
      string createdAt
    }

    FILES {
      string id PK "documentId"
      blob blob "PDF bytes"
    }
```

Flow: **file blob** + **queued record** → extract API → **invoice record** (or **failed job**). Retry re-sends the same blob. Save edits update `fields` / `issues` / `status` on that record.

Samples also keep a copy of the PDF in `files` so Review can preview without calling the API again.
