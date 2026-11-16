-- Tema e mentor de cada encontro + quatro notas novas no exit ticket (tema e mentor).
-- O link do encontro não muda: tema e mentor ficam no cadastro do encontro, o aluno só dá as notas.

alter table public.encontros add column if not exists tema text not null default '';
alter table public.encontros add column if not exists mentor text not null default '';

-- notas novas: vazias nas respostas anteriores a esta mudança
alter table public.exit_tickets add column if not exists tema_relevancia smallint check (tema_relevancia between 0 and 10);
alter table public.exit_tickets add column if not exists mentor_clareza smallint check (mentor_clareza between 0 and 10);
alter table public.exit_tickets add column if not exists mentor_dominio smallint check (mentor_dominio between 0 and 10);
alter table public.exit_tickets add column if not exists mentor_geral smallint check (mentor_geral between 0 and 10);

-- ---------- aluno ----------
create or replace function public.pdp_encontro(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'nome', e.nome, 'data', e.data, 'tema', e.tema, 'mentor', e.mentor,
    'aberto', pdp_encontro_aberto(e.id))
  from encontros e where e.slug = p_slug
$$;

-- nota de 0 a 10 opcional no envio (páginas antigas em cache não mandam as novas)
create or replace function public.pdp_nota(p jsonb, k text)
returns smallint language plpgsql immutable as $$
declare v smallint;
begin
  if not (p ? k) or p->>k is null then return null; end if;
  v := (p->>k)::smallint;
  if v < 0 or v > 10 then raise exception '% invalida', k; end if;
  return v;
end $$;
revoke all on function public.pdp_nota(jsonb, text) from public, anon, authenticated;

create or replace function public.pdp_exit_enviar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_enc uuid;
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_nota smallint := (p->>'recomendacao')::smallint;
  v_tema smallint := pdp_nota(p, 'tema_relevancia');
  v_clar smallint := pdp_nota(p, 'mentor_clareza');
  v_domi smallint := pdp_nota(p, 'mentor_dominio');
  v_gera smallint := pdp_nota(p, 'mentor_geral');
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
  -- (nota nova ausente no envio mantém a que já estava)
  update exit_tickets set recomendacao = v_nota, levo = v_levo, criterio = v_crit, proximo = v_prox,
    melhorar = v_melh, atualizado_em = now(),
    tema_relevancia = case when p ? 'tema_relevancia' then v_tema else tema_relevancia end,
    mentor_clareza = case when p ? 'mentor_clareza' then v_clar else mentor_clareza end,
    mentor_dominio = case when p ? 'mentor_dominio' then v_domi else mentor_dominio end,
    mentor_geral = case when p ? 'mentor_geral' then v_gera else mentor_geral end
  where encontro_id = v_enc
    and ((v_pid is not null and participante_id = v_pid) or (v_pid is null and participante_id is null and email = v_email));
  get diagnostics v_n = row_count;
  if v_n > 0 then return; end if;

  insert into exit_tickets (id, encontro_id, participante_id, email, recomendacao, levo, criterio, proximo, melhorar,
    tema_relevancia, mentor_clareza, mentor_dominio, mentor_geral)
  values ((p->>'id')::uuid, v_enc, v_pid, case when v_pid is null then v_email end, v_nota, v_levo, v_crit, v_prox, v_melh,
    v_tema, v_clar, v_domi, v_gera)
  on conflict (id) do update set recomendacao = excluded.recomendacao, levo = excluded.levo, criterio = excluded.criterio,
    proximo = excluded.proximo, melhorar = excluded.melhorar, atualizado_em = now(),
    tema_relevancia = coalesce(excluded.tema_relevancia, exit_tickets.tema_relevancia),
    mentor_clareza = coalesce(excluded.mentor_clareza, exit_tickets.mentor_clareza),
    mentor_dominio = coalesce(excluded.mentor_dominio, exit_tickets.mentor_dominio),
    mentor_geral = coalesce(excluded.mentor_geral, exit_tickets.mentor_geral)
  where exit_tickets.encontro_id = v_enc;
end $$;

