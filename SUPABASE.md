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
4. `supabase/migrations/20261121000400_uravu_realtime.sql`: live updates, so a change on one device appears on the others by itself

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

Open `http://localhost:8080`. With `config.js` filled in, Uravu opens to its sign-in screen. Create an account (or sign in), and your family opens. Open the same address in a second browser or a private window and sign in to the same account: a change in one appears in the other within a second or two.

## 10. Deploy

1. Change `VERSION` at the top of `sw.js`, e.g. `uravu-2026-11-21-2`, so installed phones pick up the new files.
2. Commit `config.js` with your URL and anon key. Don't commit `.env.test`.
3. Push. GitHub Pages or Vercel publishes it, as described in the README.
4. Make sure the published address is in **Site URL / Redirect URLs** (step 4).

## Old copies from the earlier version

The earlier version kept a copy on each device. The first time the online version opens on such a device, after you sign in it checks that copy against your account. It lists anything only the old copy has and offers **Add to my account**, **Download the old copy as a file**, and **Remove the old copy from this device**. Nothing on the device is removed until you tap Remove twice.

## How it works (for reference)

- **Online only, sign-in required.** With `config.js` filled in, the app opens to a sign-in screen. Your family is loaded from your account into memory and every change is saved straight back to it. Nothing about your family is written to the device: no `localStorage` data, no on-device photo store.
- The device remembers only the sign-in (Supabase's session, `uravu.auth`) and, once entered, the vault key (in IndexedDB `uravu-sync`, as a key the browser won't let anyone read out).
- **Offline:** you can look at what's already open, but changes can't be saved. An orange strip says so, and any change is undone with a message. Opening the app with no internet shows an offline screen that retries by itself.
- **Saving:** about half a second after each change, the app compares the data with what the account has and sends the difference. It also checks on opening, when the internet comes back, when the app comes back to the screen, and every 2 minutes.
- **Live updates:** each signed-in device listens to Supabase Realtime for changes to its own user's rows (RLS applies). When another device saves something, this device pulls it in within a second or two.
- Each row has `owner_id, id, data, updated_at, deleted, server_at`. The newest `updated_at` wins, and the database itself refuses an older edit (the `uravu_touch` trigger). Deleting something sets `deleted = true` and blanks its details.
- **Vault:** document numbers, notes, names, file names, and every photo and PDF are encrypted on the device with AES-256-GCM before they're saved. The key comes from the vault PIN (PBKDF2-SHA256, 600,000 rounds, random salt). Files are fetched with one-minute signed links and opened in memory only. A forgotten PIN can't be recovered.
- Without `config.js` values (as in the automatic tests), the app works the old way, on the device only.
- **Not yet supported:** changing the vault PIN.
