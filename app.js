import { project, summarize, simulate, formatBRL, formatMonthLong, currentMonthKey, toCents, CATEGORIAS, installmentValues } from './finance.js';
import { loadState, saveState, defaultState, exportJSONString, importJSONString, exportMarkdown, enableEncryption, disableEncryption, isEncrypted, uid } from './storage.js';

const $ = (s) => document.querySelector(s);
let state = defaultState();
let sessionPass = null;

const THEMES = ['rosa','vermelho','laranja','amarelo','verde','esmeralda','ciano','azul','indigo','roxo','magenta','cinza'];

function parseBR(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ---------- boot ----------
async function boot() {
  const first = await loadState(null);
  if (first && first.__needsPassword) {
    $('#lockView').hidden = false;
    $('#appViews').hidden = true;
    return;
  }
  state = first;
  applyTheme();
  afterUnlock();
}

function afterUnlock() {
  $('#lockView').hidden = true;
  $('#appViews').hidden = false;
  $('#lockBadge').textContent = isEncrypted() ? 'cripto 🔒' : 'local';
  initStatic();
  render();
}

async function persist() {
  await saveState(state, sessionPass);
}

// ---------- static ----------
function initStatic() {
  // tabs
  document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', 'false'));
    b.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    ({ home: 'view-home', add: 'view-add', months: 'view-months', settings: 'view-settings' });
    $('#view-' + b.dataset.tab).classList.add('active');
    window.scrollTo({ top: 0 });
  });
  // categorias
  $('#fCat').innerHTML = CATEGORIAS.map((c) => `<option>${c}</option>`).join('');
  const now = currentMonthKey();
  $('#fInicio').value = now; $('#mRef').value = now;
  // temas
  $('#themes').innerHTML = '';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.textContent = t; b.setAttribute('aria-pressed', String((state.theme || 'azul') === t));
    b.onclick = async () => { state.theme = t; applyTheme(); await persist(); initStaticThemes(); render(); };
    b.dataset.themeBtn = t;
    $('#themes').appendChild(b);
  }
  bindOnce();
}

function initStaticThemes() {
  document.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', String(state.theme === b.dataset.themeBtn)));
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme || 'azul');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb');
}

let bound = false;
function bindOnce() {
  if (bound) return; bound = true;
  $('#formAdd').addEventListener('input', hideSim);
  $('#btnSim').onclick = showSim;
  $('#formAdd').onsubmit = async (e) => {
    e.preventDefault();
    const c = readForm();
    if (!c) return;
    state.commitments.push(c);
    await persist(); e.target.reset();
    $('#fInicio').value = currentMonthKey(); $('#fParc').value = 2;
    hideSim(); render();
    document.querySelector('[data-tab="home"]').click();
  };
  $('#formMes').onsubmit = async (e) => {
    e.preventDefault();
    const m = $('#mRef').value; if (!m) return;
    const r = parseBR($('#mRec').value), g = parseBR($('#mGua').value);
    if ($('#mRec').value !== '') state.incomes[m] = r;
    if ($('#mGua').value !== '') state.savings[m] = g;
    await persist(); render();
  };
  $('#btnUnlock').onclick = async () => {
    const p = $('#unlockPass').value;
    try { state = await loadState(p); sessionPass = p; applyTheme(); afterUnlock(); }
    catch { $('#unlockErr').textContent = 'Senha incorreta.'; }
  };
  $('#btnLock').onclick = async () => {
    const p = $('#secPass').value; if (p.length < 4) { $('#secMsg').textContent = 'Use ao menos 4 caracteres.'; return; }
    await enableEncryption(state, p); sessionPass = p;
    $('#secMsg').textContent = 'Proteção ativada.'; $('#lockBadge').textContent = 'cripto 🔒';
  };
  $('#btnUnlock2').onclick = async () => { await disableEncryption(state); sessionPass = null; $('#secMsg').textContent = 'Proteção removida.'; $('#lockBadge').textContent = 'local'; };
  const dl = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const doJSON = () => dl(`alicia-backup-${currentMonthKey()}.json`, exportJSONString(state), 'application/json');
  const doMD = () => dl(`alicia-resumo-${currentMonthKey()}.md`, exportMarkdown(state, project(state)), 'text/markdown');
  $('#btnExport').onclick = doJSON; $('#btnJSON').onclick = doJSON; $('#btnMD').onclick = doMD;
  const doPrint = () => window.print();
  $('#btnPrint').onclick = doPrint; $('#btnPrint2').onclick = doPrint;
  $('#fileImp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { state = importJSONString(await f.text()); await persist(); applyTheme(); render(); }
    catch { alert('Arquivo inválido.'); }
  };
  $('#btnWipe').onclick = async () => {
    if (!confirm('Apagar TODOS os dados locais?')) return;
    state = defaultState(); sessionPass = null;
    localStorage.removeItem('alicia.finance.v1'); localStorage.removeItem('alicia.finance.meta.v1');
    applyTheme(); render();
  };
}

