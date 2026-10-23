import type { Db } from './db.js';

const STATEMENTS = [
  `create table if not exists users (
     id text primary key,
     email text not null unique,
     name text not null,
     password_hash text not null,
     created_at timestamptz not null default now()
   )`,

  `create table if not exists titles (
     id text primary key,
     slug text not null unique,
     name text not null,
     tagline text not null,
     description text not null,
     year integer not null,
     maturity text not null,
     genre text not null,
     duration_mins integer not null,
     manifest_url text not null,
     poster_from text not null,
     poster_to text not null,
     backdrop_from text not null,
     backdrop_to text not null,
     featured boolean not null default false,
     sort_order integer not null default 0,
     created_at timestamptz not null default now()
   )`,

  `create table if not exists watch_progress (
     user_id text not null references users(id) on delete cascade,
     title_id text not null references titles(id) on delete cascade,
     position_secs integer not null default 0,
     duration_secs integer not null default 0,
     completed boolean not null default false,
     updated_at timestamptz not null default now(),
     primary key (user_id, title_id)
   )`,

  `create table if not exists playback_sessions (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     title_id text not null references titles(id) on delete cascade,
     device text not null default 'web',
     created_at timestamptz not null default now(),
     expires_at timestamptz not null
   )`,

  `create index if not exists watch_progress_user_updated_idx
     on watch_progress (user_id, updated_at desc)`,

  `create index if not exists playback_sessions_user_expiry_idx
     on playback_sessions (user_id, expires_at)`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.query(statement);
  }
}
