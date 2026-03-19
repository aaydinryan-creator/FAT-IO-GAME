const express = require("express");
const cors = require("cors");
const app = express();
const http = require("http").createServer(app);
const { Server } = require("socket.io");

app.use(cors());

const io = new Server(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static("public"));

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1400;
const FOOD_COUNT = 78;
const START_SIZE = 30;
const WHALE_SIZE = 300;
const SCORE_KILL_ADVANTAGE = 8;
const MAX_AVATAR_DATA_LENGTH = 400000;
const CHAT_LIMIT = 40;

const TAG_EVENT_DURATION_MS = 5000;
const TAG_SCORE_STEP = 1000;

const INFECTED_COUNTDOWN_MS = 8000;
const INFECTED_ROUND_MS = 45000;
const INFECTED_POSTROUND_MS = 5000;

const SERVER_TICK_MS = 1000 / 15;

const ALLOWED_HATS = new Set(["🧢", "🎩", "🎓", "👒"]);
const ALLOWED_COLORS = new Set(["#ffcc4d", "#ff7b7b", "#7bdcff", "#8cff98", "#d59cff", "#ffffff"]);
const ALLOWED_FACES = new Set(["😐", "🙂", "😋", "🥴"]);
const ALLOWED_ACCESSORIES = new Set(["none", "🕶️", "🥸", "🥇", "💎"]);
const ALLOWED_MODES = new Set(["normal", "infected"]);

const FOOD_TYPES = [
    { emoji: "🍔", value: 4 },
    { emoji: "🍕", value: 3 },
    { emoji: "🍩", value: 5 },
    { emoji: "🍟", value: 2 },
    { emoji: "🥤", value: 2 }
];

let players = {};
let food = [];
let recentChats = [];

let currentMode = "normal";

let gameState = {
    mode: "normal",
    tagEvent: {
        active: false,
        leaderId: null,
        endsAt: 0,
        milestone: 0
    },
    infected: {
        phase: "waiting",
        countdownEndsAt: 0,
        roundEndsAt: 0,
        postRoundEndsAt: 0,
        infectedIds: []
    },
    music: {
        track: null,
        startedAt: 0
    }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function randomFood() {
    const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
    return {
        id: Math.floor(Math.random() * 1000000000),
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        emoji: type.emoji,
        value: type.value
    };
}

function refillFood() {
    while (food.length < FOOD_COUNT) {
        food.push(randomFood());
    }
}

function sanitizeUsername(name) {
    const cleaned = (name || "Player")
        .toString()
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 14);

    return cleaned || "Player";
}

function sanitizeChatText(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
}

function getSafeChoice(value, allowedSet, fallback) {
    return allowedSet.has(value) ? value : fallback;
}

function sanitizeAvatarData(value) {
    if (!value || typeof value !== "string") return null;
    if (!value.startsWith("data:image/")) return null;
    if (value.length > MAX_AVATAR_DATA_LENGTH) return null;
    return value;
}

function sanitizeMode(value) {
    return ALLOWED_MODES.has(value) ? value : "normal";
}

