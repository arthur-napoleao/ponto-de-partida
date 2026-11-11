/* Cenários da regra da etapa. Rodar: node testes/cenarios.js
   Confere a regra de comum.js e mostra o que a pessoa leria no resultado. */
'use strict';
var P = require('../comum.js');
var S = true, N = false;

var CENARIOS = [
  // critérios de aceite do briefing (seção 11)
  { nome: 'Aceite: todas "não"', r: [N, N, N, N, N, N], q7: 1, espera: 1 },
  { nome: 'Aceite: só a 1 "sim"', r: [S, N, N, N, N, N], q7: 2, espera: 2 },
  { nome: 'Aceite: 1 a 3 "sim", 4 "não"', r: [S, S, S, N, N, N], q7: 4, espera: 4 },
  { nome: 'Aceite: 1 a 4 "sim", 5 "não"', r: [S, S, S, S, N, N], q7: 4, espera: 4 },
  { nome: 'Aceite: 1 a 5 "sim", 6 "não"', r: [S, S, S, S, S, N], q7: 5, espera: 5 },
  { nome: 'Aceite: todas "sim"', r: [S, S, S, S, S, S], q7: 5, espera: 5, consolidada: true },
  // casos que testam o sentido da regra
  { nome: 'Faz tudo, mas não escreveu o que quer', r: [N, S, S, S, S, S], q7: 5, espera: 1 },
  { nome: 'Explorou temas sem escrever objetivo', r: [N, S, N, N, N, N], q7: 2, espera: 1 },
  { nome: 'Tem critérios, sem curiosidade fora do curso', r: [S, N, S, S, N, N], q7: 3, espera: 2 },
  { nome: 'Conversou com foco, sem caminhos priorizados', r: [S, S, S, N, S, N], q7: 4, espera: 4 },
  { nome: 'Priorizou caminhos, nunca conversou com foco', r: [S, S, S, S, N, S], q7: 4, espera: 4 },
  { nome: 'Se vê mais atrás do que as respostas', r: [S, S, S, S, N, N], q7: 1, espera: 4 },
  { nome: 'Se vê bem à frente das respostas', r: [S, N, N, N, N, N], q7: 5, espera: 2 }
];

var falhas = 0;
CENARIOS.forEach(function (c, i) {
  var x = P.calcularEtapa(c.r), E = P.ETAPAS[x.etapa];
  var ok = x.etapa === c.espera && !!x.consolidada === !!c.consolidada;
  if (!ok) falhas++;
  var sims = c.r.map(function (v, k) { return v ? k + 1 : null; }).filter(Boolean);
  console.log('\n' + (ok ? 'ok   ' : 'FALHA') + ' ' + (i + 1) + '. ' + c.nome);
  console.log('      "sim" em: ' + (sims.length ? sims.join(', ') : 'nenhuma') + ' · frase escolhida: ' + c.q7);
  console.log('      → Etapa ' + x.etapa + ': ' + E.nome + (x.consolidada ? ' (consolidada)' : '') +
    (x.primeiraNao ? ' · primeira "não" na pergunta ' + x.primeiraNao : ''));
  console.log('      significa: ' + E.significa);
  if (c.q7 !== x.etapa) console.log('      linha extra: Você se vê na etapa ' + c.q7 + '. Pelas suas respostas, vale olhar a etapa ' + x.etapa + ' primeiro.');
});
console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'Todos os cenários batem com a regra.'));
process.exit(falhas ? 1 : 0);
