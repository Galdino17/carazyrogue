import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(projectDir);
const localHubMap = "NewMapIni";
const localFirstMap = localHubMap;
const unsafeLocalMaps = new Set(["tutorial", "mainMap", "fightMap", "map", "map3", "mapCity", "map4", "mapIni"]);
const unsafeLocalMapFiles = new Set(["tutorial", "mainMap", "map3", "map4", "mapIni"]);
const bundleSocketNeedle = 'this.socket=re(m,{auth:{playerId:this.playerId}})';
const bundleSocketReplacement =
    'this.socket=re(m,{transports:["polling"],upgrade:!1,auth:{playerId:this.playerId}})';

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
    ".wav": "audio/wav",
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
let localMarketVersion = 1;

const localItemSnapshots = {
    potion_hp_p: {
        id: "potion_hp_p",
        uid: "mock-potion-hp-p",
        type: "consumable",
        name: "Pocao de vida pequena",
        rarity: "common",
        amountable: true,
        qty: 3,
        icon: { texture: "basicItems", frame: 0 },
        desc: ["Recupera uma pequena quantidade de vida."],
        atributes: {},
    },
    sword: {
        id: "sword",
        uid: "mock-sword",
        type: "equipment",
        slotType: "weapon_left",
        name: "Espada de treino",
        rarity: "rare",
        amountable: false,
        qty: 1,
        icon: { texture: "basicItems", frame: 1 },
        desc: ["Arma simples para validar compra local."],
        atributes: { damage: 8 },
    },
    shield: {
        id: "shield",
        uid: "mock-shield",
        type: "equipment",
        slotType: "shield",
        name: "Escudo de cobre",
        rarity: "common",
        amountable: false,
        qty: 1,
        icon: { texture: "basicItems", frame: 2 },
        desc: ["Defesa basica para testes de mercado."],
        atributes: { maxHealth: 12 },
    },
};

function clone(value) {
    return structuredClone(value);
}

function isoHoursFromNow(hours) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function makeMarketListing({
    listingId,
    itemId,
    priceGold = 0,
    priceCrystal = 0,
    sellerId = "local-merchant",
    sellerName = "Mercador Local",
    qty = null,
}) {
    const itemSnapshot = clone(localItemSnapshots[itemId]);

    if (qty != null) {
        itemSnapshot.qty = qty;
    }

    return {
        listingId,
        sellerId,
        sellerName,
        owner_player_id: sellerId,
        status: "ACTIVE",
        itemSnapshot,
        priceGold,
        priceCrystal,
        expiresAt: isoHoursFromNow(24),
        createdAt: new Date().toISOString(),
        renew: {
            gold: Math.max(10, Math.ceil(priceGold * 0.05)),
            crystal: Math.max(1, Math.ceil(priceCrystal * 0.05)),
        },
    };
}

let localMarketListings = [
    makeMarketListing({
        listingId: "local_listing_potion_hp_p",
        itemId: "potion_hp_p",
        qty: 3,
        priceGold: 75,
    }),
    makeMarketListing({
        listingId: "local_listing_training_sword",
        itemId: "sword",
        priceGold: 2500,
        sellerName: "Ferreiro Local",
    }),
    makeMarketListing({
        listingId: "local_listing_copper_shield",
        itemId: "shield",
        priceCrystal: 25,
        sellerName: "Escudeiro Local",
    }),
];

const localArenaRooms = [
    {
        room_id: "local_arena_trial",
        room_name: "Treino Local",
        name: "Guardiao Local",
        owner_player_id: "local-arena-bot",
        lvl_min: 1,
        lvl_max: 3,
        entry_requirements: [{ type: "gold", amount: 50 }],
        rewards: [
            { item: clone(localItemSnapshots.potion_hp_p), amount: 1 },
            { item: "gold", amount: 100 },
        ],
        snapshot: {
            name: "Guardiao Local",
            player: {
                level: 1,
                equipment: {},
            },
            level: 1,
            sp: 40,
            equipment: {},
            upgrades: {},
            pets: [],
        },
    },
    {
        room_id: "local_arena_expensive",
        room_name: "Desafio Caro",
        name: "Campeao Local",
        owner_player_id: "local-arena-champion",
        lvl_min: 1,
        lvl_max: 10,
        entry_requirements: [{ type: "gold", amount: 2000 }],
        rewards: [
            { item: clone(localItemSnapshots.sword), amount: 1 },
            { item: "gold", amount: 250 },
        ],
        snapshot: {
            name: "Campeao Local",
            player: {
                level: 5,
                equipment: {},
            },
            level: 5,
            sp: 80,
            equipment: {},
            upgrades: {
                vitality: { maxHealth: 2 },
                power: { damage: 2 },
            },
            pets: [],
        },
    },
];

