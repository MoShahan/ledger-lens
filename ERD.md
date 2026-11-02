# Ledger Lens ER diagram

Postgres schema from `backend/src/schema.sql`.

```mermaid
erDiagram
    direction LR

    DOCUMENTS ||--o{ JOBS : starts
    DOCUMENTS ||--o{ INVOICES : produces
    JOBS ||--o| INVOICES : yields

    DOCUMENTS {
        uuid id PK
        text filename
        text storage_path
        text source "upload or sample"
        timestamptz created_at
    }

    JOBS {
        uuid id PK
        uuid document_id FK
        text status "queued extracting needs_review ready failed"
        text error_code "nullable"
        text error_message "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    INVOICES {
        uuid id PK
        uuid document_id FK
        uuid job_id FK
        text status "needs_review or ready"
        jsonb fields
        jsonb issues
        timestamptz created_at
        timestamptz updated_at
    }
```

## Relationships

| From | To | Cardinality | Notes |
| --- | --- | --- | --- |
| `documents` | `jobs` | 1 → N | One PDF can have many extract attempts (including retries). |
| `documents` | `invoices` | 1 → N | Structured results for that file. |
| `jobs` | `invoices` | 1 → 0..1 | A successful job yields one invoice; failed jobs have none. |

Deleting a document cascades to its jobs and invoices (`ON DELETE CASCADE`).

## Indexes

- `jobs_status_idx` on `jobs(status)`
- `invoices_status_idx` on `invoices(status)`
