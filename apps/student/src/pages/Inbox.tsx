import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, fetchProfileCached } from '../services/api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { EmptyState, ListSkeleton, Spinner } from '../components/states';
import { useToast } from '../lib/toast';
import { formatRelative, describeStudent } from '../lib/format';
import {
  MATCH_TYPE_LABELS,
  type AppNotification,
  type ConnectRequest,
  type StudentPublicProfile,
} from '../types';

const NOTIFICATION_ICONS: Record<string, Parameters<typeof Icon>[0]['name']> = {
  new_match: 'connections',
  new_message: 'inbox',
  connect_request: 'send',
  verification_approved: 'shield',
  verification_rejected: 'alert',
  account_suspended: 'alert',
  account_reinstated: 'check',
  admin_announcement: 'spark',
};

export interface InboxProps {
  requests: ConnectRequest[];
  notifications: AppNotification[];
  loading: boolean;
  onResponded: (requestId: string) => void;
}

export function Inbox({ requests, notifications, loading, onResponded }: InboxProps) {
  const toast = useToast();
  const [senders, setSenders] = useState<Record<string, StudentPublicProfile>>({});
  const [pending, setPending] = useState<Record<string, 'accept' | 'decline'>>({});

  const senderIds = useMemo(() => requests.map((request) => request.from_id), [requests]);
  const senderKey = senderIds.join(',');

  useEffect(() => {
    if (senderIds.length === 0) return;
    let active = true;

    void Promise.all(
      senderIds.map((id) =>
        fetchProfileCached(id)
          .then((profile) => [id, profile] as const)
          .catch(() => null),
      ),
    ).then((entries) => {
      if (!active) return;
      const resolved: Record<string, StudentPublicProfile> = {};
      entries.forEach((entry) => { if (entry) resolved[entry[0]] = entry[1]; });
      setSenders((current) => ({ ...current, ...resolved }));
    });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderKey]);

  const respond = async (request: ConnectRequest, action: 'accept' | 'decline') => {
    setPending((current) => ({ ...current, [request.id]: action }));
    try {
      await api.respondToRequest(request.id, action);
      onResponded(request.id);
      toast.success(
        action === 'accept'
          ? `You are now connected with ${senders[request.from_id]?.full_name ?? 'this student'}.`
          : 'Request declined.',
      );
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not update that request.'));
    } finally {
      // Always clear, so a failure re-enables the buttons instead of leaving the
      // row permanently disabled (the original bug).
      setPending((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    }
  };

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const isEmpty = requests.length === 0 && notifications.length === 0;

  return (
    <section>
      <header className="page-head">
        <p className="eyebrow">Updates</p>
        <h1 className="display">Inbox</h1>
        <p className="lede">
          Connection requests, new matches and account updates.
          {unreadCount > 0 && ` ${unreadCount} unread.`}
        </p>
      </header>

      {loading && <ListSkeleton count={3} />}

      {!loading && requests.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <div className="panel-head">
            <h2>
              Connection request{requests.length === 1 ? '' : 's'}
              {' '}<span className="muted">({requests.length})</span>
            </h2>
          </div>
          <div className="list-card">
            {requests.map((request) => {
              const sender = senders[request.from_id];
              const busy = pending[request.id];

              return (
                <div className="list-row request-row" key={request.id}>
                  <Avatar student={sender} />
                  <div className="list-row-body">
                    <h3>{sender?.full_name ?? 'A student from your campus'}</h3>
                    <p>
                      {sender?.branch ? `${describeStudent(sender.branch, sender.year)} · ` : ''}
                      {MATCH_TYPE_LABELS[request.match_type ?? 'friendship']}
                    </p>
                    {request.message && (
                      <p className="muted" style={{ marginTop: 6, whiteSpace: 'normal' }}>
                        “{request.message}”
                      </p>
                    )}
                  </div>
                  <span className="list-row-time">{formatRelative(request.created_at)}</span>
                  <div className="list-row-actions">
                    <button
                      type="button"
                      className="button primary small"
                      disabled={Boolean(busy)}
                      onClick={() => void respond(request, 'accept')}
                    >
                      {busy === 'accept'
                        ? <><Spinner label="Accepting" size={14} /> Accepting…</>
                        : <><Icon name="check" size={15} /> Accept</>}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={Boolean(busy)}
                      onClick={() => void respond(request, 'decline')}
                    >
                      {busy === 'decline' ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div>
          <div className="panel-head">
            <h2>Notifications</h2>
          </div>
          <div className="list-card">
            {notifications.map((notification) => (
              <div
                className={`list-row${notification.is_read ? '' : ' is-unread'}`}
                key={notification.id}
              >
                <span className="state-icon" style={{ width: 36, height: 36, margin: 0, borderRadius: 11 }}>
                  <Icon name={NOTIFICATION_ICONS[notification.type ?? ''] ?? 'spark'} size={17} />
                </span>
                <div className="list-row-body">
                  <h3>{notification.title ?? 'Campus Connector update'}</h3>
                  <p style={{ whiteSpace: 'normal' }}>{notification.body}</p>
                </div>
                <span className="list-row-time">{formatRelative(notification.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && isEmpty && (
        <EmptyState
          icon="inbox"
          title="You are all caught up"
          description="Connection requests, new matches and account updates will appear here."
          action={<Link className="button secondary" to="/discover"><Icon name="discover" size={16} /> Discover people</Link>}
        />
      )}
    </section>
  );
}
