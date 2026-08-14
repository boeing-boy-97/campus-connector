import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, functions, storage } from './services/firebase';
import './chat-media.css';

type IntentFlags = Record<'dating' | 'friendship' | 'study' | 'hackathon' | 'project', boolean>;

type Student = {
  id: string;
  full_name: string;
  bio?: string;
  branch?: string;
  year?: number;
  interests?: string[];
  intent_flags?: IntentFlags;
  profile_photos?: string[];
  verification_status?: 'pending' | 'approved' | 'rejected' | 'suspended' | 'deleted';
  verification_submitted_at?: unknown;
  rejection_reason?: string;
};

type Match = {
  id: string;
  student_a_id: string;
  student_b_id: string;
  status: string;
  match_type?: string;
  last_message_preview?: string;
};

type ConnectRequest = {
  id: string;
  from_id: string;
  to_id: string;
  status: string;
  match_type?: string;
  message?: string;
};

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  text?: string;
  media_path?: string;
  media_type?: 'image' | 'video';
  is_deleted?: boolean;
};

type Notice = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean;
};

type View = 'discover' | 'connections' | 'inbox' | 'profile';

type ApiEnvelope<T> = { success: boolean; data: T };

async function callFunction<T>(name: string, data: object = {}): Promise<T> {
  const callable = httpsCallable<object, ApiEnvelope<T>>(functions, name);
  const result = await callable(data);
  if (!result.data?.success) {
    throw new Error('The server returned an invalid response.');
  }
  return result.data.data as T;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    return message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '.');
  }
  return fallback;
}

const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: 'discover', label: 'Discover', icon: '⌕' },
  { id: 'connections', label: 'Connect', icon: '♧' },
  { id: 'inbox', label: 'Inbox', icon: '◌' },
  { id: 'profile', label: 'Profile', icon: '◉' },
];

