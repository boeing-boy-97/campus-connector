import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Shared test environment.
 *
 * jsdom lacks a few browser APIs the components legitimately use; each is
 * stubbed with realistic behaviour rather than a no-op that would hide a bug.
 */

// `scrollIntoView` is used by the chat auto-scroll.
Element.prototype.scrollIntoView = vi.fn();

// `matchMedia` is read by responsive helpers.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Attachment previews call createObjectURL.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
});
