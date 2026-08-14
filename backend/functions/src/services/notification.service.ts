// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notification.service.ts — Centralized notification dispatch            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { notify } from '../utils/fcm.utils';
import { NotificationType } from '../../../../shared/enums';

/**
 * Notification service — all in-app + push notifications go through here.
 * Keeps notification copy and types in one place.
 */
export const NotificationService = {

  async connectRequest(params: { toId: string; senderName: string; requestId: string }) {
    await notify({
      userId: params.toId,
      type: NotificationType.CONNECT_REQUEST,
      title: 'New Connection Request 💌',
      body: `${params.senderName} wants to connect with you!`,
      data: { request_id: params.requestId, type: NotificationType.CONNECT_REQUEST },
    });
  },

  async newMatch(params: { toId: string; matchedName: string; matchId: string }) {
    await notify({
      userId: params.toId,
      type: NotificationType.NEW_MATCH,
      title: "It's a Match! 💞",
      body: `You and ${params.matchedName} are now connected! Say hello 👋`,
      data: { match_id: params.matchId, type: NotificationType.NEW_MATCH },
    });
  },

  async newMessage(params: {
    toId: string;
    senderName: string;
    matchId: string;
    preview: string;
  }) {
    await notify({
      userId: params.toId,
      type: NotificationType.NEW_MESSAGE,
      title: params.senderName,
      body: params.preview,
      data: { match_id: params.matchId, type: NotificationType.NEW_MESSAGE },
    });
  },

  async verificationApproved(params: { userId: string; collegeName: string }) {
    await notify({
      userId: params.userId,
      type: NotificationType.VERIFICATION_APPROVED,
      title: '✅ Profile Verified!',
      body: `Your ${params.collegeName} profile is live. Start connecting!`,
      data: { type: NotificationType.VERIFICATION_APPROVED },
    });
  },

  async verificationRejected(params: { userId: string; reason?: string }) {
    await notify({
      userId: params.userId,
      type: NotificationType.VERIFICATION_REJECTED,
      title: '❌ Verification Update',
      body: params.reason || 'Your verification needs a retry. Please resubmit a clear photo.',
      data: { type: NotificationType.VERIFICATION_REJECTED },
    });
  },

  async connectRequestDeclined(_params: { toId: string; requestId: string }) {
    // Silent — no notification on decline (better UX, avoids embarrassment)
    // Only create in-app record if explicitly needed
  },
};
