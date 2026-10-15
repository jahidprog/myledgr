# Prototype limitations

- The Apps Script endpoint and browser sync client are implemented, but the owner still needs to create the Sheet, paste and authorize the script, deploy the web app, publish the PWA, and pair the phone. These steps have not been performed in the user’s Google or GitHub accounts.
- Browser-local data is not encrypted and can be lost if site data is cleared. Do not enter sensitive business data.
- Cloud sync requires the app to be open. There is no background sync, no automatic retry timer, and no cross-device conflict resolution UI yet.
- PIN setup stores a PBKDF2 hash and the app locks on reopen or after two minutes in the background. Five-try escalating retry lockout is not implemented.
- Some screens and reports are first-pass forms. Editing/version conflicts, a user-facing void-with-reason flow, full report filters, category management, and broad validation still need completion. Server-side return limits and recovery limits are enforced.
- The static service worker caches the app shell only; it does not cache API responses.
- No real-phone installability, accessibility, low-end Android, iPhone, or offline acceptance pass has been run. No automated or Apps Script self-test suite is included yet.
