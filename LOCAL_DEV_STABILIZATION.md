# Estabilizacao local da build publicada

Este projeto ainda esta trabalhando sobre uma build publicada, nao sobre o source original. As correcoes desta fase existem para permitir desenvolvimento local minimo sem depender do backend real para todo fluxo e sem carregar mapas com tilesets ausentes.

## Mapas seguros no ambiente local

Os mapas considerados seguros para carregar diretamente nesta build sao:

- `NewMapIni`
- `desert`
- `arena`
- `room1`

Esses mapas usam texturas carregadas pelo bundle atual, principalmente `New_objs`, `terrain` e `desertObjs`.

## Mapas redirecionados pelo servidor local

O `serve-local.mjs` redireciona os mapas abaixo para `NewMapIni.json` quando eles sao solicitados no ambiente local:

- `tutorial`
- `mainMap`
- `map` / `map3`
- `mapCity` / `map4`
- `mapIni`
- `fightMap`

Motivo: os JSONs desses mapas referenciam tilesets que nao existem ou nao sao carregados pelo bundle atual, como `Tutorial`, `mainMapa`, `map3I1`, `map3I2`, `Mapa4`, `mapIni1`, `mapIni2`, `mapIni3`, `mapIni4` e `objs`.

Este redirecionamento e um fallback local. Ele nao substitui a recuperacao dos tilesets originais.

## Save local inicial

O save padrao do mock agora inicia em `NewMapIni`, nao em `tutorial`.

Isso evita que uma sessao local nova abra direto em um mapa com tileset ausente.

## Socket.IO local

O bundle publicado conecta Socket.IO diretamente em `https://crazyrogue.duckdns.org`. Como isso prende chat, perfil e notificacoes ao backend real, o `serve-local.mjs` reescreve o bundle apenas em tempo de resposta local:

- `const Yr="https://crazyrogue.duckdns.org";` vira `const Yr=window.location.origin;`
- a conexao Socket.IO fica restrita a `polling`

O servidor local implementa um mock minimo em `/socket.io/` para:

- handshake Engine.IO/Socket.IO por polling
- evento `player:profile`
- evento `hall:hydrate`
- `load_inbox`
- `open_private_chat`
- `load_private_history`
- eco basico para `chat_global` e `chat_private`

Esse mock e um andaime de desenvolvimento. Ele nao valida multiplayer real, sincronizacao de players, sala real, autenticacao real ou persistencia de chat.

## O que ainda precisa ser recuperado

Para corrigir de forma definitiva, ainda e necessario recuperar:

- source original em `src/`
- `package.json` e lockfile
- `vite.config.*`
- tilesets originais ausentes
- contrato real de Socket.IO
- pipeline de validacao de mapas antes do build

Qualquer alteracao direta no bundle continua sendo trabalho descartavel na proxima build real. Nesta fase, o bundle fisico nao foi editado; a reescrita acontece apenas enquanto o servidor local entrega o arquivo.

## Assets com situacao conhecida

Os arquivos abaixo foram analisados e tem status documentado:

### Orfaos provaveis (nao referenciados pelo bundle)

| Arquivo | Situacao |
|---|---|
| `assets/map/map2.json` | Tileset standalone (type:"tileset"), nao e um mapa Phaser. Pode ser orfao. |
| `assets/map/map2.tsx` | Tileset XML externo. Referencia `map2.jpg` que NAO existe em disco — link quebrado. |
| `assets/map/desert.tmj` | Formato .tmj (Tiled JSON). Pode ser variante do `desert.json`. Verificar duplicata. |
| `vite.svg` | Favicon do scaffold Vite. Referenciado no index.html como favicon — manter. |

### Duplicatas suspeitas

| Arquivos | Situacao |
|---|---|
| `assets/images/fundoPersonagem.jpg` (37KB) e `fundoPersonagem.png` (1.1MB) | Mesma imagem em dois formatos. O bundle so usa um deles. O .png e 30x maior; remover quando o source confirmar qual e o correto. |

### Assets verificados como necessarios

Todos os outros arquivos em `assets/images/`, `assets/audio/`, `assets/fonts/` e `assets/ui/` sao referenciados diretamente pelo bundle ou pelos mapas seguros.

Use `node scripts/validate-assets.mjs` para gerar a lista atualizada de orfaos.

## Scripts de qualidade (Fase 3)

Alem do servidor local, os seguintes scripts foram adicionados:

| Comando | O que faz |
|---|---|
| `node scripts/validate-assets.mjs` | Valida tilesets de todos os mapas e detecta assets orfaos |
| `node scripts/smoke-test.mjs` | Testa index, API mock, mapa inicial, redirect e Socket.IO |
| `node scripts/check-env.mjs` | Valida variaveis de ambiente contra o bundle |
| `node scripts/lint-check.mjs` | Checker de qualidade de codigo (sem deps npm) |

### Configs de estilo (referencia)

- `.eslintrc.json` — regras ESLint para quando ESLint for instalado pos-recuperacao do source
- `.prettierrc.json` — preferencias de formatacao do projeto