function Avatar({
  student,
  size = 'normal',
}: {
  student?: Partial<Student>;
  size?: 'small' | 'normal' | 'large';
}) {
  const photo = student?.profile_photos?.[0];
  return (
    <div className={`avatar ${size}`}>
      {photo ? (
        <img src={photo} alt={`${student?.full_name ?? 'Student'} profile`} />
      ) : (
        <span>{student?.full_name?.trim().slice(0, 1).toUpperCase() || '?'}</span>
      )}
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await callFunction('sendOtp', {
        email: email.trim().toLowerCase(),
        consent_given: form.get('consent') === 'on',
        consent_version: '1.0.0',
      });
      setStep('otp');
    } catch (error) {
      setError(errorMessage(error, 'Could not send the verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await callFunction<{ custom_token: string }>('verifyOtp', {
        email: email.trim().toLowerCase(),
        otp,
      });
      await signInWithCustomToken(auth, result.custom_token);
    } catch (error) {
      setError(errorMessage(error, 'The code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">COLLEGE-VERIFIED COMMUNITY</p>
        <h1>Meet your campus,<br /><em>for real.</em></h1>
        <p className="auth-copy">
          Campus Connector is a private space for verified students to find collaborators,
          friends, and meaningful connections.
        </p>

        {step === 'email' ? (
          <form onSubmit={submitEmail}>
            <label>
              College email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                required
              />
            </label>
            <label className="consent-row">
              <input name="consent" type="checkbox" required />
              <span>I agree to the Terms of Service and Privacy Policy.</span>
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Sending…' : 'Continue with email'} <span>→</span>
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp}>
            <p className="auth-copy">Enter the six-digit code sent to <strong>{email}</strong>.</p>
            <label>
              Verification code
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>
            <button className="primary" disabled={busy || otp.length !== 6}>
              {busy ? 'Verifying…' : 'Verify and sign in'} <span>→</span>
            </button>
            <button
              type="button"
              className="text-button auth-back"
              onClick={() => { setStep('email'); setOtp(''); setError(''); }}
              disabled={busy}
            >
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('discover');
  const [profile, setProfile] = useState<Student | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [verifiedSession, setVerifiedSession] = useState(false);
  const [cards, setCards] = useState<Student[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [requests, setRequests] = useState<ConnectRequest[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setProfile(null);
    setProfileLoaded(false);
    setVerifiedSession(false);
    setCards([]);
    setMatches([]);
    setRequests([]);
    setNotices([]);
    setSelectedMatch(null);
    setLoading(false);
  }), []);

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
        setToast(errorMessage(error, 'Could not load your profile.'));
      },
    );
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!user || profile?.verification_status !== 'approved') {
      setVerifiedSession(false);
      return;
    }

    void user.getIdToken(true)
      .then(() => { if (active) setVerifiedSession(true); })
      .catch((error) => setToast(errorMessage(error, 'Could not refresh your session.')));
    return () => { active = false; };
  }, [profile?.verification_status, user]);

  useEffect(() => {
    if (!user || !verifiedSession) return;

    const matchBuckets: Record<'a' | 'b', Match[]> = { a: [], b: [] };
    const emitMatches = () => {
      const unique = new Map<string, Match>();
      [...matchBuckets.a, ...matchBuckets.b].forEach((match) => unique.set(match.id, match));
      setMatches([...unique.values()]);
    };
    const handleMatchError = (error: Error) => setToast(errorMessage(error, 'Could not load connections.'));

    const unsubscribeA = onSnapshot(
      query(collection(db, 'matches'), where('student_a_id', '==', user.uid)),
      (snapshot) => {
        matchBuckets.a = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Match));
        emitMatches();
      },
      handleMatchError,
    );
    const unsubscribeB = onSnapshot(
      query(collection(db, 'matches'), where('student_b_id', '==', user.uid)),
      (snapshot) => {
        matchBuckets.b = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Match));
        emitMatches();
      },
      handleMatchError,
    );
    const unsubscribeRequests = onSnapshot(
      query(
        collection(db, 'connect_requests'),
        where('to_id', '==', user.uid),
        where('status', '==', 'pending'),
        orderBy('created_at', 'desc'),
      ),
      (snapshot) => setRequests(snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      } as ConnectRequest))),
      (error) => setToast(errorMessage(error, 'Could not load connection requests.')),
    );
    const unsubscribeNotices = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('user_id', '==', user.uid),
        orderBy('created_at', 'desc'),
        limit(20),
      ),
      (snapshot) => setNotices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Notice))),
      (error) => setToast(errorMessage(error, 'Could not load notifications.')),
    );

    return () => {
      unsubscribeA();
      unsubscribeB();
      unsubscribeRequests();
      unsubscribeNotices();
    };
  }, [user, verifiedSession]);

  const getRecommendations = async () => {
    try {
      const result = await callFunction<{ profiles: Student[]; has_more: boolean }>(
        'getRecommendations',
        { page_size: 20, match_type: 'friendship' },
      );
      setCards(result.profiles);
    } catch (error) {
      setToast(errorMessage(error, 'Could not load recommendations.'));
    }
  };

  useEffect(() => {
    if (verifiedSession) void getRecommendations();
  }, [verifiedSession]);

  useEffect(() => {
    if (view === 'inbox' && notices.some((notice) => !notice.is_read)) {
      void callFunction('markNotificationsRead').catch(() => undefined);
    }
  }, [notices, view]);

  const connect = async (student: Student) => {
    try {
      await callFunction('sendConnectRequest', { to_id: student.id, match_type: 'friendship' });
      setCards((current) => current.filter((item) => item.id !== student.id));
      setToast(`Connection request sent to ${student.full_name}.`);
    } catch (error) {
      setToast(errorMessage(error, 'Could not send the request.'));
    }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      await callFunction('acceptConnectRequest', { request_id: requestId, action });
      setRequests((current) => current.filter((request) => request.id !== requestId));
      setToast(action === 'accept' ? 'Connection accepted.' : 'Request declined.');
    } catch (error) {
      setToast(errorMessage(error, 'Could not update the request.'));
    }
  };

  const activeMatches = matches.filter((match) => match.status === 'active');
  const unread = notices.filter((notice) => !notice.is_read).length;
  const connections = useMemo(
    () => activeMatches.map((match) => ({
      ...match,
      otherId: match.student_a_id === user?.uid ? match.student_b_id : match.student_a_id,
    })),
    [activeMatches, user?.uid],
  );

  if (loading) return <div className="splash"><div className="brand-mark">C</div></div>;
  if (!user) return <AuthScreen />;
  if (!profileLoaded) return <div className="splash"><div className="brand-mark">C</div></div>;

  const incomplete = !profile || profile.verification_status !== 'approved';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => { setView('discover'); setSelectedMatch(null); }} aria-label="Campus Connector home">
          <b>campus</b><i>connector</i>
        </button>
        <div className="top-actions">
          <button className="icon-button" aria-label="Notifications" onClick={() => { setView('inbox'); setSelectedMatch(null); }}>
            ♢{unread > 0 && <sup>{unread}</sup>}
          </button>
          <Avatar student={profile ?? undefined} size="small" />
        </div>
      </header>

      <aside className="sidebar">
        <div className="college-pill"><span className="status-dot" /> VERIFIED CAMPUS</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id && !selectedMatch ? 'active' : ''}
              onClick={() => { setView(item.id); setSelectedMatch(null); }}
            >
              <span>{item.icon}</span>{item.label}
              {item.id === 'inbox' && requests.length > 0 && <sup>{requests.length}</sup>}
            </button>
          ))}
        </nav>
        <button className="signout" onClick={() => signOut(auth)}>Sign out</button>
      </aside>

      <main className="content">
        {incomplete ? (
          <Verification profile={profile} />
        ) : selectedMatch ? (
          <Chat match={selectedMatch} currentUserId={user.uid} onBack={() => setSelectedMatch(null)} />
        ) : view === 'discover' ? (
          <Discover cards={cards} refresh={getRecommendations} onConnect={connect} />
        ) : view === 'connections' ? (
          <Connections connections={connections} onMessage={setSelectedMatch} />
        ) : view === 'inbox' ? (
          <Inbox notices={notices} requests={requests} onRespond={respondToRequest} />
        ) : (
          <Profile profile={profile} onError={setToast} />
        )}
      </main>

      {!incomplete && (
        <nav className="mobile-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id && !selectedMatch ? 'active' : ''}
              onClick={() => { setView(item.id); setSelectedMatch(null); }}
            >
              <span>{item.icon}</span><small>{item.label}</small>
            </button>
          ))}
        </nav>
      )}

      {toast && <button className="toast" onClick={() => setToast('')}>{toast} ×</button>}
    </div>
  );
}

