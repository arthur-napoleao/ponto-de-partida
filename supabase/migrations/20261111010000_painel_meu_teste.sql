-- P2 (painel do facilitador) e P3 ("Meu teste")

create extension if not exists pgcrypto with schema extensions;

-- Senha do painel: só o hash fica no banco. Definida pelo service_role, nunca pelo repositório.
create table if not exists public.segredos (chave text primary key, valor text not null);
alter table public.segredos enable row level security;
revoke all on public.segredos from anon, authenticated;

create or replace function public.pdp_definir_senha(p_senha text)
returns void language sql security definer set search_path = public, extensions as $$
  insert into segredos (chave, valor) values ('painel', crypt(p_senha, gen_salt('bf')))
  on conflict (chave) do update set valor = excluded.valor
$$;
revoke all on function public.pdp_definir_senha(text) from public, anon, authenticated;
grant execute on function public.pdp_definir_senha(text) to service_role;

-- "Meu teste": um por aluno, editável (a última versão vale).
create table if not exists public.apostas (
  id uuid primary key,                       -- gerado no navegador
  participante_id uuid unique references public.participantes (id) on delete cascade,
  email text,                                -- quando a pessoa entra sem o link pessoal
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aposta text not null default '',
  teste text not null default '',
  sigo_se text not null default '',
  paro_se text not null default '',
  ate text not null default '',
  com_quem text not null default ''
);
alter table public.apostas enable row level security;
revoke all on public.apostas from anon, authenticated;

create or replace function public.pdp_aposta_enviar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_aposta text := left(coalesce(p->>'aposta', ''), 1000);
  v_teste text := left(coalesce(p->>'teste', ''), 1000);
  v_sigo text := left(coalesce(p->>'sigo_se', ''), 1000);
  v_paro text := left(coalesce(p->>'paro_se', ''), 1000);
  v_ate text := left(coalesce(p->>'ate', ''), 200);
  v_com text := left(coalesce(p->>'com_quem', ''), 200);
begin
  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;

  if v_pid is not null then
    insert into apostas (id, participante_id, email, aposta, teste, sigo_se, paro_se, ate, com_quem)
    values ((p->>'id')::uuid, v_pid, nullif(v_email, ''), v_aposta, v_teste, v_sigo, v_paro, v_ate, v_com)
    on conflict (participante_id) do update set
      aposta = excluded.aposta, teste = excluded.teste, sigo_se = excluded.sigo_se,
      paro_se = excluded.paro_se, ate = excluded.ate, com_quem = excluded.com_quem, atualizado_em = now();
  else
    insert into apostas (id, participante_id, email, aposta, teste, sigo_se, paro_se, ate, com_quem)
    values ((p->>'id')::uuid, null, nullif(v_email, ''), v_aposta, v_teste, v_sigo, v_paro, v_ate, v_com)
    on conflict (id) do update set
      aposta = excluded.aposta, teste = excluded.teste, sigo_se = excluded.sigo_se,
      paro_se = excluded.paro_se, ate = excluded.ate, com_quem = excluded.com_quem, atualizado_em = now();
  end if;
end $$;

-- Com o link pessoal, a pessoa vê também o "Meu teste" que já gravou.
create or replace function public.pdp_registros(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome', pa.nome,
    'etapa', pa.etapa_calculada,
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'criado_em', r.criado_em, 'encontro', r.encontro,
        'energia', r.energia, 'surpresa', r.surpresa, 'criterio', r.criterio, 'pergunta', r.pergunta)
        order by r.criado_em desc)
      from registros r where r.participante_id = pa.id), '[]'::jsonb),
    'aposta', (select jsonb_build_object('id', a.id, 'aposta', a.aposta, 'teste', a.teste, 'sigo_se', a.sigo_se,
        'paro_se', a.paro_se, 'ate', a.ate, 'com_quem', a.com_quem, 'atualizado_em', a.atualizado_em)
      from apostas a where a.participante_id = pa.id))
  from participantes pa where pa.token = p_token
$$;

revoke all on function public.pdp_aposta_enviar(jsonb) from public;
grant execute on function public.pdp_aposta_enviar(jsonb) to anon, authenticated;

-- Exportações
create or replace view public.exportacao with (security_invoker = true) as
  select nome, email, curso, periodo, momento,
    q1, q2, q3, q4, q5, q6, q7,
    etapa_calculada, consolidada, etapa_percebida, diferenca, te_descreve, criado_em,
    (select count(*) from public.registros r where r.participante_id = p.id) as registros_feitos,
    exists (select 1 from public.apostas a where a.participante_id = p.id) as fez_meu_teste
  from public.participantes p
  order by criado_em;
revoke all on public.exportacao from anon, authenticated;

create or replace view public.exportacao_apostas with (security_invoker = true) as
  select coalesce(p.nome, '') as nome, coalesce(p.email, a.email) as email, p.etapa_calculada,
    a.aposta, a.teste, a.sigo_se, a.paro_se, a.ate, a.com_quem, a.criado_em, a.atualizado_em
  from public.apostas a left join public.participantes p on p.id = a.participante_id
  order by a.criado_em;
revoke all on public.exportacao_apostas from anon, authenticated;

-- Painel do facilitador: tudo numa chamada, protegido pela senha.
create or replace function public.pdp_painel(p_senha text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  select valor into v_hash from segredos where chave = 'painel';
  if v_hash is null or p_senha is null or crypt(p_senha, v_hash) <> v_hash then
    perform pg_sleep(1);
    raise exception 'senha incorreta';
  end if;
  return jsonb_build_object(
    'agora', now(),
    'total', (select count(*) from participantes),
    'consolidadas', (select count(*) from participantes where consolidada),
    'por_etapa', (select coalesce(jsonb_object_agg(etapa_calculada, n), '{}'::jsonb)
      from (select etapa_calculada, count(*) n from participantes group by 1) x),
    'matriz', (select coalesce(jsonb_agg(jsonb_build_object('c', etapa_calculada, 'p', etapa_percebida, 'n', n)), '[]'::jsonb)
      from (select etapa_calculada, etapa_percebida, count(*) n from participantes group by 1, 2) x),
    'descreve', (select coalesce(jsonb_object_agg(coalesce(te_descreve, 'sem_resposta'), n), '{}'::jsonb)
      from (select te_descreve, count(*) n from participantes group by 1) x),
    'registros_semana', (select coalesce(jsonb_agg(jsonb_build_object('semana', semana, 'pessoas', pessoas, 'registros', n) order by semana), '[]'::jsonb)
      from (select date_trunc('week', criado_em at time zone 'America/Sao_Paulo')::date semana,
              count(distinct coalesce(participante_id::text, email)) pessoas, count(*) n
            from registros group by 1) x),
    'apostas', (select count(*) from apostas),
    'linhas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao e),
    'linhas_registros', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_registros e),
    'linhas_apostas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_apostas e)
  );
end $$;
revoke all on function public.pdp_painel(text) from public;
grant execute on function public.pdp_painel(text) to anon, authenticated;
