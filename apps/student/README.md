# Campus Connect — Student Web App

React + TypeScript + Vite frontend for the student experience. Talks directly to
Firebase Auth, Firestore, Cloud Storage, and the Cloud Functions deployed to
`asia-south1`.

## Sign-in methods

- **College email (OTP)** — the primary flow. `sendOtp` → email → `verifyOtp` →
  custom token. Requires an *approved* college whose `domain` matches the email.
- **Google** — Firebase popup sign-in, then `loginWithGoogle` verifies the college
  domain and sets the student's custom claims. Backend rejections are surfaced to
  the user (not swallowed).

> **Phone-number login is intentionally disabled.** Firebase phone auth alone
> cannot produce a Campus Connect student account (no college context / custom
> claims / profile provisioning), so it was removed from the UI until a complete
> phone onboarding flow is implemented.

## Environment variables

Copy `.env.example` → `.env.local` for local development:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX   # optional
VITE_USE_FIREBASE_EMULATORS=false           # "true" only for local dev
```

## Deploying to Vercel

The app reads its entire Firebase configuration from `import.meta.env.VITE_FIREBASE_*`
at build time. In the Vercel project → **Settings → Environment Variables**, make
sure **all** of these are set:

| Variable | Required | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✅ | From the Web App config |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | **Must match** the project your Cloud Functions are deployed to |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Numeric sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | `1:xxxx:web:xxxx` |
| `VITE_FIREBASE_MEASUREMENT_ID` | ⚠️ | Optional (Analytics) |

Checklist:

1. **Same Firebase project everywhere.** `VITE_FIREBASE_PROJECT_ID` must point to
   the same project that hosts `sendOtp`, `verifyOtp`, and `loginWithGoogle`
   (region `asia-south1`), otherwise every call fails with a mismatch.
2. **Add the Vercel domain as an authorized domain** in Firebase Console →
   Authentication → Settings → Authorized domains (e.g. `yourapp.vercel.app`),
   or Google pop-up sign-in will be blocked.
3. **Enable the Google sign-in provider** in Firebase Console → Authentication →
   Sign-in method.
4. **Redeploy after changing env vars.** Vercel rebuilds on change, but a manual
   redeploy is safest after adding Firebase config.
5. **Verify at runtime.** Open the deployed app's browser console — if config is
   missing you'll see `Missing Firebase config: VITE_FIREBASE_...`.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
```

To use the Firebase emulator suite, set `VITE_USE_FIREBASE_EMULATORS=true` in
`.env.local` and start the emulators from the repo root:

```bash
firebase emulators:start
```

## Build

```bash
npm run build    # type-checks (tsc -b) then bundles with Vite
npm run lint     # oxlint
```
