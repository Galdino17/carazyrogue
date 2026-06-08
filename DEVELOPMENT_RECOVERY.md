# Recuperacao do ambiente de desenvolvimento

## Estado confirmado

O repositorio local e os remotes conhecidos foram verificados:

- `origin`: `https://github.com/matheusqueirozds/carazyrogue.git`
- `upstream`: `https://github.com/Galdino17/carazyrogue.git`

Branches remotas verificadas:

- `origin/main`
- `origin/updates-queiroz`
- `upstream/main`

Nao foi encontrado no historico conhecido:

- `src/`
- `package.json`
- lockfile original
- `vite.config.*`
- sourcemaps
- configuracao original de lint/testes

Conclusao: o source real ainda nao foi recuperado. O que existe neste repositorio e uma build publicada estabilizada para uso local.

## O que foi recuperado nesta fase

Foi criado um scaffold minimo de desenvolvimento para tornar o estado atual reprodutivel:

- `package.json`
- `package-lock.json`
- `vite.config.mjs`
- `.env.example`
- `.gitignore`
- `scripts/validate-assets.mjs`
- `scripts/dev-doctor.mjs`
- `scripts/build-placeholder.mjs`

Esse scaffold permite rodar e validar a build publicada localmente, mas nao substitui o projeto fonte original.

## Comandos

```bash
npm run dev
npm run check
npm run validate:assets
npm run doctor
```

`npm run build` falha intencionalmente enquanto `src/` nao for recuperado. Isso evita publicar uma nova build como se ela tivesse sido gerada a partir de source mantivel.

## Configuracao local

Copie `.env.example` para `.env.local` se precisar customizar porta, host, base path, backend ou mock Socket.IO.

Variaveis principais:

- `HOST`
- `PORT`
- `CARAZYROGUE_PUBLIC_BASE`
- `CARAZYROGUE_API_ORIGIN`
- `CARAZYROGUE_SOCKET_ORIGIN`
- `CARAZYROGUE_LOCAL_FIRST_MAP`
- `CARAZYROGUE_LOCAL_HUB_MAP`
- `CARAZYROGUE_LOCAL_SOCKET_MOCK`

## Proximo passo real

Para transformar isto em um projeto de desenvolvimento sustentavel, ainda e necessario recuperar o source por uma fonte externa ao historico git conhecido:

- maquina do autor original
- backup local
- artifact antigo de CI/deploy
- outro repositorio privado
- sourcemaps de deploy antigo

Depois que o source for recuperado, o scaffold atual deve ser usado como referencia de configuracao local, nao como substituto da arquitetura real do jogo.
