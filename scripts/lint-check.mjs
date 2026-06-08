/**
 * lint-check.mjs
 *
 * Checker de qualidade de código leve para os arquivos .mjs do projeto.
 * Roda em Node puro, sem dependências npm.
 *
 * Verifica:
 *  - Uso de `var` (prefira `const` / `let`)
 *  - Uso de `eval(` (risco de segurança)
 *  - `console.log` em arquivos que não deveriam ter saída de debug
 *  - `debugger;` deixado no código
 *  - Linhas muito longas (>120 chars, aviso)
 *  - `TODO` / `FIXME` não endereçados (informativo)
 *
 * Run: node scripts/lint-check.mjs
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Files / directories to scan (relative to rootDir)
const SCAN_TARGETS = [
  "serve-local.mjs",
  "scripts/validate-assets.mjs",
  "scripts/dev-doctor.mjs",
  "scripts/build-placeholder.mjs",
  "scripts/check-env.mjs",
  "scripts/smoke-test.mjs",
  "scripts/lint-check.mjs",
];

// Rules: { id, level, test(line, lineIndex, lines, filePath) }
// level: "error" | "warn" | "info"
const RULES = [
  {
    id: "no-var",
    level: "error",
    description: "Uso de `var` — prefira `const` ou `let`",
    test: (line) => /\bvar\s+/.test(line),
  },
  {
    id: "no-eval",
    level: "error",
    description: "Uso de `eval(` — risco de segurança",
    // Match real eval() calls, not string literals or regex patterns describing eval
    test: (line) => {
      // Remove string literals to avoid false positives on descriptions / regexes
      const stripped = line.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '""').replace(/\/\/.*/g, "");
      return /\beval\s*\(/.test(stripped);
    },
  },
  {
    id: "no-debugger",
    level: "error",
    description: "Instrução `debugger` encontrada",
    test: (line) => /\bdebugger\s*;?$/.test(line.trim()),
  },
  {
    id: "no-console-log-in-lib",
    level: "warn",
    description:
      "`console.log` em serve-local.mjs (use `console.info` para saída permanente ou `console.warn`/`error` para diagnóstico)",
    // Only enforce this in the server module — all scripts/*.mjs files are CLIs that
    // intentionally use console.log for user-facing output.
    test: (line, _i, _lines, filePath) => {
      const base = path.basename(filePath);
      if (base !== "serve-local.mjs") return false;
      return /\bconsole\.log\s*\(/.test(line);
    },
  },
  {
    id: "line-too-long",
    level: "warn",
    description: "Linha com mais de 120 caracteres",
    test: (line) => line.length > 120,
  },
  {
    id: "todo-fixme",
    level: "info",
    description: "TODO / FIXME pendente",
    test: (line) => /\b(TODO|FIXME)\b/.test(line),
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

const findings = { error: [], warn: [], info: [] };

async function lintFile(filePath) {
  let source;

  try {
    source = await readFile(filePath, "utf8");
  } catch {
    findings.error.push({ file: filePath, line: 0, rule: "file-read", message: "Não foi possível ler o arquivo." });
    return;
  }

  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comment-only lines for most rules (but keep for todo-fixme)
    const trimmed = line.trim();
    const isFullComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");

    for (const rule of RULES) {
      if (rule.id !== "todo-fixme" && isFullComment) continue;

      if (rule.test(line, i, lines, filePath)) {
        const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
        findings[rule.level].push({
          file: rel,
          line: lineNum,
          rule: rule.id,
          message: rule.description,
          snippet: line.trim().slice(0, 80),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== lint-check ===\n");

  for (const target of SCAN_TARGETS) {
    const filePath = path.join(rootDir, target);
    await lintFile(filePath);
    console.log(`Verificado: ${target}`);
  }

  console.log("");

  let totalErrors = 0;
  let totalWarns = 0;
  let totalInfos = 0;

  for (const finding of findings.error) {
    console.error(`ERROR [${finding.rule}] ${finding.file}:${finding.line} — ${finding.message}`);
    if (finding.snippet) console.error(`      > ${finding.snippet}`);
    totalErrors++;
  }

  for (const finding of findings.warn) {
    console.warn(`WARN  [${finding.rule}] ${finding.file}:${finding.line} — ${finding.message}`);
    if (finding.snippet) console.warn(`      > ${finding.snippet}`);
    totalWarns++;
  }

  for (const finding of findings.info) {
    console.log(`INFO  [${finding.rule}] ${finding.file}:${finding.line} — ${finding.message}`);
    if (finding.snippet) console.log(`      > ${finding.snippet}`);
    totalInfos++;
  }

  console.log("");
  console.log(
    `Resultado: ${totalErrors} erro(s), ${totalWarns} aviso(s), ${totalInfos} info(s) em ${SCAN_TARGETS.length} arquivo(s).`,
  );

  if (totalErrors > 0) {
    console.log("\n❌ Lint falhou — corrija os erros antes de commitar.");
    process.exitCode = 1;
    return;
  }

  if (totalWarns > 0) {
    console.log("\n⚠️  Lint passou com avisos.");
    return;
  }

  console.log("\n✅ Lint passou sem erros ou avisos.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
