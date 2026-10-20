# Shohel Business prototype

This repository contains a Bangla-first static PWA in `web/` and an optional Google Sheets backend in `apps-script/add.gs`.

## What works in this version

- Add and search customers; record orders, payments, and expenses.
- View customer balances and recent activity.
- Void orders, payments, and expenses with a reason.
- Keep entries on the current browser while offline and sync them to a paired Sheet when online.
- Send feedback; it is queued with the other entries until sync succeeds.

The app starts empty. Add a customer first. There is no demo-data seed, PIN lock, report module, JSON export, or cloud backup setup in this version. Browser storage is not encrypted, so use sample information only. A real-phone acceptance pass is still needed.

## Create and connect the Sheet

1. Create a private Google spreadsheet for this prototype.
2. Open **Extensions → Apps Script** and paste `apps-script/add.gs` into a script file.
3. In Apps Script project settings, enable the `appsscript.json` manifest and replace it with `apps-script/appsscript.json`.
4. Run `setup` in the Apps Script editor and approve the permissions. It creates the required tabs and API token.
5. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then deploy. Keep the spreadsheet private and copy the deployed `/exec` URL.
6. In the spreadsheet, reload it and open **Shohel App → 2. Generate pairing link**. Enter the published app's HTTPS URL. Open the generated link on the phone; the app saves the pairing details and removes them from the address bar.

Apps Script may show an unverified-app screen during your first authorization. Continue only after confirming that this is the script you created and inspected. After script changes, deploy a new version from **Deploy → Manage deployments → Edit**. Use **Shohel App → 3. Rotate token** to invalidate old pairings.

## Publish with GitHub Pages

1. Push this repository to a GitHub repository's `main` branch. Never commit a pairing link, API token, or clasp credential.
2. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
3. The included `.github/workflows/pages.yml` publishes `web/`. After it finishes, open the HTTPS Pages URL and pair the phone using the steps above.

## Use the app

Add a customer, then use the home screen shortcuts to record an order, payment, or expense. The customer screen shows sales, collected payments, balance, and history. The status strip shows whether data is waiting to sync. If offline, entries stay on that browser and sync when it is online again. Keep the app open and tap **এখনই সিঙ্ক** to request a sync.

The app stores its cache and pairing token in browser local storage. Clearing site data removes local entries and pairing details. Do not enter confidential or real customer information in this prototype.
