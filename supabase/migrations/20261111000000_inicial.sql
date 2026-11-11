-- Ponto de partida (v0) — modelo de dados
-- O navegador nunca lê nem escreve nas tabelas diretamente: RLS ligado, sem políticas.
-- Todo acesso público passa pelas funções pdp_* (security definer), que são idempotentes.

create table if not exists public.participantes (
  id uuid primary key,                      -- gerado no navegador: reenvio não duplica
  token text not null unique,               -- link pessoal de retorno
  criado_em timestamptz not null default now(),
  nome text not null,
  email text not null,
  curso text not null,
  periodo text not null,
  momento text not null,
  q1 boolean not null, q2 boolean not null, q3 boolean not null,
  q4 boolean not null, q5 boolean not null, q6 boolean not null,
  q7 smallint not null check (q7 between 1 and 5),
  etapa_calculada smallint not null check (etapa_calculada between 1 and 5),
  consolidada boolean not null default false,
  etapa_percebida smallint not null check (etapa_percebida between 1 and 5),
  diferenca smallint not null,              -- percebida menos calculada
  te_descreve text check (te_descreve in ('sim', 'mais_ou_menos', 'nao')),
  te_descreve_em timestamptz,
  consentimento boolean not null default true
);
create index if not exists participantes_email_idx on public.participantes (lower(email));

create table if not exists public.registros (
  id uuid primary key,                      -- gerado no navegador: reenvio não duplica
  participante_id uuid references public.participantes (id) on delete cascade,
  email text,                               -- usado quando a pessoa entra sem o link pessoal
  criado_em timestamptz not null default now(),
  encontro text not null,
  energia text not null default '',
  surpresa text not null default '',
  criterio text not null default '',
  pergunta text not null default ''
);
create index if not exists registros_participante_idx on public.registros (participante_id);

alter table public.participantes enable row level security;
alter table public.registros enable row level security;
revoke all on public.participantes from anon, authenticated;
revoke all on public.registros from anon, authenticated;

-- Regra da etapa: a da primeira pergunta respondida com "não" (1 a 6).
-- Perguntas 4 e 5 levam à etapa 4. Todas "sim" = etapa 5, consolidada.
create or replace function public.pdp_etapa(q1 boolean, q2 boolean, q3 boolean, q4 boolean, q5 boolean, q6 boolean)
returns smallint language sql immutable as $$
  select (case
    when not q1 then 1
    when not q2 then 2
    when not q3 then 3
    when not q4 then 4
    when not q5 then 4
    else 5
  end)::smallint
$$;

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
  insert into participantes (id, token, nome, email, curso, periodo, momento,
    q1, q2, q3, q4, q5, q6, q7, etapa_calculada, consolidada, etapa_percebida, diferenca)
  values ((p->>'id')::uuid, left(p->>'token', 40),
    left(trim(p->>'nome'), 120), lower(left(trim(p->>'email'), 160)),
    left(trim(p->>'curso'), 120), left(trim(p->>'periodo'), 40), left(trim(p->>'momento'), 60),
    v1, v2, v3, v4, v5, v6, v7,
    v_etapa, (v1 and v2 and v3 and v4 and v5 and v6), v7, v7 - v_etapa)
  on conflict do nothing;
end $$;

create or replace function public.pdp_descreve(p_token text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_valor not in ('sim', 'mais_ou_menos', 'nao') then raise exception 'valor invalido'; end if;
  update participantes set te_descreve = p_valor, te_descreve_em = now() where token = p_token;
end $$;

create or replace function public.pdp_registro_enviar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
begin
  if coalesce(p->>'token', '') <> '' then
    select id into v_pid from participantes where token = p->>'token';
  end if;
  if v_pid is null and v_email <> '' then
    select id into v_pid from participantes where lower(email) = v_email order by criado_em desc limit 1;
  end if;
  insert into registros (id, participante_id, email, encontro, energia, surpresa, criterio, pergunta)
  values ((p->>'id')::uuid, v_pid, nullif(v_email, ''),
    left(trim(coalesce(p->>'encontro', '')), 120),
    left(coalesce(p->>'energia', ''), 1000), left(coalesce(p->>'surpresa', ''), 1000),
    left(coalesce(p->>'criterio', ''), 1000), left(coalesce(p->>'pergunta', ''), 1000))
  on conflict do nothing;
end $$;

-- Registros anteriores: só com o token pessoal (o e-mail sozinho não dá leitura).
create or replace function public.pdp_registros(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome', pa.nome,
    'etapa', pa.etapa_calculada,
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'criado_em', r.criado_em, 'encontro', r.encontro,
        'energia', r.energia, 'surpresa', r.surpresa, 'criterio', r.criterio, 'pergunta', r.pergunta)
        order by r.criado_em desc)
      from registros r where r.participante_id = pa.id), '[]'::jsonb))
  from participantes pa where pa.token = p_token
$$;

revoke all on function public.pdp_enviar(jsonb), public.pdp_descreve(text, text),
  public.pdp_registro_enviar(jsonb), public.pdp_registros(text) from public;
grant execute on function public.pdp_enviar(jsonb), public.pdp_descreve(text, text),
  public.pdp_registro_enviar(jsonb), public.pdp_registros(text) to anon, authenticated;

-- Exportação em CSV pelo painel do Supabase (Table Editor > exportacao > Export to CSV).
create or replace view public.exportacao with (security_invoker = true) as
  select nome, email, curso, periodo, momento,
    q1, q2, q3, q4, q5, q6, q7,
    etapa_calculada, consolidada, etapa_percebida, diferenca, te_descreve, criado_em,
    (select count(*) from public.registros r where r.participante_id = p.id) as registros_feitos
  from public.participantes p
  order by criado_em;
revoke all on public.exportacao from anon, authenticated;

create or replace view public.exportacao_registros with (security_invoker = true) as
  select coalesce(p.nome, '') as nome, coalesce(p.email, r.email) as email,
    r.encontro, r.energia, r.surpresa, r.criterio, r.pergunta, r.criado_em
  from public.registros r left join public.participantes p on p.id = r.participante_id
  order by r.criado_em;
revoke all on public.exportacao_registros from anon, authenticated;
