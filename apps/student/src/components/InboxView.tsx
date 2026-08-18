import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

export type NoticeItem = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean;
  created_at?: unknown;
};

interface InboxViewProps {
  notices: NoticeItem[];
  onNoticesViewed?: () => void;
}

export function InboxView({ notices, onNoticesViewed }: InboxViewProps) {
  const unreadKey = notices
    .filter((n) => !n.is_read)
    .map((n) => n.id)
    .join(',');

  // Auto-mark notifications as read when viewed.
  // Depend on the actual unread IDs rather than notices.length so a read-state
  // change or a replacement notification is handled correctly.
  useEffect(() => {
    const unreadIds = unreadKey ? unreadKey.split(',') : [];
    if (unreadIds.length === 0) return;

    const markRead = async () => {
      try {
        const markReadFn = httpsCallable(functions, 'markNotificationsRead');
        await markReadFn({ notification_ids: unreadIds });
        onNoticesViewed?.();
      } catch {
        // Silent fail — not critical
      }
    };

    // Delay slightly so the user actually sees the unread state.
    const timer = setTimeout(markRead, 2000);
    return () => clearTimeout(timer);
  }, [unreadKey, onNoticesViewed]);

  const formatTimestamp = (ts: unknown): string => {
    if (!ts) return '';
    try {
      const date = (ts as { toDate?: () => Date })?.toDate?.();
      if (!date) return '';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const getNoticeIcon = (type?: string) => {
    switch (type) {
      case 'new_match': return '♥';
      case 'connect_request': return '💌';
      case 'new_message': return '💬';
      case 'verification_approved': return '✅';
      case 'verification_rejected': return '❌';
      default: return '●';
    }
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">UPDATES</p>
          <h1>Inbox & Notifications</h1>
          <p>Requests, connection matches, and campus announcements.</p>
        </div>
      </div>

      {notices.length > 0 ? (
        <div className="list-card">
          {notices.map((n) => (
            <article className={`notice ${n.is_read ? '' : 'unread'}`} key={n.id}>
              <div className="notice-icon">
                {getNoticeIcon(n.type)}
              </div>
              <div className="notice-content">
                <h2>{n.title ?? 'Campus Connector update'}</h2>
                <p>{n.body}</p>
                <span className="notice-time">{formatTimestamp(n.created_at)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">◌</div>
          <h1>You're all caught up</h1>
          <p>Important activity and updates from your campus community will appear here.</p>
        </section>
      )}
    </section>
  );
}
