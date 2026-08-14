import './setup';
import type * as functions from 'firebase-functions/v1';
import {
  assertSameCollege,
  requireAdmin,
  requireAuth,
  requireCollegeLinked,
  requireModerator,
  requireVerified,
} from '../middleware/auth.middleware';
import { validate, Schemas } from '../middleware/validate.middleware';
import { z } from 'zod';
import { VerificationStatus } from '../../../../shared/enums';

type CallableContext = functions.https.CallableContext;

/** Builds a callable context with the given ID token claims. */
function contextWith(claims: Record<string, unknown> = {}, uid = 'user-1'): CallableContext {
  return {
    auth: {
      uid,
      token: {
        email: 'student@college.edu',
        email_verified: true,
        ...claims,
      },
    },
  } as unknown as CallableContext;
}

const anonymous = {} as CallableContext;

describe('requireAuth', () => {
  it('returns a typed context for a signed-in caller', () => {
    const result = requireAuth(contextWith({
      college_id: 'college-1',
      role: 'student',
      verification_status: VerificationStatus.APPROVED,
    }));

    expect(result).toMatchObject({
      uid: 'user-1',
      email: 'student@college.edu',
      collegeId: 'college-1',
      role: 'student',
      verificationStatus: VerificationStatus.APPROVED,
      isEmailVerified: true,
    });
  });

  it('rejects an unauthenticated caller', () => {
    expect(() => requireAuth(anonymous)).toThrow(/authentication required/i);
  });

  it('defaults to the least-privileged role and status when claims are absent', () => {
    const result = requireAuth(contextWith());
    expect(result.role).toBe('student');
    expect(result.verificationStatus).toBe(VerificationStatus.PENDING);
    expect(result.collegeId).toBe('');
  });
});

describe('requireAdmin', () => {
  it('accepts an administrator', () => {
    expect(requireAdmin(contextWith({ role: 'admin' })).role).toBe('admin');
  });

  it('rejects a moderator', () => {
    expect(() => requireAdmin(contextWith({ role: 'moderator' })))
      .toThrow(/admin access required/i);
  });

  it('rejects a student', () => {
    expect(() => requireAdmin(contextWith({ role: 'student' })))
      .toThrow(/admin access required/i);
  });

  it('rejects a caller who forged no role at all', () => {
    expect(() => requireAdmin(contextWith())).toThrow(/admin access required/i);
  });
});

describe('requireModerator', () => {
  it('accepts both moderators and administrators', () => {
    expect(requireModerator(contextWith({ role: 'moderator' })).role).toBe('moderator');
    expect(requireModerator(contextWith({ role: 'admin' })).role).toBe('admin');
  });

  it('rejects a student', () => {
    expect(() => requireModerator(contextWith({ role: 'student' })))
      .toThrow(/moderator access required/i);
  });
});

describe('requireVerified', () => {
  it('accepts an approved student', () => {
    const context = contextWith({ verification_status: VerificationStatus.APPROVED });
    expect(requireVerified(context).verificationStatus).toBe(VerificationStatus.APPROVED);
  });

  it('rejects a pending student', () => {
    expect(() => requireVerified(contextWith({
      verification_status: VerificationStatus.PENDING,
    }))).toThrow(/must be verified/i);
  });

  it('rejects a rejected student', () => {
    expect(() => requireVerified(contextWith({
      verification_status: VerificationStatus.REJECTED,
    }))).toThrow(/must be verified/i);
  });

  it('reports suspension distinctly so the user learns why', () => {
    expect(() => requireVerified(contextWith({
      verification_status: VerificationStatus.SUSPENDED,
    }))).toThrow(/suspended/i);
  });
});

describe('requireCollegeLinked', () => {
  it('accepts a caller with a linked college', () => {
    expect(requireCollegeLinked(contextWith({ college_id: 'college-1' })).collegeId)
      .toBe('college-1');
  });

  it('rejects a caller with no college claim', () => {
    expect(() => requireCollegeLinked(contextWith()))
      .toThrow(/not linked to a college/i);
  });
});

describe('assertSameCollege', () => {
  const student = requireAuth(contextWith({ college_id: 'college-1', role: 'student' }));

  it('allows access within the same college', () => {
    expect(() => assertSameCollege(student, 'college-1')).not.toThrow();
  });

  it('blocks cross-college access', () => {
    expect(() => assertSameCollege(student, 'college-2')).toThrow(/own college/i);
  });

  it('lets an administrator reach any college', () => {
    const admin = requireAuth(contextWith({ college_id: 'college-1', role: 'admin' }));
    expect(() => assertSameCollege(admin, 'college-9')).not.toThrow();
  });
});

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(2),
    count: z.number().int().min(1).default(5),
  });

  it('returns parsed data and applies defaults', () => {
    expect(validate(schema, { name: 'Ada' })).toEqual({ name: 'Ada', count: 5 });
  });

  it('reports the offending field in the message', () => {
    expect(() => validate(schema, { name: 'A' })).toThrow(/name:/);
  });

  it('rejects a completely wrong payload type', () => {
    expect(() => validate(schema, 'not-an-object')).toThrow();
  });

  it('rejects a null payload', () => {
    expect(() => validate(schema, null)).toThrow();
  });
});

