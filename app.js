/* Ponto de partida — fluxo: início → identificação → 7 perguntas → resultado */
(function () {
  'use strict';
  var P = window.PDP, esc = P.esc, app = document.getElementById('app');
  var CHAVE = 'pdp_estado';
  var MOMENTOS = ['Buscando o primeiro estágio', 'Estagiando', 'Trabalhando', 'Outro'];
  var DESCREVE = [['sim', 'Sim'], ['mais_ou_menos', 'Mais ou menos'], ['nao', 'Não']];

  // estado guardado no aparelho: recarregar a página não perde nada
  var e = P.ler(CHAVE, null) || { tela: 'inicio', ident: {}, r: [], q7: null, i: 0 };
  function salvar() { P.gravar(CHAVE, e); }
  function ir(tela, i) { e.tela = tela; if (i != null) e.i = i; salvar(); desenhar(); window.scrollTo(0, 0); }

  function desenhar() {
    ({ inicio: telaInicio, ident: telaIdent, q: telaPergunta, resultado: telaResultado }[e.tela] || telaInicio)();
  }

  /* ---------- início ---------- */
  function telaInicio() {
    app.innerHTML =
      '<h1>Ponto de partida</h1>' +
      '<p>Sete perguntas rápidas sobre o que você já fez. Não é prova nem nota: é um mapa de onde vale cavar agora.</p>' +
      '<p class="suave">Leva menos de 5 minutos. No fim, você vê em que etapa do processo está e qual é o próximo passo.</p>' +
      '<div class="empurra pilha">' +
      '<button class="botao" id="comecar">Começar</button>' +
      '<p class="pequeno suave centro">Isto não é uma avaliação psicológica.</p></div>';
    document.getElementById('comecar').onclick = function () { ir('ident'); };
  }

  /* ---------- identificação ---------- */
  function telaIdent() {
    var d = e.ident;
    app.innerHTML =
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
    document.getElementById('momentos').onclick = function (ev) {
      var b = ev.target.closest('[data-m]'); if (!b) return;
      d.momento = b.getAttribute('data-m'); salvar();
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('marcado', x === b); });
    };
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault(); colher();
      var falta = !d.nome ? 'seu nome' : !/^\S+@\S+\.\S+$/.test(d.email || '') ? 'um e-mail válido' :
        !d.curso ? 'seu curso' : !d.formatura ? 'seu semestre de formatura' : !d.momento ? 'seu momento' : '';
      if (falta) { var el = document.getElementById('erro'); el.textContent = 'Falta preencher ' + falta + '.'; el.hidden = false; return; }
      ir('q', Math.min(e.r.length, 6));
    };
  }

  /* ---------- perguntas 1 a 7 ---------- */
  function topoPergunta(i) {
    return '<div class="avanco"><button class="voltar" id="voltar" aria-label="Voltar">‹ Voltar</button>' +
      '<div class="trilho"><div class="cheio" style="width:' + Math.round((i / 7) * 100) + '%"></div></div>' +
      '<span class="conta">' + (i + 1) + ' de 7</span></div>';
  }

  function telaPergunta() {
    var i = e.i;
    if (i < 6) {
      var atual = e.r[i];
      app.innerHTML = topoPergunta(i) +
        '<p class="rotulo-pergunta">Nos últimos três meses</p>' +
        '<p class="enunciado">' + esc(P.PERGUNTAS[i].texto) + '</p>' +
        '<div class="empurra dupla">' +
        '<button class="botao claro' + (atual === true ? ' marcado' : '') + '" data-v="1">Sim</button>' +
        '<button class="botao claro' + (atual === false ? ' marcado' : '') + '" data-v="0">Não</button></div>';
      Array.prototype.forEach.call(app.querySelectorAll('[data-v]'), function (b) {
        b.onclick = function () { e.r[i] = b.getAttribute('data-v') === '1'; ir('q', i + 1); };
      });
    } else {
      app.innerHTML = topoPergunta(6) +
        '<p class="enunciado" style="font-size:1.25rem">Qual frase mais parece você hoje?</p>' +
        '<div class="pilha">' + P.FRASES.map(function (f, k) {
          return '<button class="botao claro frase' + (e.q7 === k + 1 ? ' marcado' : '') + '" data-f="' + (k + 1) + '">' + esc(f) + '</button>';
        }).join('') + '</div>';
      Array.prototype.forEach.call(app.querySelectorAll('[data-f]'), function (b) {
        b.onclick = function () { e.q7 = Number(b.getAttribute('data-f')); concluir(); };
      });
    }
    document.getElementById('voltar').onclick = function () { if (i === 0) ir('ident'); else ir('q', i - 1); };
  }

  /* ---------- conclusão: calcula, mostra e grava ---------- */
  function concluir() {
    if (e.r.length < 6 || !e.q7) return;
    if (!e.id) { e.id = P.uuid(); e.token = P.novoToken(); }
    if (!e.enviado) {
      e.enviado = true; salvar(); // marca antes de enfileirar: toque duplo não gera dois envios
      P.gravar('pdp_token', e.token);
      P.enfileirar('pdp_enviar', { p: {
        id: e.id, token: e.token,
        nome: e.ident.nome, email: e.ident.email, curso: e.ident.curso, formatura: e.ident.formatura, momento: e.ident.momento,
        q1: e.r[0], q2: e.r[1], q3: e.r[2], q4: e.r[3], q5: e.r[4], q6: e.r[5], q7: e.q7
      } });
    }
    ir('resultado');
  }

  function linkPessoal() { return new URL('semana.html?t=' + encodeURIComponent(e.token), location.href).href; }

  function telaResultado() {
    var c = P.calcularEtapa(e.r), E = P.ETAPAS[c.etapa], percebida = e.q7;
    var comoFoi = c.consolidada
      ? 'Você respondeu “sim” às seis perguntas. Por isso a etapa é a 5, consolidada: o ciclo de testar, registrar e ajustar já faz parte do seu jeito de decidir.'
      : 'Olhamos as perguntas 1 a 6 em ordem. A etapa é a da primeira pergunta respondida com “não”. A sua foi a pergunta ' + c.primeiraNao +
        ' (“' + esc(P.PERGUNTAS[c.primeiraNao - 1].texto) + '”), que pertence à etapa ' + c.etapa + '.';

    app.innerHTML =
      '<div class="cartao escuro"><div class="etapa-topo"><div class="numero">' + c.etapa + '</div><div>' +
      '<p class="pequeno suave">Seu ponto de partida</p>' +
      '<h1>Etapa ' + c.etapa + ': ' + esc(E.nome) + (c.consolidada ? ' <span class="selo">consolidada</span>' : '') + '</h1></div></div>' +
      '<p class="titulo" style="font-size:1.2rem;margin-top:14px">' + esc(E.pergunta) + '</p></div>' +

      '<div class="bloco"><h3>O que significa</h3><p>' + esc(E.significa) + '</p></div>' +
      (percebida !== c.etapa ? '<p class="faixa">Você se vê na etapa ' + percebida + '. Pelas suas respostas, vale olhar a etapa ' + c.etapa + ' primeiro.</p>' : '') +
      '<div class="bloco"><h3>Sua aposta no exercício de hoje</h3><p class="forte">' + esc(E.aposta) + '</p></div>' +
      '<div class="bloco"><h3>Próximo passo da semana</h3><p class="forte">' + esc(E.passo) + '</p></div>' +
      '<div class="bloco"><h3>Como a etapa foi calculada</h3><p class="pequeno">' + comoFoi + '</p></div>' +

      '<div class="cartao centro"><p class="forte" style="font-weight:800">Guarde o número: o Arthur vai pedir no chat.</p></div>' +

      '<div class="cartao" id="descreve"></div>' +
      '<div id="retorno"></div>' +
      '<div id="situacao" class="situacao" hidden></div>' +
      '<p class="rodape">Travou numa etapa? Olhe a anterior.<br>Isto não é uma avaliação psicológica.</p>';

    desenharDescreve();
    P.aoMudarFila(function (s) {
      var el = document.getElementById('situacao'); if (!el) return;
      el.hidden = false;
      if (s === 'ok') { el.className = 'situacao ok'; el.textContent = 'Respostas gravadas.'; }
      else { el.className = 'situacao pendente'; el.textContent = 'Gravando suas respostas… Se a conexão cair, tentamos de novo sozinhos. Deixe esta página aberta.'; }
    });
  }

  function desenharDescreve() {
    var el = document.getElementById('descreve');
    el.innerHTML = '<h2 style="margin-bottom:12px">Essa etapa te descreve?</h2><div class="pilha">' +
      DESCREVE.map(function (o) {
        return '<button class="botao claro' + (e.descreve === o[0] ? ' marcado' : '') + '" data-d="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>' + (e.descreve ? '<p class="pequeno suave" style="margin-top:10px">Anotado. Obrigado!</p>' : '');
    Array.prototype.forEach.call(el.querySelectorAll('[data-d]'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-d');
        if (e.descreve === v) return;
        e.descreve = v; salvar();
        P.enfileirar('pdp_descreve', { p_token: e.token, p_valor: v });
        desenharDescreve();
      };
    });
    desenharRetorno();
  }

  function desenharRetorno() {
    var el = document.getElementById('retorno');
    if (!e.descreve) { el.innerHTML = ''; return; }
    var link = linkPessoal();
    el.innerHTML = '<div class="cartao pilha"><h2>Seu link pessoal</h2>' +
      '<p class="pequeno">Depois de cada encontro da Trilha, volte por este link para o registro da semana (3 minutos). Guarde-o: é só seu.</p>' +
      '<p class="link-pessoal" id="link">' + esc(link) + '</p>' +
      '<button class="botao" id="copiar">Copiar meu link</button>' +
      '<a class="botao claro" href="' + esc(link) + '">Abrir o registro da semana</a>' +
      '<a class="botao claro" href="meu-teste.html?t=' + encodeURIComponent(e.token) + '">Abrir o Meu teste</a></div>';
    document.getElementById('copiar').onclick = function () {
      var b = this, feito = function () { b.textContent = 'Link copiado'; setTimeout(function () { b.textContent = 'Copiar meu link'; }, 2500); };
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        navigator.share({ title: 'Meu link da Trilha de Carreira', url: link }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(feito, function () {});
      } else {
        var r = document.createRange(); r.selectNodeContents(document.getElementById('link'));
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand('copy'); feito(); } catch (x) {}
      }
    };
  }

  desenhar();
  P.esvaziar();
})();
