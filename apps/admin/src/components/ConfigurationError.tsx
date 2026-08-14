/**
 * Shown when the admin panel is built without its Firebase environment.
 *
 * The previous build hardcoded a live project's API key and IDs as fallbacks, so
 * a misconfigured deployment silently connected to the wrong project. Failing
 * loudly here tells the operator exactly which variables to set.
 */
export function ConfigurationError({ missingKeys }: { missingKeys: readonly string[] }) {
  return (
    <div className="full-center">
      <div className="card config-card">
        <h2 style={{ marginBottom: 12 }}>Configuration required</h2>
        <p className="text-muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
          The admin panel cannot start because its Firebase configuration is incomplete.
          This is a build/deployment setting, not a problem with your account.
        </p>
        <p className="text-muted" style={{ lineHeight: 1.6, marginBottom: 12 }}>
          Set the following in <code className="inline-code">apps/admin/.env.local</code> for local
          development, or in your hosting provider&apos;s build environment, then rebuild:
        </p>
        <pre className="error-detail">{missingKeys.map((key) => `${key}=`).join('\n')}</pre>
        <p className="text-muted text-sm" style={{ lineHeight: 1.6, marginTop: 14 }}>
          Values come from the Firebase console under
          {' '}<strong>Project settings → Your apps → SDK setup and configuration</strong>.
          See <code className="inline-code">apps/admin/.env.example</code>.
        </p>
      </div>
    </div>
  );
}

export default ConfigurationError;
