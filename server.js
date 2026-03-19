const express = require("express");
const cors = require("cors");
const app = express();
const http = require("http").createServer(app);
const { Server } = require("socket.io");

const allowedOrigins = [
    "https://glittery-beijinho-f984e2.netlify.app",
    "https://fat-io-game.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
];

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"]
}));

const io = new Server(http, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

app.use(express.static("public"));

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1400;
const FOOD_COUNT = 85;
const START_SIZE = 30;
const WHALE_SIZE = 180;
const SCORE_KILL_ADVANTAGE = 3;

const ALLOWED_HATS = new Set(["🧢", "🎩", "🎓", "👒"]);
const ALLOWED_COLORS = new Set(["#ffcc4d", "#ff7b7b", "#7bdcff", "#8cff98", "#d59cff", "#ffffff"]);
const ALLOWED_FACES = new Set(["😐", "🙂", "😋", "🥴"]);
const ALLOWED_ACCESSORIES = new Set(["none", "🕶️", "🥸", "🥇", "💎"]);

const FOOD_TYPES = [
    { emoji: "🍔", value: 4 },
    { emoji: "🍕", value: 3 },
    { emoji: "🍩", value: 5 },
    { emoji: "🍟", value: 2 },
    { emoji: "🥤", value: 2 }
];

let players = {};
let food = [];

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

function getSafeChoice(value, allowedSet, fallback) {
    return allowedSet.has(value) ? value : fallback;
}

function getLeaderboard() {
    return Object.entries(players)
        .map(([id, p]) => ({
            id,
            username: p.username,
            score: p.score,
            size: p.size,
            color: p.color
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
}

function getLeaderId() {
    const top = getLeaderboard()[0];
    return top ? top.id : null;
}

function emitWorld() {
    io.emit("update", {
        players,
        food,
        leaderboard: getLeaderboard(),
        leaderId: getLeaderId(),
        world: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT
        },
        whaleSize: WHALE_SIZE
    });
}

function eatPlayer(bigId, smallId) {
    const big = players[bigId];
    const small = players[smallId];
    if (!big || !small) return false;

    big.size += Math.max(10, Math.floor(small.size * 0.35));
    big.score += Math.max(20, Math.floor(small.score * 0.4) + 10);

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

    const foodEatRadius = Math.min(48, 20 + Math.sqrt(me.size) * 1.8);

    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (distance(me, f) < foodEatRadius) {
            me.size += f.value;
            me.score += f.value;
            food.splice(i, 1);
        }
    }
}

function getBodyRadius(size) {
    const fontSize = Math.min(138, 28 + size * 0.34);
    return Math.max(22, fontSize * 0.52);
}

function processPlayerCollisions() {
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
            const overlapNeeded = 10;

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

refillFood();

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("joinGame", (data) => {
        const username = sanitizeUsername(data?.username);
        const hat = getSafeChoice(data?.hat, ALLOWED_HATS, "🧢");
        const color = getSafeChoice(data?.color, ALLOWED_COLORS, "#ffcc4d");
        const face = getSafeChoice(data?.face, ALLOWED_FACES, "😐");
        const accessory = getSafeChoice(data?.accessory, ALLOWED_ACCESSORIES, "none");

        players[socket.id] = {
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            size: START_SIZE,
            score: 0,
            username,
            hat,
            color,
            face,
            accessory
        };

        socket.emit("init", {
            players,
            food,
            myId: socket.id,
            leaderboard: getLeaderboard(),
            leaderId: getLeaderId(),
            world: {
                width: WORLD_WIDTH,
                height: WORLD_HEIGHT
            },
            whaleSize: WHALE_SIZE
        });

        emitWorld();
    });

    socket.on("move", (data) => {
        const me = players[socket.id];
        if (!me) return;

        me.x = clamp(Number(data?.x) || me.x, 0, WORLD_WIDTH);
        me.y = clamp(Number(data?.y) || me.y, 0, WORLD_HEIGHT);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        emitWorld();
    });
});

setInterval(() => {
    const ids = Object.keys(players);

    for (const id of ids) {
        processFoodForPlayer(id);
    }

    refillFood();

    let collisionHappened = true;
    let safety = 0;

    while (collisionHappened && safety < 10) {
        collisionHappened = processPlayerCollisions();
        safety++;
    }

    emitWorld();
}, 1000 / 20);

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});