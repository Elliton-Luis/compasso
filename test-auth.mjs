// Harness: simula o DOM mínimo e testa o compasso cadastro → token → login.
function makeEl() {
  const classes = new Set();
  return {
    hidden: true, value: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, onclick: null, onchange: null, onsubmit: null,
    files: [], checked: false,
    setAttribute() {}, addEventListener(_ev, fn) { this._fn = fn; },
    appendChild() {}, click() { if (this.onclick) this.onclick(); },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, f) => (f ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
}
const registry = new Map();
function el(sel) {
  if (!registry.has(sel)) registry.set(sel, makeEl());
  return registry.get(sel);
}

globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();
globalThis.document = {
  querySelector: (s) => el(s),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  documentElement: makeEl(),
  body: makeEl(),
  activeElement: null,
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#2563eb' });
globalThis.window = globalThis;
globalThis.alert = () => {};
globalThis.confirm = () => false;

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!cond) failures++;
}

await import('./app.js');
await tick(200);

// 1) Abertura limpa → tela de CADASTRO visível, login oculto
check('setup visível na 1ª abertura', el('#setupView').hidden === false);
check('login oculto na 1ª abertura', el('#lockView').hidden === true);
check('app oculto na 1ª abertura', el('#appViews').hidden === true);
check('navegação isolada no cadastro', document.body.classList.contains('locked'));

// 2) O botão Criar perfil TEM função (era o defeito)
check('btnSetup tem handler ligado no boot', typeof el('#btnSetup').onclick === 'function');
check('btnUnlock tem handler ligado no boot', typeof el('#btnUnlock').onclick === 'function');

// 3) Validações do cadastro
el('#setupName').value = '';
el('#setupPass').value = '1234'; el('#setupPass2').value = '1234';
await el('#btnSetup').onclick();
check('cadastro exige nome', el('#setupErr').textContent !== '');
el('#setupName').value = 'Maria';
el('#setupPass').value = '12'; el('#setupPass2').value = '12';
await el('#btnSetup').onclick();
check('cadastro exige senha 4+', el('#setupErr').textContent !== '');
el('#setupPass').value = '1234'; el('#setupPass2').value = '4321';
await el('#btnSetup').onclick();
check('cadastro exige senhas iguais', el('#setupErr').textContent !== '');

// 4) Cadastro válido → token exibido uma vez
el('#setupPass').value = '1234'; el('#setupPass2').value = '1234';
await el('#btnSetup').onclick();
const prof = JSON.parse(localStorage.getItem('compasso.profile.v1'));
check('perfil salvo com nome', prof && prof.name === 'Maria');
check('token gerado', !!prof.token && prof.token.includes('-'));
check('token exibido', el('#tokenBox').hidden === false && el('#tokenValue').textContent === prof.token);
check('dados criptografados', !!JSON.parse(localStorage.getItem('compasso.meta.v1')).enc);

// 5) Começar → app abre com o nome no topo, telas de entrada somem
await el('#btnTokenGo').onclick();
check('app abre após cadastro', el('#appViews').hidden === false);
check('cadastro some após entrar', el('#setupView').hidden === true);
check('login some após entrar', el('#lockView').hidden === true);
check('navegação liberada após entrar', !document.body.classList.contains('locked'));
check('nome no topo', el('#helloName').textContent === 'Maria');
check('dashboard tem gráfico mensal', /<svg|Sem compromissos/.test(el('#chartMonths').innerHTML));
check('dashboard tem resumo', el('#summaryBox').innerHTML.includes('Mês mais pesado'));

// 6) Login: senha errada nega, certa entra (com lembrar de mim)
el('#unlockPass').value = 'errada';
await el('#btnUnlock').onclick();
check('senha errada mostra erro', el('#unlockErr').textContent !== '');
el('#unlockPass').value = '1234';
el('#rememberMe').checked = true;
await el('#btnUnlock').onclick();
check('senha certa entra', el('#appViews').hidden === false);
check('lembrar de mim gravado', !!localStorage.getItem('compasso.remember.v1'));

// 7) Senha vazia
el('#unlockPass').value = '';
await el('#btnUnlock').onclick();
check('senha vazia pede digitação', el('#unlockErr').textContent !== '');

if (failures) { console.error(failures + ' FALHA(S)'); process.exit(1); }
console.log('Fluxo cadastro/login OK');
