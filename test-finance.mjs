import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installmentValues, expandCommitment, project, addMonths, summarize } from './finance.js';

test('parcelas somam o total e distribuem centavos', () => {
  assert.deepEqual(installmentValues(20000, 2), [10000, 10000]);
  assert.deepEqual(installmentValues(20000, 3), [6667, 6667, 6666]);
  assert.deepEqual(installmentValues(60000, 6), [10000, 10000, 10000, 10000, 10000, 10000]);
});

test('parcelado atravessa virada de ano', () => {
  const c = { id: '1', descricao: 'NB', valorCentavos: 60000, tipo: 'cartao', parcelas: 6, inicio: '2026-10', recorrente: false };
  const occ = expandCommitment(c, '2027-06');
  assert.equal(occ.length, 6);
  assert.equal(occ[0].month, '2026-10');
  assert.equal(occ[5].month, '2027-03');
  assert.equal(occ.reduce((s, o) => s + o.valorCentavos, 0), 60000);
});

test('recorrente com fim opcional', () => {
  const c = { id: 'r', descricao: 'Acad', valorCentavos: 10000, tipo: 'externo', inicio: '2026-09', recorrente: true, fim: '2026-11' };
  const occ = expandCommitment(c, '2027-01');
  assert.deepEqual(occ.map((o) => o.month), ['2026-09', '2026-10', '2026-11']);
});

test('disponível = receita - guardar - compromissos; cartão separado de externo', () => {
  const state = {
    incomes: { '2026-10': 300000 }, savings: { '2026-10': 50000 },
    commitments: [
      { id: 'a', descricao: 'NB', valorCentavos: 60000, tipo: 'cartao', parcelas: 6, inicio: '2026-10', recorrente: false },
      { id: 'b', descricao: 'Perfume', valorCentavos: 20000, tipo: 'externo', parcelas: 2, inicio: '2026-10', recorrente: false },
    ],
  };
  const proj = project(state, { start: '2026-10', months: 3 });
  const out = proj[0];
  assert.equal(out.cartao, 10000);
  assert.equal(out.externo, 10000);
  assert.equal(out.comprometido, 20000);
  assert.equal(out.disponivel, 300000 - 50000 - 20000);
  const sum = summarize(proj);
  assert.equal(sum.ultimoComCompromisso, '2027-03');
});

test('addMonths cruza ano', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-10', 6), '2027-04');
});

test('salário mensal vale para todos os meses projetados', () => {
  const state = {
    salarioCentavos: 300000, incomes: {}, savings: {},
    commitments: [
      { id: 'a', descricao: 'Acad', valorCentavos: 10000, tipo: 'externo', inicio: '2026-10', recorrente: true, fim: null },
    ],
  };
  const proj = project(state, { start: '2026-10', months: 3 });
  for (const p of proj) {
    assert.equal(p.receita, 300000);
    assert.equal(p.disponivel, 300000 - 10000);
  }
});

test('receita específica do mês tem prioridade sobre o salário', () => {
  const state = {
    salarioCentavos: 300000, incomes: { '2026-11': 400000 }, savings: {},
    commitments: [],
  };
  const proj = project(state, { start: '2026-10', months: 3 });
  assert.equal(proj[0].receita, 300000);
  assert.equal(proj[1].receita, 400000);
  assert.equal(proj[2].receita, 300000);
});
