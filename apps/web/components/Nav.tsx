'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken, getToken, onAuthChange } from '@/lib/api';
import { initials } from '@/lib/format';
import type { MeResponse } from '@/lib/types';

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setTokenState] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const sync = () => setTokenState(getToken());
    sync();
    return onAuthChange(sync);
  }, []);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    api<MeResponse>('/auth/me')
      .then((response) => {
        if (!cancelled) setMe(response);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (pathname?.startsWith('/watch')) return null;

  function signOut() {
    clearToken();
    setMe(null);
    router.push('/');
    router.refresh();
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="logo" aria-label="Blitzman home">
          <span className="logo-mark" aria-hidden>
            ⚡
          </span>
          <span className="logo-word">BLITZMAN</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <Link href="/" className={pathname === '/' ? 'nav-link active' : 'nav-link'}>
            Browse
          </Link>
          <Link
            href="/status"
            className={pathname === '/status' ? 'nav-link active' : 'nav-link'}
          >
            Status
          </Link>
          <span className="nav-link nav-link-soon" title="Arrives in a later phase">
            My List
          </span>
        </nav>

        <div className="nav-right">
          {token ? (
            <>
              <span className="avatar" title={me?.user.email ?? 'Signed in'}>
                {me ? initials(me.user.name) : '··'}
              </span>
              <button type="button" className="btn-ghost btn-small" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary btn-small">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
