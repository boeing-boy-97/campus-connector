# Fix: OTP Email Configuration Guide

## Problem ✗
OTP codes are not being sent to user emails during login/signup.

## Solution ✓
The code was correct, but **SMTP credentials were not configured**. Follow these steps:

---

## Step 1: Set Up Gmail App Password

If using Gmail for `noreply@campusconnect.app`:

1. Enable 2-Factor Authentication on your Gmail account
2. Go to [Google Account Security](https://myaccount.google.com/apppasswords)
3. Select "Mail" and "Windows Computer" (or your platform)
4. Generate an **App Password** (16 characters)
5. Copy the app password (you'll need it in Step 2)

**Alternative:** Use any SMTP provider (SendGrid, Resend, AWS SES, etc.)

---

## Step 2: Configure Firebase Functions with SMTP Settings

### Option A: Production Deployment (Recommended)

Run these commands from your project root:

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

### Option B: Local Development (Emulator)

1. Create `.env.local` in `backend/functions/` directory:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@campusconnect.app
SMTP_PASS=your-16-char-app-password
```

2. Start Firebase emulator:

```bash
cd backend/functions
npm run serve
```

---

## Step 3: Test OTP Email Sending

1. Start the app (student or admin frontend)
2. Go to login/signup page
3. Enter a test email (e.g., `test@college.edu`)
4. Click "Send OTP"
5. Check email inbox for code within 10 seconds

**If still not receiving:**
- Check Firebase Functions logs: `firebase functions:log`
- Verify SMTP credentials are correct
- Check spam/junk folder
- Ensure college domain is registered in Firebase

---

## SMTP Provider Options

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| **Gmail** | smtp.gmail.com | 587 | Requires App Password, 2FA enabled |
| **SendGrid** | smtp.sendgrid.net | 587 | Best for production, high volume |
| **AWS SES** | email-smtp.[region].amazonaws.com | 587 | AWS-only, need IAM user |
| **Resend** | smtp.resend.com | 587 | Developer-friendly, free tier |

---

## Troubleshooting

### Error: "Email delivery is not configured"
→ SMTP variables not set. Run Step 2 again.

### Error: "Authentication failed"
→ Wrong password or username. Double-check credentials.

### OTP sent but email not received
→ Check spam folder or email provider's delivery logs.

### In Firebase console, seeing permission errors
→ Ensure you have "Editor" role on Firebase project.

---

## Files Modified in This Fix

- `backend/functions/src/functions/auth/sendOtp.ts` — Now supports Firebase config + env vars
- `backend/functions/src/config/firebase.ts` — Firebase Admin SDK setup (no changes needed)

## Related Files

- See `.env.example` for all configuration options
- OTP schema validation: `backend/functions/src/functions/auth/sendOtp.ts`
- Email template: `backend/functions/src/functions/auth/sendOtp.ts` (HTML email built-in)
