# ADR-001 — Estratégia: executar build publicada vs recuperar source original

**Status:** Aceito  
**Data:** 2026-06-08  
**Autores:** Matheus Queiroz (queirozds), contribuidores do repositório carazyrogue

---

## Contexto

O repositório `carazyrogue` perdeu acesso ao source TypeScript/JavaScript original (`src/`).
O que existe localmente é apenas a **build publicada** — um bundle Vite minificado
(`assets/index-DDI3sdiz.js`, ~1.6MB) junto com os assets do jogo (mapas Tiled, texturas,
áudio, fontes).

Não foram encontrados no histórico git local ou nos remotes conhecidos:

- `src/` (código fonte TypeScript/JavaScript)
- `package.json` original com dependências reais
- lockfile original
- `vite.config.*` original
- sourcemaps

Os remotes conhecidos são:
- `origin`: `https://github.com/matheusqueirozds/carazyrogue.git`
- `upstream`: `https://github.com/Galdino17/carazyrogue.git`

---

## Decisão

**Executamos a build publicada localmente como se fosse o ambiente de desenvolvimento,
sem modificar o bundle físico.**

A build é reescrita em tempo de resposta pelo servidor local (`serve-local.mjs`), que:
1. Substitui a origem de API de produção pela origem local (`window.location.origin`)
2. Restringe o Socket.IO a `polling` para funcionar sem WebSocket
3. Redireciona mapas com tilesets ausentes para um mapa hub seguro (`NewMapIni`)
4. Serve uma API mock completa (autenticação, save, mercado, arena, chat)

---

## Consequências

### Positivas
- O jogo é jogável localmente sem backend real
- Nenhuma modificação permanente no bundle publicado
- Rollback trivial: qualquer mudança no servidor local não afeta a build real
- Os assets (mapas, texturas, áudio) estão preservados e funcionais

### Negativas / Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Nova build publicada com diferentes padrões de bundle quebra as reescritas | Alta | Alto | `bundleSocketNeedle` e `rewriteIndexForLocal` precisam ser atualizados manualmente |
| Tilesets de mapas ausentes causam tela preta | Média | Alto | Validador de mapas + redirecionamento de mapas unsafe |
| Mock de API diverge do contrato real | Alta | Médio | Mock documentado como andaime — não validar comportamento de produção contra ele |
| Source permanece irrecuperável | — | Alto | Pressão para recuperar via backup, CI antigo ou autor original |

### Neutra — O que este ADR não cobre
- Qualquer refatoração de código de jogo (impossível sem source)
- Adição de features ao jogo
- Correção de bugs dentro do bundle

---

## Alternativas consideradas

### Alternativa 1: Deobfuscação do bundle
O bundle é minificado mas não obfuscado. Seria possível reformatar e renomear variáveis.
**Rejeitada** — trabalho de semanas, resultado frágil e sem chance de manutenção futura.

### Alternativa 2: Reescrever o jogo do zero
**Rejeitada** — fora do escopo; o objetivo é recuperar o estado existente.

### Alternativa 3: Usar a build diretamente do servidor de produção
**Rejeitada** — depende do backend real para todo fluxo, impossibilita desenvolvimento offline.

---

## Quando revisar este ADR

Este ADR deve ser revisado (e provavelmente substituído) quando:

1. O `src/` original for recuperado de qualquer fonte (máquina do autor, backup, CI antigo)
2. Uma nova build for publicada com estrutura de bundle substancialmente diferente
3. O servidor de produção mudar de domínio (atualizar `productionApiOrigin` em `serve-local.mjs`)

---

## Referências

- [`serve-local.mjs`](../serve-local.mjs) — servidor local e lógica de reescrita
- [`LOCAL_DEV_STABILIZATION.md`](../LOCAL_DEV_STABILIZATION.md) — mapas seguros e decisões de mock
- [`DEVELOPMENT_RECOVERY.md`](../DEVELOPMENT_RECOVERY.md) — histórico de tentativa de recuperação do source
- [`scripts/validate-assets.mjs`](../scripts/validate-assets.mjs) — validador de tilesets e assets
- [`scripts/smoke-test.mjs`](../scripts/smoke-test.mjs) — verificação de integridade do ambiente local
