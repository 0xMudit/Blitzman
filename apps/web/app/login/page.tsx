'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api, getToken, setToken } from '@/lib/api';

type Mode = 'signin' | 'create';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: skip the form.
  useEffect(() => {
    if (!getToken()) return;
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next && next.startsWith('/') ? next : '/');
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const body =
        mode === 'create' ? { email, name, password } : { email, password };
      const response = await api<{ token: string }>(
        mode === 'create' ? '/auth/register' : '/auth/login',
        { method: 'POST', body, token: null },
      );
      setToken(response.token);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden />
      <div className="auth-shell">
        <section className="auth-pitch">
          <span className="hero-eyebrow">Phase 1 · now streaming</span>
          <h1>
            One account.
            <br />
            Every screen.
            <br />
            <span className="gradient-text">Zero buffering.</span>
          </h1>
          <p>
            A real streaming stack you can read end to end: adaptive bitrate playback, signed
            120-second playback tokens, concurrency policing, and cross-device resume.
          </p>
          <ul className="auth-facts">
            <li>
              <strong>ABR</strong> HLS ladder with manual quality override
            </li>
            <li>
              <strong>2 streams</strong> per account, enforced server-side
            </li>
            <li>
              <strong>Resume</strong> exactly where you stopped, on any device
            </li>
          </ul>
        </section>

        <section className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={mode === 'create' ? 'active' : ''}
              onClick={() => {
                setMode('create');
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === 'create' && (
              <label>
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                  maxLength={60}
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'create' ? 'At least 8 characters' : 'Your password'}
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'create' ? 8 : undefined}
              />
            </label>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary btn-full" disabled={busy}>
              {busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button type="button" onClick={() => setMode('create')}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have one?{' '}
                <button type="button" onClick={() => setMode('signin')}>
                  Sign in
                </button>
              </>
            )}
          </p>

          <Link href="/" className="auth-guest">
            Keep browsing without an account →
          </Link>
        </section>
      </div>
    </main>
  );
}
