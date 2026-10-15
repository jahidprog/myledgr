# Assumptions

- The repository started with specification documents only; the UI is a self-contained static PWA prototype in `web/`.
- Until an Apps Script URL and token are provided, data remains local to this browser. The status strip is illustrative; live cloud sync is not implemented yet.
- Demo data is synthetic. Amounts are displayed in taka; this UI prototype currently uses integer taka values for its seeded and entered values.
- Asset purchase price means the total paid for the asset row, not a per-unit price.
- The week begins Saturday. Profit/loss is explicitly provisional as requested.
- The PIN setup hashes a PIN with PBKDF2 and stores the resulting hash in browser storage; an automatic lock screen and retry lockout still need to be added before real use.
- The app uses a lightweight static JavaScript shell instead of the requested Preact/TypeScript toolchain because no source code or package setup was present. This is a prototype implementation choice and should be revisited before production.
