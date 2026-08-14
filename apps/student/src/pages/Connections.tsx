import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, fetchProfileCached } from '../services/api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { EmptyState, ListSkeleton } from '../components/states';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../lib/toast';
import { formatRelative } from '../lib/format';
import { MATCH_TYPE_LABELS, type MatchWithPeer, type StudentPublicProfile } from '../types';

/**
 * Resolves peer profiles for a set of matches in one batched effect.
 *
 * Previously each row mounted its own `getProfile` effect, so rendering the
 * connections list fired one callable invocation per row (and again on every
 * re-render). `fetchProfileCached` de-duplicates and caches, and doing it here
 * means one pass per list change.
 */
function usePeerProfiles(peerIds: string[]) {
  const [profiles, setProfiles] = useState<Record<string, StudentPublicProfile>>({});
  const key = peerIds.join(',');

  useEffect(() => {
    if (peerIds.length === 0) return;
    let active = true;

    void Promise.all(
      peerIds.map((id) =>
        fetchProfileCached(id)
          .then((profile) => [id, profile] as const)
          // A peer whose account was deleted must not break the whole list.
          .catch(() => null),
      ),
    ).then((entries) => {
      if (!active) return;
      const resolved: Record<string, StudentPublicProfile> = {};
      entries.forEach((entry) => { if (entry) resolved[entry[0]] = entry[1]; });
      setProfiles((current) => ({ ...current, ...resolved }));
    });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profiles;
}

export interface ConnectionsProps {
  matches: MatchWithPeer[];
  loading: boolean;
}

export function Connections({ matches, loading }: ConnectionsProps) {
  const toast = useToast();
  const peerIds = useMemo(() => matches.map((match) => match.peerId), [matches]);
  const profiles = usePeerProfiles(peerIds);

  const [query, setQuery] = useState('');
  const [pendingUnmatch, setPendingUnmatch] = useState<MatchWithPeer | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...matches].sort((a, b) => {
      // Unread first, then most recent activity.
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const aTime = a.last_message_at ?? a.matched_at;
      const bTime = b.last_message_at ?? b.matched_at;
      return String(formatRelative(bTime)).localeCompare(String(formatRelative(aTime)));
    });

    if (!needle) return sorted;
    return sorted.filter((match) => {
      const peer = profiles[match.peerId];
      return [peer?.full_name, peer?.branch, match.last_message_preview]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [matches, profiles, query]);

  const unmatch = async () => {
    if (!pendingUnmatch) return;
    setBusy(true);
    try {
      await api.unmatch(pendingUnmatch.id);
      toast.success('Connection removed.');
      setPendingUnmatch(null);
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not remove that connection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="page-head">
        <p className="eyebrow">Your network</p>
        <h1 className="display">Connections</h1>
        <p className="lede">People who accepted your request, or whose request you accepted.</p>
      </header>

      {loading && <ListSkeleton count={4} />}

      {!loading && matches.length === 0 && (
        <EmptyState
          icon="connections"
          title="Your network starts here"
          description="Send a request from Discover. Once it is accepted, your conversation appears here."
          action={<Link className="button secondary" to="/discover"><Icon name="discover" size={16} /> Find people</Link>}
        />
      )}

      {!loading && matches.length > 0 && (
        <>
          {matches.length > 5 && (
            <div className="filter-bar">
              <div className="field">
                <label className="field-label" htmlFor="connections-search">Search connections</label>
                <input
                  id="connections-search"
                  className="input"
                  type="search"
                  placeholder="Name, branch or message"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matching connections"
              description={`Nothing matches “${query.trim()}”.`}
              action={
                <button type="button" className="button secondary" onClick={() => setQuery('')}>
                  Clear search
                </button>
              }
            />
          ) : (
            <div className="list-card">
              {visible.map((match) => {
                const peer = profiles[match.peerId];
                const preview = match.last_message_preview
                  || `${MATCH_TYPE_LABELS[match.match_type ?? 'friendship']} · connected`;

                return (
                  <div className={`list-row${match.unreadCount > 0 ? ' is-unread' : ''}`} key={match.id}>
                    <Avatar student={peer} badge={match.unreadCount > 0} />
                    <div className="list-row-body">
                      <h3>{peer?.full_name ?? 'Campus connection'}</h3>
                      <p>{preview}</p>
                    </div>
                    {match.unreadCount > 0 && (
                      <span className="unread-pill" aria-label={`${match.unreadCount} unread messages`}>
                        {match.unreadCount > 9 ? '9+' : match.unreadCount}
                      </span>
                    )}
                    <span className="list-row-time">
                      {formatRelative(match.last_message_at ?? match.matched_at)}
                    </span>
                    <div className="list-row-actions">
                      <Link className="button secondary small" to={`/chat/${match.id}`}>
                        <Icon name="inbox" size={15} /> Message
                      </Link>
                      <button
                        type="button"
                        className="button ghost small"
                        onClick={() => setPendingUnmatch(match)}
                        aria-label={`Remove connection with ${peer?.full_name ?? 'this student'}`}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingUnmatch !== null}
        title="Remove this connection?"
        message={
          `You will no longer be able to message ${
            profiles[pendingUnmatch?.peerId ?? '']?.full_name ?? 'this student'
          }, and they will disappear from your connections. This cannot be undone.`
        }
        confirmLabel="Remove connection"
        destructive
        busy={busy}
        onConfirm={() => void unmatch()}
        onCancel={() => setPendingUnmatch(null)}
      />
    </section>
  );
}
