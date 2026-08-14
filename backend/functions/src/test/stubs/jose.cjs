/**
 * Stub for the ESM-only `jose` package.
 *
 * Only reached through firebase-admin's JWT verification path, which these tests
 * never exercise (the Admin SDK is replaced wholesale in src/test/setup.ts).
 * Every export throws if it is ever actually called, so a test that starts
 * depending on real JWT verification fails loudly rather than silently passing
 * against a no-op.
 */
function unsupported(name) {
  return () => {
    throw new Error(
      `jose.${name} was called in a test. JWT verification is not stubbed — ` +
      'mock the Firebase Admin boundary instead.'
    );
  };
}

module.exports = {
  createLocalJWKSet: unsupported('createLocalJWKSet'),
  createRemoteJWKSet: unsupported('createRemoteJWKSet'),
  decodeJwt: unsupported('decodeJwt'),
  decodeProtectedHeader: unsupported('decodeProtectedHeader'),
  importJWK: unsupported('importJWK'),
  importPKCS8: unsupported('importPKCS8'),
  importSPKI: unsupported('importSPKI'),
  importX509: unsupported('importX509'),
  jwtVerify: unsupported('jwtVerify'),
  SignJWT: class { constructor() { unsupported('SignJWT')(); } },
};
