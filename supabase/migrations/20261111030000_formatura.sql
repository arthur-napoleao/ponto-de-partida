-- "Período" vira "semestre previsto de formatura".

alter table public.participantes rename column periodo to formatura;

create or replace function public.pdp_enviar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v1 boolean := (p->>'q1')::boolean; v2 boolean := (p->>'q2')::boolean;
  v3 boolean := (p->>'q3')::boolean; v4 boolean := (p->>'q4')::boolean;
  v5 boolean := (p->>'q5')::boolean; v6 boolean := (p->>'q6')::boolean;
  v7 smallint := (p->>'q7')::smallint;
  v_etapa smallint;
begin
  if length(coalesce(p->>'token', '')) < 12 then raise exception 'token invalido'; end if;
  v_etapa := pdp_etapa(v1, v2, v3, v4, v5, v6);
  insert into participantes (id, token, nome, email, curso, formatura, momento,
    q1, q2, q3, q4, q5, q6, q7, etapa_calculada, consolidada, etapa_percebida, diferenca)
  values ((p->>'id')::uuid, left(p->>'token', 40),
    left(trim(p->>'nome'), 120), lower(left(trim(p->>'email'), 160)),
    left(trim(p->>'curso'), 120),
    left(trim(coalesce(p->>'formatura', p->>'periodo', '')), 40),   -- aceita aparelhos com a página antiga em cache
    left(trim(p->>'momento'), 60),
    v1, v2, v3, v4, v5, v6, v7,
    v_etapa, (v1 and v2 and v3 and v4 and v5 and v6), v7, v7 - v_etapa)
  on conflict do nothing;
end $$;

drop view if exists public.exportacao;
create view public.exportacao with (security_invoker = true) as
  select nome, email, curso, formatura, momento,
    q1, q2, q3, q4, q5, q6, q7,
    etapa_calculada, consolidada, etapa_percebida, diferenca, te_descreve, criado_em,
    (select count(*) from public.registros r where r.participante_id = p.id) as registros_feitos,
    exists (select 1 from public.apostas a where a.participante_id = p.id) as fez_meu_teste
  from public.participantes p
  order by criado_em;
revoke all on public.exportacao from anon, authenticated;
