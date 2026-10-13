-- Nota corregida de los títulos en los que TMDB e IMDb no se ponen de
-- acuerdo (0,7 puntos o más, hacia arriba o hacia abajo). La app usa esta
-- nota en vez de la de TMDB para decidir si un título entra en cada
-- apartado (Añadir, Estrenos, Top); lo que enseña sigue siendo lo de TMDB.
-- La rellena scripts/notas-imdb.mjs (GitHub Actions, cada semana).
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.notas_ajustadas (
  tmdb_id integer not null,
  tipo    text    not null check (tipo in ('movie', 'tv')),
  nota    numeric(3, 1) not null,
  primary key (tmdb_id, tipo)
);

alter table public.notas_ajustadas enable row level security;

-- la lee cualquiera con sesión; solo la escribe el script (va con la
-- conexión directa a Postgres, que no pasa por estas reglas)
create policy "leer notas ajustadas" on public.notas_ajustadas
  for select to authenticated using (true);

grant select on public.notas_ajustadas to authenticated;

-- Qué código de IMDb tiene cada título de TMDB: averiguarlo es una
-- consulta a TMDB por título, así que se guarda para no repetirla cada
-- semana. Solo la usa el script: la app no tiene acceso.
create table if not exists public.tmdb_imdb (
  tmdb_id     integer not null,
  tipo        text    not null check (tipo in ('movie', 'tv')),
  imdb_id     text,
  comprobado  timestamptz not null default now(),
  primary key (tmdb_id, tipo)
);

alter table public.tmdb_imdb enable row level security;
revoke all on public.tmdb_imdb from anon, authenticated;
