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
import { ConnectionsView } from './components/ConnectionsView';
import type { MatchItem } from './components/ConnectionsView';
import { InboxView } from './components/InboxView';
import type { NoticeItem } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { Avatar } from './components/Avatar';

type View = 'discover' | 'connections' | 'inbox' | 'profile';

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover', icon: '⌕' },
  { id: 'connections', label: 'Connect', icon: '♧' },
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
  const [cardsLoading, setCardsLoading] = useState(false);
  const [toast, setToast] = useState('');

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
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  // Real-time Firestore subscriptions for matches and notifications
  useEffect(() => {
    if (!user) return;

    const matchesQuery = query(collection(db, 'matches'), where('student_a_id', '==', user.uid));
    const unsubMatches = onSnapshot(
      matchesQuery,
      (snapshot) => {
        setMatches(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<MatchItem, 'id' | 'otherId'>),
            otherId: docSnap.data().student_b_id,
          }))
        );
      },
      (error) => {
        console.warn('Matches snapshot error:', error);
      }
    );

    const noticesQuery = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(20)
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
      (error) => {
        console.warn('Notifications snapshot error:', error);
      }
    );

    return () => {
      unsubMatches();
      unsubNotices();
    };
  }, [user]);

  // Fetch discovery recommendations
  const getRecommendations = useCallback(async () => {
    if (!user || profile?.verification_status !== 'approved') return;
    setCardsLoading(true);
    try {
      const res = await callFunction<{ recommendations?: StudentProfile[]; students?: StudentProfile[] }>(
        'getRecommendations',
        { page_size: 20 }
      );
      setCards(res.data.recommendations ?? res.data.students ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load recommendations.';
      setToast(msg);
    } finally {
      setCardsLoading(false);
    }
  }, [user, profile?.verification_status]);

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
      setToast(`Connection request sent to ${student.full_name}.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not send connection request.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
      setView('discover');
    } catch (e) {
      console.error('Sign out error:', e);
    }
  };

  const activeMatches = useMemo(() => matches.filter((x) => x.status === 'active'), [matches]);
  const unreadCount = useMemo(() => notices.filter((x) => !x.is_read).length, [notices]);

  // Initial loading splash screen (prevents flickering)
  if (authLoading) {
    return (
      <div className="splash">
        <div className="brand-mark">C</div>
      </div>
    );
  }

  // Guest route
  if (!user) {
    return <AuthScreen />;
  }

  const isProfileIncomplete = !profile || profile.verification_status !== 'approved';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView('discover')} aria-label="Campus Connect home">
          <b>campus</b><i>connect</i>
        </button>

        <div className="top-actions">
          <button
            className="icon-button"
            aria-label="Notifications"
            onClick={() => setView('inbox')}
          >
            ♢{unreadCount > 0 && <sup>{unreadCount}</sup>}
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
              onClick={() => setView(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
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
        ) : view === 'discover' ? (
          <DiscoverView
            cards={cards}
            refresh={getRecommendations}
            onConnect={handleConnect}
            loading={cardsLoading}
          />
        ) : view === 'connections' ? (
          <ConnectionsView connections={activeMatches} />
        ) : view === 'inbox' ? (
          <InboxView notices={notices} />
        ) : (
          <ProfileView profile={profile} />
        )}
      </main>

      <nav className="mobile-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => setView(item.id)}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>

      {toast && (
        <button className="toast" onClick={() => setToast('')}>
          {toast} ×
        </button>
      )}
    </div>
  );
}
