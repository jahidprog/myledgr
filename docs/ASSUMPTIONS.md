# Assumptions

- The UI is a self-contained static JavaScript PWA in `web/`; it does not use a bundler or framework.
- Until a Google Apps Script URL and token are paired, entries stay in browser local storage. The app can still be used locally and syncs queued changes when a backend is configured and online.
- Amounts are entered in taka and calculated as integer paisa in the browser. The Sheet stores amounts in taka.
- Customer balances are computed from active orders and payments. Expenses do not change customer balances.
- Voiding is a soft delete with a required reason; the original row remains in the Sheet.
- The PWA is a prototype. It has no PIN screen lock, encryption, or cross-device conflict resolution.
