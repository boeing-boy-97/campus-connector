export type NoticeItem = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  is_read?: boolean;
  created_at?: unknown;
};

interface InboxViewProps {
  notices: NoticeItem[];
}

export function InboxView({ notices }: InboxViewProps) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">UPDATES</p>
          <h1>Inbox & Notifications</h1>
          <p>Requests, connection matches, and campus announcements.</p>
        </div>
      </div>

      {notices.length > 0 ? (
        <div className="list-card">
          {notices.map((n) => (
            <article className={`notice ${n.is_read ? '' : 'unread'}`} key={n.id}>
              <div className="notice-icon">
                {n.type === 'match' ? '♥' : n.type === 'connect_request' ? '♧' : '●'}
              </div>
              <div>
                <h2>{n.title ?? 'Campus Connector update'}</h2>
                <p>{n.body}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state compact">
          <div className="lock">◌</div>
          <h1>You’re all caught up</h1>
          <p>Important activity and updates from your campus community will appear here.</p>
        </section>
      )}
    </section>
  );
}