function readForm() {
  const desc = $('#fDesc').value.trim(); if (!desc) return null;
  const valor = parseBR($('#fValor').value); if (valor <= 0) { alert('Informe um valor maior que zero.'); return null; }
  const rec = $('#fRec').checked;
  return {
    id: uid(), descricao: desc, valorCentavos: valor,
    tipo: $('#fTipo').value, categoria: $('#fCat').value,
    parcelas: rec ? 1 : Math.min(60, Math.max(1, Number($('#fParc').value) || 1)),
    inicio: $('#fInicio').value || currentMonthKey(),
    recorrente: rec, fim: rec ? ($('#fFim').value || null) : null,
  };
}

function hideSim() { $('#simBox').hidden = true; }
function showSim() {
  const c = readForm(); if (!c) return;
  c.id = 'sim'; c.descricao = c.descricao + ' (simulação)';
  const proj = simulate(state, c);
  const sum = summarize(proj);
  const box = $('#simBox'); box.hidden = false;
  box.innerHTML = `<strong>Se adicionar: ${formatBRL(c.recorrente ? c.valorCentavos : Math.round(c.valorCentavos / Math.max(1, c.parcelas)))}/mês.</strong><br>` +
    `<span class="muted">Mês mais pesado passa a ser ${sum.maisPesado.labelLong} (${formatBRL(sum.maisPesado.comprometido)}). ` +
    `Dinheiro comprometido até ${sum.ultimoComCompromisso || '—'}. Total futuro: ${formatBRL(sum.totalFuturo)}.</span>`;
}

