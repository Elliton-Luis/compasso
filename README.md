# Alicia — Projeção Financeira Pessoal

Camada pessoal de planejamento financeiro. Não substitui o app do banco: responde **"quanto do meu dinheiro já está comprometido agora e no futuro?"**

Entrada simples, análise poderosa: cadastre `descrição + valor + tipo + parcelas + início` e o sistema calcula parcelas, faturas, disponibilidade e projeções.

## Funcionalidades

- Receita e valor a guardar por mês (`disponível = receita − guardar − compromissos`)
- Compromissos no cartão (impactam faturas) e externos (projetados sem ir p/ fatura)
- Parcelados (`R$ 600 em 6x` gera 6 meses) e recorrentes mensais com fim opcional
- Projeção mensal futura, próximas faturas, linha temporal, mês mais pesado, último mês comprometido, % da receita, total futuro
- Simulação antes de salvar ("se eu assumir +R$ 200/mês?")
- 8 categorias simples, 12 temas de cor, mobile-first
- Backup: JSON (exportar/importar), Markdown legível, PDF via impressão
- Proteção opcional por senha (AES-GCM + PBKDF2 via Web Crypto; senha nunca armazenada)
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

## Dados

`localStorage` chave `alicia.finance.v1`: `{ incomes:{YYYY-MM:centavos}, savings:{...}, commitments:[{id,descricao,valorCentavos,tipo,categoria,parcelas,inicio,recorrente,fim}], theme }`. Valores derivados (parcela do mês, totais) são sempre calculados, nunca armazenados.

## Backup

Ajustes → Exportar JSON / Markdown / PDF. Restaurar via seletor de arquivo JSON.

## Segurança

Ajustes → Proteção por senha: cifra o JSON com AES-GCM (chave PBKDF2-SHA256, 120k iterações). Sem a senha os dados não abrem.

## Estrutura

- `index.html` — layout + 4 visões (Início, Novo, Meses, Ajustes)
- `styles.css` — mobile-first, 12 temas via `[data-theme]`, print p/ PDF
- `finance.js` — regras puras (parcelas, recorrência, projeção, resumo, simulação)
- `storage.js` — persistência, cripto, backup (JSON/Markdown)
- `app.js` — UI/orquestração
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA
- `test-finance.mjs` — testes Node das regras

<!-- Screenshot: dashboard -->
<!-- Screenshot: projecao-mensal -->
