import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(rootDir, "assets");
const mapDir = path.join(assetsDir, "map");
const safeMaps = new Set(["NewMapIni", "desert", "arena", "room1"]);
const localFallbackMaps = new Set(["tutorial", "mainMap", "fightMap", "map3", "map4", "mapIni"]);

const errors = [];
const warnings = [];

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

function findPreloadedTextureKeys(bundleSource) {
  const keys = new Set();
  const pattern = /\{type:"(image|spritesheet|atlas)",key:"([^"]+)",path:"([^"]+)"/g;
  let match;

  while ((match = pattern.exec(bundleSource))) {
    keys.add(match[2]);
  }

  return keys;
}

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

  if (bundles.length !== 1) {
    errors.push(`Esperado exatamente 1 bundle index-*.js em assets/. Encontrados: ${bundles.join(", ") || "nenhum"}.`);
  }

  const bundleName = bundles[0];

  if (!bundleName) {
    return "";
  }

  return readFile(path.join(assetsDir, bundleName), "utf8");
}

async function validateBundleRefs(bundleSource) {
  const refs = findBundleAssetRefs(bundleSource);

  for (const ref of refs) {
    const filePath = path.join(rootDir, ref);

    if (!(await pathExists(filePath))) {
      errors.push(`Asset referenciado pelo bundle nao existe: ${ref}`);
    }
  }

  console.log(`Bundle: ${refs.length} referencias literais de asset verificadas.`);
}

async function validateMap(mapFile, textureKeys) {
  const mapName = path.basename(mapFile, ".json");
  const mapPath = path.join(mapDir, mapFile);
  const raw = await readFile(mapPath, "utf8");
  const map = JSON.parse(raw);
  const tilesets = Array.isArray(map.tilesets) ? map.tilesets : [];
  const isSafeMap = safeMaps.has(mapName);
  const isFallbackMap = localFallbackMaps.has(mapName);

  for (const tileset of tilesets) {
    const tilesetName = tileset.name || "";
    const source = tileset.image || tileset.source || "";
    const textureLoaded = tilesetName ? textureKeys.has(tilesetName) : false;
    const sourceExists = source ? await pathExists(path.join(mapDir, source)) : true;
    const label = `${mapFile}:${tilesetName || "(sem nome)"}`;

    if (isSafeMap && !textureLoaded) {
      errors.push(`${label} nao tem textura carregada pelo bundle.`);
    }

    if (isSafeMap && !sourceExists && !textureLoaded) {
      errors.push(`${label} referencia arquivo inexistente: ${source}`);
    }

    if (isSafeMap && !sourceExists && textureLoaded) {
      warnings.push(`${label} tem caminho de tileset nao portavel (${source}), mas a textura esta carregada.`);
    }

    if (isFallbackMap && (!textureLoaded || !sourceExists)) {
      warnings.push(`${label} continua inseguro e depende do fallback local para ${process.env.CARAZYROGUE_LOCAL_HUB_MAP || "NewMapIni"}.`);
    }
  }

  if (isSafeMap) {
    console.log(`Mapa seguro validado: ${mapName}`);
  }
}

async function validateMaps(bundleSource) {
  const textureKeys = findPreloadedTextureKeys(bundleSource);
  const files = (await readdir(mapDir)).filter((file) => file.endsWith(".json")).sort();

  for (const file of files) {
    await validateMap(file, textureKeys);
  }
}

async function main() {
  const files = await walkFiles(assetsDir);
  console.log(`Assets em disco: ${files.length}`);

  const bundleSource = await loadCurrentBundle();
  await validateBundleRefs(bundleSource);
  await validateMaps(bundleSource);

  for (const warning of warnings) {
    console.warn(`WARN: ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("Validacao de assets concluida sem erros bloqueantes.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
