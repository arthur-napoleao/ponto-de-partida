/* Cenários da regra da etapa e dos textos do resultado. Rodar: node testes/cenarios.js */
'use strict';
var P = require('../comum.js');
var S = true, N = false;

var T = {
  base: function (k) { return P.ETAPAS[k].significa; },
  e4via5: 'Você já tem caminhos prioritários. Falta testar um deles com uma pergunta definida.',
  consolidada: 'Você já testa e fecha o ciclo. O ganho agora é manter o ritmo: um teste por vez, sempre com registro.',
  extra: 'Você também já faz coisas das etapas seguintes. Esta é a base que ainda falta.',
  frente: function (p, c) { return 'Você se vê na etapa ' + p + '. Pelas suas respostas, vale olhar a etapa ' + c + ' primeiro.'; },
  atras: function (p, c) { return 'Você se vê na etapa ' + p + '. Pelas suas respostas, você já fez o trabalho das etapas anteriores: a etapa ' + c + ' é onde vale cavar agora.'; }
};

// espera: etapa; sig: texto de "o que significa"; extra: linha de etapas seguintes; div: linha de divergência
var CENARIOS = [
  // critérios de aceite do briefing (seção 11)
  { nome: 'Aceite: todas "não"', r: [N, N, N, N, N, N], q7: 1, espera: 1, sig: T.base(1) },
  { nome: 'Aceite: só a 1 "sim"', r: [S, N, N, N, N, N], q7: 2, espera: 2, sig: T.base(2) },
  { nome: 'Aceite: 1 a 3 "sim", 4 "não"', r: [S, S, S, N, N, N], q7: 4, espera: 4, sig: T.base(4) },
  { nome: 'Aceite: 1 a 4 "sim", 5 "não"', r: [S, S, S, S, N, N], q7: 4, espera: 4, sig: T.e4via5 },
  { nome: 'Aceite: 1 a 5 "sim", 6 "não"', r: [S, S, S, S, S, N], q7: 5, espera: 5, sig: T.base(5) },
  { nome: 'Aceite: todas "sim"', r: [S, S, S, S, S, S], q7: 5, espera: 5, consolidada: true, sig: T.consolidada },
  // casos de sentido
  { nome: 'Faz tudo, mas não escreveu o que quer', r: [N, S, S, S, S, S], q7: 5, espera: 1, sig: T.base(1), extra: true, div: T.frente(5, 1) },
  { nome: 'Explorou temas sem escrever objetivo', r: [N, S, N, N, N, N], q7: 2, espera: 1, sig: T.base(1), extra: true, div: T.frente(2, 1) },
  { nome: 'Tem critérios, sem curiosidade fora do curso', r: [S, N, S, S, N, N], q7: 3, espera: 2, sig: T.base(2), extra: true, div: T.frente(3, 2) },
  { nome: 'Conversou com foco, sem caminhos priorizados', r: [S, S, S, N, S, N], q7: 4, espera: 4, sig: T.base(4), extra: true },
  { nome: 'Priorizou caminhos, nunca conversou com foco', r: [S, S, S, S, N, S], q7: 4, espera: 4, sig: T.e4via5, extra: true },
  { nome: 'Se vê mais atrás do que as respostas', r: [S, S, S, S, N, N], q7: 1, espera: 4, sig: T.e4via5, div: T.atras(1, 4) },
  { nome: 'Se vê bem à frente das respostas', r: [S, N, N, N, N, N], q7: 5, espera: 2, sig: T.base(2), div: T.frente(5, 2) },
  { nome: 'Consolidada, mas se vê no começo', r: [S, S, S, S, S, S], q7: 2, espera: 5, consolidada: true, sig: T.consolidada, div: T.atras(2, 5) },
  { nome: 'Etapa 5 por falta da 6, se vê na 4', r: [S, S, S, S, S, N], q7: 4, espera: 5, sig: T.base(5), div: T.atras(4, 5) }
];

var falhas = 0;
CENARIOS.forEach(function (c, i) {
  var t = P.textosResultado(c.r, c.q7), erros = [];
  if (t.etapa !== c.espera) erros.push('etapa ' + t.etapa + ' (esperava ' + c.espera + ')');
  if (!!t.consolidada !== !!c.consolidada) erros.push('consolidada errada');
  if (t.significa !== c.sig) erros.push('"o que significa" errado');
  if (!!t.extra !== !!c.extra) erros.push('linha de etapas seguintes ' + (t.extra ? 'sobrando' : 'faltando'));
  if (t.divergencia !== (c.div || '')) erros.push('linha de divergência errada');
  if (erros.length) falhas++;
  var sims = c.r.map(function (v, k) { return v ? k + 1 : null; }).filter(Boolean);
  console.log('\n' + (erros.length ? 'FALHA' : 'ok   ') + ' ' + (i + 1) + '. ' + c.nome + (erros.length ? '  ← ' + erros.join('; ') : ''));
  console.log('      "sim" em: ' + (sims.length ? sims.join(', ') : 'nenhuma') + ' · se vê na etapa ' + c.q7);
  console.log('      → Etapa ' + t.etapa + ': ' + P.ETAPAS[t.etapa].nome + (t.consolidada ? ' (consolidada)' : '') +
    (t.primeiraNao ? ' · primeira "não" na pergunta ' + t.primeiraNao : ''));
  console.log('      significa: ' + t.significa);
  if (t.extra) console.log('      + ' + t.extra);
  if (t.divergencia) console.log('      faixa: ' + t.divergencia);
});
console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'Todos os ' + CENARIOS.length + ' cenários batem com a regra e os textos.'));
process.exit(falhas ? 1 : 0);
