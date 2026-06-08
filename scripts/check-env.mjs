/**
 * check-env.mjs
 *
 * Validates that the environment variables used by serve-local.mjs are
 * consistent with each other and with what the published bundle expects.
 *
 * Run with: node scripts/check-env.mjs
 */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Origin hardcoded in the published build (keep in sync with serve-local.mjs)
const BUNDLE_HARDCODED_ORIGIN = "https://crazyrogue.duckdns.org";

const issues = [];
const oks = [];

// ---------------------------------------------------------------------------
// Load .env / .env.local files (same logic as serve-local.mjs)
// ---------------------------------------------------------------------------

async function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);

  try {
    await access(filePath);
  } catch {
    return false; // file does not exist — that's fine
  }

  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] != null) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkPort() {
  const raw = process.env.PORT;
  const port = raw ? Number(raw) : 5173;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push(`PORT inválida: '${raw}'. Deve ser um inteiro entre 1 e 65535.`);
  } else {
    oks.push(`PORT=${port}`);
  }
}

function checkHost() {
  const host = process.env.HOST || "127.0.0.1";

  if (!/^[a-zA-Z0-9._:-]+$/.test(host)) {
    issues.push(`HOST inválido: '${host}'.`);
  } else {
    oks.push(`HOST=${host}`);
  }
}

function checkBasePath() {
  const base = process.env.CARAZYROGUE_PUBLIC_BASE || "/carazyrogue/";

  if (!base.startsWith("/")) {
    issues.push(`CARAZYROGUE_PUBLIC_BASE deve começar com '/'. Valor atual: '${base}'`);
  } else if (!base.endsWith("/")) {
    issues.push(`CARAZYROGUE_PUBLIC_BASE deve terminar com '/'. Valor atual: '${base}'`);
  } else {
    oks.push(`CARAZYROGUE_PUBLIC_BASE=${base}`);
  }
}

function checkApiOrigin() {
  const apiOrigin = process.env.CARAZYROGUE_API_ORIGIN;

  if (!apiOrigin) {
    // Default will be the production origin — that's expected
    oks.push(`CARAZYROGUE_API_ORIGIN=(padrão: ${BUNDLE_HARDCODED_ORIGIN})`);
    return;
  }

  if (!apiOrigin.startsWith("http://") && !apiOrigin.startsWith("https://")) {
    issues.push(
      `CARAZYROGUE_API_ORIGIN deve começar com 'http://' ou 'https://'. Valor: '${apiOrigin}'`,
    );
    return;
  }

  if (apiOrigin !== BUNDLE_HARDCODED_ORIGIN) {
    // The serve-local.mjs will rewrite the bundle — this is intentional for staging, just warn
    oks.push(
      `CARAZYROGUE_API_ORIGIN=${apiOrigin} (difere do bundle: ${BUNDLE_HARDCODED_ORIGIN} — serve-local.mjs reescreverá o bundle)`,
    );
  } else {
    oks.push(`CARAZYROGUE_API_ORIGIN=${apiOrigin} (igual ao bundle)`);
  }
}

function checkSocketOrigin() {
  const apiOrigin = process.env.CARAZYROGUE_API_ORIGIN || BUNDLE_HARDCODED_ORIGIN;
  const socketOrigin = process.env.CARAZYROGUE_SOCKET_ORIGIN;

  if (!socketOrigin) {
    oks.push(`CARAZYROGUE_SOCKET_ORIGIN=(padrão: ${apiOrigin})`);
    return;
  }

  if (!socketOrigin.startsWith("http://") && !socketOrigin.startsWith("https://")) {
    issues.push(
      `CARAZYROGUE_SOCKET_ORIGIN deve começar com 'http://' ou 'https://'. Valor: '${socketOrigin}'`,
    );
    return;
  }

  oks.push(`CARAZYROGUE_SOCKET_ORIGIN=${socketOrigin}`);
}

