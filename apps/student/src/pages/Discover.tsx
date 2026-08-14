import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../services/api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { CardSkeletonGrid, EmptyState, ErrorState, Spinner } from '../components/states';
import { Modal } from '../components/Modal';
import { useToast } from '../lib/toast';
import { describeStudent } from '../lib/format';
import {
  MATCH_TYPE_LABELS,
  type IntentFlags,
  type MatchType,
  type Student,
  type StudentPublicProfile,
} from '../types';

const PAGE_SIZE = 12;
const MAX_INTRO_LENGTH = 200;

const GENDER_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

interface Filters {
  matchType: MatchType;
  year: string;
  gender: string;
}

/** Connection types the signed-in student has enabled on their own profile. */
function enabledIntents(flags: IntentFlags | undefined): MatchType[] {
  if (!flags) return ['friendship'];
  const enabled = (Object.keys(flags) as MatchType[]).filter((key) => flags[key]);
  return enabled.length > 0 ? enabled : ['friendship'];
}

export interface DiscoverProps {
  profile: Student;
}

/**
 * Discovery feed.
 *
 * Fixes the three original problems here: the empty state no longer appears
 * while loading, `match_type` is chosen by the student instead of hardcoded to
 * friendship, and `has_more` / `next_cursor` from the backend are actually used
 * so the feed is no longer capped at a single page of 20 profiles.
 */
