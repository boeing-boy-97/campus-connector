import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../services/firebase';
import { api, errorMessage, fetchProfileCached } from '../services/api';
import { Avatar } from '../components/Avatar';
import { usePhotoUrl } from '../lib/usePhotoUrl';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, FieldError, ListSkeleton, Spinner } from '../components/states';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../lib/toast';
import { formatBytes, formatDayLabel, formatTime, toDate } from '../lib/format';
import {
  REPORT_CATEGORIES,
  REPORT_REASONS,
  type Match,
  type Message,
  type StudentPublicProfile,
} from '../types';

/** How many messages to hold in the live window. */
const PAGE_SIZE = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];

/** Lazily resolves and renders a chat attachment. */
function ChatMedia({ message }: { message: Message }) {
  const url = usePhotoUrl(message.media_path ?? undefined);
  const [failed, setFailed] = useState(false);

  // `usePhotoUrl` returns undefined both while loading and on failure, so give
  // it a moment before declaring the attachment unavailable.
  useEffect(() => {
    if (url) {
      setFailed(false);
      return;
    }
    const timer = setTimeout(() => setFailed(true), 8000);
    return () => clearTimeout(timer);
  }, [url]);

  if (!url) {
    return failed
      ? <em className="media-loading"><Icon name="alert" size={14} /> Attachment unavailable</em>
      : <span className="media-loading"><Spinner size={13} /> Loading attachment…</span>;
  }

  return message.media_type === 'video'
    ? <video className="message-media" src={url} controls preload="metadata" playsInline />
    : <img className="message-media" src={url} alt="Shared attachment" loading="lazy" />;
}

export interface ChatProps {
  matches: Match[];
  currentUserId: string;
  matchesLoading: boolean;
}

/**
 * One-to-one conversation.
 *
 * Key fixes over the original implementation:
 *  - Loads the **newest** page of messages. The old query was
 *    `orderBy('sent_at','asc') limit(100)`, which pinned the view to the oldest
 *    100 messages, so an active thread never showed recent activity.
 *  - `markRead` is issued once per new set of unread message IDs instead of on
 *    every snapshot, removing a write feedback loop.
 *  - Timestamps, day separators, read receipts, message deletion, report and
 *    block are all wired to real endpoints.
 */
