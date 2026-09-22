// finance.js — lógica pura de projeção (sem DOM). Usável no browser (ES module) e no Node.
// Modelo:
// commitment = { id, descricao, valorCentavos, tipo:'cartao'|'externo',
//                categoria, parcelas, inicio:'YYYY-MM', recorrente:bool, fim:'YYYY-MM'|null }
// Se recorrente=true: valorCentavos = valor MENSAL. parcelas ignorado.
// Se recorrente=false: valorCentavos = valor TOTAL, dividido em `parcelas` meses a partir de `inicio`.

export function monthKey(year, month1to12) {
  return `${String(year).padStart(4, '0')}-${String(month1to12).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonths(key, n) {
  let { year, month } = parseMonthKey(key);
  let idx = (year * 12 + (month - 1)) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return monthKey(y, m);
}

export function currentMonthKey(now = new Date()) {
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

export function monthRange(start, end) {
  const out = [];
  let k = start;
  let guard = 0;
  while (k <= end && guard < 120) {
    out.push(k);
    k = addMonths(k, 1);
    guard++;
  }
  return out;
}

const MES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MES_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export function formatMonthShort(key) {
  const { year, month } = parseMonthKey(key);
  return `${MES_PT[month - 1]}/${String(year).slice(2)}`;
}

export function formatMonthLong(key) {
  const { year, month } = parseMonthKey(key);
  return `${MES_FULL[month - 1]}/${year}`;
}

export function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function toCents(valorReais) {
  return Math.round(Number(valorReais) * 100);
}

// Divide totalCentavos em n parcelas distribuindo o resto nos PRIMEIRAS parcelas.
// Ex: 20000/3 = [6667, 6667, 6666]. Soma sempre == total.
export function installmentValues(totalCentavos, n) {
  const total = Math.round(totalCentavos);
  const count = Math.max(1, Math.floor(n) || 1);
  const base = Math.floor(total / count);
  let rest = total - base * count;
  const out = new Array(count).fill(base);
  for (let i = 0; i < count && rest > 0; i++, rest--) out[i] += 1;
  // Se total negativo (não esperado) garante soma mesmo assim
  for (let i = 0; i < count && rest < 0; i++, rest++) out[i] -= 1;
  return out;
}

// Expande um compromisso em ocorrências mensais até horizonEnd (YYYY-MM).
// Retorna [{ month, valorCentavos, tipo, id, descricao, categoria, parcela, deParcelas }]
export function expandCommitment(c, horizonEnd) {
  const out = [];
  if (!c || !c.inicio) return out;
  if (c.recorrente) {
    const fim = c.fim && c.fim >= c.inicio ? c.fim : horizonEnd;
    const end = fim <= horizonEnd ? fim : horizonEnd;
    for (const m of monthRange(c.inicio, end)) {
      if (m < c.inicio) continue;
      out.push({
        month: m, valorCentavos: Math.round(c.valorCentavos),
        tipo: c.tipo, id: c.id, descricao: c.descricao,
        categoria: c.categoria || 'Outros', parcela: null, deParcelas: null,
        recorrente: true,
      });
    }
    return out;
  }
  const n = Math.max(1, Math.floor(c.parcelas) || 1);
  const vals = installmentValues(c.valorCentavos, n);
  for (let i = 0; i < n; i++) {
    const m = addMonths(c.inicio, i);
    if (m > horizonEnd) break;
    out.push({
      month: m, valorCentavos: vals[i],
      tipo: c.tipo, id: c.id, descricao: c.descricao,
      categoria: c.categoria || 'Outros', parcela: n > 1 ? i + 1 : null, deParcelas: n > 1 ? n : null,
      recorrente: false,
    });
  }
  return out;
}

export function lastCommitmentMonth(commitments, fallbackEnd) {
  let last = null;
  for (const c of commitments) {
    if (!c.inicio) continue;
    const end = c.recorrente ? (c.fim || fallbackEnd) : addMonths(c.inicio, (Math.max(1, c.parcelas || 1)) - 1);
    if (!last || end > last) last = end;
  }
  return last;
}

// state = { incomes:{mes:centavos}, savings:{mes:centavos}, commitments:[] }
// opts = { start, months } — se omitido, 12 meses a partir do mês atual (estendido p/ cobrir compromissos).
export function project(state, opts = {}) {
  const today = opts.start || currentMonthKey();
  let months = opts.months || 12;
  const commitments = state.commitments || [];
  const provisionalEnd = addMonths(today, months - 1);
  const last = lastCommitmentMonth(commitments, provisionalEnd);
  let end = provisionalEnd;
  if (last && last > end) end = last;
  // Nunca projetar além de 60 meses a partir de start
  const hardEnd = addMonths(today, 59);
  if (end > hardEnd) end = hardEnd;
  const keys = monthRange(today, end);

  const occByMonth = new Map(keys.map((k) => [k, []]));
  for (const c of commitments) {
    for (const occ of expandCommitment(c, end)) {
      if (occByMonth.has(occ.month)) occByMonth.get(occ.month).push(occ);
    }
  }

  return keys.map((m) => {
    const occ = occByMonth.get(m) || [];
    const cartao = occ.filter((o) => o.tipo === 'cartao').reduce((s, o) => s + o.valorCentavos, 0);
    const externo = occ.filter((o) => o.tipo !== 'cartao').reduce((s, o) => s + o.valorCentavos, 0);
    const comprometido = cartao + externo;
    // Receita do mês: valor específico > salário mensal fixo > 0.
    const receita = Math.round((state.incomes || {})[m] ?? state.salarioCentavos ?? 0);
    const guardar = Math.round((state.savings || {})[m] || 0);
    const disponivel = receita - guardar - comprometido;
    const pct = receita > 0 ? comprometido / receita : 0;
    return {
      month: m, label: formatMonthShort(m), labelLong: formatMonthLong(m),
      receita, guardar, cartao, externo, comprometido, disponivel, pct, itens: occ,
    };
  });
}

export function summarize(projection) {
  if (!projection.length) return null;
  let maisPesado = projection[0];
  let totalFuturo = 0;
  let ultimoComCompromisso = null;
  for (const p of projection) {
    totalFuturo += p.comprometido;
    if (p.comprometido > maisPesado.comprometido) maisPesado = p;
    if (p.comprometido > 0) ultimoComCompromisso = p.month;
  }
  const atual = projection[0];
  return { totalFuturo, maisPesado, ultimoComCompromisso, atual };
}

// Simulação: projeta como ficaria se um compromisso hipotético fosse adicionado (sem salvar).
export function simulate(state, hypothetical, opts) {
  const next = { ...state, commitments: [...(state.commitments || []), hypothetical] };
  return project(next, opts);
}

export const CATEGORIAS = ['Alimentação', 'Assinaturas', 'Casa', 'Transporte', 'Estudos', 'Lazer', 'Compras', 'Outros'];
