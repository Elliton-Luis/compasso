# Compasso — Projeção Financeira Pessoal

Camada pessoal de planejamento financeiro. Não substitui o app do banco: responde **"quanto do meu dinheiro já está comprometido agora e no futuro?"**

Entrada simples, análise poderosa: cadastre `descrição + valor + tipo + parcelas + início` e o sistema calcula parcelas, faturas, disponibilidade e projeções.

## Funcionalidades

- Receita e valor a guardar por mês (`disponível = receita − guardar − compromissos`)
- Salário mensal fixo que preenche todos os meses (dá para ajustar um mês específico, ex.: 13º)
- Compromissos no cartão (impactam faturas) e externos (projetados sem ir p/ fatura)
- Parcelados (`R$ 600 em 6x` gera 6 meses) e recorrentes mensais com fim opcional
- Projeção mensal futura, próximas faturas, linha temporal, mês mais pesado, último mês comprometido, % da receita, total futuro
- Simulação antes de salvar ("se eu assumir +R$ 200/mês?") — mostra o disponível deste mês antes e depois
- 8 categorias simples, 12 temas de fundo, modo claro/escuro, mobile-first
- Perfil único (nome + senha + token de cadastro), login só com senha, lembrar de mim com prazo configurável
- Backup: JSON (exportar/importar), Markdown legível, PDF via impressão
- Criptografia sempre ativa (AES-GCM + PBKDF2 via Web Crypto; senha nunca armazenada)
- PWA offline (manifest + service worker)

## Tecnologias

HTML + CSS + JavaScript Vanilla (ES modules), LocalStorage, Web Crypto API. Sem framework, sem backend, sem dependências.

## Como executar

Opção 1 — direto: abra `index.html` no navegador (módulos ES podem exigir servidor local).

Opção 2 — servidor local (recomendado, necessário p/ PWA/service worker):

```bash
python3 -m http.server 5173
# abrir http://localhost:5173
```

Testes de regras financeiras:

```bash
node --test test-finance.mjs
```

## PWA

Com servidor local ou HTTPS: o navegador oferece "Instalar". Depois de instalado funciona offline (cache-first).

## Perfil

Cadastro único de nome + **senha** (a que você digita para entrar; o 👁️ mostra o que foi digitado). O app então gera um **código** diferente (ex.: `AB12-CD34`):

- **Senha** → abre o app. Só você sabe.
- **Código** → não abre nada; prova que o perfil é seu e é pedido para confirmar ações importantes (apagar tudo). Anote e guarde — ele está em Ajustes → Perfil, com botão copiar.

Depois do cadastro, a entrada pede só a senha (com 👁️ para conferir).

## Sessão (lembrar de mim)

Na tela de entrada, marque "Lembrar de mim" para dispensar a senha até o prazo expirar. Ajustes → Senha e sessão define o prazo (1h, 8h, 1 dia, 7 dias, 30 dias). "Esquecer este aparelho" ou "Bloquear agora" encerra na hora. Só use em aparelho pessoal: o lembrar guarda a senha ofuscada no aparelho até expirar.

## Aparência

Ajustes → Aparência: modo ☀️ Claro (fundo branco pastel) ou 🌙 Escuro (fundo azul escuro), + 12 temas que pintam o fundo do app (topo, base, botões e telas).

## Dados

`localStorage`:

- `compasso.finance.v1`: dados financeiros **sempre criptografados** (AES-GCM). Valores derivados (parcela do mês, totais) são calculados, nunca armazenados.
- `compasso.profile.v1`: perfil em texto puro (nome, token, tema, modo, prazo do lembrar) — necessário para mostrar o nome na tela de entrada.
- `compasso.remember.v1`: presente só com "lembrar" ativo; guarda a senha ofuscada com validade.
- Chaves antigas (`fluxo.*`, `alicia.*`) são migradas automaticamente na primeira abertura após a renomeação.

## Backup

Ajustes → Exportar JSON / Markdown / PDF. Restaurar via seletor de arquivo JSON.

## Segurança

Os dados financeiros são cifrados com AES-GCM (chave PBKDF2-SHA256, 120k iterações). Sem a senha não abrem. A senha nunca é armazenada — exceto com "lembrar de mim" ativo (ofuscada, com validade configurável).

## Estrutura

- `index.html` — layout + cadastro, entrada, 4 visões (Início, Novo, Meses, Ajustes)
- `styles.css` — mobile-first, 12 temas de fundo via `[data-theme]`, modo claro/escuro via `[data-mode]`, print p/ PDF
- `finance.js` — regras puras (parcelas, recorrência, projeção, resumo, simulação)
- `storage.js` — persistência, perfil, lembrar, cripto, backup (JSON/Markdown)
- `app.js` — UI/orquestração
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA
- `test-finance.mjs` — testes Node das regras

<!-- Screenshot: dashboard -->
<!-- Screenshot: projecao-mensal -->
