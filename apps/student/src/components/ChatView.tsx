import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { Avatar } from './Avatar';
import type { StudentProfile } from './Verification';

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  text?: string;
  media_url?: string;
  media_type?: string;
  sent_at?: Timestamp;
  read_at?: Timestamp | null;
  is_deleted: boolean;
}

interface ChatViewProps {
  matchId: string;
  currentUserId: string;
  onBack: () => void;
}

const MESSAGES_PER_PAGE = 50;

export function ChatView({ matchId, currentUserId, onBack }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch other user profile
  useEffect(() => {
    const fetchOtherUser = async () => {
      try {
        const matchSnap = await getDoc(doc(db, 'matches', matchId));
        if (!matchSnap.exists()) return;
        const matchData = matchSnap.data();
        const otherId =
          matchData.student_a_id === currentUserId
            ? matchData.student_b_id
            : matchData.student_a_id;
        const studentSnap = await getDoc(doc(db, 'students', otherId));
        if (studentSnap.exists()) {
          setOtherUser({ id: studentSnap.id, ...studentSnap.data() } as StudentProfile);
        }
      } catch (e) {
        console.error('Failed to load other user:', e);
      }
    };
    fetchOtherUser();
  }, [matchId, currentUserId]);

  // Real-time messages subscription
  useEffect(() => {
    setLoading(true);
    const messagesQuery = query(
      collection(db, 'messages'),
      where('match_id', '==', matchId),
      where('is_deleted', '==', false),
      orderBy('sent_at', 'desc'),
      limit(MESSAGES_PER_PAGE)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Message[];
        msgs.reverse(); // Oldest first for display
        setMessages(msgs);
        setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
        setLoading(false);

        // Mark messages as read
        markMessagesRead();
      },
      (error) => {
        console.error('Messages snapshot error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read
  const markMessagesRead = useCallback(async () => {
    try {
      const markReadFn = httpsCallable(functions, 'markRead');
      await markReadFn({ match_id: matchId });
    } catch {
      // Silent fail — not critical
    }
  }, [matchId]);

  // Load older messages
  const loadOlderMessages = async () => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestMsg = messages[0];
      const olderQuery = query(
        collection(db, 'messages'),
        where('match_id', '==', matchId),
        where('is_deleted', '==', false),
        orderBy('sent_at', 'desc'),
        startAfter(doc(db, 'messages', oldestMsg.id)),
        limit(MESSAGES_PER_PAGE)
      );
      const { getDocs } = await import('firebase/firestore');
      const snap = await getDocs(olderQuery);
      const olderMsgs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      olderMsgs.reverse();
      setMessages((prev) => [...olderMsgs, ...prev]);
      setHasMore(snap.docs.length === MESSAGES_PER_PAGE);
    } catch (e) {
      console.error('Failed to load older messages:', e);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');
    try {
      const sendFn = httpsCallable(functions, 'sendMessage');
      await sendFn({ match_id: matchId, text });
      inputRef.current?.focus();
    } catch (e) {
      console.error('Failed to send message:', e);
      setInputText(text); // Restore on failure
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  messages.forEach((msg) => {
    const msgDate = formatDate(msg.sent_at);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <section className="chat-view">
      {/* Chat Header */}
      <div className="chat-header">
        <button className="chat-back" onClick={onBack} aria-label="Go back">
          ←
        </button>
        <Avatar student={otherUser ?? undefined} size="small" />
        <div className="chat-header-info">
          <h2>{otherUser?.full_name ?? 'Campus connection'}</h2>
          <p>{otherUser?.branch}{otherUser?.year ? ` · Year ${otherUser.year}` : ''}</p>
        </div>
        <button
          className="icon-button chat-more"
          aria-label="More options"
          title="More options"
        >
          ⋯
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {loading ? (
          <div className="chat-loading">
            <div className="button-spinner" /> Loading messages…
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                className="load-older-btn"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            )}

            {messages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">👋</div>
                <p>
                  Say hello to <strong>{otherUser?.full_name}</strong>!
                  <br />
                  You matched — start a conversation.
                </p>
              </div>
            ) : (
              groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="chat-date-divider">
                    <span>{group.date}</span>
                  </div>
                  {group.messages.map((msg) => {
                    const isMine = msg.sender_id === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={`chat-bubble-wrap ${isMine ? 'mine' : 'theirs'}`}
                      >
                        <div className="chat-bubble">
                          <p>{msg.text}</p>
                          <span className="chat-time">
                            {formatTime(msg.sent_at)}
                            {isMine && msg.read_at && (
                              <span className="chat-read-receipt">✓✓</span>
                            )}
                            {isMine && !msg.read_at && (
                              <span className="chat-sent-receipt">✓</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={sending}
          maxLength={2000}
          className="chat-input"
          aria-label="Message input"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          aria-label="Send message"
        >
          {sending ? '…' : '→'}
        </button>
      </div>
    </section>
  );
}
