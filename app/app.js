/* Trilha de Carreira — aplicativo de uma página só.
   Rotas (hash): #/ (boas-vindas) · #/entrar · #/comecar · #/p/1..7 · #/resultado
                 #/inicio · #/ponto · #/reflexoes · #/reflexoes/nova
                 #/testes · #/testes/novo · #/testes/ID · #/testes/ID/editar · #/testes/ID/concluir
   Dados: o aparelho é a primeira cópia (localStorage); o banco é sincronizado pela fila de comum.js. */
(function () {
  'use strict';
  var P = window.PDP, esc = P.esc;
  var app = document.getElementById('app'), nav = document.getElementById('nav');

  var MOMENTOS = ['Buscando o primeiro estágio', 'Estagiando', 'Trabalhando', 'Outro'];
  var PERIODOS = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º', '11º ou mais'];
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
  var ICONES = {
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
    var r = rota(), a = r[0] || '';
    var fluxo = { '': 1, entrar: 1, comecar: 1, p: 1 };
    if (!identificado() && !fluxo[a]) { ir('', true); return; }
    if (identificado() && a === '') { ir('inicio', true); return; }
    if (a === 'p' && !(e.ident && e.ident.nome)) { ir('comecar', true); return; }
    if ((a === 'ponto' || a === 'resultado') && !temPonto()) { ir(identificado() ? 'inicio' : '', true); return; }

    var comBarra = identificado() && !fluxo[a] && a !== 'resultado';
    document.body.classList.toggle('com-barra', comBarra);
    nav.hidden = !comBarra;
    if (comBarra) desenharBarra(a);

    ({ '': telaBoasVindas, entrar: telaEntrar, comecar: telaIdent, p: telaPergunta, resultado: telaResultado,
      inicio: telaInicio, ponto: telaPonto, reflexoes: telaReflexoes, testes: telaTestes }[a] || telaInicio)(r);

    if (!semAnimar) {
      app.classList.remove('entra'); void app.offsetWidth; app.classList.add('entra');
      window.scrollTo(0, 0);
    }
  }

  function desenharBarra(atual) {
    nav.innerHTML = [['inicio', 'Início'], ['ponto', 'Etapa'], ['reflexoes', 'Reflexões'], ['testes', 'Testes']].map(function (i) {
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
      '<div class="campo"><label for="curso">Curso</label><input id="curso" type="text" list="cursos" maxlength="120" placeholder="Ex.: Engenharia de Produção" value="' + esc(d.curso) + '">' +
      '<datalist id="cursos"><option>Administração</option><option>Ciências Econômicas</option><option>Engenharia Civil</option><option>Engenharia de Produção</option><option>Engenharia Elétrica</option><option>Engenharia Mecânica</option><option>Engenharia Química</option><option>Engenharia de Computação</option><option>Engenharia Ambiental e Sanitária</option><option>Engenharia Cartográfica</option></datalist></div>' +
      '<div class="campo"><label for="periodo">Período</label><select id="periodo"><option value="">Escolha</option>' +
      PERIODOS.map(function (p) { return '<option' + (d.periodo === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label>Seu momento</label><div class="chips" id="momentos">' +
      MOMENTOS.map(function (m) { return '<button type="button" class="botao claro' + (d.momento === m ? ' marcado' : '') + '" data-m="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div></div>' +
      '<p class="erro" id="erro" hidden></p>' +
      '<button class="botao" type="submit">Continuar</button>' +
      '<p class="pequeno suave">Suas respostas serão usadas pelo Legado UERJ para melhorar a Trilha. Você pode pedir a exclusão a qualquer momento.</p>' +
      '</form>';

    function colher() {
      ['nome', 'email', 'curso', 'periodo'].forEach(function (k) { d[k] = document.getElementById(k).value.trim(); });
      salvar();
    }
    document.getElementById('f').addEventListener('input', colher);
    aoClicar('[data-m]', function (b) {
      d.momento = b.getAttribute('data-m'); salvar();
      Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle('marcado', x === b); });
    });
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault(); colher();
      var falta = !d.nome ? 'seu nome' : !/^\S+@\S+\.\S+$/.test(d.email || '') ? 'um e-mail válido' :
        !d.curso ? 'seu curso' : !d.periodo ? 'seu período' : !d.momento ? 'seu momento' : '';
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
        nome: e.ident.nome, email: e.ident.email, curso: e.ident.curso, periodo: e.ident.periodo, momento: e.ident.momento,
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
      '<div class="bloco"><h3>O que significa</h3><p>' + esc(E.significa) + '</p></div>' +
      (e.q7 !== c.etapa ? '<p class="faixa">Você se vê na etapa ' + e.q7 + '. Pelas suas respostas, vale olhar a etapa ' + c.etapa + ' primeiro.</p>' : '') +
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
    var abertos = casa.testes.filter(function (t) { return t.estado !== 'concluido'; });
    if (!temPonto()) return { sobre: 'Comece por aqui', texto: 'Fazer o ponto de partida', href: '#/comecar' };
    if (!casa.testes.length) return { sobre: 'Próximo passo', texto: 'Desenhar meu primeiro teste', href: '#/testes/novo' };
    var andando = abertos.filter(function (t) { return t.estado === 'andamento'; })[0];
    if (andando) return { sobre: 'Teste em andamento', texto: 'Fechar o ciclo: o que aprendi?', href: '#/testes/' + andando.id };
    if (abertos[0]) return { sobre: 'Seu teste está desenhado', texto: 'Marcar que comecei', href: '#/testes/' + abertos[0].id };
    return { sobre: 'Depois do encontro', texto: 'Registrar uma reflexão', href: '#/reflexoes/nova' };
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

    var nr = casa.registros.length, nt = casa.testes.length;
    var abertos = casa.testes.filter(function (t) { return t.estado !== 'concluido'; }).length;
    h += '<a class="cartao" href="#/reflexoes"><div class="linha-cartao"><div class="icone">' + ICONES.reflexoes + '</div><div class="corpo"><h2>Reflexões</h2>' +
      '<p class="pequeno suave">' + (nr ? nr + ' registrada' + (nr > 1 ? 's' : '') + ' · última em ' + dataCurta(casa.registros[0].criado_em) : 'Três minutos depois de cada encontro.') + '</p></div><span class="seta">›</span></div></a>';
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

  /* ---------- reflexões ---------- */
  function telaReflexoes(r) {
    if (r[1] === 'nova') return telaReflexaoNova();
    var h = '<div class="topo-lista"><h1>Reflexões</h1></div>' +
      '<a class="botao" href="#/reflexoes/nova">Registrar reflexão</a>';
    if (!casa.registros.length) h += '<div class="vazio"><p>Nenhuma reflexão ainda.</p><p class="pequeno">Depois de cada encontro da Trilha, leva três minutos.</p></div>';
    casa.registros.forEach(function (x) {
      h += '<div class="cartao item"><span class="etiqueta">' + esc(x.encontro) + '</span> <span class="meta">' + dataCurta(x.criado_em) + '</span><dl class="reflexao">' +
        REFLEXAO.map(function (c) { return x[c[0]] ? '<dt>' + c[1] + '</dt><dd>' + esc(x[c[0]]) + '</dd>' : ''; }).join('') + '</dl></div>';
    });
    app.innerHTML = h;
  }

  function telaReflexaoNova() {
    var d = rascunho.reflexao || (rascunho.reflexao = {});
    var h = '<a class="voltar-topo" href="#/reflexoes">‹ Reflexões</a><h1>Nova reflexão</h1>' +
      '<p class="suave">Respostas curtas valem.</p><form id="f" class="pilha" style="gap:14px" novalidate>' +
      '<div class="campo"><label for="encontro">Qual encontro?</label><input id="encontro" type="text" maxlength="120" placeholder="Ex.: workshop de 11/11" value="' + esc(d.encontro) + '"></div>';
    REFLEXAO.forEach(function (c) {
      h += '<div class="campo"><label for="' + c[0] + '">' + c[1] + '</label><textarea id="' + c[0] + '" maxlength="1000" rows="2">' + esc(d[c[0]]) + '</textarea></div>';
    });
    h += '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Guardar reflexão</button></form>';
    app.innerHTML = h;
    document.getElementById('f').addEventListener('input', function (ev) { if (ev.target.id) { d[ev.target.id] = ev.target.value; salvarRascunho(); } });
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      var x = { id: P.uuid(), criado_em: new Date().toISOString(), encontro: (d.encontro || '').trim() };
      REFLEXAO.forEach(function (c) { x[c[0]] = (d[c[0]] || '').trim(); });
      var falta = !x.encontro ? 'Diga de qual encontro é esta reflexão.' :
        !REFLEXAO.some(function (c) { return x[c[0]]; }) ? 'Escreva em pelo menos um dos campos.' : '';
      if (falta) { var el = document.getElementById('erro'); el.textContent = falta; el.hidden = false; return; }
      casa.registros.unshift(x); salvarCasa();
      var q = quem();
      P.enfileirar('pdp_registro_enviar', { p: { id: x.id, token: q.token, email: q.email, encontro: x.encontro,
        energia: x.energia, surpresa: x.surpresa, criterio: x.criterio, pergunta: x.pergunta } });
      rascunho.reflexao = {}; salvarRascunho();
      ir('reflexoes', true);
    };
  }

  /* ---------- testes ---------- */
  function achar(id) { return casa.testes.filter(function (t) { return t.id === id; })[0]; }

  function enviarTeste(t, extras) {
    var q = quem(), p = { id: t.id, token: q.token, email: q.email, estado: t.estado };
    CAMPOS_TESTE.forEach(function (k) { p[k] = t[k] || ''; });
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
    if (r[1] === 'novo') return telaTesteForm(null);
    if (r[1]) {
      var t = achar(r[1]);
      if (!t) { ir('testes', true); return; }
      if (r[2] === 'editar') return telaTesteForm(t);
      if (r[2] === 'concluir') return telaTesteConcluir(t);
      return telaTeste(t);
    }
    var h = '<div class="topo-lista"><h1>Meus testes</h1></div><a class="botao" href="#/testes/novo">Desenhar um teste</a>';
    if (!casa.testes.length) h += '<div class="vazio"><p>Nenhum teste ainda.</p><p class="pequeno">Um teste é um jeito pequeno e barato de ver se a sua aposta se sustenta.</p></div>';
    ['andamento', 'desenhado', 'concluido'].forEach(function (est) {
      casa.testes.filter(function (t) { return (t.estado || 'desenhado') === est; }).forEach(function (t) {
        h += '<a class="cartao item" href="#/testes/' + t.id + '"><span class="etiqueta ' + est + '">' + ESTADOS[est] + '</span>' +
          '<h3 class="corta">' + esc(t.teste || t.aposta || 'Teste sem descrição') + '</h3>' +
          '<p class="meta">' + (t.ate ? 'Até ' + esc(t.ate) : 'Sem data') + (t.com_quem ? ' · com ' + esc(t.com_quem) : '') + '</p></a>';
      });
    });
    app.innerHTML = h;
  }

  function telaTeste(t) {
    var est = t.estado || 'desenhado';
    var h = '<a class="voltar-topo" href="#/testes">‹ Meus testes</a>' +
      '<div><span class="etiqueta ' + est + '">' + ESTADOS[est] + '</span></div>' +
      '<div class="cartao escuro frases">' + frases(t) + '</div>';
    if (est === 'concluido') {
      h += '<div class="cartao"><dl class="reflexao" style="margin:0"><dt style="margin-top:0">O que aprendi</dt><dd>' + (esc(t.aprendi) || '<span class="suave">—</span>') + '</dd>' +
        '<dt>O que muda</dt><dd>' + (esc(t.muda) || '<span class="suave">—</span>') + '</dd></dl></div>' +
        '<a class="botao claro" href="#/testes/' + t.id + '/concluir">Editar o que aprendi</a>' +
        '<a class="botao" href="#/testes/novo">Desenhar o próximo teste</a>';
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

  function telaTesteForm(t) {
    var novo = !t, d = novo ? (rascunho.teste || (rascunho.teste = {})) : t;
    var h = '<a class="voltar-topo" href="#/testes' + (novo ? '' : '/' + t.id) + '">‹ Voltar</a>' +
      '<h1>' + (novo ? 'Desenhar um teste' : 'Editar teste') + '</h1>' +
      '<p class="suave">Complete as frases. Escreva do seu jeito, curto e concreto.</p><form id="f" class="pilha" style="gap:16px" novalidate>';
    BLOCOS.forEach(function (b) {
      h += '<div class="cartao pilha" style="gap:10px"><p class="sobre">' + b.rot + '</p>';
      if (b.antes) h += '<label class="andaime" for="' + b.campos[0][0] + '">' + esc(b.antes) + ' <span class="lacuna">___</span>.</label>';
      b.campos.forEach(function (c) {
        var curto = c[0] === 'ate' || c[0] === 'com_quem';
        h += '<div class="campo">' + (c[1] ? '<label class="andaime" for="' + c[0] + '">' + esc(c[1]) + ' <span class="lacuna">___</span></label>' : '') +
          (curto ? '<input id="' + c[0] + '" type="text" maxlength="200" placeholder="' + esc(c[2]) + '" value="' + esc(d[c[0]]) + '">'
            : '<textarea id="' + c[0] + '" maxlength="1000" rows="2" placeholder="' + esc(c[2]) + '">' + esc(d[c[0]]) + '</textarea>') + '</div>';
      });
      h += '</div>';
    });
    h += '<p class="erro" id="erro" hidden></p><button class="botao" type="submit">Guardar teste</button></form>';
    app.innerHTML = h;
    var valores = {}; CAMPOS_TESTE.forEach(function (k) { valores[k] = d[k] || ''; });
    document.getElementById('f').addEventListener('input', function (ev) {
      if (!ev.target.id) return;
      valores[ev.target.id] = ev.target.value;
      if (novo) { d[ev.target.id] = ev.target.value; salvarRascunho(); }   // edição só vale ao guardar
    });
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      if (!valores.aposta.trim() && !valores.teste.trim()) { var el = document.getElementById('erro'); el.textContent = 'Complete pelo menos a aposta ou o teste.'; el.hidden = false; return; }
      var alvo = t || { id: P.uuid(), criado_em: new Date().toISOString(), estado: 'desenhado', aprendi: '', muda: '' };
      CAMPOS_TESTE.forEach(function (k) { alvo[k] = valores[k].trim(); });
      if (novo) { casa.testes.unshift(alvo); rascunho.teste = {}; salvarRascunho(); }
      enviarTeste(alvo);
      ir('testes/' + alvo.id, true);
    };
  }

  function telaTesteConcluir(t) {
    app.innerHTML = '<a class="voltar-topo" href="#/testes/' + t.id + '">‹ Voltar</a><h1>Fechar o ciclo</h1>' +
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
