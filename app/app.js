/* Trilha de Carreira — aplicativo de uma página só.
   Rotas (hash): #/ (boas-vindas) · #/entrar · #/comecar · #/p/1..7 · #/resultado
                 #/inicio · #/ponto · #/reflexoes · #/e/SLUG (exit ticket de um encontro criado no painel)
                 #/testes · #/testes/novo · #/testes/ID · #/testes/ID/editar · #/testes/ID/concluir
   Dados: o aparelho é a primeira cópia (localStorage); o banco é sincronizado pela fila de comum.js. */
(function () {
  'use strict';
  var P = window.PDP, esc = P.esc;
  var app = document.getElementById('app'), nav = document.getElementById('nav');

  var MOMENTOS = ['Buscando o primeiro estágio', 'Estagiando', 'Trabalhando', 'Outro'];
  var DESCREVE = [['sim', 'Sim'], ['mais_ou_menos', 'Mais ou menos'], ['nao', 'Não']];
  var REFLEXAO = [['energia', 'O que me deu energia?'], ['surpresa', 'O que me surpreendeu?'],
    ['criterio', 'Um critério que descobri.'], ['pergunta', 'A pergunta que levo para o próximo encontro.']];
  var ESTADOS = { desenhado: 'Desenhado', andamento: 'Em andamento', concluido: 'Concluído' };
  var BLOCOS = [
    { rot: 'Aposta', antes: 'Para essa vida dar certo para mim, precisa ser verdade que', campos: [['aposta', '', 'ex.: eu goste de resolver problemas com dados no dia a dia']] },
    { rot: 'Teste', antes: 'O jeito mais simples de ver isso acontecer é', campos: [['teste', '', 'ex.: passar uma tarde acompanhando uma analista de dados']] },
    { rot: 'Critério', antes: '', campos: [['sigo_se', 'Sigo se', 'ex.: eu sair com vontade de fazer de novo'], ['paro_se', 'Paro ou mudo se', 'ex.: o tempo passar devagar']] },
    { rot: 'Data', antes: '', campos: [['ate', 'Faço até', 'ex.: 25/11'], ['com_quem', 'com', 'ex.: a Ana, prima que trabalha na área']] }
  ];
  var CAMPOS_TESTE = ['aposta', 'teste', 'sigo_se', 'paro_se', 'ate', 'com_quem'];
  var TIPOS_PLANO = {
    1: { nome: 'O caminho em curso', dica: 'Se tudo continuar como está, onde você estará daqui a 5 anos?', ex: 'ex.: Engenheiro de operações numa indústria no Rio, liderando uma linha' },
    2: { nome: 'O plano B', dica: 'Se o plano 1 deixasse de existir amanhã, o que você faria?', ex: 'ex.: Analista de dados numa empresa de varejo' },
    3: { nome: 'A doideira', dica: 'Se dinheiro e a opinião dos outros não importassem, o que você faria?', ex: 'ex.: Oficina que ensina jovens a consertar bicicleta' }
  };
  var REGUA = [['recursos', 'Recursos', 'Tenho o que preciso para seguir esse plano?'],
    ['animacao', 'Animação', 'Quanto esse plano me anima?'],
    ['confianca', 'Confiança', 'Quanto acredito que consigo chegar lá?'],
    ['coerencia', 'Coerência', 'Quanto ele combina comigo e com o que acho que trabalho e vida devem ser?']];
  var SUGESTOES_PERGUNTA = ['Quem já vive esse plano e toparia conversar comigo?', 'Como é uma terça-feira normal nesse plano?',
    'O que teria que ser verdade para isso dar certo para mim?', 'O que eu menos sei sobre esse caminho?'];
  var ICONES = {
    planos: '<svg viewBox="0 0 24 24"><circle cx="6" cy="19" r="2"/><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M6 17c0-5 4-8 10-9"/></svg>',
    inicio: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    ponto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    reflexoes: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/></svg>',
    testes: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M8 15h8"/></svg>'
  };

  /* ---------- estado no aparelho ---------- */
  var tokenLink = null;
  try { tokenLink = new URLSearchParams(location.search).get('t'); } catch (x) {}
  var e = P.ler('pdp_estado', null) || { ident: {}, r: [], q7: null };
  // link pessoal de outra pessoa neste aparelho: começa limpo
  if (tokenLink && e.token && e.token !== tokenLink) {
    e = { ident: {}, r: [], q7: null }; P.gravar('pdp_casa', null); P.gravar('pdp_email', null);
  }
  var token = P.tokenAtual() || e.token || null;
  if (tokenLink) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (x) {} }
  var email = P.ler('pdp_email', null);
  var casa = P.ler('pdp_casa', null) || { registros: [], testes: [] };
  if (!casa.exits) casa.exits = [];
  if (!casa.planos) casa.planos = [];
  var exitsLocais = P.ler('pdp_exits', {});           // respostas deste aparelho, por encontro (slug)
  var rascunho = P.ler('pdp_rascunhos', {});
  var sincronizou = false;

  function salvar() { P.gravar('pdp_estado', e); }
  function salvarCasa() { P.gravar('pdp_casa', casa); }
  function salvarRascunho() { P.gravar('pdp_rascunhos', rascunho); }
  function temPonto() { return e.r.length === 6 && !!e.q7 && !!e.enviado; }
  function identificado() { return temPonto() || !!email || !!token; }
  function quem() { return { token: token || '', email: token ? '' : (email || '') }; }
  function primeiroNome() { return ((e.ident && e.ident.nome) || '').trim().split(' ')[0] || ''; }
  function dataCurta(iso) { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (x) { return ''; } }

  /* ---------- sincronização com o banco ---------- */
  function hojeISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function dataBR(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
  /* "25/11", "25/11/2026" ou "2026-11-25" → "2026-11-25" (ou '' se não der para ler) */
  function lerData(txt) {
    txt = String(txt || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
    var m = txt.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!m) return '';
    var a = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear());
    return a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  function vencido(t) { var d = t.ate_data || lerData(t.ate); return !!d && t.estado !== 'concluido' && d <= hojeISO(); }
  function plano(n) { return casa.planos.filter(function (p) { return +p.ordem === +n; })[0]; }
  function perguntasDe(pl) { return ((pl && pl.perguntas) || []).filter(function (q) { return (q.texto || '').trim(); }); }
  function reguaCompleta(pl) { return REGUA.every(function (r) { return pl[r[0]]; }); }
  function testeDaPergunta(n, qid) { return casa.testes.filter(function (t) { return +t.plano_ordem === +n && t.pergunta_id === qid; })[0]; }

  function unir(locais, remotos) {
    var filaVazia = !P.ler('pdp_fila', []).length, mapa = {}, saida = [];
    (remotos || []).forEach(function (r) { mapa[r.id] = r; });
    (locais || []).forEach(function (l) {
      if (mapa[l.id] && filaVazia) return;          // o banco já tem a versão final
      saida.push(l); delete mapa[l.id];             // ainda na fila (ou só local): vale a do aparelho
    });
    Object.keys(mapa).forEach(function (k) { saida.push(mapa[k]); });
    return saida.sort(function (a, b) { return String(b.criado_em).localeCompare(String(a.criado_em)); });
  }

  function sincronizar() {
    if (!token) return;
    P.rpc('pdp_casa', { p_token: token }).then(function (d) {
      if (!d) return;                               // token ainda não chegou ao banco (envio na fila)
      sincronizou = true;
      if (!e.ident) e.ident = {};
      if (!e.ident.nome) e.ident.nome = d.nome;
      if (!temPonto()) { e.r = d.r; e.q7 = d.q7; e.enviado = true; e.token = token; }
      if (d.te_descreve && !e.descreve) e.descreve = d.te_descreve;
      salvar();
      casa.registros = unir(casa.registros, d.registros);
      casa.testes = unir(casa.testes, d.testes);
      casa.exits = unir(casa.exits, d.exits || []);
      // planos: um por ordem; enquanto houver envio pendente, vale o do aparelho
      var filaVazia = !P.ler('pdp_fila', []).length;
      (d.planos || []).forEach(function (rp) {
        var lp = plano(rp.ordem);
        if (!lp) casa.planos.push(rp);
        else if (filaVazia) { for (var k in rp) if (k !== 'id') lp[k] = rp[k]; }
      });
      salvarCasa();
      var ativo = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (!ativo) desenhar(true);
    }, function () {});
  }

  /* ---------- rotas ---------- */
  function rota() { return (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean); }
  function ir(h, trocar) {
    var alvo = '#/' + h;
    if (location.hash === alvo) { desenhar(); return; }
    if (trocar) { try { history.replaceState(null, '', alvo); desenhar(); return; } catch (x) {} }
    location.hash = alvo;
  }
  window.addEventListener('hashchange', function () { desenhar(); });

  function desenhar(semAnimar) {
    enviarPlanoPendente();
    var r = rota(), a = r[0] || '';
    var fluxo = { '': 1, entrar: 1, comecar: 1, p: 1, e: 1 };
    if (!identificado() && !fluxo[a]) { ir('', true); return; }
    if (identificado() && a === '') { ir('inicio', true); return; }
    if (a === 'p' && !(e.ident && e.ident.nome)) { ir('comecar', true); return; }
    if ((a === 'ponto' || a === 'resultado') && !temPonto()) { ir(identificado() ? 'inicio' : '', true); return; }

    var comBarra = identificado() && !fluxo[a] && a !== 'resultado';  // fluxo inclui o exit ticket (e): tela focada
    document.body.classList.toggle('com-barra', comBarra);
    nav.hidden = !comBarra;
    if (comBarra) desenharBarra(a);

    ({ '': telaBoasVindas, entrar: telaEntrar, comecar: telaIdent, p: telaPergunta, resultado: telaResultado,
      inicio: telaInicio, ponto: telaPonto, planos: telaPlanos, reflexoes: telaReflexoes, testes: telaTestes, e: telaExit }[a] || telaInicio)(r);

    if (!semAnimar) {
      app.classList.remove('entra'); void app.offsetWidth; app.classList.add('entra');
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (x) { window.scrollTo(0, 0); }
    }
  }

  function desenharBarra(atual) {
    nav.innerHTML = [['inicio', 'Início'], ['ponto', 'Etapa'], ['planos', 'Planos'], ['testes', 'Testes'], ['reflexoes', 'Reflexões']].map(function (i) {
      return '<a href="#/' + i[0] + '"' + (atual === i[0] ? ' class="ativo" aria-current="page"' : '') + '>' + ICONES[i[0]] + '<span>' + i[1] + '</span></a>';
    }).join('');
  }

  function aoClicar(seletor, fn) {
    Array.prototype.forEach.call(app.querySelectorAll(seletor), function (el) { el.onclick = function (ev) { fn(el, ev); }; });
  }

  /* ---------- boas-vindas e entrada ---------- */
  function telaBoasVindas() {
    app.innerHTML =
      '<h1>Ponto de partida</h1>' +
      '<p>Sete perguntas rápidas sobre o que você já fez. Não é prova nem nota: é um mapa de onde vale cavar agora.</p>' +
      '<p class="suave">Leva menos de 5 minutos. No fim, você vê em que etapa do processo está e qual é o próximo passo.</p>' +
      '<div class="empurra pilha">' +
      '<a class="botao" href="#/comecar">Começar</a>' +
      '<a class="botao texto" href="#/entrar" style="align-self:center">Já fiz o ponto de partida</a>' +
      '<p class="pequeno suave centro">Isto não é uma avaliação psicológica.</p></div>';
  }

  function telaEntrar() {
    app.innerHTML =
      '<a class="voltar-topo" href="#/">‹ Voltar</a>' +
      '<h2>Entrar</h2>' +
      '<p>O jeito mais completo é abrir pelo <b>seu link pessoal</b>, que apareceu no fim do ponto de partida.</p>' +
      '<p class="suave">Sem o link, entre com o e-mail que você usou. Neste aparelho você verá só o que registrar por aqui.</p>' +
      '<form id="f" class="pilha" style="gap:12px" novalidate>' +
      '<div class="campo"><label for="email">E-mail</label><input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="160"></div>' +
      '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Entrar</button></form>';
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      var v = document.getElementById('email').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(v)) { var el = document.getElementById('erro'); el.textContent = 'Informe um e-mail válido.'; el.hidden = false; return; }
      email = v; P.gravar('pdp_email', email); ir('inicio');
    };
  }

  /* ---------- identificação ---------- */
  function telaIdent() {
    var d = e.ident || (e.ident = {});
    if (!d.email && email) d.email = email;
    app.innerHTML =
      '<a class="voltar-topo" href="#/' + (identificado() ? 'inicio' : '') + '">‹ Voltar</a>' +
      '<h2>Antes de começar</h2>' +
      '<form id="f" class="pilha" novalidate style="gap:14px">' +
      '<div class="campo"><label for="nome">Nome</label><input id="nome" type="text" autocomplete="name" autocapitalize="words" maxlength="120" value="' + esc(d.nome) + '"></div>' +
      '<div class="campo"><label for="email">E-mail</label><input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="160" value="' + esc(d.email) + '"></div>' +
      P.htmlCurso(d.curso) + P.htmlFormatura(d.formatura) +
      '<div class="campo"><label>Seu momento</label><div class="chips" id="momentos">' +
      MOMENTOS.map(function (m) { return '<button type="button" class="botao claro' + (d.momento === m ? ' marcado' : '') + '" data-m="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div></div>' +
      '<p class="erro" id="erro" hidden></p>' +
      '<button class="botao" type="submit">Continuar</button>' +
      '<p class="pequeno suave">Suas respostas serão usadas pelo Legado UERJ para melhorar a Trilha. Você pode pedir a exclusão a qualquer momento.</p>' +
      '</form>';

    function colher() {
      ['nome', 'email'].forEach(function (k) { d[k] = document.getElementById(k).value.trim(); });
      d.curso = P.lerCurso(); d.formatura = document.getElementById('formatura').value;
      salvar();
    }
    P.ligarCurso();
    document.getElementById('f').addEventListener('input', colher);
    aoClicar('[data-m]', function (b) {
      d.momento = b.getAttribute('data-m'); salvar();
      Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle('marcado', x === b); });
    });
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault(); colher();
      var falta = !d.nome ? 'seu nome' : !/^\S+@\S+\.\S+$/.test(d.email || '') ? 'um e-mail válido' :
        !d.curso ? 'seu curso' : !d.formatura ? 'seu semestre de formatura' : !d.momento ? 'seu momento' : '';
      if (falta) { var el = document.getElementById('erro'); el.textContent = 'Falta preencher ' + falta + '.'; el.hidden = false; return; }
      ir('p/' + Math.min(e.r.length + 1, 7));
    };
  }

  /* ---------- perguntas 1 a 7 (uma por tela, sem teclado) ---------- */
  function telaPergunta(r) {
    if (temPonto()) { ir('ponto', true); return; }
    var n = Math.max(1, Math.min(7, parseInt(r[1], 10) || 1));
    if (n > e.r.length + 1) { ir('p/' + (e.r.length + 1), true); return; }
    var topo = '<div class="avanco"><a class="voltar" href="#/' + (n === 1 ? 'comecar' : 'p/' + (n - 1)) + '" style="text-decoration:none">‹ Voltar</a>' +
      '<div class="trilho"><div class="cheio" style="width:' + Math.round(((n - 1) / 7) * 100) + '%"></div></div>' +
      '<span class="conta">' + n + ' de 7</span></div>';
    if (n <= 6) {
      var atual = e.r[n - 1];
      app.innerHTML = topo +
        '<p class="rotulo-pergunta">Nos últimos três meses</p>' +
        '<p class="enunciado">' + esc(P.PERGUNTAS[n - 1].texto) + '</p>' +
        '<div class="empurra dupla">' +
        '<button class="botao claro' + (atual === true ? ' marcado' : '') + '" data-v="1">Sim</button>' +
        '<button class="botao claro' + (atual === false ? ' marcado' : '') + '" data-v="0">Não</button></div>';
      aoClicar('[data-v]', function (b) { e.r[n - 1] = b.getAttribute('data-v') === '1'; salvar(); ir('p/' + (n + 1)); });
    } else {
      app.innerHTML = topo +
        '<p class="enunciado" style="font-size:1.25rem">Qual frase mais parece você hoje?</p>' +
        '<div class="pilha">' + P.FRASES.map(function (f, k) {
          return '<button class="botao claro frase' + (e.q7 === k + 1 ? ' marcado' : '') + '" data-f="' + (k + 1) + '">' + esc(f) + '</button>';
        }).join('') + '</div>';
      aoClicar('[data-f]', function (b) { e.q7 = Number(b.getAttribute('data-f')); concluir(); });
    }
  }

  function concluir() {
    if (e.r.length < 6 || !e.q7) return;
    if (!e.id) { e.id = P.uuid(); e.token = P.novoToken(); }
    if (!e.enviado) {
      e.enviado = true; salvar();               // marca antes de enfileirar: toque duplo não gera dois envios
      token = e.token; P.gravar('pdp_token', token);
      P.enfileirar('pdp_enviar', { p: {
        id: e.id, token: e.token,
        nome: e.ident.nome, email: e.ident.email, curso: e.ident.curso, formatura: e.ident.formatura, momento: e.ident.momento,
        q1: e.r[0], q2: e.r[1], q3: e.r[2], q4: e.r[3], q5: e.r[4], q6: e.r[5], q7: e.q7
      } });
    }
    ir('resultado', true);                       // o "voltar" do celular não reabre a pergunta 7
  }

  /* ---------- resultado (logo após as perguntas) e Etapa (na barra) ---------- */
  function blocoEtapa(revela) {
    var c = P.calcularEtapa(e.r), E = P.ETAPAS[c.etapa];
    var comoFoi = c.consolidada
      ? 'Você respondeu “sim” às seis perguntas. Por isso a etapa é a 5, consolidada: o ciclo de testar, registrar e ajustar já faz parte do seu jeito de decidir.'
      : 'Olhamos as perguntas 1 a 6 em ordem. A etapa é a da primeira pergunta respondida com “não”. A sua foi a pergunta ' + c.primeiraNao +
        ' (“' + esc(P.PERGUNTAS[c.primeiraNao - 1].texto) + '”), que pertence à etapa ' + c.etapa + '.';
    return '<div class="cartao escuro' + (revela ? ' revela' : '') + '"><div class="etapa-topo"><div class="numero">' + c.etapa + '</div><div>' +
      '<p class="sobre">Seu ponto de partida</p>' +
      '<h1>Etapa ' + c.etapa + ': ' + esc(E.nome) + (c.consolidada ? ' <span class="selo">consolidada</span>' : '') + '</h1></div></div>' +
      '<p class="titulo" style="font-size:1.2rem;margin-top:14px">' + esc(E.pergunta) + '</p></div>' +
      P.htmlSignifica(e.r, e.q7) +
      '<div class="bloco"><h3>Sua aposta no exercício de hoje</h3><p class="forte">' + esc(E.aposta) + '</p></div>' +
      '<div class="bloco"><h3>Próximo passo da semana</h3><p class="forte">' + esc(E.passo) + '</p></div>' +
      '<div class="bloco"><h3>Como a etapa foi calculada</h3><p class="pequeno">' + comoFoi + '</p></div>';
  }

  function blocoDescreve() {
    return '<div class="cartao"><h2 style="margin-bottom:12px">Essa etapa te descreve?</h2><div class="pilha">' +
      DESCREVE.map(function (o) {
        return '<button class="botao claro' + (e.descreve === o[0] ? ' marcado' : '') + '" data-d="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>' + (e.descreve ? '<p class="pequeno suave" style="margin-top:10px">Anotado. Obrigado!</p>' : '') + '</div>';
  }

  function ligarDescreve(depois) {
    aoClicar('[data-d]', function (b) {
      var v = b.getAttribute('data-d');
      if (e.descreve !== v) { e.descreve = v; salvar(); P.enfileirar('pdp_descreve', { p_token: e.token || token, p_valor: v }); }
      depois();
    });
  }

  var RODAPE = '<p class="rodape">Travou numa etapa? Olhe a anterior.<br>Isto não é uma avaliação psicológica.</p>';

  function telaResultado() {
    app.innerHTML = blocoEtapa(true) +
      '<div class="cartao centro"><p class="forte" style="font-weight:800">Guarde o número: o Arthur vai pedir no chat.</p></div>' +
      blocoDescreve() +
      (e.descreve ? '<a class="botao" href="#/inicio">Continuar</a>' : '') + RODAPE;
    ligarDescreve(function () { desenhar(true); var b = app.querySelector('a.botao[href="#/inicio"]'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }

  function telaPonto() {
    app.innerHTML = blocoEtapa(false) + blocoDescreve() + RODAPE;
    ligarDescreve(function () { desenhar(true); });
  }

  /* ---------- início ---------- */
  function linkPessoal() { return new URL('./?t=' + encodeURIComponent(token), location.href.split('#')[0]).href; }

  function proximoPasso() {
    if (!temPonto()) return { sobre: 'Comece por aqui', texto: 'Fazer o ponto de partida', href: '#/comecar' };
    var venc = casa.testes.filter(vencido)[0];
    if (venc) return { sobre: 'Chegou a data do seu teste', texto: 'Como foi?', href: '#/testes/' + venc.id + '/concluir' };
    var escritos = [1, 2, 3].filter(function (n) { var p = plano(n); return p && (p.titulo || '').trim(); });
    if (!escritos.length) return { sobre: 'Próximo passo', texto: 'Escrever meus 3 planos', href: '#/planos/1' };
    var falta = [1, 2, 3].filter(function (n) { return escritos.indexOf(n) < 0; })[0];
    if (falta) return { sobre: 'Seus planos', texto: 'Escrever o plano ' + falta + ': ' + TIPOS_PLANO[falta].nome.toLowerCase(), href: '#/planos/' + falta };
    var semRegua = [1, 2, 3].filter(function (n) { return !reguaCompleta(plano(n)); })[0];
    if (semRegua) return { sobre: 'Seus planos', texto: 'Passar a régua no plano ' + semRegua, href: '#/planos/' + semRegua };
    var semPergunta = [1, 2, 3].filter(function (n) { return !perguntasDe(plano(n)).length; })[0];
    if (semPergunta) return { sobre: 'Seus planos', texto: 'Fazer perguntas ao plano ' + semPergunta, href: '#/planos/' + semPergunta };
    var algumTeste = casa.testes.some(function (t) { return t.plano_ordem; });
    if (!algumTeste) {
      var n1 = [1, 2, 3].filter(function (n) { return perguntasDe(plano(n)).length; })[0], q1 = perguntasDe(plano(n1))[0];
      return { sobre: 'Próximo passo', texto: 'Transformar uma pergunta em teste', href: '#/testes/novo/' + n1 + '/' + q1.id };
    }
    var abertos = casa.testes.filter(function (t) { return t.estado !== 'concluido'; });
    var andando = abertos.filter(function (t) { return t.estado === 'andamento'; })[0];
    if (andando) return { sobre: 'Teste em andamento', texto: 'Fechar o ciclo: o que aprendi?', href: '#/testes/' + andando.id };
    if (abertos[0]) return { sobre: 'Seu teste está desenhado', texto: 'Marcar que comecei', href: '#/testes/' + abertos[0].id };
    return { sobre: 'Próximo passo', texto: 'Escolher outra pergunta para testar', href: '#/planos' };
  }

  function telaInicio() {
    var nome = primeiroNome(), h = '';
    h += '<h1 class="saudacao">' + (nome ? 'Olá, ' + esc(nome) : 'Olá') + '</h1>';
    if (!token && email) h += '<p class="aviso-topo">Você entrou só com o e-mail. Para ver tudo o que já registrou, abra pelo seu link pessoal.</p>';

    var pp = proximoPasso();
    h += '<a class="cartao proximo" href="' + pp.href + '"><div class="linha-cartao"><div class="corpo"><p class="sobre">' + pp.sobre + '</p><p class="forte">' + pp.texto + '</p></div><span class="seta">›</span></div></a>';

    if (temPonto()) {
      var c = P.calcularEtapa(e.r), E = P.ETAPAS[c.etapa];
      h += '<a class="cartao escuro" href="#/ponto"><div class="linha-cartao"><div class="numero menor">' + c.etapa + '</div><div class="corpo">' +
        '<p class="sobre">Sua etapa</p><h2>' + esc(E.nome) + (c.consolidada ? ' <span class="selo">consolidada</span>' : '') + '</h2>' +
        '<p class="pequeno" style="margin-top:4px">' + esc(E.passo) + '</p></div><span class="seta">›</span></div></a>';
    }

    var nr = casa.exits.length + casa.registros.length, nt = casa.testes.length;
    var ultima = casa.exits[0] || casa.registros[0];
    var abertos = casa.testes.filter(function (t) { return t.estado !== 'concluido'; }).length;
    var np = casa.planos.filter(function (p) { return (p.titulo || '').trim(); }).length;
    var nq = casa.planos.reduce(function (a, p) { return a + perguntasDe(p).length; }, 0);
    h += '<a class="cartao" href="#/planos"><div class="linha-cartao"><div class="icone">' + ICONES.planos + '</div><div class="corpo"><h2>Meus planos</h2>' +
      '<p class="pequeno suave">' + (np ? np + ' de 3 escritos · ' + nq + ' pergunta' + (nq === 1 ? '' : 's') : 'Três versões possíveis da sua vida daqui a 5 anos.') + '</p></div><span class="seta">›</span></div></a>';
    h += '<a class="cartao" href="#/reflexoes"><div class="linha-cartao"><div class="icone">' + ICONES.reflexoes + '</div><div class="corpo"><h2>Reflexões</h2>' +
      '<p class="pequeno suave">' + (nr ? nr + ' registrada' + (nr > 1 ? 's' : '') + ' · última em ' + dataCurta(ultima.criado_em) : 'No fim de cada encontro, pelo link compartilhado na sessão.') + '</p></div><span class="seta">›</span></div></a>';
    h += '<a class="cartao" href="#/testes"><div class="linha-cartao"><div class="icone">' + ICONES.testes + '</div><div class="corpo"><h2>Meus testes</h2>' +
      '<p class="pequeno suave">' + (nt ? abertos + ' em aberto · ' + (nt - abertos) + ' concluído' + (nt - abertos === 1 ? '' : 's') : 'Desenhe um teste pequeno para a sua aposta.') + '</p></div><span class="seta">›</span></div></a>';

    if (token) h += '<div class="cartao pilha" style="gap:10px"><p class="sobre">Seu link pessoal</p>' +
      '<p class="pequeno">Abre este espaço em qualquer aparelho. Guarde-o: é só seu.</p>' +
      '<button class="botao claro" id="copiar">Guardar meu link</button></div>';
    h += '<p class="rodape">Isto não é uma avaliação psicológica.</p>';
    app.innerHTML = h;

    var b = document.getElementById('copiar');
    if (b) b.onclick = function () {
      var link = linkPessoal(), feito = function () { b.textContent = 'Link copiado'; setTimeout(function () { b.textContent = 'Guardar meu link'; }, 2500); };
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) navigator.share({ title: 'Meu link da Trilha de Carreira', url: link }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(link).then(feito, function () { prompt('Copie o seu link:', link); });
      else prompt('Copie o seu link:', link);
    };
  }

  /* ---------- meus planos: três versões, régua, perguntas ---------- */
  var planoPendente = null, timerPlano = null;

  function enviarPlano(pl) {
    var q = quem(), p = { id: pl.id, ordem: pl.ordem, token: q.token, email: q.email, titulo: (pl.titulo || '').trim(), frase: (pl.frase || '').trim(),
      perguntas: perguntasDe(pl).map(function (x) { return { id: x.id, texto: x.texto.trim() }; }) };
    REGUA.forEach(function (r) { p[r[0]] = pl[r[0]] || null; });
    P.enfileirar('pdp_plano_salvar', { p: p });
  }
  function agendarPlano(pl) {
    pl.atualizado_em = new Date().toISOString(); salvarCasa();
    planoPendente = pl; clearTimeout(timerPlano);
    timerPlano = setTimeout(enviarPlanoPendente, 1200);
  }
  function enviarPlanoPendente() {
    clearTimeout(timerPlano);
    if (planoPendente) { var pl = planoPendente; planoPendente = null; enviarPlano(pl); }
  }
  window.addEventListener('pagehide', enviarPlanoPendente);

  function pontos(v) {
    var h = '<span class="pontos" aria-label="' + (v || 0) + ' de 5">';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (v && i <= v ? 'on' : '') + '"></i>';
    return h + '</span>';
  }

  function telaPlanos(r) {
    if (r[1] === 'comparar') return telaComparar();
    if (/^[123]$/.test(r[1] || '')) return telaPlano(+r[1]);
    var h = '<div class="topo-lista"><h1>Meus planos</h1></div>' +
      '<p class="suave">Três versões possíveis da sua vida daqui a 5 anos. Não é para escolher uma: é para descobrir o que vale perguntar e testar.</p>';
    [1, 2, 3].forEach(function (n) {
      var p = plano(n), T = TIPOS_PLANO[n], nq = perguntasDe(p).length;
      var nt = casa.testes.filter(function (t) { return +t.plano_ordem === n; }).length;
      h += '<a class="cartao item" href="#/planos/' + n + '"><p class="sobre">Plano ' + n + ' · ' + T.nome + '</p>' +
        (p && (p.titulo || '').trim()
          ? '<h3>' + esc(p.titulo) + '</h3>' + (p.frase ? '<p class="meta corta">' + esc(p.frase) + '</p>' : '') +
            (REGUA.some(function (x) { return p[x[0]]; }) ? '<div class="regua-mini">' + REGUA.map(function (x) { return '<span>' + x[1] + ' ' + pontos(p[x[0]]) + '</span>'; }).join('') + '</div>' : '') +
            '<p class="meta">' + nq + ' pergunta' + (nq === 1 ? '' : 's') + ' · ' + nt + ' teste' + (nt === 1 ? '' : 's') + '</p>'
          : '<h3 class="suave">Ainda em branco</h3><p class="meta">' + esc(T.dica) + '</p>') + '</a>';
    });
    var comRegua = casa.planos.filter(function (p) { return REGUA.some(function (x) { return p[x[0]]; }); }).length;
    if (comRegua >= 2) h += '<a class="botao claro" href="#/planos/comparar">Comparar os planos</a>';
    app.innerHTML = h;
  }

  function telaPlano(n) {
    var T = TIPOS_PLANO[n], pl = plano(n);
    if (!pl) { pl = { id: P.uuid(), ordem: n, titulo: '', frase: '', perguntas: [], criado_em: new Date().toISOString() }; casa.planos.push(pl); }
    if (!pl.perguntas) pl.perguntas = [];
    if (!pl.perguntas.length) pl.perguntas.push({ id: P.uuid().slice(0, 8), texto: '' });

    var h = '<a class="voltar-topo" href="#/planos">‹ Meus planos</a>' +
      '<p class="sobre">Plano ' + n + ' de 3</p><h1>' + esc(T.nome) + '</h1><p class="suave">' + esc(T.dica) + '</p>' +
      '<div class="cartao pilha" style="gap:12px">' +
      '<div class="campo"><label for="titulo">Título</label><input id="titulo" type="text" maxlength="120" placeholder="' + esc(T.ex) + '" value="' + esc(pl.titulo) + '"></div>' +
      '<div class="campo"><label for="frase">Em uma frase: como é essa vida?</label><textarea id="frase" maxlength="600" rows="2">' + esc(pl.frase) + '</textarea></div></div>' +
      '<div class="cartao pilha" style="gap:16px"><div><p class="sobre">Régua</p><p class="pequeno suave">De 1 (pouco) a 5 (muito). É para comparar sensações entre os planos, não para somar pontos.</p></div>' +
      REGUA.map(function (x) {
        return '<div class="regua-linha" data-dim="' + x[0] + '"><p class="regua-titulo"><b>' + x[1] + '</b> · ' + esc(x[2]) + '</p><div class="regua-botoes">' +
          [1, 2, 3, 4, 5].map(function (v) { return '<button type="button" class="nota' + (pl[x[0]] === v ? ' marcado' : '') + '" data-v="' + v + '" aria-pressed="' + (pl[x[0]] === v) + '">' + v + '</button>'; }).join('') +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="cartao pilha" style="gap:12px"><div><p class="sobre">Perguntas</p><p class="pequeno suave">Que perguntas esse plano te levanta? Escreva duas ou três. Depois, transforme uma delas em teste.</p></div>' +
      '<div id="perguntas" class="pilha" style="gap:12px">' +
      pl.perguntas.map(function (q, i) {
        var t = (q.texto || '').trim() && testeDaPergunta(n, q.id);
        return '<div class="pergunta"><textarea data-q="' + esc(q.id) + '" maxlength="500" rows="2" aria-label="Pergunta ' + (i + 1) + '" placeholder="Pergunta ' + (i + 1) + '">' + esc(q.texto) + '</textarea>' +
          ((q.texto || '').trim() ? (t ? '<a class="acao-pergunta" href="#/testes/' + t.id + '">Ver o teste desta pergunta ›</a>'
            : '<a class="acao-pergunta" href="#/testes/novo/' + n + '/' + encodeURIComponent(q.id) + '">Transformar em teste ›</a>') : '') + '</div>';
      }).join('') + '</div>' +
      (pl.perguntas.length < 6 ? '<button type="button" class="botao texto" id="mais" style="align-self:flex-start;padding-left:0">+ Outra pergunta</button>' : '') +
      '<div><p class="pequeno suave" style="margin-bottom:6px">Sem ideia? Toque numa sugestão:</p><div class="sugestoes">' +
      SUGESTOES_PERGUNTA.map(function (sg, i) { return '<button type="button" data-s="' + i + '">' + esc(sg) + '</button>'; }).join('') + '</div></div></div>' +
      '<p class="pequeno suave centro" id="salvo">Tudo o que você escreve fica guardado.</p>' +
      (n < 3 ? '<a class="botao" href="#/planos/' + (n + 1) + '">Próximo: plano ' + (n + 1) + ' ›</a>' : '<a class="botao" href="#/planos">Ver os três planos</a>');
    app.innerHTML = h;

    function mudou() { agendarPlano(pl); var s2 = document.getElementById('salvo'); if (s2) s2.textContent = 'Guardado.'; }
    ['titulo', 'frase'].forEach(function (k) {
      document.getElementById(k).addEventListener('input', function () { pl[k] = this.value; mudou(); });
    });
    document.getElementById('perguntas').addEventListener('input', function (ev) {
      var id = ev.target.getAttribute('data-q'); if (!id) return;
      pl.perguntas.forEach(function (q) { if (q.id === id) q.texto = ev.target.value; }); mudou();
      // mostra ou esconde o "Transformar em teste" sem redesenhar a tela (não rouba o próximo toque)
      var caixa = ev.target.parentNode, link = caixa.querySelector('.acao-pergunta'), cheia = !!ev.target.value.trim();
      if (cheia && !link) {
        link = document.createElement('a'); link.className = 'acao-pergunta';
        link.href = '#/testes/novo/' + n + '/' + encodeURIComponent(id); link.textContent = 'Transformar em teste ›';
        caixa.appendChild(link);
      } else if (!cheia && link) caixa.removeChild(link);
    });
    Array.prototype.forEach.call(app.querySelectorAll('.regua-linha'), function (linha) {
      var dim = linha.getAttribute('data-dim');
      Array.prototype.forEach.call(linha.querySelectorAll('[data-v]'), function (b) {
        b.onclick = function () {
          var v = +b.getAttribute('data-v'); pl[dim] = pl[dim] === v ? null : v; mudou();
          Array.prototype.forEach.call(linha.querySelectorAll('[data-v]'), function (x) {
            var on = +x.getAttribute('data-v') === pl[dim]; x.classList.toggle('marcado', on); x.setAttribute('aria-pressed', on);
          });
        };
      });
    });
    var mais = document.getElementById('mais');
    if (mais) mais.onclick = function () {
      pl.perguntas.push({ id: P.uuid().slice(0, 8), texto: '' }); salvarCasa(); desenhar(true);
      var t = app.querySelectorAll('#perguntas textarea'); if (t.length) t[t.length - 1].focus();
    };
    aoClicar('[data-s]', function (b) {
      var txt = SUGESTOES_PERGUNTA[+b.getAttribute('data-s')];
      var vazia = pl.perguntas.filter(function (q) { return !(q.texto || '').trim(); })[0];
      if (vazia) vazia.texto = txt; else if (pl.perguntas.length < 6) pl.perguntas.push({ id: P.uuid().slice(0, 8), texto: txt });
      mudou(); desenhar(true);
    });
  }

  function telaComparar() {
    var ps = [1, 2, 3].map(plano).filter(function (p) { return p && (p.titulo || '').trim(); });
    var h = '<a class="voltar-topo" href="#/planos">‹ Meus planos</a><h1>Comparar os planos</h1>' +
      '<p class="suave">Onde cada plano se destaca? Use a comparação para escolher o que perguntar primeiro, não para eleger um vencedor.</p>' +
      '<div class="cartao comparar"><table><tr><th></th>' + ps.map(function (p) { return '<th><span class="sobre">Plano ' + p.ordem + '</span><br>' + esc(p.titulo) + '</th>'; }).join('') + '</tr>' +
      REGUA.map(function (x) { return '<tr><td><b>' + x[1] + '</b></td>' + ps.map(function (p) { return '<td>' + pontos(p[x[0]]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</table></div>';
    app.innerHTML = h;
  }

  /* ---------- reflexões: histórico dos encontros ---------- */
  var EXIT = [['levo', 'O que levo deste encontro'], ['criterio', 'Um critério que descobri'],
    ['proximo', 'O que vou testar ou perguntar até a próxima sessão'], ['melhorar', 'O que faria este encontro ser melhor']];

  function telaReflexoes(r) {
    if (r[1]) { ir('reflexoes', true); return; }      // o registro livre não existe mais
    var h = '<div class="topo-lista"><h1>Reflexões</h1></div>' +
      '<p class="suave">No fim de cada encontro da Trilha, a reflexão é feita pelo link compartilhado na sessão. Tudo o que você registrou fica aqui.</p>';
    if (!casa.exits.length && !casa.registros.length) h += '<div class="vazio"><p>Nenhuma reflexão ainda.</p></div>';
    casa.exits.forEach(function (x) {
      h += '<div class="cartao item"><span class="etiqueta">' + esc(x.encontro || 'Encontro') + '</span> <span class="meta">' +
        (x.data ? dataCurta(x.data + 'T12:00:00') : dataCurta(x.criado_em)) + '</span><dl class="reflexao">' +
        EXIT.map(function (c) { return x[c[0]] ? '<dt>' + c[1] + '</dt><dd>' + esc(x[c[0]]) + '</dd>' : ''; }).join('') + '</dl>' +
        (x.slug ? '<a class="botao texto" style="padding-left:0" href="#/e/' + esc(x.slug) + '">Ver ou corrigir</a>' : '') + '</div>';
    });
    if (casa.registros.length) {
      h += '<p class="sobre" style="margin-top:8px">Reflexões anteriores</p>';
      casa.registros.forEach(function (x) {
        h += '<div class="cartao item"><span class="etiqueta">' + esc(x.encontro) + '</span> <span class="meta">' + dataCurta(x.criado_em) + '</span><dl class="reflexao">' +
          REFLEXAO.map(function (c) { return x[c[0]] ? '<dt>' + c[1] + '</dt><dd>' + esc(x[c[0]]) + '</dd>' : ''; }).join('') + '</dl></div>';
      });
    }
    app.innerHTML = h;
  }

  /* ---------- exit ticket de um encontro (único jeito de registrar reflexão e retorno) ---------- */
  var infoEncontros = P.ler('pdp_info_encontros', {});

  function telaExit(r) {
    var slug = (r[1] || '').replace(/[^A-Za-z0-9]/g, '');
    if (!slug) { ir(identificado() ? 'inicio' : '', true); return; }
    var info = infoEncontros[slug];
    var local = exitsLocais[slug] || (exitsLocais[slug] = { id: P.uuid() });
    var doBanco = casa.exits.filter(function (x) { return x.slug === slug; })[0];
    if (doBanco && local.recomendacao == null) {           // respondido em outro aparelho
      local.id = doBanco.id; local.recomendacao = doBanco.recomendacao;
      EXIT.forEach(function (c) { local[c[0]] = doBanco[c[0]] || ''; }); local.enviado = true;
    }

    function rodape() {
      return '<a class="botao claro" href="#/' + (identificado() ? 'inicio' : '') + '">' + (identificado() ? 'Ir para o início' : 'Conhecer a ferramenta') + '</a>' +
        '<p class="rodape">Isto não é uma avaliação psicológica.</p>';
    }
    function aviso(titulo, texto) {
      app.innerHTML = '<p class="sobre">Reflexão do encontro</p><h1>' + esc(titulo) + '</h1><p>' + texto + '</p>' + rodape();
    }
    function cabeca() {
      return '<p class="sobre">Reflexão do encontro</p><h1>' + esc(info && info.nome ? info.nome : 'Encontro da Trilha') + '</h1>' +
        (info && info.data ? '<p class="suave">' + new Date(info.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) + '</p>' : '');
    }

    function mostrar() {
      if (info === null) return aviso('Link não encontrado', 'Este link não corresponde a nenhum encontro. Confira com quem compartilhou.');
      if (info && !info.aberto && !local.enviado) return aviso(info.nome, 'As respostas para este encontro foram encerradas.');
      if (local.enviado && !local.editando) return resumo();
      formulario();
    }

    function resumo() {
      app.innerHTML = cabeca() +
        '<div class="situacao ok">Reflexão guardada. Até o próximo encontro!</div>' +
        '<div class="cartao"><p class="sobre">Recomendaria a um amigo</p><p class="titulo" style="font-size:1.6rem;margin-top:4px">' + local.recomendacao + ' <span class="suave pequeno">de 10</span></p>' +
        '<dl class="reflexao">' + EXIT.map(function (c) { return local[c[0]] ? '<dt>' + c[1] + '</dt><dd>' + esc(local[c[0]]) + '</dd>' : ''; }).join('') + '</dl></div>' +
        (!info || info.aberto ? '<button class="botao claro" id="editar">Corrigir minha resposta</button>' : '') + rodape();
      var b = document.getElementById('editar');
      if (b) b.onclick = function () { local.editando = true; desenhar(true); };
    }

    function formulario() {
      var d = local, h = cabeca() + '<form id="f" class="pilha" style="gap:18px" novalidate>';
      if (!identificado()) h += '<div class="campo"><label for="email">Seu e-mail (o mesmo do ponto de partida)</label>' +
        '<input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="160" value="' + esc(d.email) + '"></div>';
      h += '<div class="cartao pilha" style="gap:10px"><p class="sobre">Sobre o encontro</p>' +
        '<p class="andaime" style="margin:0">De 0 a 10, o quanto você recomendaria este encontro a um amigo interessado no tema?</p>' +
        '<div class="nota-grade" role="radiogroup" aria-label="Nota de 0 a 10">' +
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
          return '<button type="button" role="radio" aria-checked="' + (d.recomendacao === n) + '" class="nota' + (d.recomendacao === n ? ' marcado' : '') + '" data-n="' + n + '">' + n + '</button>';
        }).join('') + '</div><div class="nota-legenda"><span>nada provável</span><span>muito provável</span></div></div>';
      h += '<div class="cartao pilha" style="gap:14px"><p class="sobre">Reflexão</p>';
      EXIT.slice(0, 3).forEach(function (c) {
        h += '<div class="campo"><label for="' + c[0] + '">' + c[1] + (c[0] === 'criterio' ? ' (ou confirmei)' : '') + '</label>' +
          '<textarea id="' + c[0] + '" maxlength="1000" rows="2">' + esc(d[c[0]]) + '</textarea></div>';
      });
      h += '</div><div class="campo"><label for="melhorar">O que faria este encontro ser melhor? <span class="suave">(opcional)</span></label>' +
        '<textarea id="melhorar" maxlength="1000" rows="2">' + esc(d.melhorar) + '</textarea></div>' +
        '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Guardar reflexão</button></form>' +
        '<p class="rodape">Isto não é uma avaliação psicológica.</p>';
      app.innerHTML = h;

      function guardarLocal() { P.gravar('pdp_exits', exitsLocais); }
      document.getElementById('f').addEventListener('input', function (ev) { if (ev.target.id) { d[ev.target.id] = ev.target.value; guardarLocal(); } });
      aoClicar('[data-n]', function (b) {
        d.recomendacao = Number(b.getAttribute('data-n')); guardarLocal();
        Array.prototype.forEach.call(app.querySelectorAll('[data-n]'), function (x) {
          var on = x === b; x.classList.toggle('marcado', on); x.setAttribute('aria-checked', on);
        });
      });
      document.getElementById('f').onsubmit = function (ev) {
        ev.preventDefault();
        var erro = document.getElementById('erro'), mail = (d.email || '').trim().toLowerCase();
        var falta = (!identificado() && !/^\S+@\S+\.\S+$/.test(mail)) ? 'Informe seu e-mail.' :
          d.recomendacao == null ? 'Escolha uma nota de 0 a 10.' :
          !EXIT.slice(0, 3).some(function (c) { return (d[c[0]] || '').trim(); }) ? 'Escreva em pelo menos um dos campos da reflexão.' : '';
        if (falta) { erro.textContent = falta; erro.hidden = false; return; }
        if (!identificado()) { email = mail; P.gravar('pdp_email', email); }
        var q = quem(), p = { id: d.id, encontro: slug, token: q.token, email: q.email, recomendacao: d.recomendacao };
        EXIT.forEach(function (c) { d[c[0]] = (d[c[0]] || '').trim(); p[c[0]] = d[c[0]]; });
        P.enfileirar('pdp_exit_enviar', { p: p });
        d.enviado = true; d.editando = false; guardarLocal();
        var item = { id: d.id, slug: slug, encontro: info && info.nome, data: info && info.data, recomendacao: d.recomendacao, criado_em: new Date().toISOString() };
        EXIT.forEach(function (c) { item[c[0]] = d[c[0]]; });
        casa.exits = [item].concat(casa.exits.filter(function (x) { return x.slug !== slug; })); salvarCasa();
        desenhar();
      };
    }

    if (info === undefined) app.innerHTML = '<p class="sobre">Reflexão do encontro</p><p class="suave">Abrindo o encontro…</p>';
    else mostrar();
    // confirma no banco se o encontro existe e está aberto (sem rede: segue com o que tem)
    P.rpc('pdp_encontro', { p_slug: slug }).then(function (x) {
      if (rota()[0] !== 'e' || rota()[1] !== r[1]) return;
      var mudou = JSON.stringify(x) !== JSON.stringify(info);
      info = x; infoEncontros[slug] = x; P.gravar('pdp_info_encontros', infoEncontros);
      var ativo = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (mudou && !ativo) mostrar();
    }, function () { if (info === undefined) { info = false; mostrar(); } });
  }

  /* ---------- testes ---------- */
  function achar(id) { return casa.testes.filter(function (t) { return t.id === id; })[0]; }

  function enviarTeste(t, extras) {
    var q = quem(), p = { id: t.id, token: q.token, email: q.email, estado: t.estado };
    CAMPOS_TESTE.forEach(function (k) { p[k] = t[k] || ''; });
    ['ate_data', 'plano_ordem', 'pergunta_id', 'pergunta'].forEach(function (k) { if (t[k] != null) p[k] = t[k]; });
    if (extras) { p.aprendi = t.aprendi || ''; p.muda = t.muda || ''; }
    t.atualizado_em = new Date().toISOString(); salvarCasa();
    P.enfileirar('pdp_teste_salvar', { p: p });
  }

  function frases(t) {
    function v(k) { var x = (t[k] || '').trim(); return x ? '<b>' + esc(x) + '</b>' : '<span style="opacity:.6">___</span>'; }
    return '<p>Para essa vida dar certo para mim, precisa ser verdade que ' + v('aposta') + '.</p>' +
      '<p>O jeito mais simples de ver isso acontecer é ' + v('teste') + '.</p>' +
      '<p>Sigo se ' + v('sigo_se') + '. Paro ou mudo se ' + v('paro_se') + '.</p>' +
      '<p>Faço até ' + v('ate') + ', com ' + v('com_quem') + '.</p>';
  }

  function telaTestes(r) {
    if (r[1] === 'novo') return telaTesteForm(null, r[2] ? { ordem: +r[2], qid: decodeURIComponent(r[3] || '') } : null);
    if (r[1]) {
      var t = achar(r[1]);
      if (!t) { ir('testes', true); return; }
      if (r[2] === 'editar') return telaTesteForm(t);
      if (r[2] === 'concluir') return telaTesteConcluir(t);
      return telaTeste(t);
    }
    var h = '<div class="topo-lista"><h1>Meus testes</h1></div>';
    var semTeste = [];
    [1, 2, 3].forEach(function (n) { perguntasDe(plano(n)).forEach(function (q) { if (!testeDaPergunta(n, q.id)) semTeste.push([n, q]); }); });
    if (semTeste.length) h += '<a class="cartao proximo" href="#/testes/novo/' + semTeste[0][0] + '/' + encodeURIComponent(semTeste[0][1].id) + '"><div class="linha-cartao"><div class="corpo">' +
      '<p class="sobre">Pergunta do plano ' + semTeste[0][0] + ' ainda sem teste</p><p class="forte">' + esc(semTeste[0][1].texto) + '</p></div><span class="seta">›</span></div></a>';
    else if (!casa.planos.length) h += '<p class="suave">Os melhores testes nascem das perguntas dos seus planos. <a href="#/planos/1">Escrever meus planos</a></p>';
    h += '<a class="botao' + (semTeste.length ? ' claro' : '') + '" href="#/testes/novo">Desenhar um teste avulso</a>';
    if (!casa.testes.length) h += '<div class="vazio"><p>Nenhum teste ainda.</p><p class="pequeno">Um teste é um jeito pequeno e barato de ver se a sua aposta se sustenta.</p></div>';
    ['andamento', 'desenhado', 'concluido'].forEach(function (est) {
      casa.testes.filter(function (t) { return (t.estado || 'desenhado') === est; }).forEach(function (t) {
        h += '<a class="cartao item" href="#/testes/' + t.id + '"><span class="etiqueta ' + est + '">' + ESTADOS[est] + '</span>' +
          '<h3 class="corta">' + esc(t.teste || t.aposta || 'Teste sem descrição') + '</h3>' +
          '<p class="meta">' + (vencido(t) ? '<b class="alerta">A data chegou</b> · ' : '') + (t.ate ? 'Até ' + esc(t.ate) : 'Sem data') + (t.com_quem ? ' · com ' + esc(t.com_quem) : '') +
          (t.plano_ordem ? ' · plano ' + t.plano_ordem : '') + '</p></a>';
      });
    });
    app.innerHTML = h;
  }

  function telaTeste(t) {
    var est = t.estado || 'desenhado';
    var h = '<a class="voltar-topo" href="#/testes">‹ Meus testes</a>' +
      '<div><span class="etiqueta ' + est + '">' + ESTADOS[est] + '</span></div>' +
      (t.pergunta ? '<p class="origem">Da pergunta do <a href="#/planos/' + t.plano_ordem + '">plano ' + t.plano_ordem + '</a>: “' + esc(t.pergunta) + '”</p>' : '') +
      (vencido(t) ? '<a class="cartao proximo" href="#/testes/' + t.id + '/concluir"><div class="linha-cartao"><div class="corpo"><p class="sobre">A data chegou</p><p class="forte">Como foi?</p></div><span class="seta">›</span></div></a>' : '') +
      '<div class="cartao escuro frases">' + frases(t) + '</div>';
    if (est === 'concluido') {
      h += '<div class="cartao"><dl class="reflexao" style="margin:0"><dt style="margin-top:0">O que aprendi</dt><dd>' + (esc(t.aprendi) || '<span class="suave">—</span>') + '</dd>' +
        '<dt>O que muda</dt><dd>' + (esc(t.muda) || '<span class="suave">—</span>') + '</dd></dl></div>' +
        '<a class="botao claro" href="#/testes/' + t.id + '/concluir">Editar o que aprendi</a>' +
        '<a class="botao" href="#/planos">Escolher a próxima pergunta</a>';
    } else {
      if (est === 'desenhado') h += '<button class="botao" id="comecei">Comecei este teste</button>';
      else h += '<a class="botao" href="#/testes/' + t.id + '/concluir">Concluir: o que aprendi?</a>';
      h += '<a class="botao claro" href="#/testes/' + t.id + '/editar">Editar</a>';
      if (est === 'desenhado') h += '<a class="botao texto" href="#/testes/' + t.id + '/concluir" style="align-self:center">Já fiz, quero concluir</a>';
    }
    if (token) h += '<button class="botao texto" id="apagar" style="align-self:center">Apagar este teste</button>';
    app.innerHTML = h;
    var b = document.getElementById('comecei');
    if (b) b.onclick = function () { t.estado = 'andamento'; enviarTeste(t); desenhar(true); };
    var a = document.getElementById('apagar');
    if (a) a.onclick = function () {
      if (!confirm('Apagar este teste? Não dá para desfazer.')) return;
      casa.testes = casa.testes.filter(function (x) { return x.id !== t.id; }); salvarCasa();
      P.enfileirar('pdp_teste_apagar', { p_id: t.id, p_token: token });
      ir('testes', true);
    };
  }

  function telaTesteForm(t, origem) {
    var novo = !t, pergunta = null;
    if (novo && origem) {
      pergunta = perguntasDe(plano(origem.ordem)).filter(function (q) { return q.id === origem.qid; })[0];
      var ja = pergunta && testeDaPergunta(origem.ordem, origem.qid);
      if (ja) { ir('testes/' + ja.id, true); return; }
      if (!pergunta) origem = null;
    }
    var chave = 'teste' + (origem ? '_' + origem.ordem + '_' + origem.qid : '');
    var d = novo ? (rascunho[chave] || (rascunho[chave] = {})) : t;
    var voltar = novo ? (origem ? '#/planos/' + origem.ordem : '#/testes') : '#/testes/' + t.id;
    var h = '<a class="voltar-topo" href="' + voltar + '">‹ Voltar</a>' +
      '<h1>' + (novo ? 'Desenhar um teste' : 'Editar teste') + '</h1>' +
      (pergunta ? '<div class="cartao origem-cartao"><p class="sobre">Pergunta do plano ' + origem.ordem + ' · ' + esc(plano(origem.ordem).titulo) + '</p><p class="forte">“' + esc(pergunta.texto) + '”</p></div>' : '') +
      '<p class="suave">Complete as frases. Escreva do seu jeito, curto e concreto.</p><form id="f" class="pilha" style="gap:16px" novalidate>';
    BLOCOS.forEach(function (b) {
      h += '<div class="cartao pilha" style="gap:10px"><p class="sobre">' + b.rot + '</p>';
      if (b.antes) h += '<label class="andaime" for="' + b.campos[0][0] + '">' + esc(b.antes) + ' <span class="lacuna">___</span>.</label>';
      b.campos.forEach(function (c) {
        var curto = c[0] === 'ate' || c[0] === 'com_quem';
        var campo = c[0] === 'ate'
          ? '<input id="ate_data" type="date" min="' + hojeISO() + '" value="' + esc(d.ate_data || lerData(d.ate)) + '">'
          : curto ? '<input id="' + c[0] + '" type="text" maxlength="200" placeholder="' + esc(c[2]) + '" value="' + esc(d[c[0]]) + '">'
            : '<textarea id="' + c[0] + '" maxlength="1000" rows="2" placeholder="' + esc(c[2]) + '">' + esc(d[c[0]]) + '</textarea>';
        h += '<div class="campo">' + (c[1] ? '<label class="andaime" for="' + (c[0] === 'ate' ? 'ate_data' : c[0]) + '">' + esc(c[1]) + ' <span class="lacuna">___</span></label>' : '') + campo + '</div>';
      });
      h += '</div>';
    });
    h += '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Guardar teste</button></form>';
    app.innerHTML = h;
    var valores = { ate_data: d.ate_data || lerData(d.ate) }; CAMPOS_TESTE.forEach(function (k) { valores[k] = d[k] || ''; });
    document.getElementById('f').addEventListener('input', function (ev) {
      if (!ev.target.id) return;
      valores[ev.target.id] = ev.target.value;
      if (novo) { d[ev.target.id] = ev.target.value; salvarRascunho(); }   // edição só vale ao guardar
      if (ev.target.id === 'ate_data') valores.ate = dataBR(ev.target.value);
    });
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      if (!valores.aposta.trim() && !valores.teste.trim()) { var el = document.getElementById('erro'); el.textContent = 'Complete pelo menos a aposta ou o teste.'; el.hidden = false; return; }
      var alvo = t || { id: P.uuid(), criado_em: new Date().toISOString(), estado: 'desenhado', aprendi: '', muda: '' };
      CAMPOS_TESTE.forEach(function (k) { alvo[k] = String(valores[k] || '').trim(); });
      if (valores.ate_data) { alvo.ate_data = valores.ate_data; alvo.ate = dataBR(valores.ate_data); }
      else if (alvo.ate_data) { alvo.ate_data = ''; alvo.ate = ''; }   // a pessoa apagou a data
      if (novo && pergunta) { alvo.plano_ordem = origem.ordem; alvo.pergunta_id = pergunta.id; alvo.pergunta = pergunta.texto; }
      if (novo) { casa.testes.unshift(alvo); rascunho[chave] = {}; salvarRascunho(); }
      enviarTeste(alvo);
      ir('testes/' + alvo.id, true);
    };
  }

  function telaTesteConcluir(t) {
    app.innerHTML = '<a class="voltar-topo" href="#/testes/' + t.id + '">‹ Voltar</a><p class="sobre">Fechar o ciclo</p><h1>Como foi?</h1>' +
      '<div class="cartao escuro frases">' + frases(t) + '</div>' +
      '<form id="f" class="pilha" style="gap:14px" novalidate>' +
      '<div class="campo"><label for="aprendi">O que aprendi?</label><textarea id="aprendi" maxlength="1000" rows="3">' + esc(t.aprendi) + '</textarea></div>' +
      '<div class="campo"><label for="muda">O que muda no meu plano?</label><textarea id="muda" maxlength="1000" rows="3">' + esc(t.muda) + '</textarea></div>' +
      '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Concluir teste</button></form>';
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      var a = document.getElementById('aprendi').value.trim(), m = document.getElementById('muda').value.trim();
      if (!a && !m) { var el = document.getElementById('erro'); el.textContent = 'Escreva pelo menos uma das duas respostas.'; el.hidden = false; return; }
      t.aprendi = a; t.muda = m; t.estado = 'concluido';
      enviarTeste(t, true);
      ir('testes/' + t.id, true);
    };
  }

  /* ---------- aviso discreto enquanto houver envio pendente ---------- */
  var aviso = document.createElement('div');
  aviso.className = 'situacao pendente'; aviso.hidden = true;
  aviso.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:20;max-width:92%;box-shadow:0 4px 14px rgba(20,33,61,.15)';
  aviso.textContent = 'Sem conexão: guardado neste aparelho. Enviamos sozinhos quando a rede voltar.';
  document.body.appendChild(aviso);
  var atraso = null;
  P.aoMudarFila(function (s) {
    clearTimeout(atraso);
    if (s === 'ok') aviso.hidden = true;
    else atraso = setTimeout(function () { aviso.hidden = !P.ler('pdp_fila', []).length; }, 4000);  // só aparece se demorar
  });

  desenhar();
  P.esvaziar();
  sincronizar();
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !sincronizou) sincronizar(); });
})();
