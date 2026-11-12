-- Fase 2 do backlog: três planos por aluno, régua de 1 a 5, perguntas por plano, teste ligado à pergunta, data real do teste.

create table if not exists public.planos (
  id uuid primary key,                                   -- gerado no navegador
  participante_id uuid references public.participantes (id) on delete cascade,
  email text,
  ordem smallint not null check (ordem between 1 and 3), -- 1 caminho em curso · 2 plano B · 3 a doideira
  titulo text not null default '',
  frase text not null default '',
  recursos smallint check (recursos between 1 and 5),
  animacao smallint check (animacao between 1 and 5),
  confianca smallint check (confianca between 1 and 5),
  coerencia smallint check (coerencia between 1 and 5),
  perguntas jsonb not null default '[]'::jsonb,          -- [{id, texto}]
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists planos_um_por_ordem on public.planos (participante_id, ordem) where participante_id is not null;
create unique index if not exists planos_um_por_ordem_email on public.planos (email, ordem) where participante_id is null;
alter table public.planos enable row level security;
revoke all on public.planos from anon, authenticated;

-- teste ligado a uma pergunta de um plano, e data real
alter table public.apostas
  add column if not exists plano_ordem smallint check (plano_ordem between 1 and 3),
  add column if not exists pergunta_id text,
  add column if not exists pergunta text not null default '',
  add column if not exists ate_data date;

create or replace function public.pdp_nota_1a5(v text)
returns smallint language sql immutable as $$
  select case when v ~ '^[1-5]$' then v::smallint end
$$;

create or replace function public.pdp_plano_salvar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_ordem smallint := (p->>'ordem')::smallint;
  v_perg jsonb;
  v_n int;
begin
  if v_ordem is null or v_ordem not between 1 and 3 then raise exception 'ordem invalida'; end if;
  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;
  if v_pid is null and v_email = '' then raise exception 'sem identificacao'; end if;

  -- até 6 perguntas, cada uma com id curto e texto limitado
  select coalesce(jsonb_agg(jsonb_build_object('id', left(x->>'id', 40), 'texto', left(coalesce(x->>'texto', ''), 500))), '[]'::jsonb)
    into v_perg
  from (select x from jsonb_array_elements(case when jsonb_typeof(p->'perguntas') = 'array' then p->'perguntas' else '[]'::jsonb end) x limit 6) s;

  update planos set titulo = left(coalesce(p->>'titulo', ''), 120), frase = left(coalesce(p->>'frase', ''), 600),
    recursos = pdp_nota_1a5(p->>'recursos'), animacao = pdp_nota_1a5(p->>'animacao'),
    confianca = pdp_nota_1a5(p->>'confianca'), coerencia = pdp_nota_1a5(p->>'coerencia'),
    perguntas = v_perg, atualizado_em = now()
  where ordem = v_ordem
    and ((v_pid is not null and participante_id = v_pid) or (v_pid is null and participante_id is null and email = v_email));
  get diagnostics v_n = row_count;
  if v_n > 0 then return; end if;

  insert into planos (id, participante_id, email, ordem, titulo, frase, recursos, animacao, confianca, coerencia, perguntas)
  values ((p->>'id')::uuid, v_pid, case when v_pid is null then v_email end, v_ordem,
    left(coalesce(p->>'titulo', ''), 120), left(coalesce(p->>'frase', ''), 600),
    pdp_nota_1a5(p->>'recursos'), pdp_nota_1a5(p->>'animacao'), pdp_nota_1a5(p->>'confianca'), pdp_nota_1a5(p->>'coerencia'), v_perg)
  on conflict do nothing;
end $$;

-- o teste guarda de qual plano e pergunta veio, e a data real
create or replace function public.pdp_teste_salvar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_estado text := p->>'estado';
  v_data date;
begin
  if v_estado is not null and v_estado not in ('desenhado', 'andamento', 'concluido') then
    raise exception 'estado invalido';
  end if;
  begin v_data := nullif(p->>'ate_data', '')::date; exception when others then v_data := null; end;
  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;

  insert into apostas as a (id, participante_id, email, aposta, teste, sigo_se, paro_se, ate, com_quem,
    estado, aprendi, muda, concluido_em, plano_ordem, pergunta_id, pergunta, ate_data)
  values ((p->>'id')::uuid, v_pid, nullif(v_email, ''),
    left(coalesce(p->>'aposta', ''), 1000), left(coalesce(p->>'teste', ''), 1000),
    left(coalesce(p->>'sigo_se', ''), 1000), left(coalesce(p->>'paro_se', ''), 1000),
    left(coalesce(p->>'ate', ''), 200), left(coalesce(p->>'com_quem', ''), 200),
    coalesce(v_estado, 'desenhado'), left(coalesce(p->>'aprendi', ''), 1000), left(coalesce(p->>'muda', ''), 1000),
    case when v_estado = 'concluido' then now() end,
    case when (p->>'plano_ordem') ~ '^[1-3]$' then (p->>'plano_ordem')::smallint end,
    nullif(left(coalesce(p->>'pergunta_id', ''), 40), ''), left(coalesce(p->>'pergunta', ''), 500), v_data)
  on conflict (id) do update set
    aposta = excluded.aposta, teste = excluded.teste, sigo_se = excluded.sigo_se, paro_se = excluded.paro_se,
    ate = excluded.ate, com_quem = excluded.com_quem,
    estado = coalesce(v_estado, a.estado),
    aprendi = case when p ? 'aprendi' then excluded.aprendi else a.aprendi end,
    muda = case when p ? 'muda' then excluded.muda else a.muda end,
    concluido_em = case when coalesce(v_estado, a.estado) = 'concluido' then coalesce(a.concluido_em, now()) end,
    plano_ordem = case when p ? 'plano_ordem' then excluded.plano_ordem else a.plano_ordem end,
    pergunta_id = case when p ? 'pergunta_id' then excluded.pergunta_id else a.pergunta_id end,
    pergunta = case when p ? 'pergunta' then excluded.pergunta else a.pergunta end,
    ate_data = case when p ? 'ate_data' then excluded.ate_data else a.ate_data end,
    atualizado_em = now()
  where a.participante_id is not distinct from v_pid
    and (a.participante_id is not null or a.email is not distinct from nullif(v_email, ''));
end $$;

create or replace function public.pdp_casa(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome', pa.nome,
    'r', jsonb_build_array(pa.q1, pa.q2, pa.q3, pa.q4, pa.q5, pa.q6),
    'q7', pa.q7,
    'te_descreve', pa.te_descreve,
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'criado_em', r.criado_em, 'encontro', r.encontro,
        'energia', r.energia, 'surpresa', r.surpresa, 'criterio', r.criterio, 'pergunta', r.pergunta)
        order by r.criado_em desc)
      from registros r where r.participante_id = pa.id), '[]'::jsonb),
    'exits', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'slug', e.slug, 'encontro', e.nome, 'data', e.data,
        'recomendacao', x.recomendacao, 'levo', x.levo, 'criterio', x.criterio, 'proximo', x.proximo,
        'melhorar', x.melhorar, 'criado_em', x.criado_em)
        order by e.data desc, x.criado_em desc)
      from exit_tickets x join encontros e on e.id = x.encontro_id where x.participante_id = pa.id), '[]'::jsonb),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pl.id, 'ordem', pl.ordem, 'titulo', pl.titulo, 'frase', pl.frase,
        'recursos', pl.recursos, 'animacao', pl.animacao, 'confianca', pl.confianca, 'coerencia', pl.coerencia,
        'perguntas', pl.perguntas, 'criado_em', pl.criado_em, 'atualizado_em', pl.atualizado_em) order by pl.ordem)
      from planos pl where pl.participante_id = pa.id), '[]'::jsonb),
    'testes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'criado_em', a.criado_em, 'atualizado_em', a.atualizado_em,
        'aposta', a.aposta, 'teste', a.teste, 'sigo_se', a.sigo_se, 'paro_se', a.paro_se, 'ate', a.ate,
        'com_quem', a.com_quem, 'estado', a.estado, 'aprendi', a.aprendi, 'muda', a.muda,
        'plano_ordem', a.plano_ordem, 'pergunta_id', a.pergunta_id, 'pergunta', a.pergunta, 'ate_data', a.ate_data)
        order by a.criado_em desc)
      from apostas a where a.participante_id = pa.id), '[]'::jsonb))
  from participantes pa where pa.token = p_token
