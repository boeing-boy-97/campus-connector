# CI/CD workflows — manual application required

The automated agent that produced this branch does not have GitHub's `workflows`
permission, so it cannot add or modify files under `.github/workflows/`. The
corrected pipeline is therefore staged here and must be applied by a maintainer.

## Why the existing workflows are broken

`.github/workflows/admin.yml` and `.github/workflows/functions.yml` both run:

```yaml
cache-dependency-path: apps/admin/package-lock.json      # does not exist
cache-dependency-path: backend/functions/package-lock.json # does not exist
```

…and then `npm ci` **inside** those directories. This repository is an npm
**workspaces** monorepo with a single lockfile at the root, so those per-package
lockfiles do not exist and every run fails at the install step. There is also no
workflow for the student web app at all.

## How to apply the fix

```bash
git mv docs/ci/ci.yml .github/workflows/ci.yml
git rm .github/workflows/admin.yml .github/workflows/functions.yml
# mobile.yml is kept: it builds the signed release APK, which ci.yml does not.
git commit -m "ci: replace per-app workflows with a workspace-aware pipeline"
```

`docs/ci/ci.yml` replaces both broken workflows with one pipeline that:

1. installs once at the repository root (`npm ci`) with correct cache keys;
2. lints all three workspaces (zero warnings tolerated);
3. type-checks all TypeScript;
4. runs the backend test suite (182 tests) and the student component tests (13);
5. uploads the coverage report as an artifact;
6. builds every package and asserts the hosting output actually exists;
7. analyses and tests the Flutter app in a parallel job;
8. deploys functions, rules, indexes, storage and hosting on a push to `main`.

`.github/workflows/mobile.yml` has been trimmed to just the release-APK job,
since analysis and tests are now covered by `ci.yml`.

## Required repository secrets

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON used for deployment |
| `FIREBASE_PROJECT_ID` | Deployment target project |
| `VITE_FIREBASE_API_KEY` | Web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Web config |
| `VITE_FIREBASE_PROJECT_ID` | Web config (must match `FIREBASE_PROJECT_ID`) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Web config |
| `VITE_FIREBASE_APP_ID` | Web config |

For the mobile release job: `KEYSTORE_BASE64`, `KEY_STORE_PASSWORD`,
`KEY_PASSWORD`, `KEY_ALIAS`.