function Verification({ profile }: { profile: Student | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const interests = String(form.get('interests')).split(',').map((item) => item.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    try {
      await callFunction('createProfile', {
        full_name: String(form.get('full_name')).trim(),
        date_of_birth: String(form.get('date_of_birth')),
        gender: form.get('gender'),
        bio: String(form.get('bio')).trim(),
        branch: String(form.get('branch')).trim(),
        year: Number(form.get('year')),
        interests,
        intent_flags: { dating: false, friendship: true, study: true, hackathon: false, project: false },
        consent_given: true,
        consent_version: '1.0.0',
      });
    } catch (error) {
      setError(errorMessage(error, 'Could not save your profile.'));
    } finally {
      setBusy(false);
    }
  };

  const uploadVerification = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo || !auth.currentUser) return;
    setBusy(true);
    setError('');
    try {
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      if (!allowedTypes.has(photo.type) || photo.size > 8 * 1024 * 1024) {
        throw new Error('Choose a JPEG, PNG, or WebP image under 8 MB.');
      }
      const extension = photo.name.split('.').pop()?.toLowerCase() || 'image';
      const path = `verification_photos/${auth.currentUser.uid}/${crypto.randomUUID()}.${extension}`;
      await uploadBytes(ref(storage, path), photo, {
        contentType: photo.type,
        customMetadata: { ownerId: auth.currentUser.uid },
      });
      await callFunction('submitVerificationPhoto', { storage_path: path });
      setPhoto(null);
    } catch (error) {
      setError(errorMessage(error, 'Could not submit the verification photo.'));
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return (
      <section className="onboarding">
        <p className="eyebrow">PROFILE SETUP</p>
        <h1>Tell your campus about you.</h1>
        <p className="intro">Your profile is only shared with verified students from your own college.</p>
        <form className="profile-form" onSubmit={submitProfile}>
          <label>Full name<input name="full_name" minLength={2} maxLength={60} required /></label>
          <label>Date of birth<input name="date_of_birth" type="date" required /></label>
          <label>
            Gender
            <select name="gender" defaultValue="prefer_not_to_say">
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Branch / course<input name="branch" minLength={2} required placeholder="e.g. Computer Science" /></label>
          <label>
            Year
            <select name="year" defaultValue="1">
              {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </label>
          <label>About you<textarea name="bio" minLength={10} maxLength={500} required placeholder="What are you looking to build, learn, or explore?" /></label>
          <label>Interests<input name="interests" required placeholder="Design, football, startups (comma separated)" /></label>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'} <span>→</span></button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>
    );
  }

  if (profile.verification_status === 'suspended' || profile.verification_status === 'deleted') {
    return (
      <section className="empty-state">
        <div className="lock">!</div>
        <h1>Account unavailable</h1>
        <p>Please contact your campus administrator for help with this account.</p>
        <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
      </section>
    );
  }

  if (profile.verification_status === 'pending' && profile.verification_submitted_at) {
    return (
      <section className="empty-state">
        <div className="lock">⌛</div>
        <p className="eyebrow">REVIEW IN PROGRESS</p>
        <h1>Your verification is pending.</h1>
        <p>A campus administrator will review your private photo. This page updates automatically.</p>
        <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
      </section>
    );
  }

  return (
    <section className="onboarding">
      <p className="eyebrow">STUDENT VERIFICATION</p>
      <h1>Your profile is ready.<br />Verify it to join.</h1>
      <p className="intro">
        Upload a clear student ID or a photo in your official college uniform. It is stored privately
        and reviewed by authorized administrators.
      </p>
      {profile.verification_status === 'rejected' && (
        <p className="form-error" role="alert">
          Previous submission rejected{profile.rejection_reason ? `: ${profile.rejection_reason}` : '.'}
        </p>
      )}
      <form className="profile-form" onSubmit={uploadVerification}>
        <label>
          Student ID or uniform photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            required
          />
        </label>
        <button className="primary" disabled={busy || !photo}>
          {busy ? 'Uploading…' : 'Submit for review'} <span>→</span>
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function Discover({
  cards,
  refresh,
  onConnect,
}: {
  cards: Student[];
  refresh: () => void;
  onConnect: (student: Student) => void;
}) {
  return (
    <section>
      <div className="section-head">
        <div><p className="eyebrow">YOUR CAMPUS</p><h1>Discover people</h1><p>Thoughtful connections start with a shared place.</p></div>
        <button className="text-button" onClick={refresh}>Refresh ↻</button>
      </div>
      {cards.length ? (
        <div className="card-grid">
          {cards.map((student) => (
            <article className="person-card" key={student.id}>
              <div className="cover" />
              <Avatar student={student} size="large" />
              <div className="person-info">
                <span className="verified">✓ VERIFIED</span>
                <h2>{student.full_name}</h2>
                <p>{student.branch}{student.year ? ` · Year ${student.year}` : ''}</p>
                <p className="bio">{student.bio}</p>
                {student.interests && <div className="tags">{student.interests.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}
                <button className="connect" onClick={() => onConnect(student)}>Connect <span>→</span></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">⌕</div><h1>No new recommendations yet</h1>
          <p>When verified students matching your interests join, they will appear here.</p>
          <button className="secondary" onClick={refresh}>Check again</button>
        </section>
      )}
    </section>
  );
}

function Connections({
  connections,
  onMessage,
}: {
  connections: Array<Match & { otherId: string }>;
  onMessage: (match: Match) => void;
}) {
  return (
    <section>
      <div className="section-head"><div><p className="eyebrow">YOUR NETWORK</p><h1>Connections</h1><p>People who chose to connect with you.</p></div></div>
      {connections.length ? (
        <div className="list-card">
          {connections.map((match) => <ConnectionRow key={match.id} match={match} onMessage={() => onMessage(match)} />)}
        </div>
      ) : (
        <section className="empty-state compact"><div className="lock">♧</div><h1>Your network starts here</h1><p>Send a connection request from Discover. Once accepted, you can start a conversation.</p></section>
      )}
    </section>
  );
}

function ConnectionRow({ match, onMessage }: { match: Match & { otherId: string }; onMessage: () => void }) {
  const [person, setPerson] = useState<Student>();
  useEffect(() => {
    let active = true;
    void callFunction<Student>('getProfile', { student_id: match.otherId }).then((profile) => {
      if (active) setPerson(profile);
    });
    return () => { active = false; };
  }, [match.otherId]);

  return (
    <div className="connection">
      <Avatar student={person} />
      <div><h2>{person?.full_name ?? 'Campus connection'}</h2><p>{match.last_message_preview || `${match.match_type ?? 'Connection'} · Connected`}</p></div>
      <button className="secondary" onClick={onMessage}>Message</button>
    </div>
  );
}

function RequestRow({
  request,
  onRespond,
}: {
  request: ConnectRequest;
  onRespond: (requestId: string, action: 'accept' | 'decline') => void;
}) {
  const [sender, setSender] = useState<Student>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void callFunction<Student>('getProfile', { student_id: request.from_id }).then((profile) => {
      if (active) setSender(profile);
    });
    return () => { active = false; };
  }, [request.from_id]);

  const respond = (action: 'accept' | 'decline') => {
    setBusy(true);
    onRespond(request.id, action);
  };

  return (
    <article className="request-row">
      <Avatar student={sender} />
      <div className="request-copy">
        <h2>{sender?.full_name ?? 'A student from your campus'}</h2>
        <p>{request.message || `Wants to connect for ${request.match_type ?? 'friendship'}.`}</p>
      </div>
      <div className="request-actions">
        <button className="primary compact-button" disabled={busy} onClick={() => respond('accept')}>Accept</button>
        <button className="secondary compact-button" disabled={busy} onClick={() => respond('decline')}>Decline</button>
      </div>
    </article>
  );
}

function Inbox({
  notices,
  requests,
  onRespond,
}: {
  notices: Notice[];
  requests: ConnectRequest[];
  onRespond: (requestId: string, action: 'accept' | 'decline') => void;
}) {
  return (
    <section>
      <div className="section-head"><div><p className="eyebrow">UPDATES</p><h1>Inbox</h1><p>Requests, matches, and account updates.</p></div></div>
      {requests.length > 0 && (
        <div className="inbox-section">
          <h2 className="inbox-heading">Connection requests</h2>
          <div className="list-card">{requests.map((request) => <RequestRow key={request.id} request={request} onRespond={onRespond} />)}</div>
        </div>
      )}
      {notices.length ? (
        <div className="inbox-section">
          <h2 className="inbox-heading">Notifications</h2>
          <div className="list-card">
            {notices.map((notice) => (
              <article className={`notice ${notice.is_read ? '' : 'unread'}`} key={notice.id}>
                <div className="notice-icon">{notice.type === 'new_match' ? '♥' : '●'}</div>
                <div><h2>{notice.title ?? 'Campus Connector update'}</h2><p>{notice.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      ) : requests.length === 0 ? (
        <section className="empty-state compact"><div className="lock">◌</div><h1>You’re all caught up</h1><p>Important activity from your campus community will appear here.</p></section>
      ) : null}
    </section>
  );
}

function ChatMedia({ message }: { message: Message }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!message.media_path) return;
    let active = true;
    void getDownloadURL(ref(storage, message.media_path))
      .then((value) => active && setUrl(value))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [message.media_path]);

  if (failed) return <em>Media unavailable</em>;
  if (!url) return <span className="media-loading">Loading media…</span>;
  return message.media_type === 'video'
    ? <video className="message-media" src={url} controls preload="metadata" />
    : <img className="message-media" src={url} alt="Shared attachment" />;
}

function Chat({
  match,
  currentUserId,
  onBack,
}: {
  match: Match;
  currentUserId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [person, setPerson] = useState<Student>();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const otherId = match.student_a_id === currentUserId ? match.student_b_id : match.student_a_id;

  useEffect(() => {
    void callFunction<Student>('getProfile', { student_id: otherId }).then(setPerson);
  }, [otherId]);

  useEffect(() => onSnapshot(
    query(collection(db, 'messages'), where('match_id', '==', match.id), orderBy('sent_at', 'asc'), limit(100)),
    (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Message)));
      if (snapshot.docs.some((item) => item.data().sender_id !== currentUserId && !item.data().read_at)) {
        void callFunction('markRead', { match_id: match.id }).catch(() => undefined);
      }
    },
    (error) => setError(errorMessage(error, 'Could not load this conversation.')),
  ), [currentUserId, match.id]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message && !media) return;
    setBusy(true);
    setError('');
    try {
      let mediaPath: string | undefined;
      if (media) {
        const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
        if (!allowedTypes.has(media.type) || media.size > 25 * 1024 * 1024) {
          throw new Error('Choose a JPEG, PNG, WebP, or MP4 file under 25 MB.');
        }
        const extension = media.name.split('.').pop()?.toLowerCase() || 'media';
        mediaPath = `chat_media/${match.id}/${crypto.randomUUID()}.${extension}`;
        await uploadBytes(ref(storage, mediaPath), media, {
          contentType: media.type,
          customMetadata: { uploader_id: currentUserId, match_id: match.id },
        });
      }
      await callFunction('sendMessage', {
        match_id: match.id,
        ...(message ? { text: message } : {}),
        ...(mediaPath ? { media_path: mediaPath } : {}),
      });
      setText('');
      setMedia(undefined);
    } catch (error) {
      setError(errorMessage(error, 'Could not send the message.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <button className="text-button" onClick={onBack}>← Back</button>
        <Avatar student={person} />
        <div><h1>{person?.full_name ?? 'Campus connection'}</h1><p>Private campus conversation</p></div>
      </header>
      <div className="message-list" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">Say hello and start the conversation.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender_id === currentUserId ? 'mine' : ''}`}>
            {message.is_deleted ? <em>Message deleted</em> : (
              <>
                {message.media_path && <ChatMedia message={message} />}
                {message.text && <span>{message.text}</span>}
              </>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="message-form" onSubmit={send}>
        <label className="media-picker" title="Attach a photo or video">
          <span aria-hidden="true">＋</span>
          <span className="sr-only">Attach a photo or video</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            disabled={busy}
            onClick={(event) => { event.currentTarget.value = ''; }}
            onChange={(event) => setMedia(event.target.files?.[0])}
          />
        </label>
        <div className="message-input-wrap">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            placeholder="Write a message…"
            aria-label="Message"
          />
          {media && (
            <button className="attachment-chip" type="button" onClick={() => setMedia(undefined)}>
              {media.name} ×
            </button>
          )}
        </div>
        <button className="primary compact-button" disabled={busy || (!text.trim() && !media)}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

function Profile({ profile, onError }: { profile: Student; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await callFunction('updateProfile', {
        bio: String(form.get('bio')).trim(),
        branch: String(form.get('branch')).trim(),
        year: Number(form.get('year')),
        interests: String(form.get('interests')).split(',').map((item) => item.trim()).filter(Boolean),
      });
      setEditing(false);
    } catch (error) {
      onError(errorMessage(error, 'Could not update your profile.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <Avatar student={profile} size="large" />
        <div><span className="verified">✓ VERIFIED STUDENT</span><h1>{profile.full_name}</h1><p>{profile.branch}{profile.year ? ` · Year ${profile.year}` : ''}</p></div>
        <button className="secondary profile-edit" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel' : 'Edit profile'}</button>
      </div>
      {editing ? (
        <form className="profile-form profile-editor" onSubmit={save}>
          <label>Branch / course<input name="branch" minLength={2} maxLength={100} defaultValue={profile.branch} required /></label>
          <label>Year<select name="year" defaultValue={profile.year}>{[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}</select></label>
          <label>About<textarea name="bio" minLength={10} maxLength={500} defaultValue={profile.bio} required /></label>
          <label>Interests<input name="interests" defaultValue={profile.interests?.join(', ')} required /></label>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </form>
      ) : (
        <>
          <div className="profile-block"><p className="eyebrow">ABOUT</p><p>{profile.bio || 'Add a bio to help your campus community get to know you.'}</p></div>
          <div className="profile-block"><p className="eyebrow">INTERESTS</p><div className="tags">{profile.interests?.length ? profile.interests.map((item) => <span key={item}>{item}</span>) : <span>None added</span>}</div></div>
        </>
      )}
    </section>
  );
}