function getLeaderboard() {
    return Object.entries(players)
        .map(([id, p]) => ({
            id,
            username: p.username,
            score: p.score,
            size: p.size,
            color: p.color,
            infected: !!p.infected
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
}

function getLeaderId() {
    const top = getLeaderboard()[0];
    return top ? top.id : null;
}

function getPlayerPayload(player, includeAvatar = false) {
    const payload = {
        x: player.x,
        y: player.y,
        size: player.size,
        score: player.score,
        username: player.username,
        hat: player.hat,
        color: player.color,
        face: player.face,
        accessory: player.accessory,
        infected: !!player.infected,
        isFatFook: !!player.isFatFook
    };

    if (includeAvatar) {
        payload.avatarData = player.avatarData || null;
    }

    return payload;
}

function getPlayersPayload(includeAvatar = false) {
    const out = {};
    for (const [id, p] of Object.entries(players)) {
        out[id] = getPlayerPayload(p, includeAvatar);
    }
    return out;
}

function emitWorld() {
    gameState.mode = currentMode;
    gameState.infected.infectedIds = Object.keys(players).filter((id) => players[id]?.infected);

    io.emit("update", {
        players: getPlayersPayload(false),
        food,
        leaderboard: getLeaderboard(),
        leaderId: getLeaderId(),
        world: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT
        },
        whaleSize: WHALE_SIZE,
        gameState
    });
}

function emitAnnouncement(text, {
    flash = false,
    flashColor = "rgba(255, 210, 80, 0.28)",
    flashDuration = 220,
    shake = false,
    shakeDuration = 220,
    shakeIntensity = 0.01,
    burp = false,
    burpVolume = 1.0
} = {}) {
    io.emit("gameAnnouncement", {
        text,
        flash,
        flashColor,
        flashDuration,
        shake,
        shakeDuration,
        shakeIntensity,
        burp,
        burpVolume
    });
}

function resetModeState(mode) {
    currentMode = mode;
    gameState.mode = mode;

    gameState.tagEvent = {
        active: false,
        leaderId: null,
        endsAt: 0,
        milestone: 0
    };

    gameState.infected = {
        phase: "waiting",
        countdownEndsAt: 0,
        roundEndsAt: 0,
        postRoundEndsAt: 0,
        infectedIds: []
    };

    gameState.music = {
        track: null,
        startedAt: 0
    };

    for (const id of Object.keys(players)) {
        const p = players[id];
        p.infected = false;
        p.isFatFook = false;
        p.lastTagMilestone = 0;
        p.score = 0;
        p.size = START_SIZE;
        p.announcedFatFook = false;
        p.announcedScoreFatFook = false;
    }
}

function randomSpawnPlayer(p) {
    p.x = Math.random() * WORLD_WIDTH;
    p.y = Math.random() * WORLD_HEIGHT;
}

function getBodyRadius(size) {
    const fontSize = Math.min(138, 28 + size * 0.34);
    return Math.max(22, fontSize * 0.52);
}

function eatPlayer(bigId, smallId) {
    const big = players[bigId];
    const small = players[smallId];
    if (!big || !small) return false;

    big.size += Math.max(12, Math.floor(small.size * 0.28));
    big.score += Math.max(18, Math.floor(small.score * 0.35) + 12);

    io.to(smallId).emit("eliminated", {
        by: big.username
    });

    io.to(bigId).emit("burgerTime", {
        target: small.username
    });

    delete players[smallId];
    return true;
}

function processFoodForPlayer(playerId) {
    const me = players[playerId];
    if (!me) return;

    const foodEatRadius = Math.min(44, 18 + Math.sqrt(me.size) * 1.55);

    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (distance(me, f) < foodEatRadius) {
            me.size += f.value;
            me.score += f.value;
            food.splice(i, 1);
        }
    }
}

function processNormalPlayerCollisions() {
    const ids = Object.keys(players);

    for (let i = 0; i < ids.length; i++) {
        const idA = ids[i];
        const a = players[idA];
        if (!a) continue;

        for (let j = i + 1; j < ids.length; j++) {
            const idB = ids[j];
            const b = players[idB];
            if (!b) continue;

            const dist = distance(a, b);

            const aRadius = getBodyRadius(a.size);
            const bRadius = getBodyRadius(b.size);
            const overlapNeeded = 12;

            const touchingEnough = dist < (aRadius + bRadius - overlapNeeded);

            const aCanEatB = a.score >= b.score + SCORE_KILL_ADVANTAGE;
            const bCanEatA = b.score >= a.score + SCORE_KILL_ADVANTAGE;

            if (touchingEnough && aCanEatB) {
                eatPlayer(idA, idB);
                return true;
            }

            if (touchingEnough && bCanEatA) {
                eatPlayer(idB, idA);
                return true;
            }
        }
    }

    return false;
}

function processTagEventCollisions() {
    const leaderId = gameState.tagEvent.leaderId;
    const hunter = players[leaderId];
    if (!hunter) return false;

    const ids = Object.keys(players);

    for (const id of ids) {
        if (id === leaderId) continue;
        const p = players[id];
        if (!p) continue;

        const dist = distance(hunter, p);
        const hunterRadius = getBodyRadius(hunter.size);
        const targetRadius = getBodyRadius(p.size);

        if (dist < (hunterRadius + targetRadius - 10)) {
            eatPlayer(leaderId, id);
            return true;
        }
    }

    return false;
}

function maybeStartTagEvent() {
    if (currentMode !== "normal") return;
    if (gameState.tagEvent.active) return;

    const top = getLeaderboard()[0];
    if (!top) return;

    const leader = players[top.id];
    if (!leader) return;

    const milestone = Math.floor(leader.score / TAG_SCORE_STEP);
    if (milestone < 1) return;
    if ((leader.lastTagMilestone || 0) >= milestone) return;

    leader.lastTagMilestone = milestone;
    leader.isFatFook = true;

    gameState.tagEvent.active = true;
    gameState.tagEvent.leaderId = top.id;
    gameState.tagEvent.endsAt = Date.now() + TAG_EVENT_DURATION_MS;
    gameState.tagEvent.milestone = milestone * TAG_SCORE_STEP;

    emitAnnouncement(`HIDE FROM ${leader.username.toUpperCase()} IT'S A FOOT FOOOK`, {
        flash: true,
        shake: true,
        burp: true,
        shakeDuration: 320,
        shakeIntensity: 0.012,
        burpVolume: 1
    });
}

function maybeEndTagEvent() {
    if (!gameState.tagEvent.active) return;
    if (Date.now() < gameState.tagEvent.endsAt) return;

    const leader = players[gameState.tagEvent.leaderId];
    if (leader) {
        leader.isFatFook = leader.size >= WHALE_SIZE;
    }

    gameState.tagEvent.active = false;
    gameState.tagEvent.leaderId = null;
    gameState.tagEvent.endsAt = 0;
    gameState.tagEvent.milestone = 0;

    emitAnnouncement("DRIVE THRU REOPENED", {
        flash: true,
        flashColor: "rgba(120,255,170,0.18)"
    });
}

function updateNormalFatFookStates() {
    for (const id of Object.keys(players)) {
        const p = players[id];
        if (!p) continue;

        const forcedFat = gameState.tagEvent.active && gameState.tagEvent.leaderId === id;
        p.isFatFook = forcedFat || p.size >= WHALE_SIZE;
        p.infected = false;
    }

    gameState.music.track = null;
    gameState.music.startedAt = 0;
}

function announceSizeFatFooks() {
    if (currentMode !== "normal") return;

    for (const id of Object.keys(players)) {
        const p = players[id];
        if (!p) continue;

        if (p.size >= WHALE_SIZE && !p.announcedFatFook) {
            p.announcedFatFook = true;

            emitAnnouncement(`${p.username.toUpperCase()} IS A FOOT FOOOK`, {
                flash: true,
                shake: true,
                burp: true,
                flashColor: "rgba(255, 214, 80, 0.22)",
                flashDuration: 260,
                shakeDuration: 260,
                shakeIntensity: 0.01,
                burpVolume: 0.9
            });
        }

        if (p.size < WHALE_SIZE) {
            p.announcedFatFook = false;
        }
    }
}

function beginInfectedCountdown() {
    gameState.infected.phase = "countdown";
    gameState.infected.countdownEndsAt = Date.now() + INFECTED_COUNTDOWN_MS;
    gameState.infected.roundEndsAt = 0;
    gameState.infected.postRoundEndsAt = 0;

    gameState.music.track = "whale";
    gameState.music.startedAt = Date.now();

    for (const id of Object.keys(players)) {
        const p = players[id];
        p.infected = false;
        p.isFatFook = false;
        p.score = 0;
        p.size = START_SIZE;
        p.announcedFatFook = false;
        p.announcedScoreFatFook = false;
        randomSpawnPlayer(p);
    }

    emitAnnouncement("INFECTED STARTS IN 8", {
        flash: true,
        shake: true,
        flashColor: "rgba(130,255,130,0.18)",
        shakeDuration: 180,
        shakeIntensity: 0.006
    });
}

function startInfectedRound() {
    const ids = Object.keys(players);
    if (ids.length < 2) {
        gameState.infected.phase = "waiting";
        gameState.music.track = null;
        gameState.music.startedAt = 0;
        return;
    }

    for (const id of ids) {
        const p = players[id];
        p.infected = false;
        p.isFatFook = false;
        p.score = 0;
        p.size = START_SIZE;
        p.announcedFatFook = false;
        p.announcedScoreFatFook = false;
        randomSpawnPlayer(p);
    }

    const firstInfectedId = ids[Math.floor(Math.random() * ids.length)];
    const first = players[firstInfectedId];
    first.infected = true;
    first.isFatFook = true;
    first.size = WHALE_SIZE + 20;
    first.score = 100;

    gameState.infected.phase = "active";
    gameState.infected.roundEndsAt = Date.now() + INFECTED_ROUND_MS;
    gameState.infected.countdownEndsAt = 0;
    gameState.infected.postRoundEndsAt = 0;

    emitAnnouncement(`${first.username.toUpperCase()} IS THE FAT FOOOK`, {
        flash: true,
        shake: true,
        burp: true,
        flashColor: "rgba(120,255,140,0.20)",
        shakeDuration: 320,
        shakeIntensity: 0.012,
        burpVolume: 1
    });
}

function convertPlayerToInfected(id) {
    const p = players[id];
    if (!p || p.infected) return;

    p.infected = true;
    p.isFatFook = true;
    p.size = WHALE_SIZE;
    p.score += 50;

    emitAnnouncement(`${p.username.toUpperCase()} GOT INFECTED`, {
        flash: true,
        flashColor: "rgba(120,255,140,0.18)",
        shake: true,
        shakeDuration: 180,
        shakeIntensity: 0.008
    });
}

function processInfectedCollisions() {
    const ids = Object.keys(players);

    for (let i = 0; i < ids.length; i++) {
        const idA = ids[i];
        const a = players[idA];
        if (!a) continue;

        for (let j = i + 1; j < ids.length; j++) {
            const idB = ids[j];
            const b = players[idB];
            if (!b) continue;

            const dist = distance(a, b);
            const aRadius = getBodyRadius(a.size);
            const bRadius = getBodyRadius(b.size);

            if (dist < (aRadius + bRadius - 10)) {
                if (a.infected && !b.infected) {
                    convertPlayerToInfected(idB);
                    a.score += 25;
                    return true;
                }
                if (b.infected && !a.infected) {
                    convertPlayerToInfected(idA);
                    b.score += 25;
                    return true;
                }
            }
        }
    }

    return false;
}

function getSurvivorCount() {
    return Object.values(players).filter((p) => p && !p.infected).length;
}

function getInfectedCount() {
    return Object.values(players).filter((p) => p && p.infected).length;
}

function endInfectedRound(resultText) {
    gameState.infected.phase = "postRound";
    gameState.infected.postRoundEndsAt = Date.now() + INFECTED_POSTROUND_MS;
    gameState.infected.roundEndsAt = 0;
    gameState.infected.countdownEndsAt = 0;

    emitAnnouncement(resultText, {
        flash: true,
        shake: true,
        burp: true,
        flashColor: "rgba(255,240,120,0.20)",
        shakeDuration: 260,
        shakeIntensity: 0.01,
        burpVolume: 0.85
    });
}

function updateInfectedMode() {
    const playerCount = Object.keys(players).length;

    if (playerCount < 2) {
        gameState.infected.phase = "waiting";
        gameState.infected.countdownEndsAt = 0;
        gameState.infected.roundEndsAt = 0;
        gameState.infected.postRoundEndsAt = 0;
        gameState.music.track = null;
        gameState.music.startedAt = 0;

        for (const id of Object.keys(players)) {
            players[id].infected = false;
            players[id].isFatFook = false;
            players[id].score = 0;
            players[id].size = START_SIZE;
            players[id].announcedFatFook = false;
            players[id].announcedScoreFatFook = false;
        }
        return;
    }

    const now = Date.now();

    if (gameState.infected.phase === "waiting") {
        beginInfectedCountdown();
        return;
    }

    if (gameState.infected.phase === "countdown") {
        if (now >= gameState.infected.countdownEndsAt) {
            startInfectedRound();
        }
        return;
    }

    if (gameState.infected.phase === "active") {
        let collisionHappened = true;
        let safety = 0;

        while (collisionHappened && safety < 10) {
            collisionHappened = processInfectedCollisions();
            safety++;
        }

        const survivors = getSurvivorCount();
        const infectedCount = getInfectedCount();

        if (survivors <= 0 && infectedCount > 0) {
            endInfectedRound("INFECTED WIN");
            return;
        }

        if (now >= gameState.infected.roundEndsAt) {
            endInfectedRound("SURVIVORS WIN");
            return;
        }

        return;
    }

    if (gameState.infected.phase === "postRound") {
        if (now >= gameState.infected.postRoundEndsAt) {
            beginInfectedCountdown();
        }
    }
}

refillFood();

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("joinGame", (data) => {
        const username = sanitizeUsername(data?.username);
        const hat = getSafeChoice(data?.hat, ALLOWED_HATS, "🧢");
        const color = getSafeChoice(data?.color, ALLOWED_COLORS, "#ffcc4d");
        const face = getSafeChoice(data?.face, ALLOWED_FACES, "😐");
        const accessory = getSafeChoice(data?.accessory, ALLOWED_ACCESSORIES, "none");
        const avatarData = sanitizeAvatarData(data?.avatarData);
        const requestedMode = sanitizeMode(data?.gameMode);

        if (players[socket.id]) {
            delete players[socket.id];
        }

        const playerCountBeforeJoin = Object.keys(players).length;
        const shouldSwitchMode = playerCountBeforeJoin === 0 || currentMode !== requestedMode;

        if (shouldSwitchMode) {
            resetModeState(requestedMode);
            refillFood();
        }

        players[socket.id] = {
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            size: START_SIZE,
            score: 0,
            username,
            hat,
            color,
            face,
            accessory,
            avatarData,
            infected: false,
            isFatFook: false,
            lastTagMilestone: 0,
            announcedFatFook: false,
            announcedScoreFatFook: false
        };

        if (currentMode === "infected" && gameState.infected.phase === "active") {
            players[socket.id].score = 0;
            players[socket.id].size = START_SIZE;
            players[socket.id].infected = false;
            players[socket.id].isFatFook = false;
            players[socket.id].announcedFatFook = false;
            players[socket.id].announcedScoreFatFook = false;
        }

        socket.emit("init", {
            players: getPlayersPayload(true),
            food,
            myId: socket.id,
            leaderboard: getLeaderboard(),
            leaderId: getLeaderId(),
            world: {
                width: WORLD_WIDTH,
                height: WORLD_HEIGHT
            },
            whaleSize: WHALE_SIZE,
            gameState,
            recentChats
        });

        socket.broadcast.emit("playerJoined", {
            id: socket.id,
            player: getPlayerPayload(players[socket.id], true)
        });

        emitWorld();
    });

    socket.on("chatMessage", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const text = sanitizeChatText(data?.text);
        if (!text) return;

        const msg = {
            username: p.username,
            text,
            ts: Date.now()
        };

        recentChats.push(msg);
        if (recentChats.length > CHAT_LIMIT) {
            recentChats.shift();
        }

        io.emit("chatMessage", msg);
    });

    socket.on("move", (data) => {
        const me = players[socket.id];
        if (!me) return;

        me.x = clamp(Number(data?.x) || me.x, 0, WORLD_WIDTH);
        me.y = clamp(Number(data?.y) || me.y, 0, WORLD_HEIGHT);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];

        if (Object.keys(players).length === 0) {
            resetModeState(currentMode);
        }

        emitWorld();
    });
});

setInterval(() => {
    if (currentMode === "normal") {
        if (!gameState.tagEvent.active) {
            for (const id of Object.keys(players)) {
                processFoodForPlayer(id);
            }
        }

        refillFood();

        let collisionHappened = true;
        let safety = 0;

        while (collisionHappened && safety < 10) {
            collisionHappened = gameState.tagEvent.active
                ? processTagEventCollisions()
                : processNormalPlayerCollisions();
            safety++;
        }

        maybeStartTagEvent();
        maybeEndTagEvent();
        updateNormalFatFookStates();
        announceSizeFatFooks();
    } else if (currentMode === "infected") {
        updateInfectedMode();

        for (const id of Object.keys(players)) {
            const p = players[id];
            if (!p) continue;

            if (p.infected) {
                p.isFatFook = true;
                p.size = Math.max(p.size, WHALE_SIZE);
            } else if (gameState.infected.phase === "active" || gameState.infected.phase === "countdown") {
                p.isFatFook = false;
                p.size = clamp(p.size, START_SIZE, START_SIZE + 10);
            }
        }
    }

    emitWorld();
}, SERVER_TICK_MS);

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});