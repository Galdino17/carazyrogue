/**
 * smoke-test.mjs
 *
 * Smoke test de infraestrutura para o ambiente local de CarazyRogue.
 * Verifica que o servidor está respondendo corretamente em todos os
 * endpoints críticos que o jogo usa na inicialização.
 *
 * Pré-requisito: servidor rodando (node serve-local.mjs ou npm run dev)
 *
 * Run: node scripts/smoke-test.mjs
 *
 * Retorna exit code 0 se todos os testes passarem, 1 caso contrário.
 */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Load env config (mirrors serve-local.mjs loadEnvFile logic)
// ---------------------------------------------------------------------------

async function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);

  try {
    await access(filePath);
  } catch {
    return;
  }

  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;

    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();

    if (!key || process.env[key] != null) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

await loadEnvFile(".env");
await loadEnvFile(".env.local");

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const base = (() => {
  const raw = process.env.CARAZYROGUE_PUBLIC_BASE || "/carazyrogue/";
  const t = raw.trim();
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
})();

const origin = `http://${host}:${port}`;

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = [];
let passed = 0;
let failed = 0;

function pass(name, detail = "") {
  results.push({ status: "PASS", name, detail });
  passed++;
}

function fail(name, detail = "") {
  results.push({ status: "FAIL", name, detail });
  failed++;
}

// ---------------------------------------------------------------------------
// Fetch with timeout helper
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Individual smoke tests
// ---------------------------------------------------------------------------

/**
 * Test 1 — Server reachability
 * The index.html must respond with 200 and contain the bundle script tag.
 */
async function testIndexHtml() {
  const url = `${origin}${base}`;

  try {
    const res = await fetchWithTimeout(url);

    if (res.status !== 200) {
      fail("index.html reachable", `Status ${res.status} (esperado 200) em ${url}`);
      return;
    }

    const body = await res.text();

    if (!body.includes("<script") || !body.includes("/assets/index-")) {
      fail("index.html contém bundle script", "Tag <script> do bundle não encontrada no HTML");
      return;
    }

    if (!body.includes("apiOrigin")) {
      fail("index.html interceptor fetch presente", "Variável `apiOrigin` não encontrada no HTML");
      return;
    }

    pass("index.html reachable + bundle script presente");
  } catch (err) {
    if (err.name === "AbortError") {
      fail("index.html reachable", `Timeout após 5s em ${url}. O servidor está rodando?`);
    } else if (err.code === "ECONNREFUSED") {
      fail(
        "index.html reachable",
        `Conexão recusada em ${url}. Inicie o servidor com: node serve-local.mjs`,
      );
    } else {
      fail("index.html reachable", String(err));
    }
  }
}

/**
 * Test 2 — Mock API: GET /player
 * Must return { success: true, player: { player: { id, name, map } } }
 */
async function testApiPlayer() {
  const url = `${origin}/player`;

  try {
    const res = await fetchWithTimeout(url);

    if (res.status !== 200) {
      fail("GET /player", `Status ${res.status} (esperado 200)`);
      return;
    }

    const json = await res.json();

    if (!json.success) {
      fail("GET /player — success:true", `success=${json.success}`);
      return;
    }

    if (!json.player || typeof json.player !== "object") {
      fail("GET /player — player object", "Campo 'player' ausente ou inválido");
      return;
    }

    const p = json.player.player || json.player;

    if (!p.id || !p.name || !p.map) {
      fail("GET /player — campos obrigatórios", `id=${p.id}, name=${p.name}, map=${p.map}`);
      return;
    }

    pass(`GET /player — player '${p.name}' no mapa '${p.map}'`);
  } catch (err) {
    fail("GET /player", String(err));
  }
}

/**
 * Test 3 — Mapa inicial (NewMapIni.json)
 * Deve retornar um JSON válido com os campos tilesets e layers.
 */
async function testInitialMap() {
  const url = `${origin}${base}assets/map/NewMapIni.json`;

  try {
    const res = await fetchWithTimeout(url);

    if (res.status !== 200) {
      fail("GET NewMapIni.json", `Status ${res.status} (esperado 200) em ${url}`);
      return;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      fail("GET NewMapIni.json — JSON válido", "Resposta não é JSON válido");
      return;
    }

    if (!Array.isArray(json.tilesets) || json.tilesets.length === 0) {
      fail("GET NewMapIni.json — campo tilesets", "Array 'tilesets' ausente ou vazio");
      return;
    }

    if (!Array.isArray(json.layers) || json.layers.length === 0) {
      fail("GET NewMapIni.json — campo layers", "Array 'layers' ausente ou vazio");
      return;
    }

    pass(
      `GET NewMapIni.json — ${json.tilesets.length} tileset(s), ${json.layers.length} layer(s)`,
    );
  } catch (err) {
    fail("GET NewMapIni.json", String(err));
  }
}