$$;

revoke all on function public.pdp_plano_salvar(jsonb) from public;
grant execute on function public.pdp_plano_salvar(jsonb) to anon, authenticated;

-- exportações
create or replace view public.exportacao_apostas with (security_invoker = true) as
  select coalesce(p.nome, '') as nome, coalesce(p.email, a.email) as email, p.etapa_calculada,
    a.aposta, a.teste, a.sigo_se, a.paro_se, a.ate, a.com_quem, a.criado_em, a.atualizado_em,
    a.estado, a.aprendi, a.muda, a.concluido_em, a.plano_ordem, a.pergunta, a.ate_data
  from public.apostas a left join public.participantes p on p.id = a.participante_id
  order by a.criado_em;
revoke all on public.exportacao_apostas from anon, authenticated;

create or replace view public.exportacao_planos with (security_invoker = true) as
  select coalesce(p.nome, '') as nome, coalesce(p.email, pl.email) as email, coalesce(p.teste, false) as teste,
    pl.ordem, pl.titulo, pl.frase, pl.recursos, pl.animacao, pl.confianca, pl.coerencia,
    (select string_agg(q->>'texto', ' | ') from jsonb_array_elements(pl.perguntas) q where coalesce(q->>'texto', '') <> '') as perguntas,
    jsonb_array_length(pl.perguntas) as n_perguntas,
    (select count(*) from public.apostas a where a.participante_id = pl.participante_id and a.plano_ordem = pl.ordem) as testes_ligados,
    pl.criado_em, pl.atualizado_em
  from public.planos pl left join public.participantes p on p.id = pl.participante_id
  order by coalesce(p.nome, pl.email), pl.ordem;
