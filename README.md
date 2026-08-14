# 🎓 Campus Connect

> A trusted, college-verified social & networking platform — for students, by students.

[![CI](https://github.com/boeing-boy-97/campus-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/boeing-boy-97/campus-connector/actions/workflows/ci.yml)

---

## 📖 Project overview

Campus Connect is a multi-tenant platform where verified college students connect
**only with peers from their own institution**. Every student is gated behind two
checks before their profile goes live:

1. **Institutional e-mail** — a one-time passcode is sent only to addresses on a
   domain belonging to an *approved* college.
2. **Human photo review** — a student ID or uniform photo is reviewed by a campus
   moderator before the profile becomes visible to anyone.

Students can then connect for **friendship**, **study groups**, **project teams**,
**hackathons** or **dating** — each of which is opt-in on both sides, so a
connection type only appears when both students enabled it.

### What makes it safe

| Guarantee | How it is enforced |
|---|---|
| Only real students | OTP to an institutional address on an admin-approved domain |
| Only verified profiles are visible | Moderator photo review; `requireVerified` on every discovery/chat endpoint |
| Per-college isolation | `college_id` checked server-side on every read path; peers only ever receive an allowlisted profile projection |
| 18+ only | Date of birth validated at profile creation (client and server) |
| Private evidence stays private | Verification photos are unreadable by peers; moderators get 15-minute signed URLs |
| Reversible safety tools | Report, block/unblock, unmatch, and moderator suspend/reinstate |
| Accountability | Every privileged action writes an immutable `audit_logs` entry |
| Data rights | Account deletion anonymises PII, closes matches, disables auth and revokes tokens |

---

## ✨ Features

### Student web app (`apps/student`)
- **Authentication** — passwordless OTP over college e-mail, live college lookup,
  resend cooldown, 6-digit code entry with paste support.
- **Onboarding** — profile creation with full validation, connection-type selection,
  verification photo upload, and live status (pending / rejected / approved).
- **Discover** — paginated feed filtered by connection type, year of study and gender,
  with skeleton loading, distinct empty and error states, and an optional intro note.
- **Connections** — searchable list with unread badges, last-message preview, relative
  timestamps and unmatch.
- **Chat** — realtime messaging, image/video attachments with client + server validation,
  day separators, read receipts, message deletion, "load earlier messages", and a
  read-only state once a connection ends.
- **Inbox** — incoming connection requests with accept/decline, plus notifications.
- **Profile** — edit bio/branch/year/interests/connection types/social links, manage up
  to six photos, review and lift blocks, and delete the account.
- **Throughout** — deep-linkable routes, auto-dismissing toasts, focus-visible styling,
  reduced-motion support, and a mobile-first responsive layout down to 320 px.

### Admin panel (`apps/admin`, served at `/admin`)
- **Dashboard** — live counts with real week-over-week trends and quick actions.
- **Verification queue** — side-by-side evidence review with signed URLs, approve/reject
  with a mandatory rejection reason that the student sees.
- **Reports** — resolved names (not raw UIDs), record an action note, and optionally
  suspend the reported account in the same step.
- **Users** — paginated listing, per-page search, status filters, suspend/reinstate,
  send an in-app announcement, resend onboarding e-mail.
- **Colleges** — create with full validation, approve/reject with reason (admin only).
- **Analytics** — real charts over Firestore aggregates: daily signups and connections,
  verification breakdown, connection-type mix, signups per college.
- **Audit log** — searchable, filterable record of every privileged action (admin only).
- **Roles** — administrators get everything; moderators get verification, reports and users.

### Mobile app (`apps/mobile`, Flutter)
Swipe-based discovery, chat, and the same OTP flow, sharing the identical Cloud
Functions API surface.

---

## 🏗️ Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│  Student web (React) │        │  Mobile (Flutter)    │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
           │  Firebase SDK (HTTPS callables + realtime listeners)
           └───────────────┬───────────────┘
                           ▼
           ┌───────────────────────────────────┐
           │  Cloud Functions (TypeScript)     │
           │  asia-south1                      │
           │                                   │
           │  handler → validate (Zod)         │
           │          → auth/role guard        │
           │          → rate limit             │
           │          → service                │
           │          → typed ApiResponse      │
           └───────────────┬───────────────────┘
                           ▼
      ┌────────────────────────────────────────────┐
      │  Firestore  (default-deny; all writes are  │
      │             performed by Cloud Functions)  │
      │  Storage    (private buckets, signed URLs) │
      │  Auth       (custom claims: role,          │
      │              college_id, verification)     │
      │  FCM        (push notifications)           │
      └────────────────────┬───────────────────────┘
                           ▲
           ┌───────────────┴───────────────┐
           │  Admin panel (React) at /admin│
           └───────────────────────────────┘
```

**Security model.** Clients have **read-only** access to Firestore and only to rows
they own or participate in. Every write goes through a Cloud Function, which is where
validation, authorization, rate limiting and audit logging live. A modified client
cannot forge a write or widen its own read scope.

---

## 🧰 Technology stack

| Layer | Technology |
|---|---|
| Student web app | React 19, TypeScript, React Router 7, Vite 8, hand-rolled design system |
| Admin panel | React 19, TypeScript, React Router 7, TanStack Query 5, Recharts 2, Zod, Vite 5 |
| Mobile | Flutter 3.22, Riverpod, GoRouter |
| Backend | Firebase Cloud Functions (Node 22, TypeScript), Zod validation |
| Database | Cloud Firestore (multi-tenant by `college_id`) |
| Files | Cloud Storage (private, signed URLs) |
| Auth | Firebase Auth — custom tokens + custom claims |
| Notifications | FCM (push) + Firestore (in-app) |
| E-mail | Nodemailer over any SMTP provider |
| Hosting | Firebase Hosting (student at `/`, admin at `/admin`) |
| Tests | Jest + in-memory Firebase doubles (backend), Vitest + Testing Library (frontend) |
| CI/CD | GitHub Actions → Firebase |

---

## 📁 Project structure

```
campus-connector/
├── apps/
│   ├── student/              React student web app
│   │   ├── src/components/   Design-system primitives (Icon, Modal, Toast, states…)
│   │   ├── src/pages/        AuthScreen, Onboarding, Discover, Connections, Inbox, Chat, Profile
│   │   ├── src/services/     firebase.ts (config guard), api.ts (typed client)
│   │   └── src/lib/          formatting, storage-URL cache, toast context
│   ├── admin/                React admin panel
│   └── mobile/               Flutter app
├── backend/functions/
│   ├── src/functions/        One file per callable, grouped by domain
│   ├── src/services/         Business logic (match, chat, student, college, notification)
│   ├── src/middleware/       validate (Zod), auth/role guards, rate limiting
│   ├── src/utils/            errors, logger, Firestore helpers, OTP, FCM, e-mail
│   └── src/test/             In-memory Firebase doubles + suites
├── firestore/
│   ├── rules/                Security rules (canonical)
│   ├── indexes/              Composite indexes + TTL policies (canonical)
│   └── schema/               Collection documentation
├── shared/                   Types, enums and constants used by web + backend
├── scripts/
│   ├── seed-data/            Emulator-only seed script (refuses to run elsewhere)
│   ├── deployment/           deploy.sh with pre-flight validation
│   └── prepare-hosting.mjs   Combines both web builds into one hosting output
└── docs/                     Architecture, audit report, config paths
```

---

## 🚀 Installation

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Java (JRE) | ≥ 11 — only for the Firebase emulator suite |
| Flutter | ≥ 3.22 — only for the mobile app |

### Setup

```bash
git clone https://github.com/boeing-boy-97/campus-connector.git
cd campus-connector

# One install for the whole monorepo (npm workspaces)
npm install

# Configure the web apps
cp apps/student/.env.example apps/student/.env.local
cp apps/admin/.env.example  apps/admin/.env.local
# …then fill in your Firebase values (see below)
```

> The web apps **deliberately refuse to start** without Firebase configuration and
> render an actionable error screen instead. This prevents a misconfigured deploy
> from silently connecting to the wrong project.

---

## 🔑 Environment variables

### Web apps — `apps/student/.env.local` and `apps/admin/.env.local`

From the Firebase console: **Project settings → Your apps → SDK setup and configuration**.
These identify the project and are public by design (access is governed by Security
Rules), but they are **required**.

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID for FCM |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_USE_FIREBASE_EMULATORS` | `true` to use the local emulator suite |
| `VITE_FIREBASE_EMULATOR_HOST` | Emulator host, default `127.0.0.1` |

### Cloud Functions — SMTP secrets (**required for OTP delivery**)

Store these as Firebase secrets, never in a file:

```bash
firebase functions:secrets:set SMTP_HOST     # e.g. smtp.sendgrid.net
firebase functions:secrets:set SMTP_PORT     # 587 (STARTTLS) or 465 (implicit TLS)
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set SMTP_FROM     # "Campus Connect <noreply@yourdomain>"
```

Any SMTP provider works (SendGrid, Mailgun, Amazon SES, Postmark, Google Workspace).
Use a sending domain with SPF and DKIM configured, or college mail servers will
reject or spam-folder the codes.

**If SMTP is not configured, `sendOtp` reports a clear configuration error rather
than pretending to send a code.** In the emulator the OTP is written to the
functions log instead, so local development needs no credentials.

### Deployment — `.env` or CI secrets

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Deployment target; must match `VITE_FIREBASE_PROJECT_ID` |

---

## 💻 Development

```bash
# Terminal 1 — Firebase emulators (Auth, Firestore, Functions, Storage)
npm run emulator

# Terminal 2 — seed sample colleges and students (emulator only)
npm run seed

# Terminal 3 — student app  → http://localhost:4173
npm run dev:student

# Terminal 4 — admin panel  → http://localhost:3000/admin
npm run dev:admin
```

Set `VITE_USE_FIREBASE_EMULATORS=true` in both `.env.local` files first.

### Creating the first administrator

Roles come from Auth custom claims. Create the user, then grant the claim:

```bash
# 1. Create an email/password user in the Firebase console (Authentication → Users)
# 2. Grant the role (run once, with Admin SDK credentials available):
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().getUserByEmail('admin@yourdomain.example')
  .then(u => admin.auth().setCustomUserClaims(u.uid, { role: 'admin' }))
  .then(() => console.log('Admin role granted. Sign out and back in.'))
  .catch(console.error);
"
```

Use `role: 'moderator'` for verification/reports/users access without college or
audit-log administration.

---

## 🧪 Testing

```bash
npm test              # everything (195 tests)
npm run test:functions # backend: 182 tests, Jest + in-memory Firebase doubles
npm run test:student   # frontend: 13 component tests, Vitest + Testing Library
npm run lint           # all three workspaces, zero warnings tolerated
npm run typecheck      # TypeScript, no emit
npm run check          # lint + typecheck + test + build
```

**Backend coverage** (~71% of lines) exercises the real service and handler code
against in-memory Firebase doubles — documents, queries, transactions, batches,
`FieldValue` sentinels, aggregation counts, Auth, Storage and FCM. The suites cover:

- **Authorization** — every guard, including cross-college and role escalation attempts.
- **Validation** — every shared schema primitive, including path-traversal and
  host-spoofing attempts.
- **Matching** — discovery filters, private-field leakage, cursor pagination, blocks,
  mutual-intent requirement, duplicate/concurrent requests, accept/decline/unmatch.
- **Chat** — participation checks, media ownership and type/size limits, read receipts,
  unread counters, deletion, and push degradation when a token is stale.
- **Students** — profile photo ownership, immutable fields, suspend/reinstate,
  DPDP-style deletion, claim synchronisation.
- **Rate limiting** — every configured bucket, window resets, per-subject isolation.
- **End-to-end** — a full journey through the deployed handlers: OTP → verify →
  profile → evidence → moderator approval → discover → connect → accept → message
  → read receipt → persistence check → edit → report → block → suspend → access revoked.

---

## 🏭 Production build

```bash
npm run build          # functions + both web apps + hosting output
```

Produces:
- `backend/functions/lib/` — compiled Cloud Functions
- `.firebase/hosting/` — student app at the root, admin panel under `/admin/`

Bundles are split into cacheable chunks (`react`, `router`, `firebase`, `charts`,
`query`, `vendor`), and the admin panel lazy-loads each route.

---

## 🚢 Deployment

### Automated (recommended)

> **Action required:** the corrected CI pipeline is staged at
> [`docs/ci/ci.yml`](docs/ci/README.md) because the automation that produced it
> lacks GitHub's `workflows` permission. A maintainer must move it into
> `.github/workflows/`. The two existing per-app workflows are broken (they
> `npm ci` against per-package lockfiles that do not exist in a workspaces
> monorepo) and should be deleted at the same time. See
> [`docs/ci/README.md`](docs/ci/README.md).

Pushing to `main` runs the CI pipeline and, if it passes, deploys. Configure these
repository secrets:

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON for deployment |
| `FIREBASE_PROJECT_ID` | Target project |
| `VITE_FIREBASE_*` | The six web config values |

### Manual

```bash
export FIREBASE_PROJECT_ID=your-project-id
export VITE_FIREBASE_API_KEY=…            # and the other five
./scripts/deployment/deploy.sh
```

The script validates configuration (including that the build target matches the
deploy target), lints, type-checks, tests, builds, verifies the hosting output
exists, and only then deploys.

### First-time project setup

```bash
firebase login
firebase use --add                      # select your project
npm run deploy:rules                    # rules + indexes first
firebase functions:secrets:set SMTP_HOST # …and the rest
npm run build && firebase deploy
```

Then, in the admin panel, **add and approve your first college** — students cannot
request a code until their e-mail domain belongs to an approved college.

> Composite indexes take a few minutes to build. Until they finish, some admin
> queries report "this query needs a Firestore index that has not finished building".

---

## 📡 API documentation

All callables are deployed to **`asia-south1`** and return
`{ success: true, data?: T }`. Errors are `HttpsError`s carrying a stable code in
`details.code`.

### Authentication

| Function | Auth | Purpose |
|---|---|---|
| `sendOtp` | public | Issues a passcode. Requires `consent_given: true`. Response is identical for registered and unregistered domains (no college enumeration). Rate limit: 3 / 10 min. |
| `verifyOtp` | public | Verifies the code, returns a custom token. Rate limit: 3 / 15 min; 3 wrong attempts burn the code. |
| `login` | signed in | Records presence, returns college branding. |

### Profile

| Function | Auth | Purpose |
|---|---|---|
| `createProfile` | college linked | Creates the profile. Enforces 18+. |
| `updateProfile` | signed in | Updates bio, branch, year, interests, connection types, social links. Rejects immutable and unknown fields. |
| `getProfile` | signed in / verified | Own full profile, or a peer's allowlisted projection. |
| `updateProfilePhotos` | signed in | Commits owned Storage paths (max 6). Arbitrary URLs are rejected. |
| `submitVerificationPhoto` | college linked | Submits evidence for review. |
| `deleteAccount` | signed in | Requires `confirmation: "DELETE MY ACCOUNT"`. Anonymises and disables. |

### Colleges

| Function | Auth | Purpose |
|---|---|---|
| `checkEmailDomain` | public | Whether a domain belongs to an approved college. |
| `getCollegeBranding` | public | Branding for a `college_id`. |
| `createCollege` | admin | Creates a college (pending). |
| `approveCollege` | admin | Approves or rejects a college. |

### Discovery & matching

| Function | Auth | Purpose |
|---|---|---|
| `getRecommendations` | verified | Cursor-paginated feed. Excludes self, other colleges, unverified, blocked, pending-request and already-matched students. |
| `sendConnectRequest` | verified | Requires both sides to have enabled the type. Rate limit: 30 / day. |
| `acceptConnectRequest` | verified | Accept (creates a match) or decline. |
| `unmatch` | verified | Ends a connection. |

### Chat

| Function | Auth | Purpose |
|---|---|---|
| `sendMessage` | verified | Text and/or media. Rate limit: 200 / hour. |
| `markRead` | verified | Marks the peer's messages read; clears the unread counter. |
| `deleteMessage` | verified | Sender-only soft delete; removes the attachment. |
| `uploadMedia` | verified | Signed upload URL scoped to the match. |

### Safety & moderation

| Function | Auth | Purpose |
|---|---|---|
| `reportUser` | verified | Files a report. Rate limit: 10 / day. |
| `blockUser` / `unblockUser` | signed in | Blocks (unmatching immediately) or unblocks. |
| `getBlockedUsers` | signed in | The caller's blocked list. |
| `getVerificationQueue` | moderator | Pending queue with 15-minute signed evidence URLs. |
| `reviewVerificationPhoto` | moderator | Approve/reject; rejection reason required. |
| `reviewReport` | moderator | Closes a report with an audited note. |
| `suspendUser` / `reinstateUser` | moderator | Suspends (revoking tokens and closing matches) or restores. |

### Notifications & analytics

| Function | Auth | Purpose |
|---|---|---|
| `getNotifications` | signed in | Paginated notifications. |
| `markNotificationsRead` | signed in | Marks some or all read. |
| `sendEmail` | admin | Resends a transactional e-mail. |
| `sendPushNotification` | admin | Sends an announcement to one student. |
| `getPlatformAnalytics` | moderator | Aggregates for the dashboard and charts. |

### Scheduled

| Function | Schedule | Purpose |
|---|---|---|
| `cleanupExpiredRecords` | every 6 h | Deletes expired OTP records and rate-limit buckets; expires stale pending requests. |

---

## 🗄️ Database

Collections: `colleges`, `students`, `verification_requests`, `connect_requests`,
`matches`, `messages`, `reports`, `blocks`, `notifications`, `audit_logs`,
`otp_records`, `rate_limits`. See
[`firestore/schema/collections.md`](firestore/schema/collections.md) for field-level
documentation.

Notable design points:
- **Deterministic pair IDs** — `matches` and `connect_requests` are keyed by a
  sha256 of the sorted participant pair, so two simultaneous requests collide on
  one document instead of creating duplicates.
- **Hashed keys** — `otp_records` and `blocks` use hashed document IDs, so no
  e-mail address or relationship is readable from an ID.
- **TTL policies** — `otp_records` and `rate_limits` expire automatically on
  `expires_at`, with a scheduled job as a backstop.
- **`participant_ids`** — lets clients use a single `array-contains` listener
  instead of two queries per user.

---

## 📚 Further documentation

- [`docs/AUDIT.md`](docs/AUDIT.md) — full production-readiness audit: every issue
  found, its severity, and how it was resolved.
- [`docs/architecture/overview.md`](docs/architecture/overview.md) — architecture detail.
- [`docs/CONFIG_PATHS.md`](docs/CONFIG_PATHS.md) — canonical config file locations.
- [`firestore/schema/collections.md`](firestore/schema/collections.md) — data model.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
