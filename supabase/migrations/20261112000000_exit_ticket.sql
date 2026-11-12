-- Fase 1 do backlog: encontros criados no painel, exit ticket por encontro, marcação de respostas de teste.

-- ---------- encontros ----------
create table if not exists public.encontros (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                 -- vai no link: app/#/e/<slug>
  nome text not null,
  data date not null,
  fechado_em timestamptz,                    -- fechamento manual pelo painel
  criado_em timestamptz not null default now()
);
alter table public.encontros enable row level security;
revoke all on public.encontros from anon, authenticated;

-- Aberto = não foi fechado à mão e ainda não chegou a data do encontro seguinte.
create or replace function public.pdp_encontro_aberto(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.fechado_em is null and not exists (
    select 1 from encontros n
    where n.data > e.data and n.data <= (now() at time zone 'America/Sao_Paulo')::date)
  from encontros e where e.id = p_id
$$;
revoke all on function public.pdp_encontro_aberto(uuid) from public, anon, authenticated;

-- ---------- exit tickets ----------
create table if not exists public.exit_tickets (
  id uuid primary key,                       -- gerado no navegador
  encontro_id uuid not null references public.encontros (id) on delete cascade,
  participante_id uuid references public.participantes (id) on delete cascade,
  email text,                                -- quando o aparelho não reconhece o aluno
  recomendacao smallint not null check (recomendacao between 0 and 10),
  levo text not null default '',
  criterio text not null default '',
  proximo text not null default '',
  melhorar text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- uma resposta por aluno por encontro
create unique index if not exists exit_um_por_participante on public.exit_tickets (encontro_id, participante_id) where participante_id is not null;
create unique index if not exists exit_um_por_email on public.exit_tickets (encontro_id, email) where participante_id is null;
alter table public.exit_tickets enable row level security;
revoke all on public.exit_tickets from anon, authenticated;

-- ---------- respostas de teste ----------
alter table public.participantes add column if not exists teste boolean not null default false;

-- ---------- funções do aluno ----------
create or replace function public.pdp_encontro(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'nome', e.nome, 'data', e.data, 'aberto', pdp_encontro_aberto(e.id))
  from encontros e where e.slug = p_slug
$$;

create or replace function public.pdp_exit_enviar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_enc uuid;
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_nota smallint := (p->>'recomendacao')::smallint;
  v_levo text := left(coalesce(p->>'levo', ''), 1000);
  v_crit text := left(coalesce(p->>'criterio', ''), 1000);
  v_prox text := left(coalesce(p->>'proximo', ''), 1000);
  v_melh text := left(coalesce(p->>'melhorar', ''), 1000);
  v_n int;
begin
  select id into v_enc from encontros where slug = p->>'encontro';
  if v_enc is null then raise exception 'encontro inexistente'; end if;
  if not pdp_encontro_aberto(v_enc) then raise exception 'encontro fechado'; end if;
  if v_nota is null or v_nota < 0 or v_nota > 10 then raise exception 'recomendacao invalida'; end if;

  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;
  if v_pid is null and v_email = '' then raise exception 'sem identificacao'; end if;

  -- já respondeu este encontro (por qualquer aparelho)? corrige a resposta
  update exit_tickets set recomendacao = v_nota, levo = v_levo, criterio = v_crit, proximo = v_prox,
    melhorar = v_melh, atualizado_em = now()
  where encontro_id = v_enc
    and ((v_pid is not null and participante_id = v_pid) or (v_pid is null and participante_id is null and email = v_email));
  get diagnostics v_n = row_count;
  if v_n > 0 then return; end if;

  insert into exit_tickets (id, encontro_id, participante_id, email, recomendacao, levo, criterio, proximo, melhorar)
  values ((p->>'id')::uuid, v_enc, v_pid, case when v_pid is null then v_email end, v_nota, v_levo, v_crit, v_prox, v_melh)
  on conflict (id) do update set recomendacao = excluded.recomendacao, levo = excluded.levo, criterio = excluded.criterio,
    proximo = excluded.proximo, melhorar = excluded.melhorar, atualizado_em = now()
  where exit_tickets.encontro_id = v_enc;
end $$;

-- tela inicial: inclui os exit tickets do aluno
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
    'testes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'criado_em', a.criado_em, 'atualizado_em', a.atualizado_em,
        'aposta', a.aposta, 'teste', a.teste, 'sigo_se', a.sigo_se, 'paro_se', a.paro_se, 'ate', a.ate,
        'com_quem', a.com_quem, 'estado', a.estado, 'aprendi', a.aprendi, 'muda', a.muda)
        order by a.criado_em desc)
      from apostas a where a.participante_id = pa.id), '[]'::jsonb))
  from participantes pa where pa.token = p_token
$$;

-- registro livre de reflexão deixa de existir: o caminho é o exit ticket do encontro
revoke execute on function public.pdp_registro_enviar(jsonb) from anon, authenticated;

