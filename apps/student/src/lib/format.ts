import type { TimestampLike } from '../types';

/** Converts any timestamp shape the backend returns into a Date, or null. */
export function toDate(value: TimestampLike): Date | null {
  if (value == null) return null;

  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const fullFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Clock time, e.g. "14:32" — used on chat bubbles. */
export function formatTime(value: TimestampLike): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : '';
}

/** Absolute date, e.g. "14 Aug 2026". */
export function formatDate(value: TimestampLike): string {
  const date = toDate(value);
  return date ? fullFormatter.format(date) : '—';
}

/**
 * Compact relative time for lists: "now", "5m", "3h", "Mon", "14 Aug".
 * Falls back to an empty string rather than rendering "Invalid Date".
 */
export function formatRelative(value: TimestampLike): string {
  const date = toDate(value);
  if (!date) return '';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);

  return dayFormatter.format(date);
}

/** Day separator label for the message list. */
export function formatDayLabel(value: TimestampLike): string {
  const date = toDate(value);
  if (!date) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  return fullFormatter.format(date);
}

/** Initials for the avatar fallback. */
export function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Computer Science · Year 3" style subtitle, skipping missing parts. */
export function describeStudent(branch?: string, year?: number): string {
  return [branch, year ? `Year ${year}` : null].filter(Boolean).join(' · ');
}

/** Human-readable file size, for upload validation messages. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
