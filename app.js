import { project, summarize, simulate, formatBRL, formatMonthLong, currentMonthKey, toCents, CATEGORIAS, installmentValues } from './finance.js';
import { loadState, saveState, defaultState, exportJSONString, importJSONString, exportMarkdown, enableEncryption, isEncrypted, uid, loadProfile, saveProfile, defaultProfile, makeToken, setRemember, getRemember, clearRemember, wipeAll, migrateKeys, hasStoredData, REMEMBER_OPTIONS } from './storage.js';

const $ = (s) => document.querySelector(s);
let state = defaultState();
let profile = null;
let sessionPass = null;
let migrationPass = null; // senha de dados legados (sem perfil) até concluir o cadastro

const THEMES = [
  ['rosa', '#ec4899'], ['vermelho', '#dc2626'], ['laranja', '#ea580c'], ['amarelo', '#a16207'],
  ['verde', '#16a34a'], ['esmeralda', '#059669'], ['ciano', '#0891b2'], ['azul', '#2563eb'],
  ['indigo', '#4f46e5'], ['roxo', '#7c3aed'], ['magenta', '#c026d3'], ['cinza', '#4b5563'],
];

function parseBR(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ---------- boot ----------
function showOnly(id) {
  for (const v of ['#setupView', '#lockView', '#appViews']) $(v).hidden = v !== '#' + id;
}

function applyProfileToLock() {
  const name = profile && profile.name ? profile.name : '';
  $('#lockHello').textContent = name ? `Olá, ${name} 👋` : 'Protegido por senha';
  const mins = profile?.rememberMinutes || 1440;
  const opt = REMEMBER_OPTIONS.find((o) => o.minutes === mins) || REMEMBER_OPTIONS[2];
  $('#rememberLabel').textContent = `Lembrar de mim (por ${opt.label})`;
}

async function boot() {
  bindAuth(); // botões de cadastro/login precisam funcionar ANTES do desbloqueio
  migrateKeys();
  profile = loadProfile();
  applyTheme();
  // 1) Lembrar de mim válido? entra direto.
  const remembered = getRemember();
  if (remembered && (profile || isEncrypted())) {
    try {
      const st = await loadState(remembered.password);
      if (!st.__needsPassword) {
        state = st; sessionPass = remembered.password;
        if (!profile) profile = { ...defaultProfile(), name: '', token: makeToken(), createdAt: new Date().toISOString() };
        applyTheme(); afterUnlock(); return;
      }
    } catch { clearRemember(); }
  }
  // 2) Sem perfil → cadastro (novo ou adotando dados legados).
  const raw = hasStoredData();
  const enc = isEncrypted();
  if (!profile && !raw) { startSetup(false); return; }
  if (!profile && raw && !enc) {
    try { state = await loadState(null); } catch { state = defaultState(); }
    startSetup(true); return; // dados legados sem senha: adota e protege
  }
  if (!profile && raw && enc) {
    // Legado criptografado sem perfil: pede a senha antiga uma vez.
    showOnly('lockView');
    $('#lockHello').textContent = 'Protegido por senha';
    return;
  }
  // 3) Perfil existe → login só com senha.
  if (enc) { applyProfileToLock(); showOnly('lockView'); return; }
  state = await loadState(null);
  afterUnlock();
}

// Cadastro único: nome + senha → gera token, criptografa, mostra token uma vez.
function startSetup(adopting) {
  showOnly('setupView');
  $('#setupHint').textContent = adopting
    ? 'Encontramos seus dados. Complete seu perfil para protegê-los com senha.'
    : 'Cadastro único: seu nome aparece no topo e a senha protege seus dados. Depois, a entrada pede só a senha.';
  $('#tokenBox').hidden = true;
  $('#btnSetup').hidden = false;
  $('#setupErr').textContent = '';
  // Se a senha já é conhecida (migração), cadastro pede só o nome.
  $('#setupPassFields').style.display = migrationPass ? 'none' : 'grid';
}

// ---------- auth (ligado no boot: funciona nas telas de cadastro e login) ----------
let authBound = false;
function bindAuth() {
  if (authBound) return; authBound = true;
  $('#btnSetup').onclick = doSetup;
  $('#btnTokenGo').onclick = () => { applyTheme(); afterUnlock(); };
  $('#btnUnlock').onclick = tryUnlock;
  $('#unlockPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  for (const id of ['#setupName', '#setupPass', '#setupPass2']) {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetup(); });
  }
}

async function doSetup() {
  const name = $('#setupName').value.trim();
  const p1 = $('#setupPass').value, p2 = $('#setupPass2').value;
  if (!name) { $('#setupErr').textContent = 'Informe seu nome.'; return; }
  if (migrationPass) {
    // Adotando dados legados já desbloqueados: só nome, mantém a senha atual.
    profile = { ...defaultProfile(), name, token: makeToken(), createdAt: new Date().toISOString() };
    saveProfile(profile); finishSetup(); return;
  }
  if (p1.length < 4) { $('#setupErr').textContent = 'A senha precisa de ao menos 4 caracteres.'; return; }
  if (p1 !== p2) { $('#setupErr').textContent = 'As senhas não conferem.'; return; }
  profile = { ...defaultProfile(), name, token: makeToken(), createdAt: new Date().toISOString() };
  saveProfile(profile);
  try {
    await enableEncryption(state, p1);
  } catch {
    $('#setupErr').textContent = 'Este navegador bloqueou a criptografia. Use Chrome/Edge/Firefox atualizado.';
    return;
  }
  sessionPass = p1;
  $('#tokenValue').textContent = profile.token;
  $('#tokenBox').hidden = false;
  $('#btnSetup').hidden = true;
  $('#setupErr').textContent = '';
}

async function tryUnlock() {
  const p = $('#unlockPass').value;
  if (!p) { $('#unlockErr').textContent = 'Digite sua senha.'; return; }
  try {
    // Legado criptografado sem perfil: captura a senha e segue p/ cadastro do nome.
    if (!profile && isEncrypted()) {
      const st = await loadState(p);
      if (st.__needsPassword) throw new Error('bad');
      state = st; sessionPass = p; migrationPass = p;
      startSetup(true); return;
    }
    const st = await loadState(p);
    if (st.__needsPassword) throw new Error('bad');
    state = st; sessionPass = p;
    // Migra tema antigo (guardado no state) para o perfil.
    if (profile && !profile.migratedTheme && st.theme) {
      profile.theme = st.theme; profile.migratedTheme = true; saveProfile(profile);
    }
    if ($('#rememberMe').checked) setRemember(p, profile?.rememberMinutes || 1440);
    applyTheme(); afterUnlock();
  } catch { $('#unlockErr').textContent = 'Senha incorreta.'; }
}

function finishSetup() {
  applyTheme(); afterUnlock();
}

function afterUnlock() {
  showOnly('appViews');
  $('#lockBadge').textContent = isEncrypted() ? '🔒' : 'local';
  $('#helloName').textContent = profile?.name || 'Compasso';
  initStatic();
  render();
}

function lock() {
  sessionPass = null; migrationPass = null;
  clearRemember();
  $('#unlockPass').value = '';
  $('#rememberMe').checked = false;
  $('#unlockErr').textContent = '';
  applyProfileToLock();
  showOnly('lockView');
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
  // temas de fundo (swatches com a própria cor)
  $('#themes').innerHTML = '';
  for (const [t, color] of THEMES) {
    const b = document.createElement('button');
    b.textContent = t; b.setAttribute('aria-pressed', String((profile?.theme || 'azul') === t));
    b.style.background = color; b.style.color = '#fff'; b.style.borderColor = 'transparent';
    b.onclick = () => { profile.theme = t; saveProfile(profile); applyTheme(); initStaticThemes(); };
    b.dataset.themeBtn = t;
    $('#themes').appendChild(b);
  }
  // modo claro/escuro
  syncModeButtons();
  $('#modeLight').onclick = () => setMode('light');
  $('#modeDark').onclick = () => setMode('dark');
  // lembrar de mim: opções de duração
  $('#rememberMinutes').innerHTML = REMEMBER_OPTIONS.map((o) =>
    `<option value="${o.minutes}">${o.label}</option>`).join('');
  $('#rememberMinutes').value = String(profile?.rememberMinutes || 1440);
  $('#rememberMinutes').onchange = () => {
    profile.rememberMinutes = Number($('#rememberMinutes').value) || 1440;
    saveProfile(profile); applyProfileToLock();
    $('#secMsg').textContent = 'Preferência de "lembrar" atualizada.';
  };
  // perfil
  $('#setName').value = profile?.name || '';
  $('#setToken').textContent = profile?.token || '—';
  bindOnce();
}

function setMode(mode) {
  profile.mode = mode; saveProfile(profile); applyTheme(); syncModeButtons();
}
function syncModeButtons() {
  const dark = (profile?.mode || 'light') === 'dark';
  $('#modeLight').setAttribute('aria-pressed', String(!dark));
  $('#modeDark').setAttribute('aria-pressed', String(dark));
}

function initStaticThemes() {
  document.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', String(profile.theme === b.dataset.themeBtn)));
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', profile?.theme || state.theme || 'azul');
  document.documentElement.setAttribute('data-mode', profile?.mode || 'light');
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
  $('#btnChangePass').onclick = async () => {
    const p1 = $('#secPass').value, p2 = $('#secPass2').value;
    if (p1.length < 4) { $('#secMsg').textContent = 'Use ao menos 4 caracteres.'; return; }
    if (p1 !== p2) { $('#secMsg').textContent = 'As senhas não conferem.'; return; }
    await enableEncryption(state, p1);
    sessionPass = p1;
    if (getRemember()) setRemember(p1, profile.rememberMinutes || 1440);
    $('#secPass').value = ''; $('#secPass2').value = '';
    $('#secMsg').textContent = 'Senha trocada.';
  };
  $('#btnSaveName').onclick = () => {
    const n = $('#setName').value.trim();
    if (!n) return;
    profile.name = n; saveProfile(profile);
    $('#helloName').textContent = n; applyProfileToLock();
    $('#secMsg').textContent = 'Nome atualizado.';
  };
  $('#btnCopyToken').onclick = async () => {
    try { await navigator.clipboard.writeText(profile.token); $('#secMsg').textContent = 'Token copiado.'; }
    catch { $('#secMsg').textContent = 'Token: ' + profile.token; }
  };
  $('#btnForget').onclick = () => { clearRemember(); $('#secMsg').textContent = 'Aparelho esquecido. Na próxima entrada a senha será pedida.'; };
  const doLock = () => lock();
  $('#btnLock2').onclick = doLock;
  $('#btnLockNow').onclick = doLock;
  const dl = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const doJSON = () => dl(`compasso-backup-${currentMonthKey()}.json`, exportJSONString(state), 'application/json');
  const doMD = () => dl(`compasso-resumo-${currentMonthKey()}.md`, exportMarkdown(state, project(state)), 'text/markdown');
  $('#btnExport').onclick = doJSON; $('#btnJSON').onclick = doJSON; $('#btnMD').onclick = doMD;
  const doPrint = () => window.print();
  $('#btnPrint').onclick = doPrint; $('#btnPrint2').onclick = doPrint;
  $('#fileImp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { state = importJSONString(await f.text()); await persist(); applyTheme(); render(); }
    catch { alert('Arquivo inválido.'); }
  };
  $('#btnWipe').onclick = async () => {
    if (!confirm('Apagar TODOS os dados locais (perfil + compromissos)?')) return;
    wipeAll();
    state = defaultState(); profile = null; sessionPass = null; migrationPass = null;
    startSetup(false);
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
  $('#helloName').textContent = profile?.name || 'Compasso';
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
    `<div class="row between" style="font-size:15px"><span style="width:70px">${p.label}</span>` +
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

window.__compassoBoot = true;
boot().catch((err) => {
  console.error(err);
  showOnly('setupView');
  $('#setupHint').textContent = 'Cadastro único: seu nome aparece no topo e a senha protege seus dados.';
  $('#setupErr').textContent = 'Falha ao abrir o armazenamento local. Libere o LocalStorage do navegador e recarregue.';
});
