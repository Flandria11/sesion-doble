-- Notas (0-10) de lo visto juntos. Una fila por persona y título.
-- Ejecutar una vez en Supabase > SQL Editor.

do $$
declare
  tipo_id text;
begin
  -- mismo tipo que titulos.id, sea uuid o bigint
  select format_type(atttypid, atttypmod) into tipo_id
  from pg_attribute
  where attrelid = 'public.titulos'::regclass and attname = 'id';

  execute format($f$
    create table if not exists public.puntuaciones (
      titulo_id  %s not null references public.titulos(id) on delete cascade,
      usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      nota       smallint not null check (nota between 0 and 10),
      creado     timestamptz not null default now(),
      primary key (titulo_id, usuario_id)
    )$f$, tipo_id);
end $$;

alter table public.puntuaciones enable row level security;

-- se ven las notas de los títulos de tus grupos
create policy "ver notas del grupo" on public.puntuaciones
  for select to authenticated
  using (exists (
    select 1 from public.titulos t
    join public.miembros m on m.pareja_id = t.pareja_id
    where t.id = puntuaciones.titulo_id and m.usuario_id = auth.uid()
  ));

-- cada uno solo pone, cambia o quita la suya, y solo en sus grupos
create policy "poner mi nota" on public.puntuaciones
  for insert to authenticated
  with check (usuario_id = auth.uid() and exists (
    select 1 from public.titulos t
    join public.miembros m on m.pareja_id = t.pareja_id
    where t.id = puntuaciones.titulo_id and m.usuario_id = auth.uid()
  ));

create policy "cambiar mi nota" on public.puntuaciones
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "quitar mi nota" on public.puntuaciones
  for delete to authenticated
  using (usuario_id = auth.uid());

grant select, insert, update, delete on public.puntuaciones to authenticated;

-- refresco en vivo: si la otra persona pone su nota, aparece sola
alter publication supabase_realtime add table public.puntuaciones;
