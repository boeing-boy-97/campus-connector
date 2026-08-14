// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  validate.middleware.ts — Zod schema validation wrapper                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { z } from 'zod';
import { Errors } from '../utils/errors';

/**
 * Validates input data against a Zod schema.
 * Throws a formatted invalid-argument error if validation fails.
 *
 * The generic is parameterised over the schema itself (rather than a single
 * `T` for both input and output) so schemas using `.default()`, `.transform()`
 * or `.catch()` infer their *output* type correctly — with a single-`T`
 * signature, defaulted fields were inferred as possibly-undefined.
 *
 * @param schema - Zod schema to validate against
 * @param data - Raw input data from the Cloud Function call
 * @returns Typed, parsed, and transformed data
 */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.errors[0];
    const field = firstError.path.join('.');
    const message = firstError.message;

    throw Errors.invalidArgument(
      field ? `${field}: ${message}` : message,
      field || undefined
    );
  }

  return result.data;
}

// ─── Reusable schema primitives ────────────────────────────────────────────────

export const Schemas = {
  /** A single Firebase document ID, never a path or whitespace-delimited value. */
  docId: z.string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[^/\s]+$/, 'Invalid document ID'),

  /**
   * College email (enforced as a .edu / .ac.in domain).
   *
   * Normalisation happens BEFORE validation. Validating first rejected any
   * address with surrounding whitespace — which mobile keyboards and copy-paste
   * add routinely — so a legitimate student saw "Invalid email address".
   */
  collegeEmail: z.string()
    .max(255)
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address').max(254))
    .refine(
      (value) => {
        const domain = value.split('@')[1] || '';
        return domain.endsWith('.edu')
          || domain.endsWith('.ac.in')
          || domain.endsWith('.edu.in')
          || domain.includes('.edu.');
      },
      'Please use your official college email address (.edu / .ac.in)'
    ),

  /** Any well-formed email, normalised. Domain eligibility is checked separately. */
  anyEmail: z.string()
    .max(255)
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address').max(254)),

  /** OTP code */
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),

  /** Hex color */
  hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (e.g. #6C63FF)'),

  /** URL — https only, so links rendered in a client cannot use javascript: */
  url: z.string().url('Invalid URL').refine(
    (value) => value.startsWith('https://'),
    'URL must use https://'
  ),

  /**
   * An https profile link on a specific host (e.g. linkedin.com, github.com).
   * Restricting the host prevents the field from being used to distribute
   * arbitrary links to other students.
   */
  profileUrl: (host: string) =>
    z.string().url('Invalid URL').max(300).refine((value) => {
      try {
        const parsed = new URL(value);
        return (
          parsed.protocol === 'https:'
          && (parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
        );
      } catch {
        return false;
      }
    }, `Must be an https link on ${host}`),

  /** Domain name */
  domain: z.string()
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Invalid domain (e.g. jdcollege.edu.in)'
    )
    .transform((d) => d.toLowerCase()),

  /** Pagination cursor */
  pagination: z.object({
    page_size: z.number().int().min(1).max(50).default(20),
    last_doc_id: z.string().optional(),
  }),
};
