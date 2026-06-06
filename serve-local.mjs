import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(projectDir);
const localFirstMap = "tutorial";
const localHubMap = "NewMapIni";
const legacyHubMaps = new Set(["room1", "mainMap", "fightMap"]);

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ogg": "audio/ogg",
    ".ttf": "font/ttf",
};

const defaultSave = {
    player: {
        id: "local-player",
        name: "Local Player",
        level: 1,
        exp: 0,
        crystal: 500,
        gold: 1000,
        statsPoints: 10,
        expTotal: 0,
        map: localFirstMap,
    },
    inventory: {
        slots: Array(36).fill(null),
        size: 36,
    },
    uisOpeneds: {
        char: false,
        inventory: false,
        stats: false,
    },
    settings: {
        volume: 1,
        graphics: "high",
    },
    baseStats: {
        speed: 80,
        damage: 5,
        atkspd: 1,
        regen: 0,
        maxHealth: 80,
        attackRange: 70,
    },
    meta: {
        createdAt: Date.now(),
        version: 2.3,
        localMock: true,
    },
};

let localSave = structuredClone(defaultSave);

function normalizeLocalMap(map) {
    if (!map) {
        return localFirstMap;
    }

    return legacyHubMaps.has(map) ? localHubMap : map;
}

function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
    return true;
}

async function readJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        return {};
    }
}

async function handleApi(req, res, pathname) {
    if (pathname === "/auth/google") {
        return sendJson(res, { success: true, token: "local-dev-token" });
    }

    if (pathname === "/player") {
        return sendJson(res, { success: true, player: localSave });
    }

    if (pathname === "/player/save") {
        const body = await readJsonBody(req);

        if (body && typeof body === "object") {
            localSave = {
                ...structuredClone(defaultSave),
                ...body,
                player: {
                    ...defaultSave.player,
                    ...(body.player || {}),
                    map: normalizeLocalMap(body.player?.map),
                },
                inventory: {
                    ...defaultSave.inventory,
                    ...(body.inventory || {}),
                },
                uisOpeneds: {
                    ...defaultSave.uisOpeneds,
                    ...(body.uisOpeneds || {}),
                },
                settings: {
                    ...defaultSave.settings,
                    ...(body.settings || {}),
                },
                baseStats: {
                    ...defaultSave.baseStats,
                    ...(body.baseStats || {}),
                },
                meta: {
                    ...defaultSave.meta,
                    ...(body.meta || {}),
                    localMock: true,
                },
            };
        }

        return sendJson(res, { success: true });
    }

    if (pathname === "/arena/rooms") {
        return sendJson(res, { success: true, rooms: [] });
    }

    if (pathname === "/arena/challenge") {
        return sendJson(res, {
            success: false,
            reason: "Arena indisponivel no modo local.",
        });
    }

    if (pathname === "/arena/my-espolio") {
        return sendJson(res, { success: true, rewards: [], gold: 0, crystal: 0 });
    }

    if (pathname === "/arena/collect-rewards") {
        return sendJson(res, { success: true, collected: [] });
    }

    if (pathname === "/market/version") {
        return sendJson(res, { success: true, version: "local-dev" });
    }

    if (pathname === "/market/list") {
        return sendJson(res, { success: true, items: [] });
    }

    return false;
}

function resolveRequestPath(url) {
    const requestUrl = new URL(url, `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalizedPathname = pathname === "/" ? "/carazyrogue/" : pathname;
    const filePath = path.normalize(path.join(rootDir, normalizedPathname));

    if (!filePath.startsWith(rootDir)) {
        return null;
    }

    return filePath;
}

const server = createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

        if (await handleApi(req, res, requestUrl.pathname)) {
            return;
        }

        let filePath = resolveRequestPath(req.url || "/");

        if (!filePath) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        if (
            [...legacyHubMaps].some((map) =>
                filePath.endsWith(path.join("assets", "map", `${map}.json`)),
            )
        ) {
            filePath = path.join(projectDir, "assets", "map", "NewMapIni.json");
        }

        const fileStat = await stat(filePath);

        if (fileStat.isDirectory()) {
            filePath = path.join(filePath, "index.html");
        }

        const body = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();

        res.writeHead(200, {
            "Content-Type": contentTypes[ext] || "application/octet-stream",
            "Cache-Control": "no-store",
        });
        res.end(body);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
    }
});

server.listen(port, host, () => {
    console.log(`Open http://localhost:${port}/carazyrogue/`);
});