// ---------- render ----------
function render() {
  const proj = project(state);
  const sum = summarize(proj);
  const cur = proj[0];
  $('#homeMonth').textContent = formatMonthLong(cur.month);
  const kpi = (t, v, cls = '') => `<div class="kpi ${cls}"><small>${t}</small><strong>${formatBRL(v)}</strong></div>`;
  $('#kpis').innerHTML =
    kpi('Receita', cur.receita) + kpi('Reservado', cur.guardar) +
    kpi('Comprometido', cur.comprometido, cur.comprometido > 0 ? 'neg' : '') +
    kpi('Disponível', cur.disponivel, cur.disponivel < 0 ? 'neg' : 'pos');

  const pct = cur.receita > 0 ? Math.round((cur.comprometido / cur.receita) * 100) : 0;
  $('#homeAlerts').innerHTML =
    `<p class="muted">${pct}% da receita comprometida · ` +
    `Mês mais pesado: <strong>${sum.maisPesado.label} (${formatBRL(sum.maisPesado.comprometido)})</strong> · ` +
    `Comprometido até: <strong>${sum.ultimoComCompromisso ? formatMonthLong(sum.ultimoComCompromisso) : '—'}</strong> · ` +
    `Total futuro: <strong>${formatBRL(sum.totalFuturo)}</strong></p>`;

  $('#faturas').innerHTML = proj.slice(0, 6).map((p) =>
    `<li><span>${p.labelLong}</span><strong>${formatBRL(p.cartao)}</strong></li>`).join('') || '<li>Nada no cartão. 🎉</li>';
  const lastCard = [...proj].reverse().find((p) => p.cartao > 0);
  $('#faturaFim').textContent = lastCard ? `Cartão comprometido até ${formatMonthLong(lastCard.month)}.` : '';

  const max = Math.max(1, ...proj.slice(0, 12).map((p) => p.comprometido));
  $('#bars').innerHTML = proj.slice(0, 12).map((p) =>
    `<div class="row between" style="font-size:13px"><span style="width:64px">${p.label}</span>` +
    `<div class="bar" style="flex:1"><i style="width:${Math.round((p.comprometido / max) * 100)}%"></i></div>` +
    `<strong style="width:86px;text-align:right">${formatBRL(p.comprometido)}</strong></div>`).join('');

  const occ = proj.flatMap((p) => p.itens.map((i) => ({ ...i, refMonth: p.month }))).slice(0, 12);
  $('#timeline').innerHTML = occ.map((o) =>
    `<li><span>${o.descricao} <span class="pill ${o.tipo}">${o.tipo}</span> ${o.parcela ? `<span class="muted">${o.parcela}/${o.deParcelas}</span>` : ''}<br><span class="muted">${o.categoria} · ${formatMonthLong(o.month)}</span></span><strong>${formatBRL(o.valorCentavos)}</strong></li>`).join('')
    || '<li class="muted">Nenhum compromisso futuro. Cadastre em “Novo”.</li>';

  // projeção mensal detalhada
  $('#proj').innerHTML = proj.map((p) => `
    <details ${p.month === cur.month ? 'open' : ''}>
      <summary>${p.labelLong} — ${formatBRL(p.comprometido)} <span class="muted">· disp. ${formatBRL(p.disponivel)}</span></summary>
      <p class="muted">Receita ${formatBRL(p.receita)} · Guardar ${formatBRL(p.guardar)} · Cartão ${formatBRL(p.cartao)} · Externo ${formatBRL(p.externo)} · ${p.receita ? Math.round(p.pct * 100) + '% comprometido' : 'sem receita'}</p>
      ${p.itens.length ? `<ul class="clean">` + p.itens.map((i) => `<li><span>${i.descricao} <span class="pill ${i.tipo}">${i.tipo}</span>${i.parcela ? ` <span class="muted">${i.parcela}/${i.deParcelas}</span>` : ''}</span><strong>${formatBRL(i.valorCentavos)}</strong></li>`).join('') + `</ul>` : '<p class="muted">Sem compromissos.</p>'}
    </details>`).join('');

  // lista com excluir
  const sorted = [...(state.commitments || [])].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  $('#lista').innerHTML = sorted.map((c) => {
    const per = c.recorrente ? `${formatBRL(c.valorCentavos)}/mês desde ${c.inicio}${c.fim ? ' até ' + c.fim : ''}`
      : c.parcelas > 1 ? `${formatBRL(c.valorCentavos)} em ${c.parcelas}x (${formatBRL(Math.round(c.valorCentavos / c.parcelas))}/mês)` : `${formatBRL(c.valorCentavos)} à vista`;
    return `<li><span><strong>${c.descricao}</strong> <span class="pill ${c.tipo}">${c.tipo}</span><br><span class="muted">${per} · ${c.categoria || ''}</span></span><button class="btn small danger" data-del="${c.id}">✕</button></li>`;
  }).join('') || '<li class="muted">Nenhum compromisso.</li>';
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    state.commitments = state.commitments.filter((c) => c.id !== b.dataset.del);
    await persist(); render();
  });

  $('#dataInfo').textContent = `${state.commitments.length} compromissos · ${Object.keys(state.incomes).length} meses com receita · armazenamento: LocalStorage${isEncrypted() ? ' (criptografado)' : ''}.`;
  // pré-preenche receita/guardar do mês selecionado
  const ref = $('#mRef').value;
  if (ref && document.activeElement !== $('#mRec') && document.activeElement !== $('#mGua')) {
    if (state.incomes[ref]) $('#mRec').value = (state.incomes[ref] / 100).toLocaleString('pt-BR');
    if (state.savings[ref]) $('#mGua').value = (state.savings[ref] / 100).toLocaleString('pt-BR');
  }
}
$('#mRef')?.addEventListener('change', render);

boot();
