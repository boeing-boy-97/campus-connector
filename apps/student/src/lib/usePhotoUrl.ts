import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../services/firebase';

/**
 * Resolves a Cloud Storage path to a download URL, with a small module-level
 * cache so the same avatar is not re-resolved on every render or row.
 */
const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function resolveStorageUrl(path: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached) return Promise.resolve(cached);

  const existing = pending.get(path);
  if (existing) return existing;

  const request = getDownloadURL(ref(storage, path))
    .then((url) => {
      urlCache.set(path, url);
      return url;
    })
    .finally(() => pending.delete(path));

  pending.set(path, request);
  return request;
}

/** True for values that are already absolute URLs rather than Storage paths. */
function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Resolves a photo reference (Storage path or absolute URL) to a displayable
 * URL. Returns `undefined` while loading or on failure so callers can show the
 * initials fallback.
 */
export function usePhotoUrl(reference?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(
    reference && isAbsoluteUrl(reference) ? reference : undefined,
  );

  useEffect(() => {
    if (!reference) {
      setUrl(undefined);
      return;
    }

    if (isAbsoluteUrl(reference)) {
      setUrl(reference);
      return;
    }

    let active = true;
    setUrl(undefined);
    resolveStorageUrl(reference)
      .then((resolved) => { if (active) setUrl(resolved); })
      // A missing or unauthorised object simply falls back to initials.
      .catch(() => { if (active) setUrl(undefined); });

    return () => { active = false; };
  }, [reference]);

  return url;
}