function checkSocketMock() {
  const raw = process.env.CARAZYROGUE_LOCAL_SOCKET_MOCK;

  if (raw === undefined || raw === null) {
    oks.push("CARAZYROGUE_LOCAL_SOCKET_MOCK=(padrão: 1, mock ativo)");
    return;
  }

  if (raw !== "0" && raw !== "1") {
    issues.push(
      `CARAZYROGUE_LOCAL_SOCKET_MOCK deve ser '0' ou '1'. Valor atual: '${raw}'`,
    );
  } else {
    const active = raw !== "0";
    oks.push(`CARAZYROGUE_LOCAL_SOCKET_MOCK=${raw} (mock ${active ? "ativo" : "inativo — usando socket real"})`);

    if (!active) {
      const socketOrigin = process.env.CARAZYROGUE_SOCKET_ORIGIN ||
        process.env.CARAZYROGUE_API_ORIGIN ||
        BUNDLE_HARDCODED_ORIGIN;
      oks.push(
        `  → Atenção: Socket.IO conectará ao servidor real em ${socketOrigin}`,
      );
    }
  }
}

function checkMapConfig() {
  const hubMap = process.env.CARAZYROGUE_LOCAL_HUB_MAP || "NewMapIni";
  const firstMap = process.env.CARAZYROGUE_LOCAL_FIRST_MAP || hubMap;

  const safeMaps = new Set(["NewMapIni", "desert", "arena", "room1"]);
  const unsafeMaps = new Set(["tutorial", "mainMap", "fightMap", "map3", "map4", "mapIni"]);

  if (!safeMaps.has(hubMap)) {
    if (unsafeMaps.has(hubMap)) {
      issues.push(
        `CARAZYROGUE_LOCAL_HUB_MAP='${hubMap}' é um mapa com tileset ausente. Use um dos: ${[...safeMaps].join(", ")}.`,
      );
    } else {
      oks.push(`CARAZYROGUE_LOCAL_HUB_MAP=${hubMap} (mapa customizado — verifique se os tilesets estão carregados)`);
    }
  } else {
    oks.push(`CARAZYROGUE_LOCAL_HUB_MAP=${hubMap} (seguro ✓)`);
  }

  if (!safeMaps.has(firstMap) && !unsafeMaps.has(firstMap)) {
    oks.push(`CARAZYROGUE_LOCAL_FIRST_MAP=${firstMap} (mapa customizado)`);
  } else if (safeMaps.has(firstMap)) {
    oks.push(`CARAZYROGUE_LOCAL_FIRST_MAP=${firstMap} (seguro ✓)`);
  } else {
    issues.push(
      `CARAZYROGUE_LOCAL_FIRST_MAP='${firstMap}' é um mapa com tileset ausente. Isso causará tela preta na inicialização.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const loadedEnv = await loadEnvFile(".env");
  const loadedEnvLocal = await loadEnvFile(".env.local");

  console.log("\n=== check-env ===\n");

  if (loadedEnv) console.log("INFO : .env carregado");
  if (loadedEnvLocal) console.log("INFO : .env.local carregado");
  if (!loadedEnv && !loadedEnvLocal) {
    console.log("INFO : Nenhum .env encontrado — usando apenas variáveis de ambiente do sistema.");
  }

  console.log(`INFO : Origem hardcoded no bundle: ${BUNDLE_HARDCODED_ORIGIN}\n`);

  checkPort();
  checkHost();
  checkBasePath();
  checkApiOrigin();
  checkSocketOrigin();
  checkSocketMock();
  checkMapConfig();

  for (const ok of oks) {
    console.log(`OK   : ${ok}`);
  }

  if (issues.length > 0) {
    console.log("");
    for (const issue of issues) {
      console.error(`ISSUE: ${issue}`);
    }
    console.log(`\n❌ ${issues.length} problema(s) de configuração encontrado(s).`);
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Configuração de ambiente consistente.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
