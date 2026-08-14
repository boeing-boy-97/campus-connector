# Campus Connect — Production Readiness Audit

Audit performed on the full monorepo (student web app, admin web app, Flutter mobile
client, Cloud Functions backend, Firestore/Storage rules, CI, docs).

Status legend: `FIXED` · `PARTIAL` · `BLOCKED` (needs an external credential)

---

## 1. Backend / Cloud Functions

| # | Problem | Severity | Status |
|---|---|---|---|
| B1 | `backend/functions/{auth,users,colleges,matching,chat,moderation}/*.ts` were stale duplicates of `src/functions/**` using the removed `firebase-functions` v1 root import and module-level `admin.firestore()`. Dead code excluded from `tsconfig`, so it silently rotted. | High (maintainability) | FIXED — superseded duplicates removed, unique features ported |
| B2 | `backend/functions/notifications/email.ts` called `nodemailer.createTransporter(...)` — **that function does not exist** (`createTransport`). Feature was unreachable (never exported). | High | FIXED — ported to `src/functions/notifications/email.ts`, typo fixed, exported |
| B3 | `backend/functions/notifications/push.ts` (`sendPushNotification`) was never exported from `src/index.ts`. | High | FIXED — ported and exported |
| B4 | `backend/index.ts` re-exported a path that is not part of the compiled program (`include: src/**`), so it was dead and misleading. | Low | FIXED — documented as the codebase entry alias |
| B5 | `sendOtp` claimed to prevent e-mail enumeration but returned a *different* payload (`college_name`, `expires_in_minutes`, different message) for registered domains. Attacker could enumerate registered colleges. | **Security (High)** | FIXED — responses are now byte-identical |
| B6 | `markNotificationsRead` filtered with the raw string `'__name__'`. Fragile; the documented API is `FieldPath.documentId()`. | Medium | FIXED |
| B7 | No admin capability to **suspend / reinstate** a student. Admin "Action Taken" on a report therefore changed nothing about the offending user. | High (moderation is non-functional) | FIXED — new `suspendUser` / `reinstateUser` callables, audited + claim sync |
| B8 | `updateProfile` accepted `profile_photos: string[].url()` — a client could inject **arbitrary external URLs** into another student's feed (SSRF-ish / content-injection). | **Security (High)** | FIXED — replaced by `updateProfilePhotos` which validates Storage ownership + existence |
| B9 | Profile photos could never be uploaded: no Storage rule for `profile_photos/**`, no callable, no UI. `STORAGE_PATHS.PROFILE_PHOTOS` was unused. | High (incomplete feature) | FIXED end-to-end |
| B10 | `otp_records` and `rate_limits` grow without bound (abandoned OTPs are never deleted). No TTL policy, no cleanup. | Medium (cost / privacy) | FIXED — scheduled `cleanupExpiredRecords` + documented TTL policies + `fieldOverrides` |
| B11 | `StudentService.create` was dead code duplicating `createProfile`'s write, and set a different field set. | Medium | FIXED — single write path |
| B12 | `NotificationService.connectRequestDeclined` was an empty no-op that nothing called. | Low | FIXED — removed; decline is intentionally silent and documented |
| B13 | `login` (updates `last_seen`, returns college branding) was exported but never called by any client. Presence + per-college branding were dead features. | Medium | FIXED — called by student app on session start |
| B14 | `getRecommendations` returned `has_more` / `next_cursor` that no client consumed → discovery was hard-capped at 20 profiles forever. | High | FIXED — real cursor pagination in the UI |
| B15 | `unmatch`, `deleteMessage`, `reportUser`, `blockUser`, `unblockUser`, `deleteAccount`, `checkEmailDomain`, `getCollegeBranding` were all implemented and exported but had **no UI in the web app**. Report/block are advertised safety features. | High | FIXED — all wired into the student app |
| B16 | `npm run test:rules` invoked a `test:rules` script in the functions workspace that **did not exist**. | Medium | FIXED — real Firestore/Storage rules test suite |
| B17 | Jest coverage was scoped to a single util file; only OTP helpers had tests. | Medium | FIXED — service/validation/rules/integration suites |

