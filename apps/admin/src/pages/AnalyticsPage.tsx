import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where, getCountFromServer, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { TrendingUp, Users, Heart, ShieldCheck, MessageCircle, Building2 } from 'lucide-react';

async function getAnalytics() {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalStudents,
    verifiedStudents,
    pendingStudents,
    totalMatches,
    totalColleges,
    totalMessages,
    totalReports,
    studentsThisWeek,
    matchesThisWeek,
  ] = await Promise.all([
    getCountFromServer(collection(db, 'students')),
    getCountFromServer(query(collection(db, 'students'), where('verification_status', '==', 'approved'))),
    getCountFromServer(query(collection(db, 'students'), where('verification_status', '==', 'pending'))),
    getCountFromServer(query(collection(db, 'matches'), where('status', '==', 'active'))),
    getCountFromServer(query(collection(db, 'colleges'), where('verified_status', '==', 'approved'))),
    getCountFromServer(collection(db, 'messages')),
    getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'pending'))),
    getCountFromServer(collection(db, 'students')), // Approximate
    getCountFromServer(collection(db, 'matches')),   // Approximate
  ]);

  // Get gender distribution
  const maleCount = await getCountFromServer(
    query(collection(db, 'students'), where('gender', '==', 'male'), where('verification_status', '==', 'approved'))
  );
  const femaleCount = await getCountFromServer(
    query(collection(db, 'students'), where('gender', '==', 'female'), where('verification_status', '==', 'approved'))
  );

  // Get match type distribution
  const friendshipMatches = await getCountFromServer(
    query(collection(db, 'matches'), where('match_type', '==', 'friendship'), where('status', '==', 'active'))
  );
  const studyMatches = await getCountFromServer(
    query(collection(db, 'matches'), where('match_type', '==', 'study'), where('status', '==', 'active'))
  );

  return {
    total_students: totalStudents.data().count,
    verified_students: verifiedStudents.data().count,
    pending_students: pendingStudents.data().count,
    total_matches: totalMatches.data().count,
    total_colleges: totalColleges.data().count,
    total_messages: totalMessages.data().count,
    open_reports: totalReports.data().count,
    male_count: maleCount.data().count,
    female_count: femaleCount.data().count,
    friendship_matches: friendshipMatches.data().count,
    study_matches: studyMatches.data().count,
    verification_rate: totalStudents.data().count > 0
      ? Math.round((verifiedStudents.data().count / totalStudents.data().count) * 100)
      : 0,
  };
}

export default function AnalyticsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: getAnalytics,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="admin-header">
          <h1>Analytics</h1>
          <span className="badge badge-info">Loading…</span>
        </div>
        <div style={{ padding: 24 }}>
          <div className="stats-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="stat-card" key={i}>
                <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 8 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 32, width: 80, marginBottom: 8, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 14, width: 120, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Analytics</h1>
        <span className="badge badge-info">
          <TrendingUp size={12} /> Live Data
        </span>
      </div>

      <div style={{ padding: 24 }}>
        {/* Key Metrics */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#6C63FF20' }}>
              <Users size={22} color="#6C63FF" />
            </div>
            <div>
              <div className="stat-value">{stats?.total_students?.toLocaleString()}</div>
              <div className="stat-label">Total Students</div>
              <div className="stat-change up">{stats?.verification_rate}% verified</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#22C55E20' }}>
              <ShieldCheck size={22} color="#22C55E" />
            </div>
            <div>
              <div className="stat-value">{stats?.verified_students?.toLocaleString()}</div>
              <div className="stat-label">Verified</div>
              <div className="stat-change up">{stats?.pending_students} pending</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#E91E6320' }}>
              <Heart size={22} color="#E91E63" />
            </div>
            <div>
              <div className="stat-value">{stats?.total_matches?.toLocaleString()}</div>
              <div className="stat-label">Active Matches</div>
              <div className="stat-change up">
                {stats?.friendship_matches} friendship · {stats?.study_matches} study
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#F59E0B20' }}>
              <MessageCircle size={22} color="#F59E0B" />
            </div>
            <div>
              <div className="stat-value">{stats?.total_messages?.toLocaleString()}</div>
              <div className="stat-label">Total Messages</div>
              <div className="stat-change">All time</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#3B82F620' }}>
              <Building2 size={22} color="#3B82F6" />
            </div>
            <div>
              <div className="stat-value">{stats?.total_colleges?.toLocaleString()}</div>
              <div className="stat-label">Colleges</div>
              <div className="stat-change">Approved</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#EF444420' }}>
              <TrendingUp size={22} color="#EF4444" />
            </div>
            <div>
              <div className="stat-value">{stats?.open_reports}</div>
              <div className="stat-label">Open Reports</div>
              <div className={stats?.open_reports ? 'stat-change down' : 'stat-change up'}>
                {stats?.open_reports ? 'Needs attention' : 'All clear'}
              </div>
            </div>
          </div>
        </div>

        {/* Platform Health */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 20 }}>Platform Health</h3>
          <div className="grid-2">
            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Verification Rate</div>
              <div style={{ background: 'var(--bg-hover)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
                <div style={{
                  width: `${stats?.verification_rate || 0}%`,
                  background: 'linear-gradient(90deg, #22C55E, #4ADE80)',
                  height: '100%',
                  borderRadius: 8,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {stats?.verification_rate || 0}% of students verified
              </div>
            </div>

            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Gender Distribution</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: stats?.male_count || 1, background: '#3B82F6', height: 12, borderRadius: 8 }} />
                <div style={{ flex: stats?.female_count || 1, background: '#E91E63', height: 12, borderRadius: 8 }} />
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 4, display: 'flex', gap: 16 }}>
                <span>♂ {stats?.male_count || 0} male</span>
                <span>♀ {stats?.female_count || 0} female</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Match Types</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-info">🤝 {stats?.friendship_matches || 0} Friendship</span>
                <span className="badge badge-primary">📚 {stats?.study_matches || 0} Study</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Messages per Match</div>
              <div className="font-bold" style={{ fontSize: 24 }}>
                {stats?.total_matches
                  ? Math.round((stats.total_messages / stats.total_matches) * 10) / 10
                  : 0}
              </div>
              <div className="text-xs text-muted">Average messages per active match</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