let localArenaRewards = [
    {
        rewardId: "local_reward_seed",
        roomId: "local_arena_trial",
        items: [{ ...clone(localItemSnapshots.potion_hp_p), qty: 1 }],
        gold: 75,
        crystal: 3,
    },
];

function getPlayerCurrency(currency) {
    return Number(localSave?.player?.[currency] || 0);
}

function getArenaRoom(roomId) {
    return localArenaRooms.find((room) => room.room_id === roomId);
}

function checkArenaRequirements(room) {
    for (const requirement of room.entry_requirements || []) {
        if (
            requirement.type === "gold" &&
            getPlayerCurrency("gold") < Number(requirement.amount || 0)
        ) {
            return {
                ok: false,
                reason: `Gold insuficiente. Necessario: ${requirement.amount}.`,
            };
        }

        if (
            requirement.type === "crystal" &&
            getPlayerCurrency("crystal") < Number(requirement.amount || 0)
        ) {
            return {
                ok: false,
                reason: `Crystal insuficiente. Necessario: ${requirement.amount}.`,
            };
        }
    }

    return { ok: true };
}

function getListingId(pathname, prefix) {
    return decodeURIComponent(pathname.slice(prefix.length));
}

function parsePositiveInt(value, fallback, max = 100) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }

    return Math.min(parsed, max);
}

function paginate(items, page, limit) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * limit;

    return {
        page: safePage,
        limit,
        total,
        totalPages,
        items: items.slice(start, start + limit),
    };
}

function activeMarketListings() {
    const now = Date.now();

    return localMarketListings.filter(
        (listing) =>
            listing.status === "ACTIVE" &&
            (!listing.expiresAt || Date.parse(listing.expiresAt) > now),
    );
}

function bumpMarketVersion() {
    localMarketVersion += 1;
}

function getArenaRewardsTotal() {
    return localArenaRewards.reduce(
        (total, reward) => ({
            gold: total.gold + Number(reward.gold || 0),
            crystal: total.crystal + Number(reward.crystal || 0),
        }),
        { gold: 0, crystal: 0 },
    );
}

function normalizeLocalMap(map) {
    if (!map) {
        return localFirstMap;
    }

    return unsafeLocalMaps.has(map) ? localHubMap : map;
}

function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
    return true;
}

function sendText(res, body, status = 200, contentType = "text/plain; charset=utf-8") {
    res.writeHead(status, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
    });
    res.end(body);
    return true;
}

async function collectBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    return chunks;
}

async function readJsonBody(req) {
    const chunks = await collectBody(req);

    if (chunks.length === 0) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        return {};
    }
}

const socketSessions = new Map();
let socketSessionCounter = 0;

function makeSocketSession() {
    const session = {
        sid: `local-socket-${++socketSessionCounter}`,
        queue: [],
        playerId: localSave?.player?.id || "local-player",
    };

    socketSessions.set(session.sid, session);
    return session;
}

function queueSocketEvent(session, eventName, payload) {
    session.queue.push(`42${JSON.stringify([eventName, payload])}`);
}

function queueSocketConnect(session) {
    session.queue.push(`40${JSON.stringify({ sid: session.sid })}`);
    queueSocketEvent(session, "player:profile", {
        playerId: session.playerId,
        playerName: localSave?.player?.name || "Local Player",
    });
    queueSocketEvent(session, "hall:hydrate", {
        success: true,
        rooms: [],
    });
}

function parseSocketIoEvent(packet) {
    if (!packet.startsWith("42")) {
        return null;
    }

    try {
        const [eventName, payload] = JSON.parse(packet.slice(2));
        return { eventName, payload };
    } catch {
        return null;
    }
}

