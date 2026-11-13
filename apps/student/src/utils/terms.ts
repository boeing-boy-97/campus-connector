/**
 * Terms of Service & Privacy Policy copy.
 *
 * Both texts are versioned to match the `consent_version` stored with accounts
 * (`1.0.0`, see shared/constants LEGAL + backend consent validation). When the
 * legal copy changes, bump the version here AND in shared/constants, and the
 * backend will record the new version with each signup.
 */

export const LEGAL_VERSION = '1.0.0';

export type LegalDocId = 'terms' | 'privacy';

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updated: '13 November 2026',
    intro:
      'These terms govern your use of Campus Connect. By creating an account you confirm you have read and agreed to them.',
    sections: [
      {
        heading: '1. Who can use Campus Connect',
        body:
          'You must be at least 18 years old and currently enrolled at a recognised college or university whose institutional email domain is registered with Campus Connect. Accounts are personal and may not be shared, sold, or transferred.',
      },
      {
        heading: '2. Verified, college-only community',
        body:
          'Access requires a verified institutional email address and photo verification. Profiles are only visible to verified students of your own college. We may remove accounts that misrepresent their identity, enrolment, or affiliation.',
      },
      {
        heading: '3. Acceptable use',
        body:
          'You agree to treat other students with respect. Harassment, hate speech, threats, impersonation, sexual content, spam, scams, and the sharing of another person\u2019s private information without consent are prohibited. You are responsible for any content you upload.',
      },
      {
        heading: '4. Safety, reporting & moderation',
        body:
          'Every profile and message can be reported or blocked. Reports are reviewed by our moderation team and may result in warnings, content removal, or suspension. Campus Connect is not an emergency service: if you are in danger, contact local authorities.',
      },
      {
        heading: '5. Your data & privacy',
        body:
          'We process your data as described in our Privacy Policy, in line with India\u2019s Digital Personal Data Protection Act, 2023. You can delete your account at any time from Profile → Account.',
      },
      {
        heading: '6. Changes to these terms',
        body:
          'We may update these terms as the product evolves. Material changes will be shown in-app before they take effect, with a new consent version where required.',
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updated: '13 November 2026',
    intro:
      'Campus Connect collects as little as possible. This page explains exactly what we store, why, and the control you have over it.',
    sections: [
      {
        heading: '1. What we collect',
        body:
          'Your college email address, the college you are verified with, your profile details (name, branch, year, bio, interests, date of birth, photo), and the messages and connection requests you choose to send. We also store technical logs and a device notification token.',
      },
      {
        heading: '2. Why we collect it',
        body:
          'To verify that you are a real student of your college, to introduce you to other verified students on your campus, to keep the community safe through moderation, and to send you account and activity notifications.',
      },
      {
        heading: '3. Who can see your data',
        body:
          'Your profile is visible only to verified students of your own college — never to other colleges and never publicly. Verification photos are reviewed by authorised moderators only. We never sell your data and never use it for advertising.',
      },
      {
        heading: '4. How long we keep it',
        body:
          'Data is retained while your account is active. When you delete your account, your profile is anonymised, active connections are closed, and your sign-in is disabled; only the aggregate records required for safety and legal obligations are kept.',
      },
      {
        heading: '5. Your rights',
        body:
          'Under the DPDP Act, 2023 you may access, correct, or erase your personal data, withdraw consent, and complain to the Data Protection Board of India. Most of these actions are available in Profile → Account; the rest can be requested from our team.',
      },
      {
        heading: '6. Contact',
        body:
          'Questions about privacy? Reach the team through the support channel listed in the app. We respond to verified student requests within a reasonable period.',
      },
    ],
  },
};
