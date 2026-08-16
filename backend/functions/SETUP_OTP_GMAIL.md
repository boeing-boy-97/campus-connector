# ⚡ OTP Email Setup (Gmail SMTP)

The `sendOtp` function delivers OTPs over SMTP. It reads `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` from:

1. **Runtime environment variables** (`process.env`) — set via the GCP console,
   `gcloud`, or Firebase Secrets. **Recommended for production.**
2. **Legacy `functions.config().smtp.*`** — set via
   `firebase functions:config:set smtp.*`. Kept for backwards compatibility.
3. **`backend/functions/.env.local`** — loaded by the local emulator only.

> ⚠️ `firebase functions:config:set` does **not** populate `process.env`, which is
> why the code reads `functions.config()` as a fallback. If you configure SMTP one
> way and the function still says "Email service not configured", double-check
> which source you actually configured.

---

## 1. Get a Gmail App Password

1. Enable 2FA: https://myaccount.google.com/security
2. Create an app password: https://myaccount.google.com/apppasswords
3. Select **Mail** → your device → copy the 16-char password (remove spaces).

---

## 2a. Production — runtime environment variables (recommended)

GCP console → Cloud Functions → `sendOtp` → Edit → Runtime environment variables:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
```

Or via `gcloud`:

```bash
gcloud functions deploy sendOtp \
  --region=asia-south1 \
  --set-env-vars SMTP_HOST=smtp.gmail.com,SMTP_PORT=587,SMTP_USER=your-gmail@gmail.com \
  --set-secrets SMTP_PASS=SMTP_PASS:latest
```

---

## 2b. Production — legacy Firebase config (fallback)

```bash
cd backend/functions
firebase functions:config:set smtp.host="smtp.gmail.com" smtp.port="587" \
  smtp.user="your-gmail@gmail.com" smtp.pass="your-16-char-app-password"
npm run build && npm run deploy
```

---

## 2c. Local emulator — `.env.local`

Copy `.env.local.example` → `.env.local`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
```

Then `npm run serve`. Without credentials the emulator prints the OTP to the
console (`[DEV MODE] OTP for …: 123456`).

---

## 3. Test

1. Make sure the email's domain belongs to an **approved** college in Firestore
   (`colleges/{id}.verified_status == "approved"`).
2. Enter the college email in the app and request an OTP.
3. Check the inbox (and spam) within ~10 seconds.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Email service not configured` | SMTP vars missing from the deployed function's env; redeploy after setting them. |
| `Email delivery failed: …` | Wrong app password / provider rejected; check `firebase functions:log`. |
| `535-5.7.8` auth failed | Regenerate the Gmail app password; ensure 2FA is enabled. |
| `otp_sent: false` in the app | No approved college matches the email domain. |
