/**
 * The Campus Connect logomark — a single "C" on the lime tile.
 * Shared by the auth screen, splash screens and the app topbar so the brand
 * mark stays identical everywhere.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      C
    </span>
  );
}

const WORDMARK_TEXT = 'campusconnect' as const;

/**
 * The "campus connect" wordmark, rendered per-letter so each character can be
 * animated independently (the accent letters spring in one after another).
 */
export function BrandWordmark({ animate = false }: { animate?: boolean }) {
  return (
    <span className={`bp-wordmark ${animate ? 'is-animated' : ''}`.trim()} aria-label="Campus Connect">
      <b aria-hidden="true">
        {WORDMARK_TEXT.slice(0, 6).split('').map((letter, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {letter}
          </span>
        ))}
      </b>
      <i aria-hidden="true">
        {WORDMARK_TEXT.slice(6).split('').map((letter, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {letter}
          </span>
        ))}
      </i>
    </span>
  );
}

/** Google's official four-colour "G" mark, used on the Google sign-in button. */
export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
