# Cloud sync with Supabase: setup and deploy

Uravu works with no account at all. These steps switch on **optional** sign-in and sync. Until `config.js` has your project's URL and key, nothing changes.

You do steps 1–7 once, in the Supabase dashboard (https://supabase.com/dashboard). Steps 8–10 happen in this folder.

## 1. Create the project

1. **New project.** Pick a strong database password and keep it in a password manager. The app never uses it.
2. **Region:** choose **Mumbai (ap-south-1)** if most of your family is in India. It's faster, and the data stays in India.
3. Wait about 2 minutes for the project to start.

> Free projects **pause after 7 days with no activity**. Open the dashboard and click **Restore** to wake one up. The app keeps working offline meanwhile and syncs again once the project is back.

## 2. Create the tables, security rules and vault bucket

Open **SQL Editor › New query**. Paste in each file below, in this order, and click **Run** after each one:

1. `supabase/migrations/20261121000100_uravu_tables.sql`: the 10 tables, row-level security on every table, and the newest-edit-wins trigger
2. `supabase/migrations/20261121000200_uravu_vault_storage.sql`: the private `vault` bucket and its folder-per-user rules
3. `supabase/migrations/20261121000300_uravu_delete_account.sql`: the "Delete my account" function

Each file can be run again safely.

To check: **Table Editor** lists `people, links, events, likes, docs, doc_terms, functions, guests, gifts, settings`, and each one shows **RLS enabled**. **Storage** shows a bucket named `vault` marked **Private**.

(If you use the Supabase CLI instead: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)

## 3. Email sign-in

**Authentication › Sign In / Providers › Email**
- **Enable Email provider:** on
- **Confirm email:** on (recommended; new accounts must click the link in their email)
- **Minimum password length:** 8 (the app asks for at least 8)

## 4. Where sign-in may return to

**Authentication › URL Configuration**
- **Site URL:** your published address, e.g. `https://YOUR-NAME.github.io/uravu/` or `https://uravu-xxxx.vercel.app/`
- **Redirect URLs:** add the same address, plus `http://localhost:8080/` for testing on your computer

Without these, email links and Google sign-in will refuse to come back to the app.

## 5. Make "Email me a sign-in code" work

**Authentication › Emails › Templates › Magic Link**: the default email has only a link. Add the code so people can type it in. This matters for installed apps, because a tapped link opens the browser and not the app:

```html
<h2>Your Uravu sign-in code</h2>
<p>Enter this code in Uravu: <b style="font-size:20px">{{ .Token }}</b></p>
<p>Or tap this link on the same device: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
```

**Email sending limits:** Supabase's built-in email sends only a few emails per hour, which is fine for testing. For real use, set up your own SMTP under **Authentication › Emails › SMTP Settings** (Resend, Brevo, Amazon SES and others all have free tiers).

## 6. Google sign-in (optional)

1. In **Google Cloud Console › APIs & Services › Credentials**, create an **OAuth client ID** of type **Web application**.
   - **Authorized redirect URI:** `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows this exact value on the Google provider page)
2. In Supabase, go to **Authentication › Sign In / Providers › Google**: switch it on and paste the **Client ID** and **Client secret**.
3. In `config.js`, set `google: true`.

## 7. Copy the two public values

Go to **Project Settings › API** (or **API Keys**) and copy:
- **Project URL** → `supabaseUrl` in `config.js`
- **anon public** key (newer projects call it the **publishable** key) → `supabaseAnonKey` in `config.js`

**Never** copy the `service_role` / **secret** key into the app, into `config.js`, or into git. The anon key is safe to publish: it can only do what the row-level security rules allow, and those only ever let a signed-in person reach their own rows.

## 8. Check the security rules against your real project

1. **Authentication › Users › Add user › Create new user.** Make two test users (for example `uravu-test-a@yourmail.com` and `uravu-test-b@yourmail.com`) and tick **Auto Confirm User**.
2. Create a file named `.env.test` in this folder. It's already in `.gitignore`, so it won't be committed.
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   URAVU_TEST_EMAIL_A=uravu-test-a@yourmail.com
   URAVU_TEST_PASSWORD_A=...
   URAVU_TEST_EMAIL_B=uravu-test-b@yourmail.com
   URAVU_TEST_PASSWORD_B=...
   ```
3. Run:
   ```
   npm run test:cloud
   ```
   It proves that:
   - signed-out visitors get nothing
   - user B can't read, change, delete or forge user A's rows in any of the 10 tables
   - an older edit never overwrites a newer one
   - documents refuse plain-text numbers
   - B can't list, download, sign a link to, overwrite or delete A's vault files
   - the bucket isn't public

   It cleans up after itself.

## 9. Try it on your computer

```
npm start
```

Open `http://localhost:8080`, then **Settings › Sign in to sync**. Create an account, then choose **Upload this device's data**. Open the address in a second browser (or a private window), sign in to the same account, and choose **Use my account's data on this device**. Edits on one now appear on the other after a sync. Use **Sync now** on the Account page, or wait a few seconds.

## 10. Deploy

1. Change `VERSION` at the top of `sw.js`, e.g. `uravu-2026-11-21-2`, so installed phones pick up the new files.
2. Commit `config.js` with your URL and anon key. Don't commit `.env.test`.
3. Push. GitHub Pages or Vercel publishes it, as described in the README.
4. Make sure the published address is in **Site URL / Redirect URLs** (step 4).

## Moving your real data in (do this once, carefully)

Your real people are in the browser where you entered them. Do these steps **in that same browser**, on the same address (same host and port):

1. **Settings › Save a backup file** first, and keep the file safe.
2. **Settings › Sign in to sync** → create your account.
3. Choose **Upload this device's data**. Your account starts empty, so nothing is replaced.
4. **Account › Document vault:** choose a vault PIN and write it down somewhere safe. Your documents upload only after this step, encrypted.
5. On your other devices, sign in and choose **Use my account's data on this device**. That device saves a backup file of whatever it had before taking the account's data.

## How the sync works (for reference)

- The device is the main copy. The app still saves to `localStorage` (`uravu.v1`) exactly as before, so all the offline features keep working.
- When signed in, a sync compares the data with what was last synced. It does this a few seconds after each change, on opening, when the internet comes back, and every 2 minutes while the app is open. Changed rows are pushed, and rows changed on other devices are pulled.
- Each row has `owner_id, id, data, updated_at, deleted, server_at`. The newest `updated_at` wins, and the database itself refuses an older edit (the `uravu_touch` trigger). Deleting something sets `deleted = true` and blanks its details.
- Sync bookkeeping (what was last synced, edits waiting to go up, vault data waiting for a PIN) is kept in IndexedDB (`uravu-sync`). Edits made offline wait there safely until the next sync.
- **Vault:** document numbers, notes, names, file names, and every photo and PDF are encrypted on the device with AES-256-GCM. The key comes from the vault PIN (PBKDF2-SHA256, 600,000 rounds, random salt). Only the encrypted text (`docs.secret`, `doc_terms.secret`) and encrypted files reach Supabase. A forgotten PIN can't be recovered.
- **Not yet supported:** changing the vault PIN, and seeing changes from another device instantly (the app checks every 2 minutes and on every change instead).
