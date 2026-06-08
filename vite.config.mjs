const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5173);
const base = normalizeBasePath(process.env.CARAZYROGUE_PUBLIC_BASE || "/carazyrogue/");

function normalizeBasePath(basePath) {
  const trimmed = String(basePath || "/carazyrogue/").trim();
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default {
  base,
  server: {
    host,
    port,
    strictPort: false
  },
  preview: {
    host,
    port,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: "index.html"
    }
  }
};