revoke all on function public.pdp_encontro(text), public.pdp_exit_enviar(jsonb) from public;
grant execute on function public.pdp_encontro(text), public.pdp_exit_enviar(jsonb) to anon, authenticated;

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
        'tema', e.tema, 'mentor', e.mentor,
        'recomendacao', x.recomendacao, 'tema_relevancia', x.tema_relevancia, 'mentor_clareza', x.mentor_clareza,
        'mentor_dominio', x.mentor_dominio, 'mentor_geral', x.mentor_geral,
        'levo', x.levo, 'criterio', x.criterio, 'proximo', x.proximo,
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

-- ---------- painel ----------
drop function if exists public.pdp_encontro_criar(text, text, date);
create or replace function public.pdp_encontro_criar(p_senha text, p_nome text, p_data date, p_tema text default '', p_mentor text default '')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_slug text; v_id uuid;
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  if coalesce(trim(p_nome), '') = '' or p_data is null then raise exception 'nome e data obrigatorios'; end if;
  loop
    v_slug := substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=lIO0', 'xyzkmnp'), 1, 8);
    exit when not exists (select 1 from encontros where slug = v_slug);
  end loop;
  insert into encontros (slug, nome, data, tema, mentor)
  values (v_slug, left(trim(p_nome), 120), p_data, left(trim(coalesce(p_tema, '')), 120), left(trim(coalesce(p_mentor, '')), 120))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- corrige tema e mentor de um encontro já criado (o link continua o mesmo)
create or replace function public.pdp_encontro_editar(p_senha text, p_id uuid, p_tema text, p_mentor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pdp_senha_ok(p_senha) then raise exception 'senha incorreta'; end if;
  update encontros set tema = left(trim(coalesce(p_tema, '')), 120), mentor = left(trim(coalesce(p_mentor, '')), 120)
  where id = p_id;
end $$;

revoke all on function public.pdp_encontro_criar(text, text, date, text, text), public.pdp_encontro_editar(text, uuid, text, text) from public;
grant execute on function public.pdp_encontro_criar(text, text, date, text, text), public.pdp_encontro_editar(text, uuid, text, text) to anon, authenticated;

create or replace view public.exportacao_exit with (security_invoker = true) as
  select e.nome as encontro, e.data as data_encontro,
    coalesce(p.nome, '') as nome, coalesce(p.email, x.email) as email,
    x.recomendacao, x.levo, x.criterio, x.proximo, x.melhorar, x.criado_em, x.atualizado_em,
    coalesce(p.teste, false) as teste,
    e.tema, e.mentor, x.tema_relevancia, x.mentor_clareza, x.mentor_dominio, x.mentor_geral
  from public.exit_tickets x
  join public.encontros e on e.id = x.encontro_id
  left join public.participantes p on p.id = x.participante_id
  order by e.data, x.criado_em;
revoke all on public.exportacao_exit from anon, authenticated;

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
          'id', e.id, 'slug', e.slug, 'nome', e.nome, 'data', e.data, 'tema', e.tema, 'mentor', e.mentor,
          'aberto', pdp_encontro_aberto(e.id),
          'fechado_manual', e.fechado_em is not null,
          'respostas', (select count(*) from ex where ex.encontro_id = e.id),
          'media', (select round(avg(recomendacao)::numeric, 1) from ex where ex.encontro_id = e.id),
          'medias', (select jsonb_build_object(
                      'tema_relevancia', round(avg(tema_relevancia)::numeric, 1), 'mentor_clareza', round(avg(mentor_clareza)::numeric, 1),
                      'mentor_dominio', round(avg(mentor_dominio)::numeric, 1), 'mentor_geral', round(avg(mentor_geral)::numeric, 1),
                      'n_novas', count(mentor_geral))
                    from ex where ex.encontro_id = e.id),
          'notas', (select coalesce(jsonb_object_agg(recomendacao, n), '{}'::jsonb)
                    from (select recomendacao, count(*) n from ex where ex.encontro_id = e.id group by 1) z),
          'linhas', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(p.nome, ''), 'email', coalesce(p.email, ex.email),
                      'recomendacao', ex.recomendacao, 'tema_relevancia', ex.tema_relevancia, 'mentor_clareza', ex.mentor_clareza,
                      'mentor_dominio', ex.mentor_dominio, 'mentor_geral', ex.mentor_geral,
                      'levo', ex.levo, 'criterio', ex.criterio, 'proximo', ex.proximo,
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
