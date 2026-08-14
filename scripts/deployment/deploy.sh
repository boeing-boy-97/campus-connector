#!/usr/bin/env bash

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CAMPUS CONNECT — PRODUCTION DEPLOYMENT SCRIPT                           ║
# ║  Deploys Cloud Functions, Firestore Rules & Indexes, Storage Rules,     ║
# ║  and Admin Panel to Firebase Hosting                                     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -e # Exit immediately on error

echo "🚀 Starting Campus Connect Production Deployment..."
echo "====================================================="

PROJECT_ID=${FIREBASE_PROJECT_ID:-"campus-connect-prod"}
echo "📌 Target Project: $PROJECT_ID"

# 1. Type Check & Build Backend
echo "⚙️ Building Cloud Functions..."
cd backend/functions
npm ci
npx tsc --noEmit
npm run build
cd ../..

# 2. Build Admin Web App
echo "🌐 Building React Admin Panel..."
cd apps/admin
npm ci
npm run build
cd ../..

# 3. Deploy to Firebase
echo "🔥 Deploying to Firebase..."
npx firebase-tools deploy \
  --project "$PROJECT_ID" \
  --only functions,firestore:rules,firestore:indexes,storage,hosting

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Admin URL: https://$PROJECT_ID.web.app"