/**
 * Test 4 — Mapa unsafe deve ser redirecionado para o hub
 * tutorial.json deve retornar os dados de NewMapIni.json (não os dados de tutorial).
 */
async function testUnsafeMapRedirect() {
  const url = `${origin}${base}assets/map/tutorial.json`;

  try {
    const res = await fetchWithTimeout(url);

    if (res.status !== 200) {
      fail("GET tutorial.json (redirect)", `Status ${res.status} (esperado 200)`);
      return;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      fail("GET tutorial.json (redirect) — JSON válido", "Resposta não é JSON válido");
      return;
    }

    // tutorial.json has ~600KB; NewMapIni.json has ~116KB.
    // We verify the redirect worked by checking the map is NOT the tutorial map.
    // Tutorial map has specific large layer count; NewMapIni has different tilesets.
    const tilesetNames = (json.tilesets || []).map((t) => t.name).filter(Boolean);
    const hasTutorialTileset = tilesetNames.some((n) =>
      /tutorial/i.test(n),
    );

    if (hasTutorialTileset) {
      fail(
        "GET tutorial.json (redirect)",
        "Mapa tutorial foi servido diretamente — o redirecionamento para o hub não está funcionando!",
      );
      return;
    }

    pass(`GET tutorial.json → redirecionado para hub (tilesets: ${tilesetNames.join(", ") || "(nenhum)"})`);
  } catch (err) {
    fail("GET tutorial.json (redirect)", String(err));
  }
}

/**
 * Test 5 — Socket.IO handshake (Engine.IO open packet)
 * GET /socket.io/?EIO=4&transport=polling deve retornar o pacote de abertura.
 */
async function testSocketHandshake() {
  const url = `${origin}/socket.io/?EIO=4&transport=polling`;

  try {
    const res = await fetchWithTimeout(url);

    if (res.status !== 200) {
      fail("Socket.IO handshake GET", `Status ${res.status} (esperado 200) em ${url}`);
      return;
    }

    const text = await res.text();

    // Engine.IO open packet starts with "0{" followed by JSON
    if (!text.startsWith("0{") && !text.startsWith("0 {")) {
      fail(
        "Socket.IO handshake — pacote '0{...}'",
        `Resposta inesperada: ${text.slice(0, 60)}`,
      );
      return;
    }

    let handshake;
    try {
      handshake = JSON.parse(text.slice(1));
    } catch {
      fail("Socket.IO handshake — JSON do pacote", `Não foi possível parsear: ${text.slice(0, 60)}`);
      return;
    }

    if (!handshake.sid) {
      fail("Socket.IO handshake — campo 'sid'", "Campo 'sid' ausente no pacote de abertura");
      return;
    }

    pass(`Socket.IO handshake — sid=${handshake.sid}`);

    // Test 5b: POST connect packet and verify player:profile event is queued
    await testSocketConnect(handshake.sid);
  } catch (err) {
    fail("Socket.IO handshake GET", String(err));
  }
}

async function testSocketConnect(sid) {
  const postUrl = `${origin}/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(sid)}`;

  try {
    // Send Socket.IO connect packet: "40" with auth
    const postRes = await fetchWithTimeout(postUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: `40${JSON.stringify({ auth: { playerId: "smoke-test-player" } })}`,
    });

    if (postRes.status !== 200) {
      fail("Socket.IO connect POST", `Status ${postRes.status} (esperado 200)`);
      return;
    }

    // Poll for queued events
    const pollRes = await fetchWithTimeout(postUrl);

    if (pollRes.status !== 200) {
      fail("Socket.IO poll após connect", `Status ${pollRes.status} (esperado 200)`);
      return;
    }

    const pollText = await pollRes.text();

    if (pollText === "6") {
      fail("Socket.IO poll após connect — eventos", "Fila vazia (heartbeat '6') — player:profile não enfileirado");
      return;
    }

    const hasProfileEvent = pollText.includes("player:profile");
    const hasHallEvent = pollText.includes("hall:hydrate");

    if (!hasProfileEvent) {
      fail("Socket.IO evento player:profile", `Eventos recebidos: ${pollText.slice(0, 80)}`);
      return;
    }

    pass(
      `Socket.IO connect+poll — player:profile${hasHallEvent ? " + hall:hydrate" : ""} enfileirados`,
    );
  } catch (err) {
    fail("Socket.IO connect POST", String(err));
  }
}

