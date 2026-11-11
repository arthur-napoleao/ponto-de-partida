-- Painel: com vários testes por aluno, conta pessoas distintas e testes por estado.
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
    'apostas', (select count(distinct coalesce(participante_id::text, email)) from apostas),
    'testes_por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
      from (select estado, count(*) n from apostas group by 1) x),
    'linhas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao e),
    'linhas_registros', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_registros e),
    'linhas_apostas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em), '[]'::jsonb) from exportacao_apostas e)
  );
end $$;
revoke all on function public.pdp_painel(text) from public;
grant execute on function public.pdp_painel(text) to anon, authenticated;
