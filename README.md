# 🎓 Campus Connect

> A trusted, college-verified social & networking app — for students, by students.

[![Flutter Build](https://github.com/boeing-boy-97/campus-connector/actions/workflows/mobile.yml/badge.svg)](https://github.com/boeing-boy-97/campus-connector/actions/workflows/mobile.yml)
[![Admin Build](https://github.com/boeing-boy-97/campus-connector/actions/workflows/admin.yml/badge.svg)](https://github.com/boeing-boy-97/campus-connector/actions/workflows/admin.yml)
[![Functions Deploy](https://github.com/boeing-boy-97/campus-connector/actions/workflows/functions.yml/badge.svg)](https://github.com/boeing-boy-97/campus-connector/actions/workflows/functions.yml)

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
campus-connector/
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
git clone https://github.com/boeing-boy-97/campus-connector.git
cd campus-connector
```

### 2. Install Root Dependencies

```bash
npm install
```

If you need the workspace dependencies for the admin panel and functions separately:

```bash
cd apps/admin && npm install
cd ../../backend/functions && npm install
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
cp .env.example .env.local
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

# Firestore rules tests
firebase emulators:exec --only firestore "npm run test:rules"
```

---

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
