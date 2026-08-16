# 📧 OTP Email Configuration Guide

OTP codes are sent by the `sendOtp` Cloud Function using SMTP. The function reads
its configuration from **runtime environment variables first** and falls back to
the legacy `firebase functions:config:set` runtime config. Use one of the options
below.

> ⚠️ The old guide only described `firebase functions:config:set`, but the code
> also reads `process.env`. `functions:config:set` does **not** populate
> `process.env`, so a config that looked "set" in Firebase was invisible to the
> deployed function. The code now reads both sources, and the environment-variable
> approach below is the recommended one for production.

---

## Option A — Runtime environment variables (Recommended for production)

A deployed Cloud Function receives environment variables through Google Cloud.
Set these four variables so they become `process.env.SMTP_*`:

| Variable    | Example                          | Notes                                   |
|-------------|----------------------------------|------------------------------------------|
| `SMTP_HOST` | `smtp.gmail.com`                 | e.g. `smtp.sendgrid.net`, `smtp.resend.com` |
| `SMTP_PORT` | `587`                            | Use `465` for implicit TLS              |
| `SMTP_USER` | `noreply@campusconnect.app`      | SMTP login                              |
| `SMTP_PASS` | `your-16-char-app-password`      | App password / API key — treat as secret |

**Where to set them (pick one):**

1. **Google Cloud console** → Cloud Functions → `sendOtp` → **Edit** →
   **Runtime, build, connections and security settings** → **Runtime environment
   variables**. Redeploy so the new revision picks them up.

2. **`gcloud` CLI** (also sets the same runtime env vars):
   ```bash
   gcloud functions deploy sendOtp \
     --region=asia-south1 \
     --set-env-vars SMTP_HOST=smtp.gmail.com,SMTP_PORT=587,SMTP_USER=noreply@campusconnect.app \
     --set-secrets SMTP_PASS=SMTP_PASS:latest
   ```

3. **Firebase Secrets** (best for `SMTP_PASS`):
   ```bash
   firebase functions:secrets:set SMTP_PASS
   # paste the app password when prompted
   ```
   Then make sure the function references the secret (see the code comment in
   `sendOtp.ts`) and redeploy.

---

## Option B — Legacy Firebase runtime config (backwards-compatible)

Still supported by the code, but deprecated by Firebase. Prefer Option A.

```bash
cd backend/functions

firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="587" \
  smtp.user="noreply@campusconnect.app" \
  smtp.pass="your-16-char-app-password"
```

Then deploy:

```bash
npm run build
npm run deploy
```

---

## Option C — Local development (emulator)

Create `backend/functions/.env.local` (copy `.env.local.example`):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

Then start the emulator:

```bash
cd backend/functions
npm run serve
```

Without SMTP credentials the emulator logs the generated OTP to the console so
you can still test the flow end-to-end.

---

## Getting a Gmail App Password

1. Enable **2-Factor Authentication** on the Gmail account.
2. Go to https://myaccount.google.com/apppasswords
3. Select **Mail** → your device → **Generate**.
4. Copy the 16-character password and remove spaces.

**Alternative providers:**

| Provider   | Host                            | Port | Notes                          |
|------------|---------------------------------|------|--------------------------------|
| Gmail      | `smtp.gmail.com`                | 587  | App password + 2FA required    |
| SendGrid   | `smtp.sendgrid.net`             | 587  | `apikey` / `SG.xxxx`           |
| AWS SES    | `email-smtp.<region>.amazonaws.com` | 587 | IAM SMTP credentials         |
| Resend     | `smtp.resend.com`               | 587  | `resend` / `re_xxxx`           |

---

## Prerequisite: an approved college must exist

Even with perfect SMTP, `sendOtp` only emails addresses whose domain matches an
**approved** college in Firestore:

```
colleges/{id} { domain: "xyzcollege.edu.in", verified_status: "approved" }
```

If no approved college matches the email's domain, the function returns
`otp_sent: false` and the UI shows *"This email domain is not registered."*

- Add/approve colleges from the **Admin panel → Colleges**.
- Or seed development data: `npm run seed` (emulator).
- Or verify a domain directly with the `checkEmailDomain` Cloud Function.

---

## Troubleshooting

### "Email service not configured. Contact admin."
- `SMTP_USER` / `SMTP_PASS` are missing from the deployed function's runtime
  environment (Option A) **or** from `functions:config:set` (Option B).
- Re-check the function's environment in the GCP console and redeploy.

### "Email delivery failed: …"
- Wrong app password, or the SMTP provider rejected the connection.
- Check `firebase functions:log` for `sendOtp` entries.

### OTP sent but not received
- Check spam/junk and the SMTP provider's delivery logs.

### "This email domain is not registered."
- The email domain has no approved college document (see prerequisite above).
