-- Coincidencias aparcadas para más adelante (p. ej. está en cines y la
-- queréis ver cuando salga en una plataforma). Una fila por título y la
-- comparte todo el grupo: lo que aparca uno, lo ve aparcado el otro.
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
    create table if not exists public.aparcadas (
      titulo_id  %s primary key references public.titulos(id) on delete cascade,
      usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      creado     timestamptz not null default now()
    )$f$, tipo_id);
end $$;

alter table public.aparcadas enable row level security;

-- se ven las aparcadas de los títulos de tus grupos
create policy "ver aparcadas del grupo" on public.aparcadas
  for select to authenticated
  using (exists (
    select 1 from public.titulos t
    join public.miembros m on m.pareja_id = t.pareja_id
    where t.id = aparcadas.titulo_id and m.usuario_id = auth.uid()
  ));

-- cualquiera del grupo aparca o recupera, sea quien sea quien la aparcó
create policy "aparcar en mi grupo" on public.aparcadas
  for insert to authenticated
  with check (usuario_id = auth.uid() and exists (
    select 1 from public.titulos t
    join public.miembros m on m.pareja_id = t.pareja_id
    where t.id = aparcadas.titulo_id and m.usuario_id = auth.uid()
  ));

create policy "recuperar en mi grupo" on public.aparcadas
  for delete to authenticated
  using (exists (
    select 1 from public.titulos t
    join public.miembros m on m.pareja_id = t.pareja_id
    where t.id = aparcadas.titulo_id and m.usuario_id = auth.uid()
  ));

grant select, insert, delete on public.aparcadas to authenticated;

-- refresco en vivo: si la otra persona aparca una, se mueve sola
alter publication supabase_realtime add table public.aparcadas;
