import { useState, useMemo } from 'react';
import type { StudentProfile } from './Verification';
import { Avatar } from './Avatar';

interface DiscoverViewProps {
  cards: StudentProfile[];
  refresh: () => void;
  onConnect: (student: StudentProfile) => void;
  loading?: boolean;
}

export function DiscoverView({ cards, refresh, onConnect, loading = false }: DiscoverViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // Extract unique branches for filter dropdown
  const branches = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.branch) set.add(c.branch);
    });
    return Array.from(set);
  }, [cards]);

  // Filtered recommendations
  const filteredCards = useMemo(() => {
    return cards.filter((student) => {
      const matchesSearch =
        !searchTerm ||
        student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.interests?.some((i) => i.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesBranch = selectedBranch === 'all' || student.branch === selectedBranch;

      return matchesSearch && matchesBranch;
    });
  }, [cards, searchTerm, selectedBranch]);

  return (
    <section className="discover-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">YOUR CAMPUS</p>
          <h1>Discover peers</h1>
          <p>Thoughtful connections start with shared campus interest.</p>
        </div>
        <button className="text-button refresh-btn" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh ↻'}
        </button>
      </div>

      {cards.length > 0 && (
        <div className="search-filter-bar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, bio, or interest..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-field"
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                ×
              </button>
            )}
          </div>

          {branches.length > 0 && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Branches ({cards.length})</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {loading ? (
        <div className="card-grid">
          {[1, 2, 3, 4].map((n) => (
            <div className="person-card skeleton-card" key={n}>
              <div className="skeleton-cover" />
              <div className="skeleton-avatar" />
              <div className="skeleton-line title" />
              <div className="skeleton-line sub" />
              <div className="skeleton-line text" />
            </div>
          ))}
        </div>
      ) : filteredCards.length > 0 ? (
        <div className="card-grid">
          {filteredCards.map((student) => (
            <article className="person-card" key={student.id}>
              <div className="cover" />
              <Avatar student={student} size="large" />
              <div className="person-info">
                <span className="verified">✓ VERIFIED STUDENT</span>
                <h2>{student.full_name}</h2>
                <p>
                  {student.branch}
                  {student.year ? ` · Year ${student.year}` : ''}
                </p>
                <p className="bio">{student.bio}</p>

                {student.interests && student.interests.length > 0 && (
                  <div className="tags">
                    {student.interests.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}

                <button className="connect" onClick={() => onConnect(student)}>
                  Connect <span>→</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">⌕</div>
          <h1>
            {searchTerm || selectedBranch !== 'all'
              ? 'No matching peers found'
              : 'No new recommendations yet'}
          </h1>
          <p>
            {searchTerm || selectedBranch !== 'all'
              ? 'Try adjusting your search terms or branch filters.'
              : 'When verified students matching your interests join your campus, they will appear here.'}
          </p>
          <button
            className="secondary"
            onClick={() => {
              setSearchTerm('');
              setSelectedBranch('all');
              refresh();
            }}
          >
            Reset filters ↻
          </button>
        </section>
      )}
    </section>
  );
}
