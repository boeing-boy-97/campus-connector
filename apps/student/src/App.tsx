import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { api, clearProfileCache, errorMessage } from './services/api';
import { Icon, type IconName } from './components/Icon';
import { Splash } from './components/states';
import { ToastProvider } from './components/Toast';
import { useToast } from './lib/toast';
import { Avatar } from './components/Avatar';
import { AuthScreen } from './pages/AuthScreen';
import { Onboarding } from './pages/Onboarding';
import { Discover } from './pages/Discover';
import { Connections } from './pages/Connections';
import { Inbox } from './pages/Inbox';
import { Chat } from './pages/Chat';
import { NotFound, Profile } from './pages/Profile';
import type {
  AppNotification,
  CollegeBranding,
  ConnectRequest,
  Match,
  MatchWithPeer,
  Student,
} from './types';

const NAV: Array<{ to: string; label: string; icon: IconName; badge?: 'requests' | 'unread' }> = [
  { to: '/discover', label: 'Discover', icon: 'discover' },
  { to: '/connections', label: 'Connections', icon: 'connections', badge: 'unread' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', badge: 'requests' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

/** Scrolls to the top on navigation so a new page never starts mid-scroll. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

interface SessionData {
  profile: Student | null;
  profileLoaded: boolean;
  branding: CollegeBranding | null;
  matches: MatchWithPeer[];
  requests: ConnectRequest[];
  notifications: AppNotification[];
  dataLoading: boolean;
}

/**
 * Owns every realtime subscription for a signed-in, verified student.
 *
 * Matches use a single `participant_ids array-contains` listener; the original
 * code ran two listeners (`student_a_id` and `student_b_id`) and merged them,
 * doubling the read cost. A fallback pair of listeners covers documents written
 * before `participant_ids` existed.
 */
function useSession(user: User | null): SessionData & { refreshRequests: (id: string) => void } {
  const toast = useToast();
  const [profile, setProfile] = useState<Student | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [branding, setBranding] = useState<CollegeBranding | null>(null);
  const [verified, setVerified] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [requests, setRequests] = useState<ConnectRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const loginCalled = useRef('');

  // Reset all session state when the user changes (sign-in or sign-out).
  useEffect(() => {
    setProfile(null);
    setProfileLoaded(false);
    setBranding(null);
    setVerified(false);
    setMatches([]);
    setRequests([]);
    setNotifications([]);
    setDataLoading(true);
    loginCalled.current = '';
    clearProfileCache();
  }, [user?.uid]);

  // Own profile — realtime so admin verification decisions appear instantly.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'students', user.uid),
      (snapshot) => {
        setProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Student) : null);
        setProfileLoaded(true);
      },
      (error) => {
        setProfileLoaded(true);
        toast.error(errorMessage(error, 'We could not load your profile.'));
      },
    );
  }, [user, toast]);

  const verificationStatus = profile?.verification_status;

  // Refresh the ID token once approved so the new custom claims (which gate
  // every verified-only callable and Storage rule) are present.
  useEffect(() => {
    let active = true;
    if (!user || verificationStatus !== 'approved') {
      setVerified(false);
      return;
    }

    void user.getIdToken(true)
      .then(() => { if (active) setVerified(true); })
      .catch((error) => toast.error(errorMessage(error, 'We could not refresh your session.')));

    return () => { active = false; };
  }, [user, verificationStatus, toast]);

  // Session bootstrap: records presence and returns college branding.
  useEffect(() => {
    if (!user || !verified || loginCalled.current === user.uid) return;
    loginCalled.current = user.uid;

    void api.login()
      .then((payload) => setBranding(payload.branding))
      // Branding is decorative; a failure must not block the app.
      .catch(() => undefined);
  }, [user, verified]);

  // Matches, requests and notifications.
  useEffect(() => {
    if (!user || !verified) return;

    const uid = user.uid;
    let settled = 0;
    const markSettled = () => {
      settled += 1;
      if (settled >= 3) setDataLoading(false);
    };

    const buckets: Record<'current' | 'legacyA' | 'legacyB', Match[]> = {
      current: [], legacyA: [], legacyB: [],
    };
    const emitMatches = () => {
      const unique = new Map<string, Match>();
      [...buckets.current, ...buckets.legacyA, ...buckets.legacyB]
        .forEach((match) => unique.set(match.id, match));
      setMatches([...unique.values()]);
    };
    const readMatches = (snapshot: { docs: Array<{ id: string; data: () => object }> }) =>
      snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Match));

    const onMatchError = (error: Error) =>
      toast.error(errorMessage(error, 'We could not load your connections.'));

    const unsubCurrent = onSnapshot(
      query(collection(db, 'matches'), where('participant_ids', 'array-contains', uid)),
      (snapshot) => { buckets.current = readMatches(snapshot); emitMatches(); markSettled(); },
      (error) => { onMatchError(error); markSettled(); },
    );

    // Legacy fallback for matches created before `participant_ids` was written.
    const unsubLegacyA = onSnapshot(
      query(collection(db, 'matches'), where('student_a_id', '==', uid)),
      (snapshot) => { buckets.legacyA = readMatches(snapshot); emitMatches(); },
      () => undefined,
    );
    const unsubLegacyB = onSnapshot(
      query(collection(db, 'matches'), where('student_b_id', '==', uid)),
      (snapshot) => { buckets.legacyB = readMatches(snapshot); emitMatches(); },
      () => undefined,
    );

    const unsubRequests = onSnapshot(
      query(
        collection(db, 'connect_requests'),
        where('to_id', '==', uid),
        where('status', '==', 'pending'),
        orderBy('created_at', 'desc'),
      ),
      (snapshot) => {
        setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ConnectRequest)));
        markSettled();
      },
      (error) => {
        toast.error(errorMessage(error, 'We could not load connection requests.'));
        markSettled();
      },
    );

    const unsubNotifications = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc'),
        limit(30),
      ),
      (snapshot) => {
        setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AppNotification)));
        markSettled();
      },
      (error) => {
        toast.error(errorMessage(error, 'We could not load notifications.'));
        markSettled();
      },
    );

    return () => {
      unsubCurrent();
      unsubLegacyA();
      unsubLegacyB();
      unsubRequests();
      unsubNotifications();
    };
  }, [user, verified, toast]);

  // Only active matches are actionable; attach the peer ID and unread counter.
  const activeMatches = useMemo<MatchWithPeer[]>(() => {
    if (!user) return [];
    return matches
      .filter((match) => match.status === 'active')
      .map((match) => ({
        ...match,
        peerId: match.student_a_id === user.uid ? match.student_b_id : match.student_a_id,
        unreadCount: Number(match[`unread_count_${user.uid}`] ?? 0) || 0,
      }));
  }, [matches, user]);

  // Optimistically drop a request the user just answered, so the row disappears
  // immediately instead of waiting for the snapshot round-trip.
  const refreshRequests = useCallback((requestId: string) => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }, []);

  return {
    profile,
    profileLoaded,
    branding,
    matches: activeMatches,
    requests,
    notifications,
    dataLoading: dataLoading && verified,
    refreshRequests,
  };
}

