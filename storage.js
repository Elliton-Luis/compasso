// storage.js — persistência local + perfil + criptografia (Web Crypto AES-GCM + PBKDF2) + backup.
const LS_KEY = 'alicia.finance.v1';
const LS_META = 'alicia.finance.meta.v1'; // { enc:bool }
const LS_PROFILE = 'alicia.profile.v1'; // { name, token, createdAt, theme, mode, rememberMinutes } (texto puro)
const LS_REMEMBER = 'alicia.remember.v1'; // { exp, p } — lembrar de mim (opt-in, com validade)

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password, saltBuf) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { saltB64: b64encode(salt.buffer), ivB64: b64encode(iv.buffer), ctB64: b64encode(ct) };
}

export async function decryptJSON(payload, password) {
  const key = await deriveKey(password, b64decode(payload.saltB64));
  const ct = b64decode(payload.ctB64);
  const iv = new Uint8Array(b64decode(payload.ivB64));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

export function defaultState() {
  return { incomes: {}, savings: {}, commitments: [], theme: 'azul', createdAt: new Date().toISOString() };
}

export function loadMeta() {
  try { return JSON.parse(localStorage.getItem(LS_META) || 'null'); } catch { return null; }
}

// loadState: se criptografado, exige password (retorna {needsPassword:true} sem ela).
export async function loadState(password) {
  const meta = loadMeta();
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return defaultState();
  if (meta && meta.enc) {
    if (!password) return { __needsPassword: true };
    const payload = JSON.parse(raw);
    return await decryptJSON(payload, password);
  }
  try { return { ...defaultState(), ...JSON.parse(raw) }; }
  catch { return defaultState(); }
}

export async function saveState(state, password) {
  const meta = loadMeta();
  if (meta && meta.enc) {
    if (!password) throw new Error('Senha necessária para salvar.');
    const payload = await encryptJSON(state, password);
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export async function enableEncryption(state, password) {
  const payload = await encryptJSON(state, password);
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  localStorage.setItem(LS_META, JSON.stringify({ enc: true }));
}

export function isEncrypted() {
  const meta = loadMeta();
  return !!(meta && meta.enc);
}

// ---- Perfil (nome exibido no topo + token de cadastro + preferências) ----
export const REMEMBER_OPTIONS = [
  { minutes: 60, label: '1 hora' },
  { minutes: 480, label: '8 horas' },
  { minutes: 1440, label: '1 dia' },
  { minutes: 10080, label: '7 dias' },
  { minutes: 43200, label: '30 dias' },
];

export function defaultProfile() {
  return { name: '', token: '', createdAt: '', theme: 'azul', mode: 'light', rememberMinutes: 1440 };
}

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PROFILE) || 'null');
    return p ? { ...defaultProfile(), ...p } : null;
  } catch { return null; }
}

export function saveProfile(profile) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
}

// Token de cadastro: gerado uma única vez, formato legível XXXX-XXXX.
export function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[bytes[i % bytes.length] % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

// ---- Lembrar de mim (opt-in: guarda a senha ofuscada com validade) ----
function b64strEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64strDecode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function setRemember(password, minutes) {
  const exp = Date.now() + Math.max(1, minutes) * 60 * 1000;
  localStorage.setItem(LS_REMEMBER, JSON.stringify({ exp, p: b64strEncode(password) }));
}

export function getRemember() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_REMEMBER) || 'null');
    if (!r || !r.exp || !r.p) return null;
    if (Date.now() > r.exp) { clearRemember(); return null; }
    return { password: b64strDecode(r.p), exp: r.exp };
  } catch { return null; }
}

export function clearRemember() {
  localStorage.removeItem(LS_REMEMBER);
}

export function wipeAll() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_META);
  localStorage.removeItem(LS_PROFILE);
  localStorage.removeItem(LS_REMEMBER);
}

// ---- Backup ----
export function exportJSONString(state) {
  return JSON.stringify({ app: 'projeto-alicia', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importJSONString(text) {
  const obj = JSON.parse(text);
  const data = obj.data || obj; // aceita arquivo cru ou envelope
  if (!data || typeof data !== 'object') throw new Error('Arquivo inválido.');
  const st = { ...defaultState(), ...data };
  if (!Array.isArray(st.commitments)) st.commitments = [];
  return st;
}

export function exportMarkdown(state, projection) {
  const lines = [];
  const fmt = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  lines.push('# Projeção Financeira Pessoal');
  lines.push('');
  lines.push(`_Exportado em ${new Date().toLocaleString('pt-BR')}_`);
  lines.push('');
  lines.push('## Projeção mensal');
  lines.push('');
  lines.push('| Mês | Receita | Guardar | Comprometido (cartão+externo) | Disponível | % comprometido |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of projection) {
    lines.push(`| ${p.labelLong} | ${fmt(p.receita)} | ${fmt(p.guardar)} | ${fmt(p.comprometido)} (${fmt(p.cartao)}+${fmt(p.externo)}) | ${fmt(p.disponivel)} | ${Math.round(p.pct * 100)}% |`);
  }
  lines.push('');
  lines.push('## Compromissos');
  lines.push('');
  for (const c of (state.commitments || [])) {
    const extra = c.recorrente ? `mensal desde ${c.inicio}${c.fim ? ` até ${c.fim}` : ''}` : `${c.parcelas || 1}x desde ${c.inicio}`;
    lines.push(`- **${c.descricao}** — ${fmt(c.valorCentavos)} — ${c.tipo} — ${c.categoria || 'Outros'} — ${extra}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9));
}