export function Discover({ profile }: DiscoverProps) {
  const toast = useToast();
  const available = useMemo(() => enabledIntents(profile.intent_flags), [profile.intent_flags]);

  const [filters, setFilters] = useState<Filters>(() => ({
    matchType: available[0],
    year: '',
    gender: '',
  }));

  const [cards, setCards] = useState<StudentPublicProfile[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [introTarget, setIntroTarget] = useState<StudentPublicProfile | null>(null);
  const [introMessage, setIntroMessage] = useState('');

  // Guards against a stale response overwriting a newer one when filters change
  // quickly (a classic race that showed the wrong list).
  const requestId = useRef(0);

  const load = useCallback(async (mode: 'replace' | 'append') => {
    const id = requestId.current + 1;
    requestId.current = id;

    if (mode === 'replace') {
      setStatus('loading');
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await api.getRecommendations({
        page_size: PAGE_SIZE,
        match_type: filters.matchType,
        ...(filters.year ? { year_filter: Number(filters.year) } : {}),
        ...(filters.gender ? { gender_filter: filters.gender } : {}),
        ...(mode === 'append' && cursor ? { last_doc_id: cursor } : {}),
      });

      if (requestId.current !== id) return; // superseded

      setCards((current) => {
        if (mode === 'replace') return result.profiles;
        // De-duplicate: overlapping pages are possible because the backend
        // filters blocked/connected profiles in memory after paging.
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.profiles.filter((item) => !seen.has(item.id))];
      });
      setCursor(result.next_cursor);
      setHasMore(result.has_more && result.next_cursor !== null);
      setStatus('ready');
    } catch (caught) {
      if (requestId.current !== id) return;
      const message = errorMessage(caught, 'We could not load recommendations.');
      if (mode === 'replace') {
        setError(message);
        setStatus('error');
      } else {
        toast.error(message);
      }
    } finally {
      if (requestId.current === id) setLoadingMore(false);
    }
  }, [cursor, filters.gender, filters.matchType, filters.year, toast]);

  // Reload whenever the filters change. `load` is intentionally not a dependency
  // (it closes over `cursor`, which changes as pages append).
  useEffect(() => {
    setCards([]);
    setCursor(null);
    setHasMore(false);
    void load('replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.matchType, filters.year, filters.gender]);

  const connect = async (student: StudentPublicProfile, message?: string) => {
    setConnecting(student.id);
    try {
      await api.sendConnectRequest(student.id, filters.matchType, message);
      // Optimistically remove: the backend now excludes them from future pages.
      setCards((current) => current.filter((item) => item.id !== student.id));
      toast.success(`Request sent to ${student.full_name}.`);
      setIntroTarget(null);
      setIntroMessage('');
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not send that request.'));
    } finally {
      setConnecting(null);
    }
  };

  const resetFilters = () => setFilters({ matchType: available[0], year: '', gender: '' });
  const filtersActive = filters.year !== '' || filters.gender !== '';

  return (
    <section>
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <p className="eyebrow">Your campus</p>
            <h1 className="display">Discover people</h1>
            <p className="lede">Verified students from your college who are open to the same kind of connection.</p>
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => void load('replace')}
            disabled={status === 'loading'}
          >
            <Icon name="refresh" size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <div className="field">
          <label className="field-label" htmlFor="filter-type">Looking for</label>
          <select
            id="filter-type"
            className="select"
            value={filters.matchType}
            onChange={(event) => setFilters((current) => ({
              ...current,
              matchType: event.target.value as MatchType,
            }))}
          >
            {available.map((type) => (
              <option key={type} value={type}>{MATCH_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="filter-year">Year</label>
          <select
            id="filter-year"
            className="select"
            value={filters.year}
            onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}
          >
            <option value="">Any year</option>
            {[1, 2, 3, 4, 5, 6].map((year) => (
              <option key={year} value={year}>Year {year}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="filter-gender">Gender</label>
          <select
            id="filter-gender"
            className="select"
            value={filters.gender}
            onChange={(event) => setFilters((current) => ({ ...current, gender: event.target.value }))}
          >
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {filtersActive && (
          <div className="filter-actions">
            <button type="button" className="button ghost small" onClick={resetFilters}>
              <Icon name="close" size={15} /> Clear
            </button>
          </div>
        )}
      </div>

      {available.length === 1 && available[0] === 'friendship' && (
        <p className="banner info">
          <Icon name="spark" size={17} />
          <span>
            Only <strong>friendship</strong> is enabled on your profile. Turn on more connection
            types in <strong>Profile → Edit</strong> to discover study partners, project teams and more.
          </span>
        </p>
      )}

      {status === 'loading' && <CardSkeletonGrid count={PAGE_SIZE >= 6 ? 6 : PAGE_SIZE} />}

      {status === 'error' && (
        <ErrorState
          title="We could not load recommendations"
          message={error}
          onRetry={() => void load('replace')}
        />
      )}

      {status === 'ready' && cards.length === 0 && (
        <EmptyState
          icon="discover"
          title="No new people right now"
          description={
            filtersActive
              ? 'No verified students match these filters yet. Try widening them.'
              : `You have seen everyone currently open to ${MATCH_TYPE_LABELS[filters.matchType].toLowerCase()} at your college. New students appear here as they get verified.`
          }
          action={
            filtersActive ? (
              <button type="button" className="button secondary" onClick={resetFilters}>
                <Icon name="filter" size={16} /> Clear filters
              </button>
            ) : (
              <button type="button" className="button secondary" onClick={() => void load('replace')}>
                <Icon name="refresh" size={16} /> Check again
              </button>
            )
          }
        />
      )}

      {status === 'ready' && cards.length > 0 && (
        <>
          <div className="card-grid">
            {cards.map((student) => (
              <article className="person-card" key={student.id}>
                <div className="cover" />
                <Avatar student={student} size="large" />
                <div className="person-info">
                  <span className="verified-tag"><Icon name="shield" size={12} /> Verified</span>
                  <h3>{student.full_name}</h3>
                  <p className="meta">{describeStudent(student.branch, student.year)}</p>
                  <p className="bio">{student.bio || 'This student has not added a bio yet.'}</p>

                  {student.interests && student.interests.length > 0 && (
                    <div className="tags">
                      {student.interests.slice(0, 3).map((tag) => (
                        <span className="tag" key={tag}>{tag}</span>
                      ))}
                      {student.interests.length > 3 && (
                        <span className="tag">+{student.interests.length - 3}</span>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="button primary"
                    onClick={() => { setIntroTarget(student); setIntroMessage(''); }}
                    disabled={connecting === student.id}
                  >
                    {connecting === student.id
                      ? <><Spinner label="Sending" /> Sending…</>
                      : <>Connect <Icon name="send" size={16} /></>}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {hasMore && (
            <div className="load-more">
              <button
                type="button"
                className="button secondary"
                onClick={() => void load('append')}
                disabled={loadingMore}
              >
                {loadingMore
                  ? <><Spinner label="Loading" /> Loading…</>
                  : <>Show more people <Icon name="chevronDown" size={16} /></>}
              </button>
            </div>
          )}
        </>
      )}

      <Modal
        open={introTarget !== null}
        title={introTarget ? `Connect with ${introTarget.full_name}` : 'Connect'}
        description={`They will see your profile and this note. Sent as a ${MATCH_TYPE_LABELS[filters.matchType].toLowerCase()} request.`}
        busy={connecting !== null}
        onClose={() => { setIntroTarget(null); setIntroMessage(''); }}
        footer={
          <>
            <button
              type="button"
              className="button ghost"
              onClick={() => { setIntroTarget(null); setIntroMessage(''); }}
              disabled={connecting !== null}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => introTarget && void connect(introTarget, introMessage.trim() || undefined)}
              disabled={connecting !== null}
            >
              {connecting ? <><Spinner label="Sending" /> Sending…</> : 'Send request'}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="intro-message">Add a note (optional)</label>
          <textarea
            id="intro-message"
            className="textarea"
            maxLength={MAX_INTRO_LENGTH}
            value={introMessage}
            onChange={(event) => setIntroMessage(event.target.value)}
            placeholder="Hi! I saw you're into product design — want to team up for the hackathon?"
          />
          <span className="hint">{introMessage.length}/{MAX_INTRO_LENGTH}</span>
        </div>
      </Modal>
    </section>
  );
}
