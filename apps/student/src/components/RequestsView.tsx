import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { Avatar } from './Avatar';
import type { StudentProfile } from './Verification';

export interface ConnectRequest {
  id: string;
  from_id: string;
  to_id: string;
  match_type?: string;
  message?: string;
  status: string;
  created_at?: unknown;
}

interface RequestWithProfile extends ConnectRequest {
  senderProfile?: StudentProfile;
}

interface RequestsViewProps {
  currentUserId: string;
  onRequestHandled?: () => void;
}

export function RequestsView({ currentUserId, onRequestHandled }: RequestsViewProps) {
  const [incomingRequests, setIncomingRequests] = useState<RequestWithProfile[]>([]);
  const [sentRequests, setSentRequests] = useState<RequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'incoming' | 'sent'>('incoming');
  const [handlingId, setHandlingId] = useState<string | null>(null);

  // Real-time subscription to incoming requests
  useEffect(() => {
    setLoading(true);

    // Incoming requests (where current user is the recipient)
    const incomingQuery = query(
      collection(db, 'connect_requests'),
      where('to_id', '==', currentUserId),
      where('status', '==', 'pending')
    );

    const unsubIncoming = onSnapshot(incomingQuery, async (snapshot) => {
      const requests: RequestWithProfile[] = await Promise.all(
        snapshot.docs.map(async (d) => {
          const data = d.data() as ConnectRequest;
          const req: RequestWithProfile = { ...data, id: d.id };

          // Fetch sender profile
          try {
            const senderSnap = await getDoc(doc(db, 'students', data.from_id));
            if (senderSnap.exists()) {
              req.senderProfile = { id: senderSnap.id, ...senderSnap.data() } as StudentProfile;
            }
          } catch {
            // Profile fetch failed — continue without it
          }

          return req;
        })
      );
      setIncomingRequests(requests);
      setLoading(false);
    });

    // Sent requests (where current user is the sender)
    const sentQuery = query(
      collection(db, 'connect_requests'),
      where('from_id', '==', currentUserId),
      where('status', '==', 'pending')
    );

    const unsubSent = onSnapshot(sentQuery, async (snapshot) => {
      const requests: RequestWithProfile[] = await Promise.all(
        snapshot.docs.map(async (d) => {
          const data = d.data() as ConnectRequest;
          const req: RequestWithProfile = { ...data, id: d.id };

          try {
            const targetSnap = await getDoc(doc(db, 'students', data.to_id));
            if (targetSnap.exists()) {
              req.senderProfile = { id: targetSnap.id, ...targetSnap.data() } as StudentProfile;
            }
          } catch {
            // Continue
          }

          return req;
        })
      );
      setSentRequests(requests);
    });

    return () => {
      unsubIncoming();
      unsubSent();
    };
  }, [currentUserId]);

  const handleAccept = useCallback(async (requestId: string) => {
    setHandlingId(requestId);
    try {
      const acceptFn = httpsCallable(functions, 'acceptConnectRequest');
      await acceptFn({ request_id: requestId, action: 'accept' });
      onRequestHandled?.();
    } catch (e) {
      console.error('Failed to accept request:', e);
    } finally {
      setHandlingId(null);
    }
  }, [onRequestHandled]);

  const handleDecline = useCallback(async (requestId: string) => {
    setHandlingId(requestId);
    try {
      const acceptFn = httpsCallable(functions, 'acceptConnectRequest');
      await acceptFn({ request_id: requestId, action: 'decline' });
    } catch (e) {
      console.error('Failed to decline request:', e);
    } finally {
      setHandlingId(null);
    }
  }, []);

  const activeRequests = activeTab === 'incoming' ? incomingRequests : sentRequests;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">CONNECTION REQUESTS</p>
          <h1>Requests</h1>
          <p>Review incoming requests and track your sent requests.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="requests-tabs">
        <button
          className={`requests-tab ${activeTab === 'incoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('incoming')}
        >
          Incoming
          {incomingRequests.length > 0 && (
            <span className="requests-badge">{incomingRequests.length}</span>
          )}
        </button>
        <button
          className={`requests-tab ${activeTab === 'sent' ? 'active' : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          Sent
          {sentRequests.length > 0 && (
            <span className="requests-badge">{sentRequests.length}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="list-card">
          {[1, 2, 3].map((n) => (
            <div className="connection skeleton-card" key={n} style={{ minHeight: 80 }}>
              <div className="skeleton-avatar" style={{ width: 54, height: 54, position: 'relative', top: 0, left: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton-line title" style={{ marginTop: 0, width: '60%' }} />
                <div className="skeleton-line sub" style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : activeRequests.length > 0 ? (
        <div className="list-card">
          {activeRequests.map((req) => (
            <article className="request-item" key={req.id}>
              <Avatar student={req.senderProfile} />
              <div className="request-info">
                <h2>{req.senderProfile?.full_name ?? 'Campus student'}</h2>
                <p>
                  {req.senderProfile?.branch}
                  {req.senderProfile?.year ? ` · Year ${req.senderProfile.year}` : ''}
                  {req.match_type ? ` · ${req.match_type}` : ''}
                </p>
                {req.message && <p className="request-message">"{req.message}"</p>}
              </div>

              {activeTab === 'incoming' ? (
                <div className="request-actions">
                  <button
                    className="request-accept"
                    onClick={() => handleAccept(req.id)}
                    disabled={handlingId === req.id}
                  >
                    {handlingId === req.id ? '…' : '✓ Accept'}
                  </button>
                  <button
                    className="request-decline"
                    onClick={() => handleDecline(req.id)}
                    disabled={handlingId === req.id}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <span className="request-pending-badge">Pending</span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">{activeTab === 'incoming' ? '💌' : '📤'}</div>
          <h1>
            {activeTab === 'incoming'
              ? 'No incoming requests'
              : 'No sent requests'}
          </h1>
          <p>
            {activeTab === 'incoming'
              ? 'When someone sends you a connection request, it will appear here.'
              : 'Requests you send to peers from Discover will appear here.'}
          </p>
        </section>
      )}
    </section>
  );
}
