import { randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import { SEED_TITLES } from './seed-data.js';

export async function seedTitles(db: Db): Promise<number> {
  for (const title of SEED_TITLES) {
    await db.query(
      `insert into titles (
         id, slug, name, tagline, description, year, maturity, genre, duration_mins,
         manifest_url, poster_from, poster_to, backdrop_from, backdrop_to, featured, sort_order
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (slug) do update set
         name = excluded.name,
         tagline = excluded.tagline,
         description = excluded.description,
         year = excluded.year,
         maturity = excluded.maturity,
         genre = excluded.genre,
         duration_mins = excluded.duration_mins,
         manifest_url = excluded.manifest_url,
         poster_from = excluded.poster_from,
         poster_to = excluded.poster_to,
         backdrop_from = excluded.backdrop_from,
         backdrop_to = excluded.backdrop_to,
         featured = excluded.featured,
         sort_order = excluded.sort_order`,
      [
        randomUUID(),
        title.slug,
        title.name,
        title.tagline,
        title.description,
        title.year,
        title.maturity,
        title.genre,
        title.durationMins,
        title.manifestUrl,
        title.posterFrom,
        title.posterTo,
        title.backdropFrom,
        title.backdropTo,
        title.featured,
        title.sortOrder,
      ],
    );
  }
  return SEED_TITLES.length;
}

export async function seedIfEmpty(db: Db): Promise<boolean> {
  const rows = await db.query<{ count: number }>('select count(*)::int as count from titles');
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) return false;
  await seedTitles(db);
  return true;
}