## 2. Authentication & Authorization

| # | Problem | Severity | Status |
|---|---|---|---|
| A1 | Admin `ProtectedRoute` required `role === 'admin'`, but the backend exposes moderator-only surfaces via `requireModerator`. Moderators could never sign in — a whole role was unusable. | High | FIXED — moderator sessions allowed, admin-only routes gated separately |
| A2 | Admin `LoginPage` signed moderators out with "Access denied". | High | FIXED |
| A3 | Firestore rules let only `self`/`admin` read `students`; the admin panel reads that collection with the **client** SDK, so moderators saw an empty Users table with a permission error. | High | FIXED — moderators may read students |
| A4 | Firestore rules contained 7 unused helper functions, one of which (`notBlocked`) still used the retired `{a}_{b}` block-document-ID scheme, i.e. it would have silently mis-evaluated if ever wired up. | Medium | FIXED |

## 3. Configuration / Deployment

| # | Problem | Severity | Status |
|---|---|---|---|
| C1 | Both web apps **hardcoded a real Firebase API key, project ID and bucket as a fallback**. A deploy with missing env vars would silently read/write the wrong project instead of failing. | **Security / deploy (High)** | FIXED — config is validated at boot and the app renders an actionable configuration error |
| C2 | Root `firestore.indexes.json` is a `//`-comment stub — **not valid JSON**. Any tooling pointed at the conventional path crashes. | High | FIXED — real alias content |
| C3 | Root `firestore.rules` was a comment-only stub that would deploy an empty ruleset if ever referenced. | High | FIXED |
| C4 | CSP had **no `media-src`**, so `default-src 'self'` blocked chat video playback from Firebase Storage. | High | FIXED |
| C5 | CSP lacked `worker-src`/`manifest-src`; `X-Frame-Options: SAMEORIGIN` contradicted `frame-ancestors 'none'`. | Low | FIXED |
| C6 | CI ran `npm ci` inside `apps/admin` / `backend/functions` with `cache-dependency-path` pointing at per-package lockfiles that **do not exist in an npm-workspaces repo** → every workflow failed. | High | FIXED — workspace-aware pipeline written, staged at `docs/ci/ci.yml`; **a maintainer must move it into `.github/workflows/`** (the automation lacks GitHub's `workflows` permission) |
| C7 | No CI workflow for the student web app at all. | Medium | FIXED (same staged pipeline) |
| C8 | Stray `apps/student/package-lock.json` conflicting with the workspace root lockfile. | Low | FIXED |
| C9 | `.env.example` mixed Vite client vars with server secrets; `apps/admin` had **no** `.env.example`; `apps/student/.env.example` was missing every Firebase variable. | Medium | FIXED |
| C10 | Vite dev servers had no `allowedHosts`, so previews behind a proxy host are rejected. | Medium | FIXED |
| C11 | `scripts/deployment/deploy.sh` ran `npm ci` inside workspaces (same failure as C6) and hardcoded a project fallback. | Medium | FIXED |
| C12 | Student bundle was a single 793 kB chunk; admin firebase chunk 715 kB. No code splitting. | Medium (perf) | FIXED — vendor/firebase/app chunks + lazy routes |

## 4. Student Web App

| # | Problem | Severity | Status |
|---|---|---|---|
| S1 | **Sign-out was unreachable on mobile** — the only button lived in `.sidebar`, which is `display:none` below 760 px. | High | FIXED |
| S2 | Discovery showed the "No new recommendations yet" empty state **while still loading** — a false empty state. | High | FIXED — skeletons + distinct error state + retry |
| S3 | Connections / Inbox / Chat had no loading state and no error recovery action. | High | FIXED |
| S4 | Chat loaded `orderBy('sent_at','asc') limit(100)` → the **oldest** 100 messages; a long thread never showed recent messages. | High | FIXED — newest-first window, reversed for display, "load older" |
| S5 | `markRead` fired on every snapshot that contained an unread message → duplicated writes in a feedback loop. | Medium | FIXED — de-duplicated per message set |
| S6 | Intent flags were **hardcoded** (`friendship`+`study` only) at onboarding and not editable. Dating / hackathon / project connections were impossible even though the whole matching engine keys off them. | High (feature dead) | FIXED — full selector at onboarding and in profile |
| S7 | Discovery hardcoded `match_type: 'friendship'`; gender/year filters unavailable. | High | FIXED |
| S8 | `RequestRow` left its submit buttons permanently disabled when the parent request failed. | Medium | FIXED |
| S9 | `ConnectionRow` / `RequestRow` / `Chat` each issued their own `getProfile` call → N+1 callable invocations per render. | Medium (perf/cost) | FIXED — shared request-deduplicating profile cache |
| S10 | `Chat`'s `getProfile` had no `.catch` → unhandled promise rejection in the console. | Medium | FIXED |
| S11 | Toasts never auto-dismissed and were the only feedback channel. | Low | FIXED — typed, auto-dismissing, accessible toasts |
| S12 | No message timestamps, no read receipts, no unread badges, no message deletion — despite `read_at`, `unread_count_*` and `deleteMessage` all existing server-side. | Medium | FIXED |
| S13 | No profile photo management, no account deletion, no report/block, no unmatch. | High | FIXED |
| S14 | No routing: the whole app was `useState` view switching, so no deep links, no back button, and a refresh always dropped the user on Discover. | Medium | FIXED — real routes, deep-linkable chats, 404 route |
| S15 | Navigation used decorative Unicode glyphs (`⌕ ♧ ◌ ◉ ♢`) as icons — inconsistent across platforms/fonts. | Medium (UI) | FIXED — inline SVG icon set |
| S16 | `index.css` was 4 lines of minified CSS — effectively unmaintainable. | Medium | FIXED — structured design-system stylesheet |
| S17 | No focus-visible styling, several colour pairs below AA contrast, no `prefers-reduced-motion` handling. | Medium (a11y) | FIXED |
| S18 | College branding / college name never surfaced anywhere in the UI. | Medium | FIXED |
| S19 | Unused `src/assets/{react,vite}.svg`, `hero.png`, `public/icons.svg` shipped in the repo. | Low | FIXED |

## 5. Admin Web App

| # | Problem | Severity | Status |
|---|---|---|---|
| D1 | "Add College" button did **nothing** — a dead button, while `createCollege` was fully implemented and already wired in `adminService`. | High | FIXED — validated create-college dialog |
| D2 | Dashboard quick-action links were raw `<a href="/verification">` — with `basename="/admin"` these navigated **outside the app** (full reload to a 404-ish rewrite). | High | FIXED — client-side `Link`s |
| D3 | Dashboard stat deltas were **hardcoded fake strings** (`+12% this week`, `+8% this week`). | High (fake data) | FIXED — computed from real Firestore data |
| D4 | `AnalyticsPage` was a placeholder card labelled "Live Data" with no data; `recharts` was an unused dependency. | High (fake) | FIXED — real charts over real aggregates |
| D5 | Referenced `/avatar-placeholder.png`; `apps/admin` had no `public/` directory → broken images. | Medium | FIXED — real inline avatar fallback |
| D6 | Not responsive: fixed 256 px sidebar with `margin-left`, `VerificationPage` fixed 340 px column inside `height:100vh; overflow:hidden`. Unusable below ~900 px. | High | FIXED — responsive shell, drawer nav, stacked review layout |
| D7 | `StatsCard`, `Badge`, `DataTable` components were dead code (pages inlined their own markup). | Medium | FIXED — pages now use the shared components |
| D8 | `className="justify-content-center"` — not a class that exists in the stylesheet. | Low | FIXED |
| D9 | Users page had no search, no pagination, no per-user actions, and rendered `any`. | High | FIXED |
| D10 | Reports page sent a **hardcoded** action note and could not act on the reported user. | High | FIXED — moderator note + suspend/reinstate |
| D11 | No audit-log viewer although `audit_logs` exists and rules already grant admins read access. | Medium | FIXED |
| D12 | `getUsers` built a `where + orderBy` query needing a composite index that was not declared. | Medium | FIXED — index added |
| D13 | No error states on Dashboard/Users/Colleges queries; failures rendered an empty table. | Medium | FIXED |

## 6. Flutter Mobile Client

| # | Problem | Severity | Status |
|---|---|---|---|
| M1 | `FirebaseService.markMessagesRead` called `httpsCallable('markMessagesRead')` — the deployed function is **`markRead`**. Read receipts were permanently broken. | High | FIXED |
| M2 | `sendOtp` was called with `{email}` only; the schema requires `consent_given === true`, so **mobile sign-up always failed** with a validation error. | **Blocker** | FIXED |
| M3 | `getCollegeBranding()` was called with no arguments; the schema requires `college_id`. | High | FIXED |
| M4 | `deleteAccount()` was called with no arguments; the schema requires `confirmation: "DELETE MY ACCOUNT"`. | High | FIXED |
| M5 | `login_screen.dart` duplicated the raw callable instead of using `FirebaseService`, with the same missing-consent bug. | High | FIXED |
| M6 | `discovery_screen.dart` duplicated raw callables and ignored `has_more` / `next_cursor`. | Medium | FIXED |
| M7 | `StorageService.uploadFile` wrote only `uploaded_at` custom metadata — Storage rules require `ownerId` (verification) and `uploader_id`/`match_id` (chat media), so **every mobile upload was rejected**. | **Blocker** | FIXED |

## 7. Data model / Firestore

| # | Problem | Severity | Status |
|---|---|---|---|
F1 | `matches.participant_ids` was written but never queried; clients ran two separate `student_a_id` / `student_b_id` listeners (2× reads). | Medium | FIXED — `array-contains` with legacy fallback |
| F2 | `messages` had no index for the newest-first chat window. | Medium | FIXED |
| F3 | `students` had no index for the admin `verification_status + created_at` listing. | Medium | FIXED |
| F4 | `audit_logs` had no index for the plain reverse-chronological admin feed. | Medium | FIXED |
| F5 | No TTL field overrides for `otp_records` / `rate_limits`. | Medium | FIXED |

## 8. Dependencies

| # | Finding | Action |
|---|---|---|
| P1 | `npm audit`: 14 advisories, **all** transitive through `firebase-tools` (dev-only CLI) and `firebase-admin`'s `@google-cloud/*` chain. | Documented. `firebase-tools` is a devDependency that never ships; forcing its major bump is a breaking change with no runtime benefit. Runtime deps are on current majors. |
| P2 | `nodemailer` 9 API (`createTransport`) vs the legacy file's `createTransporter`. | Fixed during the port (B2). |
| P3 | `recharts` declared but unused. | Now used by the real Analytics page (D4). |
| P4 | `@hookform/resolvers`, `react-hook-form`, `zod`, `clsx`, `date-fns` declared in the admin app but unused. | Now used by the new validated admin forms. |

## 9. Verified working before changes (no regression allowed)

- OTP hashing (scrypt, constant-time compare, salted, versioned) — solid.
- OTP consumption is transactional and replay-safe.
- Rate limiting is a transactional Firestore token bucket with hashed keys.
- Firestore rules are default-deny with all writes owned by Cloud Functions.
- Verification photos and chat media are private; moderators receive short-lived signed URLs.
- Deterministic pair IDs (sha256 of the sorted pair) prevent duplicate matches/requests under concurrency.
- `toPublicStudentProfile` is an explicit allowlist, so private fields cannot leak to peers.
- 18+ age gate enforced server-side.
- DPDP-style soft delete anonymises PII, revokes tokens and disables the auth user.