revoke all on function public.pdp_encontro(text), public.pdp_exit_enviar(jsonb) from public;
grant execute on function public.pdp_encontro(text), public.pdp_exit_enviar(jsonb) to anon, authenticated;

-- ---------- funções do painel (com senha) ----------
create or replace function public.pdp_senha_ok(p_senha text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  select valor into v_hash from segredos where chave = 'painel';
  if v_hash is null or p_senha is null or crypt(p_senha, v_hash) <> v_hash then
    perform pg_sleep(1);
    return false;
  end if;
  return true;
end $$;
revoke all on function public.pdp_senha_ok(text) from public, anon, authenticated;

create or replace function public.pdp_encontro_criar(p_senha text, p_nome text, p_data date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_slug text; v_id uuid;
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  if coalesce(trim(p_nome), '') = '' or p_data is null then raise exception 'nome e data obrigatorios'; end if;
  loop
    v_slug := substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=lIO0', 'xyzkmnp'), 1, 8);
    exit when not exists (select 1 from encontros where slug = v_slug);
  end loop;
  insert into encontros (slug, nome, data) values (v_slug, left(trim(p_nome), 120), p_data) returning id into v_id;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

create or replace function public.pdp_encontro_fechar(p_senha text, p_id uuid, p_fechar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  update encontros set fechado_em = case when p_fechar then now() end where id = p_id;
end $$;

create or replace function public.pdp_encontro_apagar(p_senha text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  if exists (select 1 from exit_tickets where encontro_id = p_id) then raise exception 'encontro com respostas'; end if;
  delete from encontros where id = p_id;
end $$;

create or replace function public.pdp_marcar_teste(p_senha text, p_email text, p_teste boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  update participantes set teste = p_teste where lower(email) = lower(trim(p_email));
end $$;

revoke all on function public.pdp_encontro_criar(text, text, date), public.pdp_encontro_fechar(text, uuid, boolean),
  public.pdp_encontro_apagar(text, uuid), public.pdp_marcar_teste(text, text, boolean) from public;
grant execute on function public.pdp_encontro_criar(text, text, date), public.pdp_encontro_fechar(text, uuid, boolean),
  public.pdp_encontro_apagar(text, uuid), public.pdp_marcar_teste(text, text, boolean) to anon, authenticated;

-- ---------- exportações ----------
drop view if exists public.exportacao;
create view public.exportacao with (security_invoker = true) as
  select nome, email, curso, formatura, momento,
    q1, q2, q3, q4, q5, q6, q7,
    etapa_calculada, consolidada, etapa_percebida, diferenca, te_descreve, criado_em,
    (select count(*) from public.exit_tickets x where x.participante_id = p.id) as exit_tickets,
    (select count(*) from public.registros r where r.participante_id = p.id) as registros_antigos,
    exists (select 1 from public.apostas a where a.participante_id = p.id) as fez_meu_teste,
    teste
  from public.participantes p
  order by criado_em;
revoke all on public.exportacao from anon, authenticated;

create or replace view public.exportacao_exit with (security_invoker = true) as
  select e.nome as encontro, e.data as data_encontro,
    coalesce(p.nome, '') as nome, coalesce(p.email, x.email) as email,
    x.recomendacao, x.levo, x.criterio, x.proximo, x.melhorar, x.criado_em, x.atualizado_em,
    coalesce(p.teste, false) as teste
  from public.exit_tickets x
  join public.encontros e on e.id = x.encontro_id
  left join public.participantes p on p.id = x.participante_id
  order by e.data, x.criado_em;
revoke all on public.exportacao_exit from anon, authenticated;

-- ---------- painel ----------
drop function if exists public.pdp_painel(text);
create or replace function public.pdp_painel(p_senha text, p_incluir_testes boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t boolean := coalesce(p_incluir_testes, false);
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  return (
    with pa as (select * from participantes where t or not teste),
         ap as (select a.* from apostas a left join participantes p on p.id = a.participante_id where t or not coalesce(p.teste, false)),
         rg as (select r.* from registros r left join participantes p on p.id = r.participante_id where t or not coalesce(p.teste, false)),
         ex as (select x.* from exit_tickets x left join participantes p on p.id = x.participante_id where t or not coalesce(p.teste, false))
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
      'linhas_apostas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_apostas e)
    ));
end $$;
revoke all on function public.pdp_painel(text, boolean) from public;
grant execute on function public.pdp_painel(text, boolean) to anon, authenticated;

-- manter o projeto ativo: chamada barata usada pela rotina semanal
create or replace function public.pdp_ping()
returns int language sql stable security definer set search_path = public as $$ select count(*)::int from encontros $$;
revoke all on function public.pdp_ping() from public;
grant execute on function public.pdp_ping() to anon, authenticated;
