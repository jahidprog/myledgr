# Prototype limitations

- The Sheet, Apps Script deployment, GitHub Pages site, and phone pairing still need to be set up in the owner's accounts.
- Browser local storage is not encrypted and can be lost when site data is cleared. Use sample information only.
- Sync runs while the app is open, retries periodically, and can queue writes offline. It does not provide background sync or cross-device conflict resolution.
- This build includes customer, order, payment, expense, feedback, settings, and sync flows. It does not include PIN lock, reports, returns, investments, assets, adjustments, rate chart, import/export, or a JSON backup screen.
- The Apps Script endpoint supports snapshots, idempotent creates, and void operations. It has no edit/version-conflict workflow or richer rejected-entry recovery screen.
- The service worker caches the app shell, not API responses.
- Real-phone installability, accessibility, low-end Android, iPhone, and offline acceptance have not been checked. No automated or Apps Script self-test suite is included.
