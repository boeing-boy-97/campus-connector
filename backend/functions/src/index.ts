// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — CLOUD FUNCTIONS ENTRY POINT                           ║
// ║  src/index.ts — This is the file Firebase deploys                      ║
// ║                                                                         ║
// ║  Architecture: Each export is a thin handler that:                      ║
// ║    1. Validates input via middleware/validate.middleware.ts             ║
// ║    2. Checks auth via middleware/auth.middleware.ts                     ║
// ║    3. Rate limits via middleware/rateLimit.middleware.ts                ║
// ║    4. Delegates to a service in services/                               ║
// ║    5. Returns a typed ApiResponse                                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Initialize Firebase Admin SDK FIRST (singleton pattern)
import './config/firebase';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export { sendOtp }         from './functions/auth/sendOtp';
export { verifyOtp }       from './functions/auth/verifyOtp';
export { login }           from './functions/auth/login';
export { loginWithGoogle } from './functions/auth/loginWithGoogle';
export { updateUserRole }  from './functions/auth/updateUserRole';

// ─── Users ────────────────────────────────────────────────────────────────────
export { createProfile }  from './functions/users/createProfile';
export { updateProfile }  from './functions/users/updateProfile';
export { getProfile }     from './functions/users/getProfile';
export { deleteAccount }  from './functions/users/deleteAccount';
export { submitVerificationPhoto } from './functions/users/submitVerificationPhoto';

// ─── Colleges ─────────────────────────────────────────────────────────────────
export { createCollege }      from './functions/colleges/createCollege';
export { approveCollege }     from './functions/colleges/approveCollege';
export { getCollegeBranding } from './functions/colleges/branding';
export { checkEmailDomain }   from './functions/colleges/domainCheck';

// ─── Matching & Discovery ─────────────────────────────────────────────────────
export { getRecommendations }   from './functions/matching/recommendations';
export { sendConnectRequest }   from './functions/matching/connectRequest';
export { acceptConnectRequest } from './functions/matching/acceptRequest';
export { unmatch }              from './functions/matching/unmatch';

// ─── Chat ─────────────────────────────────────────────────────────────────────
export { sendMessage }    from './functions/chat/sendMessage';
export { markRead }       from './functions/chat/readMessage';
export { uploadMedia }    from './functions/chat/uploadMedia';
export { deleteMessage }  from './functions/chat/deleteMessage';

// ─── Moderation ───────────────────────────────────────────────────────────────
export { reportUser }               from './functions/moderation/reportUser';
export { blockUser }                from './functions/moderation/blockUser';
export { unblockUser }              from './functions/moderation/unblockUser';
export { reviewVerificationPhoto }  from './functions/moderation/verifyPhoto';

// ─── Notifications ────────────────────────────────────────────────────────────
export { markNotificationsRead }  from './functions/notifications/markRead';
export { getNotifications }       from './functions/notifications/getNotifications';
