import { useEffect, useMemo, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './services/firebase';
import { AuthScreen } from './components/AuthScreen';
import { Verification } from './components/Verification';
import type { StudentProfile } from './components/Verification';
import { DiscoverView } from './components/DiscoverView';
import { ConnectionsView, type MatchItem } from './components/ConnectionsView';
import { ChatView } from './components/ChatView';
import { RequestsView } from './components/RequestsView';
import { InboxView, type NoticeItem } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { Avatar } from './components/Avatar';
import { ErrorBoundary } from './components/ErrorBoundary';

type View = 'discover' | 'connections' | 'requests' | 'inbox' | 'profile' | 'chat';

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover', icon: '⌕' },
  { id: 'connections', label: 'Connect', icon: '♧' },
  { id: 'requests', label: 'Requests', icon: '💌' },
  { id: 'inbox', label: 'Inbox', icon: '◌' },
  { id: 'profile', label: 'Profile', icon: '◉' },
];

const callFunction = async <T,>(name: string, data?: object): Promise<{ data: T }> => {
  const callable = httpsCallable<object, { success: boolean; data: T }>(functions, name);
  const res = await callable(data ?? {});
  return { data: res.data.data };
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>('discover');
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [cards, setCards] = useState<StudentProfile[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [activeChatMatchId, setActiveChatMatchId] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Auto-dismiss toast after 5 seconds
  const showToast = useCallback((msg: string) => {
    if (toastTimer) clearTimeout(toastTimer);
    setToast(msg);
    const timer = setTimeout(() => setToast(''), 5000);
    setToastTimer(timer);
  }, [toastTimer]);

  // Fetch student profile
  const fetchProfile = useCallback(async () => {
    try {
      const result = await callFunction<StudentProfile>('getProfile');
      setProfile(result?.data ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  // Listen to Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile();
      } else {
        setProfile(null);
        setCards([]);
        setMatches([]);
        setNotices([]);
        setPendingRequestCount(0);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  // Real-time Firestore subscriptions for matches and notifications
  useEffect(() => {
    if (!user) return;

    // Matches where user is student_a
    const matchesQueryA = query(collection(db, 'matches'), where('student_a_id', '==', user.uid), where('status', '==', 'active'));
    const unsubMatchesA = onSnapshot(
      matchesQueryA,
      (snapshot) => {
        const matchesA = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MatchItem, 'id' | 'otherId'>),
          otherId: docSnap.data().student_b_id,
        }));
        setMatches((prev) => {
          const matchesB = prev.filter((m) => m.student_b_id === user.uid);
          return [...matchesA, ...matchesB];
        });
      },
      (error) => console.warn('Matches snapshot error:', error)
    );

    // Matches where user is student_b
    const matchesQueryB = query(collection(db, 'matches'), where('student_b_id', '==', user.uid), where('status', '==', 'active'));
    const unsubMatchesB = onSnapshot(
      matchesQueryB,
      (snapshot) => {
        const matchesB = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MatchItem, 'id' | 'otherId'>),
          otherId: docSnap.data().student_a_id,
        }));
        setMatches((prev) => {
          const matchesA = prev.filter((m) => m.student_a_id === user.uid);
          return [...matchesA, ...matchesB];
        });
      },
      (error) => console.warn('Matches snapshot error:', error)
    );

    // Notifications
    const noticesQuery = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(30)
    );
    const unsubNotices = onSnapshot(
      noticesQuery,
      (snapshot) => {
        setNotices(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<NoticeItem, 'id'>),
          }))
        );
      },
      (error) => console.warn('Notifications snapshot error:', error)
    );

    // Incoming connect requests count
    const requestsQuery = query(
      collection(db, 'connect_requests'),
      where('to_id', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubRequests = onSnapshot(
      requestsQuery,
      (snapshot) => {
        setPendingRequestCount(snapshot.size);
      },
      (error) => console.warn('Requests snapshot error:', error)
    );

    return () => {
      unsubMatchesA();
      unsubMatchesB();
      unsubNotices();
      unsubRequests();
    };
  }, [user]);

  // Fetch discovery recommendations
  const getRecommendations = useCallback(async () => {
    if (!user || profile?.verification_status !== 'approved') return;
    setCardsLoading(true);
    try {
      const res = await callFunction<{ profiles?: StudentProfile[]; recommendations?: StudentProfile[]; students?: StudentProfile[] }>(
        'getRecommendations',
        { page_size: 20 }
      );
      // The backend (match.service.getRecommendations) returns `profiles`;
      // keep the legacy keys as fallbacks for older function deployments.
      setCards(res.data.profiles ?? res.data.recommendations ?? res.data.students ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load recommendations.';
      showToast(msg);
    } finally {
      setCardsLoading(false);
    }
  }, [user, profile?.verification_status, showToast]);

  useEffect(() => {
    if (user && profile?.verification_status === 'approved') {
      void getRecommendations();
    }
  }, [user, profile?.verification_status, getRecommendations]);

  // Send connection request
  const handleConnect = async (student: StudentProfile) => {
    try {
      await callFunction('sendConnectRequest', {
        to_id: student.id,
        match_type: 'friendship',
      });
      setCards((current) => current.filter((x) => x.id !== student.id));
      showToast(`Connection request sent to ${student.full_name}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send connection request.');
    }
  };

  const handleSignOut = async () => {
    if (!confirm('Sign out of Campus Connect?')) return;
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
      setView('discover');
    } catch (e) {
      console.error('Sign out error:', e);
    }
  };

  const openChat = (matchId: string) => {
    setActiveChatMatchId(matchId);
    setView('chat');
  };

  const activeMatches = useMemo(() => matches.filter((x) => x.status === 'active'), [matches]);
  const unreadCount = useMemo(() => notices.filter((x) => !x.is_read).length, [notices]);

  // Initial loading splash screen
  if (authLoading) {
    return (
      <div className="splash">
        <div className="splash-content">
          <div className="brand-mark">C</div>
          <p className="splash-text">Loading…</p>
        </div>
      </div>
    );
  }

  // Guest route
  if (!user) {
    return (
      <ErrorBoundary>
        <AuthScreen />
      </ErrorBoundary>
    );
  }

  const isProfileIncomplete = !profile || profile.verification_status !== 'approved';

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="topbar">
          <button className="wordmark" onClick={() => setView('discover')} aria-label="Campus Connect home">
            <b>campus</b><i>connect</i>
          </button>

          <div className="top-actions">
            <button
              className="icon-button"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              onClick={() => setView('inbox')}
            >
              ♢{unreadCount > 0 && <sup>{unreadCount}</sup>}
            </button>
            <button
              className="icon-button mobile-menu-btn"
              aria-label="Menu"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
            >
              ☰
            </button>
            <Avatar student={profile ?? undefined} size="small" />
          </div>
        </header>

        <aside className="sidebar">
          <div className="college-pill">
            <span className="status-dot" /> VERIFIED CAMPUS
          </div>

          <nav>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => {
                  setView(item.id);
                  setActiveChatMatchId(null);
                }}
              >
                <span>{item.icon}</span>
                {item.label}
                {item.id === 'requests' && pendingRequestCount > 0 && (
                  <span className="sidebar-badge">{pendingRequestCount}</span>
                )}
                {item.id === 'inbox' && unreadCount > 0 && (
                  <span className="sidebar-badge">{unreadCount}</span>
                )}
              </button>
            ))}
          </nav>

          <button className="signout" onClick={handleSignOut}>
            Sign out
          </button>
        </aside>

        <main className="content">
          {isProfileIncomplete ? (
            <Verification profile={profile} onProfileUpdated={fetchProfile} />
          ) : view === 'chat' && activeChatMatchId ? (
            <ChatView
              matchId={activeChatMatchId}
              currentUserId={user.uid}
              onBack={() => {
                setView('connections');
                setActiveChatMatchId(null);
              }}
            />
          ) : view === 'discover' ? (
            <DiscoverView
              cards={cards}
              refresh={getRecommendations}
              onConnect={handleConnect}
              loading={cardsLoading}
            />
          ) : view === 'connections' ? (
            <ConnectionsView
              connections={activeMatches}
              onOpenChat={openChat}
            />
          ) : view === 'requests' ? (
            <RequestsView currentUserId={user.uid} onRequestHandled={() => getRecommendations()} />
          ) : view === 'inbox' ? (
            <InboxView notices={notices} />
          ) : (
            <ProfileView profile={profile} onProfileUpdated={fetchProfile} />
          )}
        </main>

        <nav className="mobile-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              onClick={() => {
                setView(item.id);
                setActiveChatMatchId(null);
              }}
            >
              <span>
                {item.icon}
                {item.id === 'requests' && pendingRequestCount > 0 && (
                  <sup className="mobile-badge">{pendingRequestCount}</sup>
                )}
                {item.id === 'inbox' && unreadCount > 0 && (
                  <sup className="mobile-badge">{unreadCount}</sup>
                )}
              </span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>

        {toast && (
          <button className="toast" onClick={() => setToast('')} aria-live="polite">
            {toast} ×
          </button>
        )}
      </div>
    </ErrorBoundary>
  );
}
