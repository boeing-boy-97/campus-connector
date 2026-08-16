# 🎓 Campus Connect

> A trusted, college-verified social & networking app — for students, by students.

[![Flutter Build](https://github.com/your-org/campus-connect/actions/workflows/mobile.yml/badge.svg)](https://github.com/your-org/campus-connect/actions/workflows/mobile.yml)
[![Admin Build](https://github.com/your-org/campus-connect/actions/workflows/admin.yml/badge.svg)](https://github.com/your-org/campus-connect/actions/workflows/admin.yml)
[![Functions Deploy](https://github.com/your-org/campus-connect/actions/workflows/functions.yml/badge.svg)](https://github.com/your-org/campus-connect/actions/workflows/functions.yml)

---

## 📖 What Is Campus Connect?

Campus Connect is a mobile-first platform where college students can:

- 💑 **Find a life partner / relationship** — within their own verified college
- 🤝 **Connect for friendship** — meet like-minded peers
- 💻 **Form project & hackathon teams** — find co-founders and teammates
- 📚 **Connect for study groups** — collaborative learning

### 🔐 What makes it safe?
- **Institutional email-only signup** — no Gmail/personal emails accepted
- **Mandatory uniform/ID photo verification** before any profile goes live
- **Per-college isolation** — students only ever see their own college peers
- **18+ age gate** — enforced at signup and Play Store level
- **Report & block** — built in from day one

---

## 🏗️ Architecture

```
Mobile App (Flutter)
       ↕ Firebase SDK (HTTPS)
Firebase Platform
  ├── Firebase Auth         ← OTP + email verification
  ├── Cloud Firestore       ← structured data (college-isolated)
  ├── Cloud Storage         ← photos (private buckets)
  ├── Cloud Functions       ← business logic (TypeScript)
  └── FCM                   ← push notifications
       ↕
Admin Web Panel (React)
  ├── Verification queue
  ├── College management
  ├── User moderation
  └── Analytics
```

---

## 📁 Project Structure

```
campus-connect/
├── apps/
│   ├── mobile/          ← Flutter mobile app (Android + iOS)
│   └── admin/           ← React admin dashboard
├── backend/
│   └── functions/       ← Firebase Cloud Functions (TypeScript)
├── firestore/
│   ├── rules/           ← Firestore security rules
│   ├── indexes/         ← Composite indexes
│   └── schema/          ← Collection schema documentation
├── shared/
│   ├── models/          ← Shared data models
│   ├── enums/           ← Shared enumerations
│   ├── constants/       ← Shared constants
│   └── types/           ← TypeScript type definitions
├── docs/
│   ├── api-docs/        ← API documentation
│   ├── database/        ← Database schema docs
│   ├── architecture/    ← Architecture diagrams
│   └── ui-design/       ← UI design specs
├── scripts/
│   ├── seed-data/       ← Test data seeding
│   ├── deployment/      ← Deployment automation
│   └── migration/       ← Database migrations
└── .github/workflows/   ← CI/CD pipelines
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Flutter | ≥ 3.22.0 |
| Dart | ≥ 3.4.0 |
| Node.js | ≥ 20.x |
| Firebase CLI | ≥ 13.x |
| Git | Latest |

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/campus-connect.git
cd campus-connect
```

### 2. Install Root Dependencies

```bash
npm install
```

### 3. Setup Firebase

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Select your project
firebase use <your-project-id>
```

> ⚠️ **Important:** Copy `.env.example` to `.env` and fill in your Firebase project credentials. Never commit `.env` to Git.

### 4. Setup & Run Cloud Functions

```bash
cd backend/functions
npm install
npm run build

# Run locally with emulator
cd ../..
firebase emulators:start
```

### 5. Setup & Run Flutter App

```bash
cd apps/mobile
flutter pub get
flutter run
```

### 6. Setup & Run Admin Panel

```bash
cd apps/admin
npm install
npm run dev
```

---

## 🔒 Security

See [docs/architecture/security.md](docs/architecture/security.md) for full security documentation.

Key security measures:
- **Firestore rules** enforce college_id isolation at the database layer
- **Firebase App Check** prevents non-genuine app clients
- **OTP rate limiting** — max 3 attempts per 10 minutes
- **Private Storage buckets** for verification photos
- **India DPDP Act 2023** compliance built-in

### Reporting Security Vulnerabilities

Please **do not** open a public GitHub issue for security vulnerabilities. Email `security@campusconnect.app` instead.

---

## 📱 Building the APK

```bash
cd apps/mobile
flutter build apk --release
# APK will be at: build/app/outputs/flutter-apk/app-release.apk
```

---

## 🧪 Running Tests

```bash
# Flutter tests
cd apps/mobile && flutter test

# Cloud Functions tests
cd backend/functions && npm test

# Firestore rules tests — none defined yet
# (see https://firebase.google.com/docs/rules/unit-tests to add them)
```

---

## ⚙️ Production Configuration

Before going live, make sure these are configured (they are the most common
causes of "login works in dev but not production"):

1. **SMTP for OTP emails.** The `sendOtp` function reads `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` from runtime environment variables
   first, then falls back to `firebase functions:config:set smtp.*`. Set them on
   the deployed function (GCP console → Functions → `sendOtp` → Runtime
   environment variables, or `gcloud --set-env-vars`, or Firebase Secrets). See
   [SETUP_OTP_EMAIL.md](SETUP_OTP_EMAIL.md).

   > ⚠️ `firebase functions:config:set` does **not** populate `process.env` — the
   > code reads `functions.config()` explicitly as a fallback.

2. **Student web app → Vercel.** The student app gets its Firebase config entirely
   from `VITE_FIREBASE_*` env vars. They must point to the **same** Firebase
   project that hosts the Cloud Functions (`asia-south1`). Full checklist in
   [apps/student/README.md](apps/student/README.md).

3. **Approved college data.** OTP and Google login both require an *approved*
   college whose `domain` matches the email (e.g. `student@xyzcollege.edu.in` →
   `domain: "xyzcollege.edu.in"`, `verified_status: "approved"`). Add/approve
   colleges from the Admin panel → Colleges, or seed development data with
   `npm run seed`.

4. **Phone login is disabled.** Firebase phone auth alone cannot provision a
   student account (no college context / custom claims / profile), so the
   student web app only offers College email and Google sign-in.

## 🌐 Deploying

```bash
# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

---

## 📋 Legal & Compliance

- [Privacy Policy](docs/legal/privacy-policy.md)
- [Terms of Service](docs/legal/terms-of-service.md)
- India DPDP Act 2023 compliant
- 18+ only — age verified at signup

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

Built with ❤️ for Indian college students.

---

*Campus Connect — Your College, Your Circle.*
