import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The four UI states every data surface needs.
 *
 * Previously the app conflated "loading" with "empty", so Discover showed
 * "No new recommendations yet" while the request was still in flight — a false
 * empty state. These components make each state explicit and always give the
 * user a recovery action on failure.
 */

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status">
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Full-page loader used while the session is resolving. */
export function Splash({ message = 'Loading Campus Connector' }: { message?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-inner">
        <div className="brand-mark" aria-hidden="true">C</div>
        <span className="sr-only">{message}</span>
        <div className="splash-bar"><span /></div>
      </div>
    </div>
  );
}

/** Skeleton card grid matching the shape of the discovery feed. */
export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="card-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <article className="person-card is-skeleton" key={index}>
          <div className="cover skeleton" />
          <div className="person-info">
            <div className="skeleton line sm" />
            <div className="skeleton line lg" />
            <div className="skeleton line md" />
            <div className="skeleton block" />
            <div className="skeleton line btn" />
          </div>
        </article>
      ))}
    </div>
  );
}

/** Skeleton rows matching the shape of a list card. */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="list-card" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="list-row is-skeleton" key={index}>
          <div className="skeleton avatar-skeleton" />
          <div className="list-row-body">
            <div className="skeleton line md" />
            <div className="skeleton line sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon = 'spark',
  title,
  description,
  action,
  compact = true,
}: EmptyStateProps) {
  return (
    <section className={`state-panel${compact ? ' compact' : ''}`}>
      <div className="state-icon" aria-hidden="true"><Icon name={icon} size={24} /></div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </section>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

/**
 * Failure state with a recovery action. Always prefer this over a bare toast for
 * a surface that has no content to show, so the user is never left with a blank
 * screen and no way forward.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  compact = true,
}: ErrorStateProps) {
  return (
    <section className={`state-panel is-error${compact ? ' compact' : ''}`} role="alert">
      <div className="state-icon danger" aria-hidden="true"><Icon name="alert" size={24} /></div>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> {retryLabel}
        </button>
      )}
    </section>
  );
}

/** Inline field/form error message. */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="form-error" role="alert">
      <Icon name="alert" size={14} /> <span>{children}</span>
    </p>
  );
}
