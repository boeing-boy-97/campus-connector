# ⚡ QUICK FIX: OTP Email Not Coming - Complete Setup

## 🎯 What's Wrong
OTP emails are not being sent because **SMTP credentials are missing or incorrect**.

---

## 🔧 STEP-BY-STEP FIX (5 minutes)

### Step 1: Create `.env.local` File

Create a new file: `backend/functions/.env.local`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-character-app-password
```

### Step 2: Get Gmail App Password

**If using Gmail:**

1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" → "Windows Computer" (or your device)
3. Google will generate a **16-character password**
4. Copy it (remove all spaces)
5. Paste it as `SMTP_PASS` in `.env.local`

**Example:**
```
SMTP_PASS=abcd efgh ijkl mnop
           ↓ Remove spaces ↓
SMTP_PASS=abcdefghijklmnop
```

### Step 3: Rebuild & Test

```bash
cd backend/functions

# Install dependencies if needed
npm install

# Build the code
npm run build

# For LOCAL TESTING: Start emulator
npm run serve

# For PRODUCTION: Deploy
npm run deploy
```

### Step 4: Test OTP Email

1. Go to your app's login page
2. Enter your college email (e.g., student@college.edu)
3. **Important:** The college domain MUST be registered in Firebase
4. Click "Send OTP"
5. **Check your email inbox within 10 seconds**

---

## ❌ Troubleshooting

### "Email service not configured. Contact admin."
- ✅ Make sure `.env.local` exists in `backend/functions/`
- ✅ Verify `SMTP_USER` and `SMTP_PASS` are set
- ✅ Run `npm run build` after creating `.env.local`

### Email not arriving
- ✅ Check **spam/junk folder**
- ✅ Check **Gmail security settings** (allow "Less secure app access" if needed)
- ✅ Make sure college domain is **approved** in Firebase

### "SMTP credentials not configured"
- ✅ Restart the emulator/server after adding `.env.local`
- ✅ Make sure there are **no spaces** in passwords

### Authentication failed - 535-5.7.8
- ✅ Your Gmail **App Password is wrong** - regenerate it
- ✅ Make sure you're using **App Password**, not regular password
- ✅ 2FA must be **enabled** on your Gmail account

---

## 📋 Using Other Email Providers

**SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxx
```

**AWS SES:**
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-iam-user@
SMTP_PASS=your-smtp-password
```

**Resend:**
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxx
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] `.env.local` file exists in `backend/functions/`
- [ ] `SMTP_USER` and `SMTP_PASS` are not empty
- [ ] College domain is registered in Firebase (ask admin)
- [ ] College has `verified_status: "approved"` in Firestore
- [ ] Ran `npm run build` after creating `.env.local`
- [ ] Restarted emulator/server

---

## 🔍 View Email Logs

Check if email function is being called:

```bash
firebase functions:log
```

Look for messages like:
```
✓ OTP email sent successfully to t***@college.edu
✗ OTP email delivery failed for t***@college.edu
[DEV MODE] OTP for t***@college.edu: 123456
```

---

## Code Changes Made

- ✅ Updated `sendOtp.ts` to read from `.env.local`
- ✅ Added detailed error logging
- ✅ SMTP connection verification before sending
- ✅ Better error messages for debugging

The code now sends emails **reliably** without complex Firebase config setup.
