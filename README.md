# Uravu – உறவு

Family and friends, in Tamil and English. A single-page app that installs on your phone and works offline.
Everything is saved on the phone itself (browser storage); use **Settings › Save a backup file** to keep a copy.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app |
| `manifest.webmanifest`, `sw.js`, `icons/` | Makes it installable and work offline |
| `serve.js` | Small web server for testing on your computer and phone |
| `test/run-tests.mjs` | Automatic tests in Chrome at phone size |
| `tools/make_icons.py` | Redraws the app icons (`npm run icons`) |

## Run it on your computer and phone

Needs [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```
npm start
```

It prints two addresses:

- **On this computer:** `http://localhost:8080`
- **On your phone:** `http://192.168.x.x:8080`. The phone must be on the same Wi-Fi. If Windows asks about the firewall, allow **Private networks**.

On the phone address, everything works except **Install** and **offline**. Browsers allow those only on `https://` (or `localhost`). To test install and offline, publish the app (below) and open the `https://` link on your phone.

## Test

```
npm test
```

This opens Chrome (or Edge) in the background at phone size and checks:

- tabs
- the ＋ menu
- long-press
- bottom sheets
- Back gesture
- badges
- downloads (backup, guest list, tree image, document photo)
- restore
- every page
- dark mode
- install
- offline
- that saved data from the original app opens unchanged

Screenshots go to `test/out/`.

## Publish free

### Option A: GitHub Pages

1. Create a free account at github.com, then create a new **public** repository named `uravu`. Don't add a README.
2. In this folder, run (replace `YOUR-NAME`):
   ```
   git remote add origin https://github.com/YOUR-NAME/uravu.git
   git push -u origin main
   ```
3. On GitHub, open the repository, then go to **Settings › Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **main** and **/ (root)**. Click **Save**.
4. After a minute your app is live at `https://YOUR-NAME.github.io/uravu/`.

### Option B: Vercel

1. Sign up at vercel.com with your GitHub account.
2. Click **Add New › Project**, import the `uravu` repository, and click **Deploy**. You don't need to change any settings.
3. Your app is live at `https://uravu-xxxx.vercel.app`. Every `git push` publishes again automatically.

### Install it on your phone

Open the `https://` link on your phone.

- **Android (Chrome):** tap **Install Uravu** on Home, or use the ⋮ menu and choose **Install app**.
- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.

### Publishing an update

1. Change the `VERSION` line at the top of `sw.js`, for example `uravu-2026-11-21-1`.
2. Commit and push.

Installed phones get the new version the next time they open the app while online.

## Your data

- Data stays on each phone. Your people, dates and documents are never sent to any server. The only things downloaded from outside are the Google Fonts.
- Publishing the app does not publish your data.
- Each phone or browser has its own separate copy.
- To move your data to another phone, save a backup file on the old phone. Then use **Restore from a backup file** on the new phone.