/**
 * Test 7 — Socket needle presente no bundle
 * O serve-local.mjs reescreve a conexão Socket.IO substituindo uma string
 * literal exata no bundle. Se o bundle mudar e essa string desaparecer,
 * o mock de Socket.IO silenciosamente para de funcionar.
 *
 * Este teste valida que a needle ainda existe ANTES de rodar o servidor.
 */
async function testSocketNeedle() {
  const { readdir } = await import("node:fs/promises");
  const assetsDir = path.join(rootDir, "assets");

  let bundlePath;
  try {
    const files = await readdir(assetsDir);
    const bundleName = files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
    if (!bundleName) {
      fail("Socket needle no bundle", "Nenhum arquivo index-*.js encontrado em assets/");
      return;
    }
    bundlePath = path.join(assetsDir, bundleName);
  } catch {
    fail("Socket needle no bundle", "Não foi possível listar assets/");
    return;
  }

  // Must mirror the bundleSocketNeedle constant in serve-local.mjs exactly.
  // If this test fails after a new build, update bundleSocketNeedle in serve-local.mjs.
  const SOCKET_NEEDLE = "this.socket=re(m,{auth:{playerId:this.playerId}})";

  let source;
  try {
    source = await readFile(bundlePath, "utf8");
  } catch (err) {
    fail("Socket needle no bundle", `Não foi possível ler o bundle: ${err}`);
    return;
  }

  if (!source.includes(SOCKET_NEEDLE)) {
    fail(
      "Socket needle no bundle",
      [
        "A needle exata não foi encontrada no bundle.",
        "Isso significa que uma nova build mudou o código de conexão Socket.IO.",
        "Atualize `bundleSocketNeedle` em serve-local.mjs para manter o mock funcionando.",
        `Needle esperada: ${SOCKET_NEEDLE}`,
      ].join(" "),
    );
    return;
  }

  pass("Socket needle presente no bundle — reescrita serve-local.mjs operacional");
}

/**
 * Test 6 — Bundle JS serve corretamente
 * O arquivo assets/index-*.js deve ser servido com Content-Type correto.
 */
async function testBundleServed() {
  // Find bundle name from disk
  let bundleName;
  try {
    const { readdir } = await import("node:fs/promises");
    const assetsDir = path.join(rootDir, "assets");
    const files = await readdir(assetsDir);
    bundleName = files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
  } catch {
    fail("Bundle JS servido", "Não foi possível listar assets/");
    return;
  }

  if (!bundleName) {
    fail("Bundle JS servido", "Nenhum arquivo index-*.js encontrado em assets/");
    return;
  }

  const url = `${origin}${base}assets/${bundleName}`;

  try {
    // Use HEAD or partial GET to avoid downloading 1.6MB
    const res = await fetchWithTimeout(url, {
      headers: { Range: "bytes=0-511" },
    });

    if (res.status !== 200 && res.status !== 206) {
      fail("Bundle JS servido", `Status ${res.status} (esperado 200 ou 206) em ${url}`);
      return;
    }

    const ct = res.headers.get("content-type") || "";

    if (!ct.includes("javascript")) {
      fail("Bundle JS Content-Type", `Content-Type='${ct}' (esperado text/javascript)`);
      return;
    }

    pass(`Bundle ${bundleName} servido com Content-Type '${ct.split(";")[0]}'`);
  } catch (err) {
    fail("Bundle JS servido", String(err));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== smoke-test ===\n`);
  console.log(`Servidor alvo: ${origin}`);
  console.log(`Base path: ${base}`);
  console.log("");

  await testSocketNeedle();
  await testIndexHtml();
  await testApiPlayer();
  await testInitialMap();
  await testUnsafeMapRedirect();
  await testSocketHandshake();
  await testBundleServed();

  console.log("");

  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`${icon} ${r.status.padEnd(4)} ${r.name}`);
    if (r.detail) {
      console.log(`       ${r.detail}`);
    }
  }

  console.log("");
  console.log(`Resultado: ${passed} passou, ${failed} falhou de ${results.length} teste(s).`);

  if (failed > 0) {
    console.log("\n❌ Smoke test falhou.");
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Todos os smoke tests passaram.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
