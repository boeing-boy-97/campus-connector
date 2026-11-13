import { useEffect, useRef } from 'react';
import { LEGAL_DOCS, LEGAL_VERSION } from '../utils/terms';
import type { LegalDocId } from '../utils/terms';

interface LegalModalProps {
  doc: LegalDocId;
  onClose: () => void;
}

/**
 * Accessible document dialog for the Terms of Service / Privacy Policy.
 * Traps keyboard focus, closes on Escape or backdrop click, and restores focus
 * to whatever opened it.
 */
export function LegalModal({ doc, onClose }: LegalModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const content = LEGAL_DOCS[doc];

  // Focus the panel on open and close on Escape.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      // Keep Tab focus inside the dialog.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="legal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="legal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="legal-panel-head">
          <div>
            <p className="legal-meta">CAMPUS CONNECT LEGAL · v{LEGAL_VERSION}</p>
            <h2 id="legal-title">{content.title}</h2>
          </div>
          <button type="button" className="legal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="legal-body">
          <p className="legal-intro">{content.intro}</p>
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        <footer className="legal-panel-foot">
          <span>Last updated {content.updated}</span>
          <button type="button" className="legal-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
