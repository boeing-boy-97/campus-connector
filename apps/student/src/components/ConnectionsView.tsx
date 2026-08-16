import { useState, useEffect } from 'react';
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
};

interface ConnectionsViewProps {
  connections: MatchItem[];
}

export function ConnectionsView({ connections }: ConnectionsViewProps) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">YOUR NETWORK</p>
          <h1>Connections</h1>
          <p>Verified campus peers who connected with you.</p>
        </div>
      </div>

      {connections.length > 0 ? (
        <div className="list-card">
          {connections.map((match) => (
            <ConnectionRow key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">♧</div>
          <h1>Your network starts here</h1>
          <p>
            Send a connection request from Discover. Once accepted by your campus peer, you can start a conversation.
          </p>
        </section>
      )}
    </section>
  );
}

function ConnectionRow({ match }: { match: MatchItem }) {
  const [person, setPerson] = useState<StudentProfile>();

  useEffect(() => {
    getDoc(doc(db, 'students', match.otherId)).then((s) => {
      if (s.exists()) {
        setPerson({ id: s.id, ...s.data() } as StudentProfile);
      }
    });
  }, [match.otherId]);

  return (
    <div className="connection">
      <Avatar student={person} />
      <div>
        <h2>{person?.full_name ?? 'Campus connection'}</h2>
        <p>{match.match_type ? `${match.match_type.toUpperCase()} · Connected` : 'Connected'}</p>
      </div>
      <button className="secondary">Message</button>
    </div>
  );
}