describe('shared schema primitives', () => {
  describe('docId', () => {
    it('accepts a normal Firestore ID', () => {
      expect(Schemas.docId.parse('abc123')).toBe('abc123');
    });

    it('rejects a path traversal attempt', () => {
      expect(() => Schemas.docId.parse('students/other')).toThrow();
      expect(() => Schemas.docId.parse('../secrets')).toThrow();
    });

    it('rejects whitespace-bearing values and empty strings', () => {
      expect(() => Schemas.docId.parse('has space')).toThrow();
      expect(() => Schemas.docId.parse('')).toThrow();
    });
  });

  describe('anyEmail', () => {
    it('normalises case and trims', () => {
      expect(Schemas.anyEmail.parse('  Student@College.EDU ')).toBe('student@college.edu');
    });

    it('rejects a malformed address', () => {
      expect(() => Schemas.anyEmail.parse('not-an-email')).toThrow();
    });
  });

  describe('collegeEmail', () => {
    it('accepts institutional domains', () => {
      expect(Schemas.collegeEmail.parse('a@mit.edu')).toBe('a@mit.edu');
      expect(Schemas.collegeEmail.parse('b@iitb.ac.in')).toBe('b@iitb.ac.in');
    });

    it('rejects personal providers', () => {
      expect(() => Schemas.collegeEmail.parse('someone@gmail.com')).toThrow();
    });
  });

  describe('otp', () => {
    it('accepts exactly six digits', () => {
      expect(Schemas.otp.parse('012345')).toBe('012345');
    });

    it('rejects the wrong length or non-digits', () => {
      expect(() => Schemas.otp.parse('12345')).toThrow();
      expect(() => Schemas.otp.parse('1234567')).toThrow();
      expect(() => Schemas.otp.parse('12a456')).toThrow();
    });
  });

  describe('url', () => {
    it('accepts https', () => {
      expect(Schemas.url.parse('https://example.edu/logo.png'))
        .toBe('https://example.edu/logo.png');
    });

    it('rejects plaintext http and javascript URLs', () => {
      expect(() => Schemas.url.parse('http://example.edu')).toThrow();
      expect(() => Schemas.url.parse('javascript:alert(1)')).toThrow();
    });
  });

  describe('profileUrl', () => {
    const linkedin = Schemas.profileUrl('linkedin.com');

    it('accepts the expected host and its subdomains', () => {
      expect(linkedin.parse('https://www.linkedin.com/in/ada')).toContain('linkedin.com');
      expect(linkedin.parse('https://linkedin.com/in/ada')).toContain('linkedin.com');
    });

    it('rejects another host, including a lookalike', () => {
      expect(() => linkedin.parse('https://github.com/ada')).toThrow();
      expect(() => linkedin.parse('https://linkedin.com.evil.test/ada')).toThrow();
    });

    it('rejects non-https', () => {
      expect(() => linkedin.parse('http://www.linkedin.com/in/ada')).toThrow();
    });
  });

  describe('domain', () => {
    it('accepts a bare domain and lowercases it', () => {
      expect(Schemas.domain.parse('JDCollege.edu.in')).toBe('jdcollege.edu.in');
    });

    it('rejects a URL or an address', () => {
      expect(() => Schemas.domain.parse('https://jdcollege.edu.in')).toThrow();
      expect(() => Schemas.domain.parse('a@jdcollege.edu.in')).toThrow();
    });
  });

  describe('hexColor', () => {
    it('accepts a six-digit hex value', () => {
      expect(Schemas.hexColor.parse('#1A237E')).toBe('#1A237E');
    });

    it('rejects shorthand and named colours', () => {
      expect(() => Schemas.hexColor.parse('#fff')).toThrow();
      expect(() => Schemas.hexColor.parse('red')).toThrow();
    });
  });

  describe('pagination', () => {
    it('defaults the page size', () => {
      expect(Schemas.pagination.parse({})).toMatchObject({ page_size: 20 });
    });

    it('caps the page size so a client cannot request an unbounded read', () => {
      expect(() => Schemas.pagination.parse({ page_size: 500 })).toThrow();
    });
  });
});