function handleSocketEvent(session, eventName, payload = {}) {
    if (eventName === "load_inbox") {
        queueSocketEvent(session, "inbox", {
            success: true,
            payload: [],
        });
        return;
    }

    if (eventName === "open_private_chat" || eventName === "load_private_history") {
        queueSocketEvent(session, "chat_history", {
            success: true,
            payload: [],
        });
        return;
    }

    if (eventName === "chat_global" || eventName === "chat_private") {
        const message = String(payload.message || "").slice(0, 500);

        queueSocketEvent(session, "chat_message", {
            success: true,
            payload: {
                id: `local-chat-${Date.now()}`,
                senderId: session.playerId,
                senderName: localSave?.player?.name || "Local Player",
                receiverName: payload.receiverName || payload.targetPlayerName || null,
                message,
                createdAt: new Date().toISOString(),
                localMock: true,
            },
        });
    }
}

async function handleSocketIo(req, res, requestUrl) {
    if (requestUrl.pathname !== "/socket.io/") {
        return false;
    }

    const transport = requestUrl.searchParams.get("transport");

    if (transport !== "polling") {
        return sendText(res, "unsupported transport", 400);
    }

    if (req.method === "GET") {
        const sid = requestUrl.searchParams.get("sid");

        if (!sid) {
            const session = makeSocketSession();
            const openPacket = {
                sid: session.sid,
                upgrades: [],
                pingInterval: 60000,
                pingTimeout: 20000,
                maxPayload: 1000000,
            };

            return sendText(res, `0${JSON.stringify(openPacket)}`);
        }

        const session = socketSessions.get(sid);

        if (!session) {
            return sendText(res, "unknown sid", 400);
        }

        const packets = session.queue.splice(0);
        return sendText(res, packets.length > 0 ? packets.join("\x1e") : "6");
    }

    if (req.method === "POST") {
        const sid = requestUrl.searchParams.get("sid");
        const session = sid ? socketSessions.get(sid) : null;

        if (!session) {
            return sendText(res, "unknown sid", 400);
        }

        const body = Buffer.concat(await collectBody(req)).toString("utf8");
        const packets = body.split("\x1e").filter(Boolean);

        for (const packet of packets) {
            if (packet.startsWith("40")) {
                try {
                    const data = packet.length > 2 ? JSON.parse(packet.slice(2)) : {};
                    session.playerId = data?.auth?.playerId || session.playerId;
                } catch {
                    // Keep the anonymous local player id when auth parsing fails.
                }

                queueSocketConnect(session);
                continue;
            }

            const event = parseSocketIoEvent(packet);

            if (event) {
                handleSocketEvent(session, event.eventName, event.payload);
            }
        }

        return sendText(res, "ok");
    }

    return sendText(res, "method not allowed", 405);
}

