// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — BACKEND README POINTER                                 ║
// ║                                                                          ║
// ║  This file is NOT the deployment entry point and is not part of any      ║
// ║  TypeScript program (the functions tsconfig only includes                 ║
// ║  `backend/functions/src/**`).                                            ║
// ║                                                                          ║
// ║  The deployed entry point is `backend/functions/src/index.ts`, declared   ║
// ║  in firebase.json as the `campus-connect-functions` codebase with source  ║
// ║  `backend/functions`.                                                    ║
// ║                                                                          ║
// ║  It previously did `export * from './functions/src/index'`, which looked  ║
// ║  like a real re-export but compiled to nothing and could mislead a reader ║
// ║  into editing the wrong file.                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export {};
