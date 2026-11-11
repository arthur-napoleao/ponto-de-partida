/* Ponto de partida — conteúdo, regra da etapa e envio com fila. Usado por index.html e semana.html. */
(function (raiz) {
  'use strict';

  var PERGUNTAS = [
    { texto: 'Escrevi, em papel ou no celular, o que quero da minha carreira nos próximos 1 a 2 anos.', etapa: 1 },
    { texto: 'Fui atrás, por conta própria, de um tema fora das matérias obrigatórias (curso, leitura, evento, projeto).', etapa: 2 },
    { texto: 'Descartei uma vaga, área ou caminho por um critério meu, que sei dizer qual é.', etapa: 3 },
    { texto: 'Tenho um ou dois caminhos prioritários e sei dizer quais deixei em espera.', etapa: 4 },
    { texto: 'Conversei com alguém de uma área já sabendo o que queria descobrir.', etapa: 4 },
    { texto: 'Depois de uma conversa ou experiência, anotei o que aprendi e mudei algo no meu plano.', etapa: 5 }
  ];

  var FRASES = [
    'Ainda estou entendendo o que eu quero da carreira.',
    'Sei que temas me interessam, mas não sei que caminhos existem.',
    'Tenho opções na cabeça, mas não sei como escolher entre elas.',
    'Tenho um ou dois caminhos e estou investigando.',
    'Estou testando um caminho e ajustando no percurso.'
  ];

  var ETAPAS = {
    1: { nome: 'Motivo', pergunta: 'Por que eu quero isso?',
      significa: 'Você ainda está dando nome ao que quer e ao que te incomoda. É o começo de todo mundo.',
      aposta: 'Vou gostar?',
      passo: 'Escreva em 10 minutos: o que eu quero da carreira nos próximos 2 anos, e por quê.' },
    2: { nome: 'Território', pergunta: 'Que temas me puxam?',
      significa: 'Você sabe por que quer se mexer. Falta mapear os temas que te dão curiosidade.',
      aposta: 'Vou gostar?',
      passo: 'Liste 10 curiosidades específicas e marque as 3 mais fortes.' },
    3: { nome: 'Critérios', pergunta: 'O que eu descarto, e por quê?',
      significa: 'Você tem temas. Falta dizer o que elimina um caminho para você.',
      aposta: 'Cabe na minha vida?',
      passo: 'Escreva 3 critérios seus e use um deles para descartar uma opção.' },
    4: { nome: 'Testes', pergunta: 'Que caminho investigo, e como?',
      significa: 'Você tem critérios. Falta escolher um caminho e testar com uma pergunta definida.',
      aposta: 'Consigo chegar?',
      passo: 'Marque uma conversa de 20 minutos com uma pergunta pronta.' },
    5: { nome: 'Movimento', pergunta: 'O que aprendi? O que muda?',
      significa: 'Você já testa. O ganho agora é fechar o ciclo: registrar o que aprendeu e ajustar o plano.',
      aposta: 'Consigo chegar?',
      passo: 'Depois do próximo teste, anote: o que aprendi e o que muda.' }
  };

  /* Regra: a etapa é a da primeira pergunta respondida com "não", na ordem 1 a 6.
     respostas = array de 6 booleanos (true = sim). */
  function calcularEtapa(respostas) {
    for (var i = 0; i < PERGUNTAS.length; i++) {
      if (!respostas[i]) return { etapa: PERGUNTAS[i].etapa, consolidada: false, primeiraNao: i + 1 };
    }
    return { etapa: 5, consolidada: true, primeiraNao: null };
  }

  /* ---------- utilidades de navegador ---------- */

  function ler(chave, padrao) {
    try { var v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* modo privado: segue em memória */ }
  }

  function uuid() {
    if (raiz.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function novoToken() {
    var letras = 'abcdefghjkmnpqrstuvwxyz23456789', b = new Uint8Array(18), s = '';
    crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += letras[b[i] % letras.length];
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- chamada ao banco (funções pdp_*) ---------- */

  function rpc(fn, args) {
    var cfg = raiz.PDP_CONFIG || {};
    if (!cfg.url || !cfg.chave) return Promise.reject({ rede: true, msg: 'sem configuração' });
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch(cfg.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.chave, Authorization: 'Bearer ' + cfg.chave },
      body: JSON.stringify(args),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(t);
      if (r.ok) return r.status === 204 ? null : r.text().then(function (x) { return x ? JSON.parse(x) : null; });
      // 4xx (fora 408/429) é erro definitivo; o resto vale tentar de novo
      var definitivo = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
      return r.text().then(function (x) { throw { rede: !definitivo, status: r.status, msg: x }; });
    }, function (e) { clearTimeout(t); throw { rede: true, msg: String(e) }; });
  }

  /* ---------- fila de envio: nada se perde ----------
     Cada item é { fn, args }. As funções do banco são idempotentes (id gerado aqui),
     então reenviar o mesmo item nunca duplica a resposta. */

  var FILA = 'pdp_fila', FILA_ERRO = 'pdp_fila_erro';
  var enviando = false, espera = 2000, timer = null, ouvintes = [];

  function estadoFila() { return ler(FILA, []).length ? (enviando ? 'enviando' : 'pendente') : 'ok'; }
  function avisar() { var e = estadoFila(); ouvintes.forEach(function (f) { try { f(e); } catch (x) {} }); }
  function aoMudarFila(f) { ouvintes.push(f); f(estadoFila()); }

  function enfileirar(fn, args) {
    var fila = ler(FILA, []); fila.push({ fn: fn, args: args }); gravar(FILA, fila);
    espera = 2000; esvaziar();
  }

  function esvaziar() {
    if (enviando) return;
    var fila = ler(FILA, []);
    if (!fila.length) { avisar(); return; }
    clearTimeout(timer);
    enviando = true; avisar();
    var item = fila[0];
    rpc(item.fn, item.args).then(function () {
      var f = ler(FILA, []); f.shift(); gravar(FILA, f);
      enviando = false; espera = 2000; esvaziar();
    }, function (erro) {
      enviando = false;
      if (erro && erro.rede) {
        avisar();
        timer = setTimeout(esvaziar, espera);
        espera = Math.min(espera * 2, 30000);
      } else {
        // erro definitivo: guarda à parte para não travar a fila nem perder o dado
        var f = ler(FILA, []), ruim = f.shift(); gravar(FILA, f);
        var erros = ler(FILA_ERRO, []); erros.push({ item: ruim, erro: erro, em: new Date().toISOString() });
        gravar(FILA_ERRO, erros);
        esvaziar();
      }
    });
  }

  if (raiz.addEventListener) {
    raiz.addEventListener('online', function () { espera = 2000; esvaziar(); });
    raiz.addEventListener('pageshow', function () { esvaziar(); });
    if (raiz.document) document.addEventListener('visibilitychange', function () { if (!document.hidden) esvaziar(); });
  }

  var api = {
    PERGUNTAS: PERGUNTAS, FRASES: FRASES, ETAPAS: ETAPAS, calcularEtapa: calcularEtapa,
    ler: ler, gravar: gravar, uuid: uuid, novoToken: novoToken, esc: esc,
    rpc: rpc, enfileirar: enfileirar, esvaziar: esvaziar, aoMudarFila: aoMudarFila
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.PDP = api;
})(typeof window !== 'undefined' ? window : globalThis);
