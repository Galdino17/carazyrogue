import { access, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}

async function listBundles() {
  try {
    return (await readdir(path.join(rootDir, "assets"))).filter((file) => /^index-[A-Za-z0-9_-]+\.js$/.test(file));
  } catch {
    return [];
  }
}

async function main() {
  const checks = [
    ["package.json", await exists("package.json")],
    ["package-lock.json", await exists("package-lock.json")],
    ["vite.config.mjs", await exists("vite.config.mjs")],
    [".env.example", await exists(".env.example")],
    ["serve-local.mjs", await exists("serve-local.mjs")]
  ];

  for (const [name, ok] of checks) {
    console.log(`${ok ? "OK" : "MISSING"} ${name}`);
  }

  const bundles = await listBundles();
  console.log(`OK bundles encontrados: ${bundles.join(", ") || "nenhum"}`);

  const hasSrc = await exists("src");
  console.log(`${hasSrc ? "OK" : "BLOCKED"} src/ original ${hasSrc ? "presente" : "nao recuperado"}`);

  const remotes = git(["remote", "-v"]);
  if (remotes) {
    console.log("Remotes conhecidos:");
    console.log(remotes);
  }

  const sourceMatches = git([
    "log",
    "--branches",
    "--remotes",
    "--name-only",
    "--pretty=format:"
  ])
    .split(/\r?\n/)
    .filter((line) => /(^|\/)(package\.json|vite\.config|src\/)/.test(line));

  if (sourceMatches.length === 0) {
    console.log("BLOCKED nenhum package/vite/src encontrado no historico git local conhecido.");
  } else {
    console.log("Possiveis artefatos de source no historico:");
    console.log([...new Set(sourceMatches)].join("\n"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
