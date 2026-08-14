# Campus Connect — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CAMPUS CONNECT SYSTEM                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐     HTTPS + Firebase SDK    ┌──────────────────────┐
│   Flutter Mobile    │◄───────────────────────────►│  Firebase Platform   │
│   (Android / iOS)   │                              │                      │
│                     │  • Firebase Auth (OTP)       │  ✓ Cloud Firestore   │
│  ✓ GoRouter         │  • Cloud Functions (TS)      │  ✓ Cloud Functions   │
│  ✓ Riverpod         │  • Firestore SDK             │  ✓ Firebase Storage  │
│  ✓ Dynamic theme    │  • Firebase Storage          │  ✓ Firebase Auth     │
│  ✓ App Check        │  • FCM                       │  ✓ FCM               │
└─────────────────────┘                              └──────────────────────┘
                                                               │
                                                    ┌──────────▼───────────┐
                                                    │    React Admin Panel  │
                                                    │   (Firebase Hosting)  │
                                                    │                       │
                                                    │  ✓ Verification Queue │
                                                    │  ✓ College Mgmt       │
                                                    │  ✓ User Moderation    │
                                                    │  ✓ Reports Dashboard  │
                                                    └───────────────────────┘
```

## Security Architecture

### College Isolation (THE critical mechanism)

Every Firestore document that touches student data has a `college_id` field.
**Every query is filtered by `college_id = current_user.college_id` at the Firestore rules layer** — not just the UI.

```
Student logs in → Firebase Auth custom claims: { role, college_id, verification_status }
                          │
             ┌────────────▼─────────────┐
             │    Firestore Security     │
             │    Rules Enforcement      │
             │                          │
             │  match /students/{id}:   │
             │    allow read: if        │
             │      target.college_id   │
             │      == my.college_id    │
             └──────────────────────────┘
```

A modified APK CANNOT bypass these rules — they run server-side on Firebase.

### Role Hierarchy

```
admin
  └── moderator
        └── student
```

- **student**: can read same-college verified profiles, manage own data
- **moderator**: + review verifications, update report status
- **admin**: + create/approve colleges, access all data, send notifications

### Verification Photo Security

```
Student uploads verification photo
          │
          ▼
Firebase Storage: verification_photos/{userId}/ (PRIVATE bucket)
          │
  ┌───────▼──────────────────────────────────────┐
  │  Storage Rules: allow read ONLY IF isAdmin()  │
  │  Normal students CANNOT access this path      │
  └───────────────────────────────────────────────┘
          │
          ▼
Admin Panel (Cloud Function) fetches signed URL
  → Displayed ONLY in admin verification queue
  → NEVER shown to other students
```

## Data Flow: New Student Signup

```
1. Student enters college email (e.g. john@jdcollege.edu.in)
2. checkEmailDomain() → validates domain → returns college branding
3. App immediately applies JD College colors/logo (dynamic theme)
4. sendOtp() → rate limited → OTP bcrypt hashed → stored in Firestore
5. Student enters OTP → verifyOtp() → bcrypt compare → Firebase custom token
6. Flutter signs in with custom token
7. Student fills profile → createProfile() → 18+ age gate → saved
8. Student uploads uniform photo → Firebase Storage (private bucket)
9. Admin review queue shows photo → approve/reject
10. verifyPhoto() → updates student status + Auth claims → notification sent
11. Student's profile goes live → visible to same-college verified peers only
```

## Multi-Tenancy Model

Each college is a completely isolated namespace:
- `college_id` is set at account creation from email domain
- Cannot be changed by the student (only admin can modify)
- All queries — discovery, matches, chat — are scoped by `college_id`
- Adding a new college = one new row in `colleges` collection + logo/colors

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Mobile | Flutter (Dart) | Single codebase → Android + iOS |
| State | Riverpod | Compile-safe, reactive |
| Navigation | GoRouter | Auth redirects, deep links |
| Backend | Firebase Cloud Functions (TypeScript) | Serverless, scalable |
| Database | Cloud Firestore | Real-time, flexible |
| Auth | Firebase Auth + custom OTP | College email verification |
| Storage | Firebase Storage | Private verification photos |
| Push | Firebase Cloud Messaging | Free, reliable |
| Admin | React + Vite | Fast SPA for internal tools |
| Query | TanStack Query | Smart caching, refetching |
| CI/CD | GitHub Actions | Automated testing + deploy |