/** Signed-in application shell with navigation. */
function AppShell({ user }: { user: User }) {
  const toast = useToast();
  const session = useSession(user);
  const {
    profile, profileLoaded, branding, matches, requests, notifications, dataLoading,
  } = session;

  const unreadNotifications = notifications.filter((item) => !item.is_read).length;
  const unreadMessages = matches.reduce((sum, match) => sum + match.unreadCount, 0);
  const badgeCounts = { requests: requests.length, unread: unreadMessages };

  const location = useLocation();
  const markedRef = useRef(false);

  // Mark notifications read when the inbox is open, once per set of unread IDs.
  useEffect(() => {
    if (location.pathname !== '/inbox') {
      markedRef.current = false;
      return;
    }
    if (markedRef.current || unreadNotifications === 0) return;

    markedRef.current = true;
    void api.markNotificationsRead().catch(() => { markedRef.current = false; });
  }, [location.pathname, unreadNotifications]);

  const handleSignOut = () => {
    clearProfileCache();
    void signOut(auth).catch((error) => {
      toast.error(errorMessage(error, 'We could not sign you out.'));
    });
  };

  if (!profileLoaded) return <Splash message="Loading your profile" />;

  const approved = profile?.verification_status === 'approved';

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="wordmark" to={approved ? '/discover' : '/'} aria-label="Campus Connector home">
          <b>campus</b><i>connector</i>
        </NavLink>

        <div className="topbar-actions">
          {branding && (
            <span className="college-chip" title={branding.name}>
              <span className="status-dot" aria-hidden="true" />
              {branding.short_name || branding.name}
            </span>
          )}

          {approved && (
            <NavLink className="icon-button" to="/inbox" aria-label={`Inbox${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}>
              <Icon name="bell" size={20} />
              {unreadNotifications > 0 && (
                <span className="count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
              )}
            </NavLink>
          )}

          {approved && (
            <NavLink to="/profile" aria-label="Your profile">
              <Avatar student={profile ?? undefined} size="small" />
            </NavLink>
          )}

          {/* Sign-out must be reachable on every breakpoint. The original app
              placed it only in the desktop sidebar, which is hidden on mobile —
              leaving mobile users with no way to sign out. */}
          <button
            type="button"
            className="icon-button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={19} />
          </button>
        </div>
      </header>

      <div className="shell-body">
        {approved && (
          <nav className="sidebar" aria-label="Main navigation">
            <p className="nav-label">Verified campus</p>
            {NAV.map((item) => {
              const count = item.badge ? badgeCounts[item.badge] : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                  {count > 0 && <span className="count">{count > 9 ? '9+' : count}</span>}
                </NavLink>
              );
            })}
            <div className="sidebar-foot">
              <button type="button" className="nav-item" onClick={handleSignOut}>
                <Icon name="logout" size={19} />
                <span>Sign out</span>
              </button>
            </div>
          </nav>
        )}

        <main className="content" id="main">
          {!approved ? (
            <Routes>
              <Route
                path="*"
                element={
                  <Onboarding
                    profile={profile}
                    onProfileCreated={() => toast.success('Profile saved. One step to go.')}
                  />
                }
              />
            </Routes>
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/discover" replace />} />
              <Route path="/discover" element={<Discover profile={profile as Student} />} />
              <Route
                path="/connections"
                element={<Connections matches={matches} loading={dataLoading} />}
              />
              <Route
                path="/inbox"
                element={
                  <Inbox
                    requests={requests}
                    notifications={notifications}
                    loading={dataLoading}
                    onResponded={session.refreshRequests}
                  />
                }
              />
              <Route
                path="/chat/:matchId"
                element={
                  <Chat
                    matches={matches}
                    currentUserId={user.uid}
                    matchesLoading={dataLoading}
                  />
                }
              />
              <Route
                path="/profile"
                element={<Profile profile={profile as Student} branding={branding} />}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </main>
      </div>

      {approved && (
        <nav className="mobile-nav" aria-label="Main navigation">
          {NAV.map((item) => {
            const count = item.badge ? badgeCounts[item.badge] : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
              >
                <Icon name={item.icon} size={21} />
                <span>{item.label}</span>
                {count > 0 && <span className="count">{count > 9 ? '9+' : count}</span>}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setResolved(true);
  }), []);

  if (!resolved) return <Splash />;
  if (!user) return <AuthScreen />;
  return <AppShell user={user} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ScrollToTop />
        <Root />
      </ToastProvider>
    </BrowserRouter>
  );
}
