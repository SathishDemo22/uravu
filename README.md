# Uravu – உறவு

Family and friends, in Tamil and English. A single-page app that installs on your phone and works offline.
Everything is saved on the phone itself (browser storage); use **Settings › Save a backup file** to keep a copy.
Optional: sign in to back up and sync across devices with Supabase. Document numbers and files are encrypted on the phone first. See **[SUPABASE.md](SUPABASE.md)** to set it up.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: layout and the list of files to load |
| `css/app.css` | All the styles (light and dark) |
| `js/core.js` | Shared state, small helpers, icons |
| `js/data.js` | Sample family, saving to the phone, kinship engine (Tamil relation names), dates |
| `js/views.js` | Home, People and Dates pages |
| `js/tree.js` | The drawn family tree: zoom, find, save as image |
| `js/person.js` | Person page, quick edits, person and date forms |
| `js/pages.js` | Settings, how-connected, documents, functions, Ask Uravu, backup, bulk tools, moi |
| `js/shell.js` | Navigation and the app shell: tabs, ＋ menu, sheets, long-press, back gesture |
| `js/cloud.js` | Optional cloud sync: data ⇄ table rows, push/pull (newest edit wins), document vault encryption, the Supabase connection |
| `js/account.js` | Sign in, sync status, first sync, vault PIN, delete account |
| `js/main.js` | Install-as-app support, then starts the app |
| `config.js` | Supabase project URL and public anon key (empty = no cloud, works as before) |
| `vendor/supabase.js` | The Supabase client, copied from `node_modules` (`npm run vendor`) so it works offline with no build step |
| `privacy.html` | What is stored, where, and how the vault is protected |
| `supabase/migrations/` | Tables, row-level security, vault bucket and delete-account function (run in the Supabase SQL Editor) |
| `test/fake-cloud.mjs` | A stand-in for Supabase used by the sync tests |
| `test/cloud-rls.mjs` | Security tests against your real Supabase project (`npm run test:cloud`) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Makes it installable and work offline |
| `serve.js` | Small web server for testing on your computer and phone |
| `test/run-tests.mjs` | Automatic tests in Chrome at phone size |
| `tools/make_icons.py` | Redraws the app icons (`npm run icons`) |
| `eslint.config.mjs` | Code checks (`npm run lint`) |
| `.github/workflows/ci.yml` | Runs the code checks and tests on GitHub after every push |

The `js/` files are plain scripts, not modules. They share one set of names and are loaded **in the order `index.html` lists them**, so keep that order. A new file must also be added to `SHELL` in `sw.js`, or it won't work offline.

There is no build step: the files in this folder are exactly what gets published.

## Run it on your computer and phone

Needs [Node.js](https://nodejs.org) 20 or newer. `npm start` and `npm test` need nothing else installed. For `npm run lint`, run `npm install` once first.

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

- tabs, and each tab remembering its pages
- the page address (refresh and links open the same page)
- page slides and swipe-from-the-edge to go back
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
- cloud sync, using a fake Supabase and two separate "phones": sign up and first upload, a second phone taking the account's data, edits both ways, offline edits sent on reconnect, newest edit wins, deletes, restore, vault encryption (nothing readable reaches the cloud; the second phone needs the PIN), sign out, delete account
- the real Supabase client with the server out of reach

To test the security rules against your real Supabase project, see step 8 in [SUPABASE.md](SUPABASE.md):

```
npm run test:cloud
```

Screenshots go to `test/out/`.

To check the code for mistakes (an undefined name, unreachable code and so on):

```
npm install
npm run lint
```

On GitHub, both of these run automatically after every push (the **Actions** tab). The screenshots are saved there too.

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

1. Change the `VERSION` line at the top of `sw.js`, for example `uravu-2026-11-21-2`.
2. Commit and push.

Installed phones get the new version the next time they open the app while online.

## Your data

- Without signing in, data stays on each phone and is never sent to any server. The only things downloaded from outside are the Google Fonts.
- If you sign in (optional, when `config.js` is filled in), a copy syncs to your Supabase project. Only you can read it (row-level security). Document numbers, notes, photos and PDFs are encrypted on the phone with your vault PIN before upload. See [privacy.html](privacy.html).
- The phone always keeps its own full copy and works offline.
- Publishing the app does not publish your data.
- To move data to another phone: sign in on both, or save a backup file on the old phone and use **Restore from a backup file** on the new one.
