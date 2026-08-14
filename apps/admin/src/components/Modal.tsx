import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus trap, Escape to dismiss, body scroll lock. */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  busy = false,
  size = 'medium',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? dialogRef.current)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const titleId = `admin-modal-${title.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="modal-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