revoke all on public.exportacao_planos from anon, authenticated;

-- painel com os planos
create or replace function public.pdp_painel(p_senha text, p_incluir_testes boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t boolean := coalesce(p_incluir_testes, false);
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  return (
    with pa as (select * from participantes where t or not teste),
         ap as (select a.* from apostas a left join participantes p on p.id = a.participante_id where t or not coalesce(p.teste, false)),
         rg as (select r.* from registros r left join participantes p on p.id = r.participante_id where t or not coalesce(p.teste, false)),
         ex as (select x.* from exit_tickets x left join participantes p on p.id = x.participante_id where t or not coalesce(p.teste, false)),
         pl as (select q.* from planos q left join participantes p on p.id = q.participante_id where t or not coalesce(p.teste, false))
    select jsonb_build_object(
      'agora', now(),
      'incluir_testes', t,
      'testes_marcados', (select count(*) from participantes where teste),
      'total', (select count(*) from pa),
      'consolidadas', (select count(*) from pa where consolidada),
      'por_etapa', (select coalesce(jsonb_object_agg(etapa_calculada, n), '{}'::jsonb)
        from (select etapa_calculada, count(*) n from pa group by 1) x),
      'matriz', (select coalesce(jsonb_agg(jsonb_build_object('c', etapa_calculada, 'p', etapa_percebida, 'n', n)), '[]'::jsonb)
        from (select etapa_calculada, etapa_percebida, count(*) n from pa group by 1, 2) x),
      'descreve', (select coalesce(jsonb_object_agg(coalesce(te_descreve, 'sem_resposta'), n), '{}'::jsonb)
        from (select te_descreve, count(*) n from pa group by 1) x),
      'registros_semana', (select coalesce(jsonb_agg(jsonb_build_object('semana', semana, 'pessoas', pessoas, 'registros', n) order by semana), '[]'::jsonb)
        from (select date_trunc('week', criado_em at time zone 'America/Sao_Paulo')::date semana,
                count(distinct coalesce(participante_id::text, email)) pessoas, count(*) n
              from rg group by 1) x),
      'apostas', (select count(distinct coalesce(participante_id::text, email)) from ap),
      'planos', jsonb_build_object(
        'pessoas', (select count(distinct coalesce(participante_id::text, email)) from pl where titulo <> ''),
        'escritos', (select count(*) from pl where titulo <> ''),
        'com_regua', (select count(*) from pl where recursos is not null and animacao is not null and confianca is not null and coerencia is not null),
        'perguntas', (select coalesce(sum((select count(*) from jsonb_array_elements(pl.perguntas) q where coalesce(q->>'texto', '') <> '')), 0) from pl),
        'testes_ligados', (select count(*) from ap where plano_ordem is not null)),
      'testes_por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
        from (select estado, count(*) n from ap group by 1) x),
      'encontros', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'slug', e.slug, 'nome', e.nome, 'data', e.data, 'aberto', pdp_encontro_aberto(e.id),
          'fechado_manual', e.fechado_em is not null,
          'respostas', (select count(*) from ex where ex.encontro_id = e.id),
          'media', (select round(avg(recomendacao)::numeric, 1) from ex where ex.encontro_id = e.id),
          'notas', (select coalesce(jsonb_object_agg(recomendacao, n), '{}'::jsonb)
                    from (select recomendacao, count(*) n from ex where ex.encontro_id = e.id group by 1) z),
          'linhas', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(p.nome, ''), 'email', coalesce(p.email, ex.email),
                      'recomendacao', ex.recomendacao, 'levo', ex.levo, 'criterio', ex.criterio, 'proximo', ex.proximo,
                      'melhorar', ex.melhorar, 'criado_em', ex.criado_em) order by ex.criado_em), '[]'::jsonb)
                    from ex left join participantes p on p.id = ex.participante_id where ex.encontro_id = e.id)
        ) order by e.data desc, e.criado_em desc), '[]'::jsonb) from encontros e),
      'linhas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao e where t or not e.teste),
      'linhas_registros', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_registros e),
      'linhas_apostas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_apostas e),
      'linhas_planos', (select coalesce(jsonb_agg(to_jsonb(e) order by e.nome, e.ordem), '[]'::jsonb) from exportacao_planos e where t or not e.teste)
    ));
end $$;
revoke all on function public.pdp_painel(text, boolean) from public;
grant execute on function public.pdp_painel(text, boolean) to anon, authenticated;

