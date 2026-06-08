import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(rootDir, "assets");
const mapDir = path.join(assetsDir, "map");

// Maps safe to use directly: tilesets must be loaded by the bundle.
const safeMaps = new Set(["NewMapIni", "desert", "arena", "room1"]);

// Maps redirected to the hub by serve-local.mjs; tileset issues are expected.
const localFallbackMaps = new Set(["tutorial", "mainMap", "fightMap", "map3", "map4", "mapIni"]);

const errors = [];
const warnings = [];
const infos = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Bundle analysis
// ---------------------------------------------------------------------------

/**
 * Finds all Phaser preload texture keys declared in the bundle.
 * Pattern matches: {type:"image",key:"foo",path:"..."} and similar.
 */
function findPreloadedTextureKeys(bundleSource) {
  const keys = new Set();
  const pattern = /\{type:"(image|spritesheet|atlas)",key:"([^"]+)",path:"([^"]+)"/g;
  let match;

  while ((match = pattern.exec(bundleSource))) {
    keys.add(match[2]);
  }

  return keys;
}

/**
 * Finds all literal asset paths referenced in the bundle source.
 */
function findBundleAssetRefs(bundleSource) {
  const refs = new Set();
  const pattern =
    /assets\/[A-Za-z0-9_./ ()-]+\.(?:png|jpg|jpeg|webp|ogg|wav|json|ttf|xml|svg|tmj|tsx)/g;
  let match;

  while ((match = pattern.exec(bundleSource))) {
    refs.add(match[0].trim());
  }

  return [...refs].sort();
}

async function loadCurrentBundle() {
  const files = await readdir(assetsDir);
  const bundles = files.filter((file) => /^index-[A-Za-z0-9_-]+\.js$/.test(file)).sort();

  if (bundles.length === 0) {
    errors.push("Nenhum bundle index-*.js encontrado em assets/.");
    return "";
  }

  if (bundles.length > 1) {
    errors.push(
      `Esperado exatamente 1 bundle index-*.js em assets/. Encontrados: ${bundles.join(", ")}.`,
    );
  }

  const bundleName = bundles[0];
  infos.push(`Bundle ativo: assets/${bundleName}`);
  return readFile(path.join(assetsDir, bundleName), "utf8");
}

// ---------------------------------------------------------------------------
// Bundle ref validation
// ---------------------------------------------------------------------------

async function validateBundleRefs(bundleSource) {
  if (!bundleSource) return;

  const refs = findBundleAssetRefs(bundleSource);
  let missing = 0;

  for (const ref of refs) {
    const filePath = path.join(rootDir, ref);

    if (!(await pathExists(filePath))) {
      errors.push(`Asset referenciado pelo bundle nao existe em disco: ${ref}`);
      missing++;
    }
  }

  infos.push(
    `Bundle: ${refs.length} referencias literais de asset verificadas, ${missing} ausentes.`,
  );
}

// ---------------------------------------------------------------------------
// Orphan asset detection
// ---------------------------------------------------------------------------

async function detectOrphanAssets(bundleSource, allFiles) {
  if (!bundleSource) return;

  const bundleRefs = new Set(findBundleAssetRefs(bundleSource));
  const orphans = [];

  for (const filePath of allFiles) {
    // Relative path from rootDir, normalised to forward slashes
    const rel = normalizePath(path.relative(rootDir, filePath));

    // Skip the bundle JS itself and non-asset files
    if (!rel.startsWith("assets/")) continue;
    if (/^assets\/index-[A-Za-z0-9_-]+\.js$/.test(rel)) continue;

    const ext = path.extname(filePath).toLowerCase();

    // Only check file types the bundle would realistically reference
    const trackableExts = new Set([
      ".png", ".jpg", ".jpeg", ".webp", ".ogg", ".wav",
      ".json", ".ttf", ".xml", ".svg", ".tmj", ".tsx",
    ]);

    if (!trackableExts.has(ext)) continue;

    if (!bundleRefs.has(rel)) {
      orphans.push(rel);
    }
  }

  if (orphans.length > 0) {
    infos.push(`Assets provavelmente nao referenciados pelo bundle (${orphans.length}):`);
    for (const orphan of orphans) {
      infos.push(`  ORPHAN  ${orphan}`);
    }
  } else {
    infos.push("Nenhum asset ortao detectado.");
  }
}

// ---------------------------------------------------------------------------
// Map validation
// ---------------------------------------------------------------------------

/**
 * Categorises a map file name (without extension) into one of:
 * "safe" | "fallback" | "unknown"
 */
function classifyMap(mapName) {
  if (safeMaps.has(mapName)) return "safe";
  if (localFallbackMaps.has(mapName)) return "fallback";
  return "unknown";
}

async function validateMap(mapFile, textureKeys) {
  const ext = path.extname(mapFile).toLowerCase();
  const mapName = path.basename(mapFile, ext);
  const mapPath = path.join(mapDir, mapFile);

  let raw;
  try {
    raw = await readFile(mapPath, "utf8");
  } catch {
    errors.push(`Nao foi possivel ler o arquivo de mapa: ${mapFile}`);
    return;
  }

  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    errors.push(`JSON invalido no mapa: ${mapFile}`);
    return;
  }

  // Standalone tileset files (type:"tileset") are not maps — validate separately
  if (map.type === "tileset") {
    await validateStandaloneTileset(mapName, mapFile, map);
    return;
  }

  const tilesets = Array.isArray(map.tilesets) ? map.tilesets : [];
  const category = classifyMap(mapName);

  if (tilesets.length === 0 && category === "safe") {
    warnings.push(`Mapa seguro sem tilesets: ${mapFile}`);
  }

  for (const tileset of tilesets) {
    await validateTilesetEntry(mapFile, mapName, tileset, textureKeys, category);
  }

  if (category === "safe") {
    infos.push(`Mapa seguro validado: ${mapName} (${tilesets.length} tileset(s))`);
  } else if (category === "fallback") {
    infos.push(`Mapa fallback (redirecionado pelo serve-local): ${mapName}`);
  } else {
    infos.push(`Mapa desconhecido validado: ${mapName}`);
  }
}

