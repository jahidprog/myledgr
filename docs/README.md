# Shohel Business prototype

## What is ready

This is a static Bangla PWA in `web/` with local persistence, demo data, customer/order/payment/expense flows, the additional prototype screens, feedback, reports, a PIN screen lock, and an Apps Script endpoint in `apps-script/add.gs`. First pairing to an empty sheet uploads the phone's demo records. Later updates push in small idempotent batches and refresh from the sheet. Do not use real business records in this prototype: local storage is not encrypted and the prototype still needs a real-phone acceptance pass.

## 1. Create the Sheet backend

1. Create a new, private Google spreadsheet for the prototype.
2. Open **Extensions → Apps Script**. Paste `apps-script/add.gs` into the editor (a file named `add.gs` is fine).
3. In Apps Script **Project Settings**, enable **Show `appsscript.json` manifest file**. Replace its contents with `apps-script/appsscript.json` and save.
4. From the editor, select `setup` and click **Run**. Review the requested Google permissions. Setup creates the tabs, protects header rows, generates the API token in Script Properties, creates the calculated tabs, and schedules a daily Drive backup. The token is not printed in logs.
5. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then deploy and authorize. Keep the Sheet itself private. Copy the `/exec` URL for the pairing step.
6. If you edit the script later, use **Deploy → Manage deployments → Edit → New version → Deploy**. The `/exec` URL stays the same. To invalidate existing pairing links, use the Sheet menu **Shohel App → ৪. Rotate token**.

The initial Google authorization may show an unverified-app screen. Confirm that this is your own script, then use **Advanced → Go to [project name]** to continue. Never approve a script you did not create or inspect.

## 2. Publish on GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch. Do not add an Apps Script token, pairing link, or `.clasp` credentials to GitHub. `.gitignore` excludes common local credential files.
2. In the repository, open **Settings → Pages** and select **GitHub Actions** as the build/deployment source.
3. The included `.github/workflows/pages.yml` publishes the contents of `web/`. Wait for the workflow to complete. The URL is usually `https://<github-user>.github.io/<repository>/`.
4. Check that the page opens over HTTPS. GitHub Actions needs no API-token secret: the token stays in Apps Script Script Properties and is transferred only inside the one-time pairing URL fragment.

## 3. Pair the Android phone

1. In the Sheet, choose **Shohel App → ৩. Pairing information** and enter the exact GitHub Pages URL, including the repository path and trailing slash if shown.
2. Send the resulting private link to the tester through a one-to-one channel. The token is inside the URL fragment; the app saves it and removes the fragment from the address bar. Delete the pairing message after pairing, and rotate the token at the end of the trial.
3. Open the pairing link in current Android Chrome. Set the PIN from **আরও → সেটিংস → PIN লক → সেট করুন**. The app performs the first sync; with an empty Sheet, the demo data on this phone is uploaded.
4. In Chrome, open **⋮ → Install app** (or **Add to Home screen**) and confirm. Launch **শোহেল** from the home screen. Turn on Airplane mode to check offline entry, then reopen the app online and tap **এখনই সিঙ্ক**.

## Important behavior

- The app uses browser local storage for its prototype cache. It is not encrypted. A JSON export intentionally omits the pairing token.
- A first sync to a truly empty Sheet uploads the demo data from the phone. If the Sheet already has customers, the app treats it as authoritative and does not seed the demo records.
- The Apps Script API supports snapshots, idempotent creates, and void operations. Some advanced production behaviors (all edit/version conflict paths, rich return/recovery audit screens, large-dataset optimization, formal self-tests and full phone QA) still need further review. Check `LIMITATIONS.md`.
- `add.gs` is a paste-in backend. The script does not include a real-data seed/import tool for the Sheet.
