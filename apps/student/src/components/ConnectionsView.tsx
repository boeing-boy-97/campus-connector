import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Avatar } from './Avatar';
import type { StudentProfile } from './Verification';

export type MatchItem = {
  id: string;
  student_a_id: string;
  student_b_id: string;
  status: string;
  match_type?: string;
  otherId: string;
  last_message_preview?: string;
  last_message_at?: unknown;
};

interface ConnectionsViewProps {
  connections: MatchItem[];
  onOpenChat: (matchId: string) => void;
}

export function ConnectionsView({ connections, onOpenChat }: ConnectionsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConnections = useMemo(() => {
    if (!searchTerm) return connections;
    return connections; // Filter happens at ConnectionRow level based on loaded profiles
  }, [connections, searchTerm]);

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">YOUR NETWORK</p>
          <h1>Connections</h1>
          <p>Verified campus peers who connected with you.</p>
        </div>
      </div>

      {connections.length > 0 && (
        <div className="search-filter-bar" style={{ marginBottom: 20 }}>
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search connections…"
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
        </div>
      )}

      {filteredConnections.length > 0 ? (
        <div className="list-card">
          {filteredConnections.map((match) => (
            <ConnectionRow
              key={match.id}
              match={match}
              onOpenChat={onOpenChat}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">♧</div>
          <h1>{searchTerm ? 'No matching connections' : 'Your network starts here'}</h1>
          <p>
            {searchTerm
              ? 'Try a different search term.'
              : 'Send a connection request from Discover. Once accepted by your campus peer, you can start a conversation.'}
          </p>
        </section>
      )}
    </section>
  );
}

function ConnectionRow({
  match,
  onOpenChat,
  searchTerm,
}: {
  match: MatchItem;
  onOpenChat: (matchId: string) => void;
  searchTerm: string;
}) {
  const [person, setPerson] = useState<StudentProfile>();

  useEffect(() => {
    getDoc(doc(db, 'students', match.otherId)).then((s) => {
      if (s.exists()) {
        setPerson({ id: s.id, ...s.data() } as StudentProfile);
      }
    });
  }, [match.otherId]);

  // Hide if search doesn't match
  if (
    searchTerm &&
    person?.full_name &&
    !person.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) {
    return null;
  }

  return (
    <div className="connection">
      <Avatar student={person} />
      <div className="connection-info">
        <h2>{person?.full_name ?? 'Campus connection'}</h2>
        <p className="connection-preview">
          {match.last_message_preview ||
            (match.match_type
              ? `${match.match_type.charAt(0).toUpperCase() + match.match_type.slice(1)} · Connected`
              : 'Connected')}
        </p>
      </div>
      <button className="secondary" onClick={() => onOpenChat(match.id)}>
        Message
      </button>
    </div>
  );
}
