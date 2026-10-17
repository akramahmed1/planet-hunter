# Architecture decision records

Short records of decisions that shape Planet Hunter v2. Each one states the
context, the decision and its consequences. To change a decision, add a new
ADR that supersedes the old one; don't rewrite history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-api-v2-versioning.md) | New endpoints live under `/api/v2`; v1 is frozen | Accepted |
| [0002](0002-generated-ts-types.md) | Frontend types are generated from the OpenAPI schema | Accepted |
| [0003](0003-postgres-job-queue.md) | Scan jobs use a Postgres table with `SKIP LOCKED` | Accepted |
| [0004](0004-tenant-isolation.md) | Classroom data is isolated by `org_id`, enforced in one place | Accepted |
| [0005](0005-age-13-plus.md) | Accounts are for ages 13 and up at launch | Accepted |
