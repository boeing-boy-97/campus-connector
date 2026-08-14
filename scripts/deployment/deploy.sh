#!/usr/bin/env bash

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CAMPUS CONNECT — PRODUCTION DEPLOYMENT                                  ║
# ║                                                                          ║
# ║  Deploys Cloud Functions, Firestore rules & indexes, Storage rules and    ║
# ║  both web apps to Firebase Hosting.                                      ║
# ║                                                                          ║
# ║  Usage:                                                                  ║
# ║    FIREBASE_PROJECT_ID=my-project ./scripts/deployment/deploy.sh          ║
# ║                                                                          ║
# ║  Requires the six VITE_FIREBASE_* variables to be exported (the web apps  ║
# ║  refuse to build against an unconfigured project on purpose).             ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -Eeuo pipefail

# Always run from the repository root regardless of the caller's directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

fail() { printf '\n❌ %s\n' "$1" >&2; exit 1; }
step() { printf '\n▶ %s\n' "$1"; }

# ── 1. Validate configuration ────────────────────────────────────────────────
# The project ID is required rather than defaulted: silently deploying to a
# fallback project is exactly the kind of accident this script must prevent.
: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID must be set to the target Firebase project}"

REQUIRED_VARS=(
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then MISSING+=("$var"); fi
done

if (( ${#MISSING[@]} > 0 )); then
  fail "Missing required environment variables: ${MISSING[*]}
       See .env.example. The web apps will not start without them."
fi

if [[ "$VITE_FIREBASE_PROJECT_ID" != "$FIREBASE_PROJECT_ID" ]]; then
  fail "VITE_FIREBASE_PROJECT_ID ($VITE_FIREBASE_PROJECT_ID) does not match
       FIREBASE_PROJECT_ID ($FIREBASE_PROJECT_ID). Refusing to deploy a build
       that points at a different project than it is being deployed to."
fi

printf '🚀 Deploying Campus Connect to: %s\n' "$FIREBASE_PROJECT_ID"

# ── 2. Install (single root install — this is an npm workspaces monorepo) ────
step "Installing dependencies"
npm ci

# ── 3. Verify before shipping ───────────────────────────────────────────────
step "Linting"
npm run lint

step "Type-checking Cloud Functions"
npm --prefix backend/functions exec -- tsc --noEmit

step "Running tests"
npm run test:functions

# ── 4. Build ────────────────────────────────────────────────────────────────
step "Building functions and both web apps"
npm run build

[[ -f .firebase/hosting/index.html ]] \
  || fail "Student app build output missing at .firebase/hosting/index.html"
[[ -f .firebase/hosting/admin/index.html ]] \
  || fail "Admin app build output missing at .firebase/hosting/admin/index.html"

# ── 5. Deploy ───────────────────────────────────────────────────────────────
step "Deploying to Firebase"
npx firebase-tools deploy \
  --project "$FIREBASE_PROJECT_ID" \
  --only functions,firestore:rules,firestore:indexes,storage,hosting \
  --force

printf '\n✅ Deployment complete.\n'
printf '   Student app: https://%s.web.app\n' "$FIREBASE_PROJECT_ID"
printf '   Admin panel: https://%s.web.app/admin\n' "$FIREBASE_PROJECT_ID"
printf '\nReminder: SMTP credentials must be configured for OTP e-mail delivery:\n'
printf '   firebase functions:secrets:set SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM\n'
