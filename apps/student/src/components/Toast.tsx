import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ToastContext, type ToastApi, type ToastTone } from '../lib/toast';

/**
 * Accessible, auto-dismissing toast notifications.
 *
 * The previous implementation stored a single string in App state which never
 * auto-dismissed, had no severity, and rendered the entire toast as a `<button>`
 * (so the whole message was announced as a control).
 */

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const DISMISS_AFTER_MS: Record<ToastTone, number> = {
  success: 4_000,
  info: 5_000,
  // Errors stay longer: the user may need to read a validation message.
  error: 8_000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message: string, tone: ToastTone) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const id = nextId.current;
    nextId.current += 1;

    setToasts((current) => {
      // Collapse an identical consecutive message instead of stacking duplicates.
      if (current.at(-1)?.message === trimmed) return current;
      // Cap the stack so a burst of failures cannot cover the screen.
      return [...current, { id, message: trimmed, tone }].slice(-3);
    });

    timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_AFTER_MS[tone]));
  }, [dismiss]);

  // Clear pending timers on unmount so no callback fires against a dead tree.
  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error'),
    info: (message: string) => push(message, 'info'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <Icon
              name={toast.tone === 'success' ? 'check' : toast.tone === 'error' ? 'alert' : 'spark'}
              size={16}
            />
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
