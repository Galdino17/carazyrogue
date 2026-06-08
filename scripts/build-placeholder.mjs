console.error("Build bloqueado: o source original em src/ ainda nao foi recuperado.");
console.error("Use `npm run dev` para rodar a build publicada estabilizada localmente.");
console.error("Recupere o repositorio fonte real antes de gerar uma nova build de producao.");
process.exitCode = 1;