export function Chat({ matches, currentUserId, matchesLoading }: ChatProps) {
  const { matchId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const match = useMemo(() => matches.find((item) => item.id === matchId), [matches, matchId]);
  const peerId = match
    ? (match.student_a_id === currentUserId ? match.student_b_id : match.student_a_id)
    : '';

  const [peer, setPeer] = useState<StudentPublicProfile>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [windowSize, setWindowSize] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');

  const [text, setText] = useState('');
  const [media, setMedia] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<Message | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef('');
  const shouldStickToBottom = useRef(true);

  // Peer profile.
  useEffect(() => {
    if (!peerId) return;
    let active = true;
    void fetchProfileCached(peerId)
      .then((profile) => { if (active) setPeer(profile); })
      .catch(() => {
        // A deleted peer still leaves a readable thread; show a neutral label.
        if (active) setPeer(undefined);
      });
    return () => { active = false; };
  }, [peerId]);

  // Live message window — newest first from Firestore, reversed for display.
  useEffect(() => {
    if (!matchId) return;
    setStatus('loading');

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'messages'),
        where('match_id', '==', matchId),
        orderBy('sent_at', 'desc'),
        limit(windowSize),
      ),
      (snapshot) => {
        const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Message));
        setMessages(docs.reverse());
        setStatus('ready');

        // Mark read once per distinct set of unread inbound messages.
        const unreadIds = docs
          .filter((item) => item.sender_id !== currentUserId && !item.read_at && !item.is_deleted)
          .map((item) => item.id)
          .sort()
          .join(',');

        if (unreadIds && unreadIds !== markedRef.current) {
          markedRef.current = unreadIds;
          void api.markRead(matchId).catch(() => {
            // A failed read receipt is not user-facing; allow a later retry.
            markedRef.current = '';
          });
        }
      },
      (error) => {
        setLoadError(errorMessage(error, 'We could not load this conversation.'));
        setStatus('error');
      },
    );

    return unsubscribe;
  }, [matchId, windowSize, currentUserId]);

  // Track whether the user is reading history, so new messages do not yank the
  // scroll position away from them.
  const onScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    shouldStickToBottom.current = distanceFromBottom < 120;
  }, []);

  useEffect(() => {
    if (shouldStickToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  const pickMedia = (file: File | undefined) => {
    setSendError('');
    if (!file) {
      setMedia(null);
      return;
    }
    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      setSendError('Attachments must be a JPEG, PNG, WebP or MP4 file.');
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setSendError(`That file is ${formatBytes(file.size)}. The limit is 25 MB.`);
      return;
    }
    setMedia(file);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !media) || !match) return;

    setSending(true);
    setSendError('');
    shouldStickToBottom.current = true;

    try {
      let mediaPath: string | undefined;

      if (media) {
        const extension = media.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
          || (media.type === 'video/mp4' ? 'mp4' : 'jpg');
        mediaPath = `chat_media/${match.id}/${crypto.randomUUID()}.${extension}`;

        // `uploader_id` and `match_id` metadata are required by Storage rules and
        // re-verified server-side before the message is accepted.
        await uploadBytes(ref(storage, mediaPath), media, {
          contentType: media.type,
          customMetadata: { uploader_id: currentUserId, match_id: match.id },
        });
      }

      await api.sendMessage(match.id, body || undefined, mediaPath);
      setText('');
      setMedia(null);
    } catch (caught) {
      setSendError(errorMessage(caught, 'Your message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async () => {
    if (!pendingDelete) return;
    setActionBusy(true);
    try {
      await api.deleteMessage(pendingDelete.id);
      setPendingDelete(null);
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not delete that message.'));
    } finally {
      setActionBusy(false);
    }
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setActionBusy(true);
    try {
      await api.reportUser({
        reported_id: peerId,
        category: String(form.get('category')),
        reason: String(form.get('reason')),
        description: String(form.get('description') ?? '').trim() || undefined,
      });
      setReportOpen(false);
      toast.success('Report submitted. Our moderators will review it.');
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not submit that report.'));
    } finally {
      setActionBusy(false);
    }
  };

  const blockPeer = async () => {
    setActionBusy(true);
    try {
      await api.blockUser(peerId);
      toast.success(`${peer?.full_name ?? 'This student'} has been blocked.`);
      setBlockOpen(false);
      navigate('/connections', { replace: true });
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not block that student.'));
    } finally {
      setActionBusy(false);
    }
  };

  // ── Guard states ────────────────────────────────────────────────────────
  if (matchesLoading) return <ListSkeleton count={5} />;

  if (!match) {
    return (
      <EmptyState
        icon="alert"
        title="Conversation not available"
        description="This conversation no longer exists, or you are not part of it."
        action={<Link className="button secondary" to="/connections">Back to connections</Link>}
        compact={false}
      />
    );
  }

  const inactive = match.status !== 'active';
  const canLoadOlder = messages.length >= windowSize;

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <Link className="icon-button" to="/connections" aria-label="Back to connections">
          <Icon name="back" size={19} />
        </Link>
        <Avatar student={peer} />
        <div className="chat-header-copy">
          <h1>{peer?.full_name ?? 'Campus connection'}</h1>
          <p>{peer?.branch ? peer.branch : 'Private campus conversation'}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setReportOpen(true)}
          aria-label="Report this student"
          title="Report"
        >
          <Icon name="flag" size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setBlockOpen(true)}
          aria-label="Block this student"
          title="Block"
        >
          <Icon name="block" size={18} />
        </button>
      </header>

      {inactive && (
        <p className="chat-banner">
          This connection has ended. You can read the history but cannot send new messages.
        </p>
      )}

      <div className="message-list" ref={listRef} onScroll={onScroll} aria-live="polite">
        {status === 'loading' && (
          <p className="chat-empty"><Spinner size={16} /> Loading conversation…</p>
        )}

        {status === 'error' && (
          <ErrorState
            message={loadError}
            onRetry={() => setWindowSize((size) => size + 1)}
          />
        )}

        {status === 'ready' && canLoadOlder && (
          <button
            type="button"
            className="button ghost small"
            style={{ alignSelf: 'center', marginBottom: 6 }}
            onClick={() => {
              shouldStickToBottom.current = false;
              setWindowSize((size) => size + PAGE_SIZE);
            }}
          >
            <Icon name="refresh" size={15} /> Load earlier messages
          </button>
        )}

        {status === 'ready' && messages.length === 0 && (
          <p className="chat-empty">
            You are connected. Say hello and start the conversation.
          </p>
        )}

        {status === 'ready' && messages.map((message, index) => {
          const mine = message.sender_id === currentUserId;
          const previous = messages[index - 1];
          const currentDay = toDate(message.sent_at)?.toDateString();
          const previousDay = previous ? toDate(previous.sent_at)?.toDateString() : null;
          const showDay = Boolean(currentDay) && currentDay !== previousDay;

          return (
            <div key={message.id} style={{ display: 'contents' }}>
              {showDay && <span className="day-divider">{formatDayLabel(message.sent_at)}</span>}
              <div className={`message${mine ? ' mine' : ''}${message.is_deleted ? ' is-deleted' : ''}`}>
                {message.is_deleted ? (
                  <span>This message was deleted</span>
                ) : (
                  <>
                    {message.media_path && <ChatMedia message={message} />}
                    {message.text && <span>{message.text}</span>}
                    {mine && (
                      <button
                        type="button"
                        className="message-delete"
                        onClick={() => setPendingDelete(message)}
                        aria-label="Delete this message"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </>
                )}
                <span className="message-meta">
                  {formatTime(message.sent_at)}
                  {mine && !message.is_deleted && (
                    <Icon
                      name="check"
                      size={12}
                      label={message.read_at ? 'Read' : 'Sent'}
                      strokeWidth={message.read_at ? 2.6 : 1.6}
                    />
                  )}
                </span>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {sendError && <FieldError>{sendError}</FieldError>}

      <form className="message-form" onSubmit={send}>
        <label className="attach-button" title="Attach a photo or video">
          <Icon name="attach" size={19} />
          <span className="sr-only">Attach a photo or video</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            disabled={sending || inactive}
            onClick={(event) => { event.currentTarget.value = ''; }}
            onChange={(event) => pickMedia(event.target.files?.[0])}
          />
        </label>

        <div className="message-input-wrap">
          {media && (
            <button
              type="button"
              className="attachment-chip"
              onClick={() => setMedia(null)}
              aria-label={`Remove attachment ${media.name}`}
            >
              <Icon name="close" size={13} />
              <span>{media.name}</span>
              <span className="muted">{formatBytes(media.size)}</span>
            </button>
          )}
          <input
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={inactive ? 'This connection has ended' : 'Write a message…'}
            aria-label="Message"
            disabled={sending || inactive}
          />
        </div>

        <button
          type="submit"
          className="button primary"
          disabled={sending || inactive || (!text.trim() && !media)}
          aria-label="Send message"
        >
          {sending ? <Spinner label="Sending" size={16} /> : <Icon name="send" size={18} />}
        </button>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this message?"
        message="The message will be replaced with “This message was deleted” for both of you. Any attachment is permanently removed."
        confirmLabel="Delete message"
        destructive
        busy={actionBusy}
        onConfirm={() => void removeMessage()}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={blockOpen}
        title={`Block ${peer?.full_name ?? 'this student'}?`}
        message="You will be unmatched immediately, neither of you will see the other in Discover, and they cannot contact you again. You can undo this in Profile → Safety."
        confirmLabel="Block student"
        destructive
        busy={actionBusy}
        onConfirm={() => void blockPeer()}
        onCancel={() => setBlockOpen(false)}
      />

      <Modal
        open={reportOpen}
        title={`Report ${peer?.full_name ?? 'this student'}`}
        description="Reports are private and reviewed by campus moderators. Blocking is separate — you can do both."
        busy={actionBusy}
        onClose={() => setReportOpen(false)}
      >
        <form onSubmit={submitReport} id="report-form">
          <div className="field">
            <label className="field-label" htmlFor="report-category">What is this about?</label>
            <select id="report-category" name="category" className="select" defaultValue="chat" required>
              {REPORT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="report-reason">Reason</label>
            <select id="report-reason" name="reason" className="select" defaultValue="harassment" required>
              {REPORT_REASONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="report-description">What happened? (optional)</label>
            <textarea
              id="report-description"
              name="description"
              className="textarea"
              maxLength={1000}
              placeholder="Share any detail that helps moderators understand the situation."
            />
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <button type="submit" className="button danger" disabled={actionBusy}>
              {actionBusy ? <><Spinner label="Submitting" /> Submitting…</> : <><Icon name="flag" size={16} /> Submit report</>}
            </button>
            <button type="button" className="button ghost" onClick={() => setReportOpen(false)} disabled={actionBusy}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
