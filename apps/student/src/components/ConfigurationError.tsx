/**
 * Rendered when required Firebase environment variables are missing.
 *
 * The previous build hardcoded a real project's API key and IDs as fallbacks, so
 * a deployment with missing variables silently pointed at the wrong project.
 * Failing visibly here is far safer, and tells the operator exactly what to set.
 */
export function ConfigurationError({ missingKeys }: { missingKeys: readonly string[] }) {
  return (
    <main className="config-screen">
      <section className="config-card">
        <h1>Configuration required</h1>
        <p>
          Campus Connector cannot start because its Firebase configuration is incomplete.
          This is a deployment setting, not a problem with your account.
        </p>
        <p>
          Set the following environment variable{missingKeys.length === 1 ? '' : 's'} in
          <code style={{ display: 'inline', padding: '2px 6px', marginLeft: 4 }}>apps/student/.env.local</code>
          {' '}(local) or in your hosting provider&apos;s build environment, then rebuild:
        </p>
        <code>{missingKeys.map((key) => `${key}=`).join('\n')}</code>
        <p style={{ marginTop: 14, marginBottom: 0 }}>
          These values come from the Firebase console under
          {' '}<strong>Project settings → Your apps → SDK setup and configuration</strong>.
          See <code style={{ display: 'inline', padding: '2px 6px' }}>apps/student/.env.example</code>.
        </p>
      </section>
    </main>
  );
}
