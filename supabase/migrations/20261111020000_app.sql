-- Aplicativo (/app/): vários testes por aluno, com estado, e uma chamada única para a tela inicial.

alter table public.apostas drop constraint if exists apostas_participante_id_key;
create index if not exists apostas_participante_idx on public.apostas (participante_id);
alter table public.apostas
  add column if not exists estado text not null default 'desenhado' check (estado in ('desenhado', 'andamento', 'concluido')),
  add column if not exists aprendi text not null default '',
  add column if not exists muda text not null default '',
  add column if not exists concluido_em timestamptz;

-- Grava ou atualiza um teste. O id nasce no navegador; reenviar não duplica.
-- Campos ausentes no pedido (estado, aprendi, muda) mantêm o valor que já estava gravado.
create or replace function public.pdp_teste_salvar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_estado text := p->>'estado';
begin
  if v_estado is not null and v_estado not in ('desenhado', 'andamento', 'concluido') then
    raise exception 'estado invalido';
  end if;
  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;

  insert into apostas as a (id, participante_id, email, aposta, teste, sigo_se, paro_se, ate, com_quem,
    estado, aprendi, muda, concluido_em)
  values ((p->>'id')::uuid, v_pid, nullif(v_email, ''),
    left(coalesce(p->>'aposta', ''), 1000), left(coalesce(p->>'teste', ''), 1000),
    left(coalesce(p->>'sigo_se', ''), 1000), left(coalesce(p->>'paro_se', ''), 1000),
    left(coalesce(p->>'ate', ''), 200), left(coalesce(p->>'com_quem', ''), 200),
    coalesce(v_estado, 'desenhado'), left(coalesce(p->>'aprendi', ''), 1000), left(coalesce(p->>'muda', ''), 1000),
    case when v_estado = 'concluido' then now() end)
  on conflict (id) do update set
    aposta = excluded.aposta, teste = excluded.teste, sigo_se = excluded.sigo_se, paro_se = excluded.paro_se,
    ate = excluded.ate, com_quem = excluded.com_quem,
    estado = coalesce(v_estado, a.estado),
    aprendi = case when p ? 'aprendi' then excluded.aprendi else a.aprendi end,
    muda = case when p ? 'muda' then excluded.muda else a.muda end,
    concluido_em = case when coalesce(v_estado, a.estado) = 'concluido' then coalesce(a.concluido_em, now()) end,
    atualizado_em = now()
  -- só o dono atualiza: mesmo participante, ou (sem cadastro) mesmo e-mail
  where a.participante_id is not distinct from v_pid
    and (a.participante_id is not null or a.email is not distinct from nullif(v_email, ''));
end $$;

create or replace function public.pdp_teste_apagar(p_id uuid, p_token text)
returns void language sql security definer set search_path = public as $$
  delete from apostas a using participantes pa
  where a.id = p_id and a.participante_id = pa.id and pa.token = p_token
$$;

-- A página antiga (meu-teste.html) continua funcionando: um teste, mesmo id.
create or replace function public.pdp_aposta_enviar(p jsonb)
returns void language sql security definer set search_path = public as $$
  select pdp_teste_salvar(p)
$$;

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
      from apostas a where a.participante_id = pa.id order by a.atualizado_em desc limit 1))
  from participantes pa where pa.token = p_token
$$;

-- Tudo o que a tela inicial precisa, numa chamada. Só com o token pessoal.
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
    'testes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'criado_em', a.criado_em, 'atualizado_em', a.atualizado_em,
        'aposta', a.aposta, 'teste', a.teste, 'sigo_se', a.sigo_se, 'paro_se', a.paro_se, 'ate', a.ate,
        'com_quem', a.com_quem, 'estado', a.estado, 'aprendi', a.aprendi, 'muda', a.muda)
        order by a.criado_em desc)
      from apostas a where a.participante_id = pa.id), '[]'::jsonb))
  from participantes pa where pa.token = p_token
$$;

revoke all on function public.pdp_teste_salvar(jsonb), public.pdp_teste_apagar(uuid, text), public.pdp_casa(text) from public;
grant execute on function public.pdp_teste_salvar(jsonb), public.pdp_teste_apagar(uuid, text), public.pdp_casa(text) to anon, authenticated;

create or replace view public.exportacao_apostas with (security_invoker = true) as
  select coalesce(p.nome, '') as nome, coalesce(p.email, a.email) as email, p.etapa_calculada,
    a.aposta, a.teste, a.sigo_se, a.paro_se, a.ate, a.com_quem, a.criado_em, a.atualizado_em,
    a.estado, a.aprendi, a.muda, a.concluido_em
  from public.apostas a left join public.participantes p on p.id = a.participante_id
  order by a.criado_em;
revoke all on public.exportacao_apostas from anon, authenticated;