async function handleApi(req, res, pathname) {
    const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

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
        return sendJson(res, { success: true, rooms: clone(localArenaRooms) });
    }

    if (pathname.startsWith("/arena/room/")) {
        const body = await readJsonBody(req);
        const roomId = decodeURIComponent(pathname.slice("/arena/room/".length));
        const room = getArenaRoom(roomId);
        const playerId = body.playerId || localSave?.player?.id;

        if (!room) {
            return sendJson(res, {
                success: false,
                reason: "Sala de arena nao encontrada no mock local.",
            });
        }

        if (room.owner_player_id === playerId) {
            return sendJson(res, {
                success: false,
                reason: "Voce nao pode desafiar sua propria sala.",
            });
        }

        const requirements = checkArenaRequirements(room);

        if (!requirements.ok) {
            return sendJson(res, {
                success: false,
                reason: requirements.reason,
            });
        }

        return sendJson(res, {
            success: true,
            room: clone(room),
            snapshot: clone(room.snapshot),
        });
    }

    if (pathname === "/arena/challenge") {
        const body = await readJsonBody(req);
        const room = getArenaRoom(body.roomId) || localArenaRooms[0];
        const rewardId = `local_reward_${Date.now()}`;
        const reward = {
            rewardId,
            roomId: room.room_id,
            items: [{ ...clone(localItemSnapshots.potion_hp_p), qty: 1 }],
            gold: room.room_id === "local_arena_expensive" ? 250 : 100,
            crystal: room.room_id === "local_arena_expensive" ? 10 : 5,
        };

        localArenaRewards.push(reward);

        return sendJson(res, {
            success: true,
            reward: clone(reward),
            rewards: clone(localArenaRewards),
            total: getArenaRewardsTotal(),
        });
    }

    if (pathname === "/arena/my-espolio") {
        return sendJson(res, {
            success: true,
            rewards: clone(localArenaRewards),
            total: getArenaRewardsTotal(),
        });
    }

    if (pathname === "/arena/collect-rewards") {
        const body = await readJsonBody(req);
        const requestedIds = Array.isArray(body.rewardIds) ? body.rewardIds : [];
        const collectAll = requestedIds.length === 0;
        const collected = localArenaRewards.filter(
            (reward) => collectAll || requestedIds.includes(reward.rewardId),
        );

        localArenaRewards = localArenaRewards.filter(
            (reward) => !collected.includes(reward),
        );

        return sendJson(res, {
            success: true,
            collected: collected.map((reward) => reward.rewardId),
            rewards: clone(collected),
            total: collected.reduce(
                (total, reward) => ({
                    gold: total.gold + Number(reward.gold || 0),
                    crystal: total.crystal + Number(reward.crystal || 0),
                }),
                { gold: 0, crystal: 0 },
            ),
        });
    }

    if (pathname === "/market/version") {
        return sendJson(res, {
            success: true,
            version: `local-dev-${localMarketVersion}`,
        });
    }

    if (pathname.startsWith("/market/listings/owner/")) {
        const playerId = getListingId(pathname, "/market/listings/owner/");
        const listings = localMarketListings.filter(
            (listing) => listing.sellerId === playerId || listing.owner_player_id === playerId,
        );

        return sendJson(res, {
            success: true,
            listings: clone(listings),
            total: listings.length,
            totalPages: 1,
        });
    }

    if (pathname === "/market/listings") {
        const page = parsePositiveInt(requestUrl.searchParams.get("page"), 1);
        const limit = parsePositiveInt(requestUrl.searchParams.get("limit"), 16, 50);
        const excludePlayerId = requestUrl.searchParams.get("excludePlayerId");
        const listings = activeMarketListings().filter(
            (listing) =>
                !excludePlayerId ||
                (listing.sellerId !== excludePlayerId &&
                    listing.owner_player_id !== excludePlayerId),
        );
        const result = paginate(listings, page, limit);

        return sendJson(res, {
            success: true,
            listings: clone(result.items),
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
        });
    }

    if (pathname === "/market/list" && req.method === "GET") {
        return sendJson(res, {
            success: true,
            items: Object.values(localItemSnapshots).map(clone),
        });
    }

    if (pathname === "/market/list" && req.method === "POST") {
        const body = await readJsonBody(req);
        const context = body.context || {};
        const itemSnapshot = context.itemSnapshot;
        const priceGold = Number(context.priceGold || 0);
        const priceCrystal = Number(context.priceCrystal || 0);

        if (!itemSnapshot || (!priceGold && !priceCrystal)) {
            return sendJson(res, {
                success: false,
                message: "Anuncio invalido para o mock local.",
            });
        }

        const listing = {
            listingId: context.listingId || `local_listing_${Date.now()}`,
            sellerId: body.playerId || localSave?.player?.id || "local-player",
            sellerName: localSave?.player?.name || "Local Player",
            owner_player_id: body.playerId || localSave?.player?.id || "local-player",
            status: "ACTIVE",
            itemSnapshot: clone(itemSnapshot),
            priceGold,
            priceCrystal,
            expiresAt: context.expiresAt || isoHoursFromNow(24),
            createdAt: new Date().toISOString(),
            renew: { gold: 10, crystal: 1 },
        };

        localMarketListings.unshift(listing);
        bumpMarketVersion();

        return sendJson(res, { success: true, listing: clone(listing) });
    }

    if (pathname.startsWith("/market/buy/")) {
        const body = await readJsonBody(req);
        const listingId = getListingId(pathname, "/market/buy/");
        const listing = localMarketListings.find((item) => item.listingId === listingId);

        if (!listing || listing.status !== "ACTIVE") {
            return sendJson(res, {
                success: false,
                message: "Anuncio indisponivel no mock local.",
            });
        }

        if (listing.sellerId === body.buyerId || listing.owner_player_id === body.buyerId) {
            return sendJson(res, {
                success: false,
                message: "Nao e possivel comprar seu proprio anuncio.",
            });
        }

        const buyerGold = Number(body.buyerPlayer?.gold ?? localSave?.player?.gold ?? 0);
        const buyerCrystal = Number(
            body.buyerPlayer?.crystal ?? localSave?.player?.crystal ?? 0,
        );

        if (buyerGold < Number(listing.priceGold || 0)) {
            return sendJson(res, {
                success: false,
                message: "Gold insuficiente para comprar este item.",
            });
        }

        if (buyerCrystal < Number(listing.priceCrystal || 0)) {
            return sendJson(res, {
                success: false,
                message: "Crystal insuficiente para comprar este item.",
            });
        }

        listing.status = "SOLD";
        listing.buyerId = body.buyerId || localSave?.player?.id || "local-player";
        listing.soldAt = new Date().toISOString();
        bumpMarketVersion();

        return sendJson(res, {
            success: true,
            listingId,
            itemSnapshot: clone(listing.itemSnapshot),
        });
    }

    if (pathname.startsWith("/market/cancel/")) {
        const body = await readJsonBody(req);
        const listingId = getListingId(pathname, "/market/cancel/");
        const listing = localMarketListings.find((item) => item.listingId === listingId);

        if (!listing) {
            return sendJson(res, {
                success: false,
                message: "Anuncio nao encontrado no mock local.",
            });
        }

        if (body.playerId && listing.sellerId !== body.playerId) {
            return sendJson(res, {
                success: false,
                message: "Apenas o dono pode cancelar este anuncio.",
            });
        }

        listing.status = "CANCELLED";
        listing.cancelledAt = new Date().toISOString();
        bumpMarketVersion();

        return sendJson(res, { success: true, listing: clone(listing) });
    }

    if (pathname.startsWith("/market/renew/")) {
        const body = await readJsonBody(req);
        const listingId = getListingId(pathname, "/market/renew/");
        const listing = localMarketListings.find((item) => item.listingId === listingId);

        if (!listing) {
            return sendJson(res, {
                success: false,
                message: "Anuncio nao encontrado no mock local.",
            });
        }

        if (body.playerId && listing.sellerId !== body.playerId) {
            return sendJson(res, {
                success: false,
                message: "Apenas o dono pode renovar este anuncio.",
            });
        }

        listing.status = "ACTIVE";
        listing.expiresAt = isoHoursFromNow(Number(body.hours || 24));
        bumpMarketVersion();

        return sendJson(res, { success: true, listing: clone(listing) });
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

function isUnsafeLocalMapFile(filePath) {
    return [...unsafeLocalMapFiles].some((map) =>
        filePath.endsWith(path.join("assets", "map", `${map}.json`)),
    );
}

function rewriteBundleForLocal(body) {
    let source = body;

    source = source.replaceAll(
        'const Yr="https://crazyrogue.duckdns.org";',
        'const Yr=window.location.origin;',
    );
    source = source.replaceAll(bundleSocketNeedle, bundleSocketReplacement);

    return source;
}

const server = createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

        if (await handleSocketIo(req, res, requestUrl)) {
            return;
        }

        if (await handleApi(req, res, requestUrl.pathname)) {
            return;
        }

        let filePath = resolveRequestPath(req.url || "/");

        if (!filePath) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        if (isUnsafeLocalMapFile(filePath)) {
            filePath = path.join(projectDir, "assets", "map", "NewMapIni.json");
        }

        const fileStat = await stat(filePath);

        if (fileStat.isDirectory()) {
            filePath = path.join(filePath, "index.html");
        }

        const ext = path.extname(filePath).toLowerCase();
        const isBundle = ext === ".js" && path.basename(filePath).startsWith("index-");
        const body = isBundle
            ? rewriteBundleForLocal(await readFile(filePath, "utf8"))
            : await readFile(filePath);

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
