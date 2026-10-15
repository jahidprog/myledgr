# Production upgrade notes

Carry forward the Bangla-first screens, customer/order/payment vocabulary, locally computed balances, the `op_id` operation concept, offline workflow, feedback questions, and the business rules in `PROTOTYPE_PROMPT.md` §7. Replace this static prototype and browser storage with the specified Flutter + Drift client and Go + PostgreSQL service. Implement append-only money records, voids with reasons, idempotent sync, server-side validation, audit/reconciliation, and a secure credential lifecycle before production use.
