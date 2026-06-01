# Mirror v2 — Real Prospectus Ingestion

Mirror now has a REAL document-ingestion pipeline. It fetches a published fund
PDF, extracts text with `unpdf`, asks Groq to pull structured regulatory
claims (with the exact source sentence), and stores them in Supabase. The
Mirror entity page shows a green "Real extracted claims" panel above the
synthetic model whenever a document has been ingested for that entity.

## How to ingest a document

```bash
curl -X POST https://genesis-swarm-rgq5.vercel.app/api/mirror/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/path/to/prospectus.pdf",
    "entity_name": "DWS Group GmbH & Co. KGaA",
    "prophecy_id": "fc192fcacf36",
    "jurisdiction": "DE",
    "category": "asset_mgmt",
    "doc_type": "annual_report",
    "auth": "<INGEST_AUTH or SEAL_AUTH secret>"
  }'
```

`prophecy_id` must match a Book entry so the claims link to the right Mirror
page. Find prophecy_ids in `lib/book-snapshot.ts` or at `/api/oracle?entity=...`.

## Finding real public documents

UCITS funds are legally required to publish prospectuses + KIID/KID documents.
These are publicly downloadable. Good sources:

1. **Fund manager websites** — most have a "Documents" / "Literature" section.
   Search: `<fund name> prospectus filetype:pdf` or `<fund name> KID filetype:pdf`
2. **CSSF** (Luxembourg) — https://www.cssf.lu — fund registers
3. **Annual reports** — `<entity> annual report 2024 filetype:pdf`
4. **Pillar 3 disclosures** (banks) — `<bank> pillar 3 disclosure 2024 filetype:pdf`
5. **SFCR** (insurers) — `<insurer> solvency financial condition report filetype:pdf`

## Prophecy IDs for the 5 Watch List entities (highest priority to ingest)

| Entity | prophecy_id | category | best doc to find |
|---|---|---|---|
| UBS Europe SE | 99983ad3fff2 | bank | Pillar 3 disclosure 2024 |
| Deutsche Bank AG, London Branch | 578a618e28db | bank | Annual report / Pillar 3 2024 |
| DWS Group GmbH & Co. KGaA | fc192fcacf36 | asset_mgmt | Annual report 2024 |
| KBC Asset Management N.V. | 81695a07cb42 | asset_mgmt | Fund prospectus / annual report |
| Banque Internationale à Luxembourg | eff9d34473ea | bank | Annual report 2024 |

## Recommended first ingestion run

Ingest the 5 Watch List entities first — those are the ones journalists and
investors will click. Real extracted claims on those 5 pages converts the
Watch List from "synthetic scoring" to "we read their actual filings."

## Env var needed

Set `INGEST_AUTH` (or reuse `SEAL_AUTH`) in Vercel so the endpoint accepts
your ingestion calls in production. Without it, the default `genesis-let-it-rip`
is used (change this for real security).

## What happens after ingestion

- Document row stored in `prospectus_documents` (Supabase)
- Each extracted claim stored in `prospectus_claims` with the exact quote
- `/mirror/<prophecy_id>` page shows the green "Real extracted claims" panel
- `/api/mirror/real?id=<prophecy_id>` returns the JSON

## Honesty note

The pipeline is real. Whether a given PDF parses cleanly depends on the PDF
(scanned-image PDFs won't extract text; digital-text PDFs will). Test each URL
and check `claims_extracted` in the response. Start with digital-text annual
reports — they parse best.
