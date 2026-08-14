// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  validate.middleware.ts — Zod schema validation wrapper                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { z, ZodSchema } from 'zod';
import { Errors } from '../utils/errors';

/**
 * Validates input data against a Zod schema.
 * Throws a formatted invalid-argument error if validation fails.
 *
 * @param schema - Zod schema to validate against
 * @param data - Raw input data from the Cloud Function call
 * @returns Typed, parsed, and transformed data
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
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

  /** College email (enforced as .edu domain or .ac.in) */
  collegeEmail: z.string()
    .email('Invalid email address')
    .max(254)
    .transform((e) => e.toLowerCase().trim())
    .refine(
      (e) => {
        const domain = e.split('@')[1] || '';
        return domain.includes('.edu') || domain.includes('.ac.in') || domain.includes('.edu.in');
      },
      'Please use your official college email address (.edu / .ac.in)'
    ),

  /** Generic .edu-style email without strict domain check (used for lookup) */
  anyEmail: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),

  /** OTP code */
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),

  /** Hex color */
  hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (e.g. #6C63FF)'),

  /** URL */
  url: z.string().url('Invalid URL'),

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