async function validateTilesetEntry(mapFile, mapName, tileset, textureKeys, category) {
  const tilesetName = tileset.name || "";
  const source = tileset.source || "";
  const imageRef = tileset.image || "";
  const label = `${mapFile}:tileset(${tilesetName || "(sem nome)"})`;

  // ---- 1. Nome vazio ---------------------------------------------------------
  if (!tilesetName) {
    if (category === "safe") {
      errors.push(`${label} — tileset sem 'name'. O Phaser nao conseguira referenciar a textura.`);
    } else {
      warnings.push(`${label} — tileset sem 'name'.`);
    }
  }

  // ---- 2. Textura carregada pelo bundle? ------------------------------------
  const textureLoaded = tilesetName ? textureKeys.has(tilesetName) : false;

  if (category === "safe" && tilesetName && !textureLoaded) {
    errors.push(
      `${label} — textura '${tilesetName}' nao e pre-carregada pelo bundle. Isso causa tela preta.`,
    );
  }

  if (category === "fallback" && !textureLoaded) {
    warnings.push(
      `${label} — textura '${tilesetName}' ausente (esperado; mapa e redirecionado para o hub).`,
    );
  }

  // ---- 3. Source externo (.tsx / .tsj) -------------------------------------
  if (source) {
    const sourcePath = path.join(mapDir, source);
    const sourceExists = await pathExists(sourcePath);

    if (!sourceExists) {
      if (category === "safe") {
        errors.push(`${label} — arquivo de tileset externo nao encontrado: ${source}`);
      } else {
        warnings.push(`${label} — arquivo de tileset externo ausente: ${source}`);
      }
    } else if (category === "safe" && !textureLoaded) {
      // Source existe mas textura nao esta carregada
      warnings.push(
        `${label} — source '${source}' encontrado, mas textura nao pre-carregada pelo bundle.`,
      );
    }
  }

  // ---- 4. Imagem inline (caminho portatil?) ---------------------------------
  if (imageRef && !source) {
    const imagePath = path.join(mapDir, imageRef);
    const imageExists = await pathExists(imagePath);

    if (!imageExists && category === "safe" && !textureLoaded) {
      errors.push(`${label} — imagem de tileset nao encontrada: ${imageRef}`);
    }

    if (!imageExists && category === "safe" && textureLoaded) {
      warnings.push(
        `${label} — caminho de tileset nao portatil ('${imageRef}'), mas textura esta carregada pelo bundle.`,
      );
    }
  }
}

async function validateStandaloneTileset(name, file, tileset) {
  const imageRef = tileset.image || "";
  const label = `${file}(tileset standalone)`;

  if (!imageRef) {
    warnings.push(`${label} — sem campo 'image'.`);
    return;
  }

  const imagePath = path.join(mapDir, imageRef);
  const imageExists = await pathExists(imagePath);

  if (!imageExists) {
    warnings.push(`${label} — imagem referenciada nao existe: ${imageRef}`);
  } else {
    infos.push(`Tileset standalone ok: ${file} -> ${imageRef}`);
  }
}

async function validateMaps(bundleSource) {
  const textureKeys = findPreloadedTextureKeys(bundleSource);
  infos.push(`Bundle: ${textureKeys.size} chave(s) de textura pre-carregada(s) encontradas.`);

  // Include both .json and .tmj map files
  const files = (await readdir(mapDir))
    .filter((file) => file.endsWith(".json") || file.endsWith(".tmj"))
    .sort();

  for (const file of files) {
    await validateMap(file, textureKeys);
  }

  infos.push(`Total de mapas verificados: ${files.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allFiles = await walkFiles(assetsDir);
  infos.push(`Assets em disco: ${allFiles.length} arquivo(s)`);

  const bundleSource = await loadCurrentBundle();

  await validateBundleRefs(bundleSource);
  await validateMaps(bundleSource);
  await detectOrphanAssets(bundleSource, allFiles);

  // Print summary
  console.log("\n=== validate-assets ===\n");

  for (const info of infos) {
    console.log(`INFO : ${info}`);
  }

  if (warnings.length > 0) {
    console.log("");
    for (const warning of warnings) {
      console.warn(`WARN : ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.log("");
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }

    console.log(`\n❌ ${errors.length} erro(s) bloqueante(s). Corrija antes de publicar.`);
    process.exitCode = 1;
    return;
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} aviso(s). Nao bloqueante(s), mas devem ser revisados.`);
  } else {
    console.log("\n✅ Validacao de assets concluida sem erros ou avisos.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
