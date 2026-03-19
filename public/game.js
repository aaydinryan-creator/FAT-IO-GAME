const socket = io("https://fat-io-game.onrender.com");

let players = {};
let food = [];
let leaderboard = [];
let leaderId = null;
let playerSprites = {};
let foodSprites = {};
let cursors;
let sceneRef;
let myId = null;
let joined = false;

let selectedHat = "🧢";
let selectedFace = "😐";
let selectedAccessory = "none";
let selectedColor = "#ffcc4d";

let worldWidth = 2400;
let worldHeight = 1400;
let whaleSize = 180;
let whaleAnnounced = false;
let toastTimer = null;
let worldBuilt = false;
let scoreBadge;

let joystickActive = false;
let joystickTouchId = null;
let joystickVector = { x: 0, y: 0 };
const joystickMaxRadius = 42;

// AUDIO
let audioUnlocked = false;
let currentLoop = null;
let currentLoopName = null;

const audioTracks = {
    normal: "/audio/eat.mp3",
    whale: "/audio/fat.mp3"
};

const menu = document.getElementById("menu");
const menuFoodBg = document.getElementById("menuFoodBg");
const usernameInput = document.getElementById("username");
const playBtn = document.getElementById("playBtn");
const leaderboardEl = document.getElementById("leaderboard");
const toastEl = document.getElementById("toast");
const deathScreen = document.getElementById("deathScreen");
const deathText = document.getElementById("deathText");
const respawnBtn = document.getElementById("respawnBtn");
const joystickEl = document.getElementById("joystick");
const joystickKnobEl = document.getElementById("joystickKnob");
scoreBadge = document.getElementById("scoreBadge");

const previewHat = document.getElementById("previewHat");
const previewBody = document.getElementById("previewBody");
const previewFace = document.getElementById("previewFace");
const previewAccessory = document.getElementById("previewAccessory");
const previewName = document.getElementById("previewName");

buildMenuFoodBackground();
setupJoystick();
setupCustomizationControls();
updatePreview();

playBtn.addEventListener("click", joinFromMenu);

respawnBtn.addEventListener("click", () => {
    deathScreen.style.display = "none";
    joinFromMenu();
});

usernameInput.addEventListener("input", updatePreview);
usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        joinFromMenu();
    }
});

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#341b12",
    scene: { preload, create, update }
};

new Phaser.Game(config);

function preload() {
    this.load.image("weirdAl", "/images/weirdal.png");
}

function create() {
    sceneRef = this;
    cursors = this.input.keyboard.createCursorKeys();

    socket.on("init", (data) => {
        players = data.players || {};
        food = data.food || [];
        leaderboard = data.leaderboard || [];
        leaderId = data.leaderId || null;
        myId = data.myId;
        worldWidth = data.world?.width || worldWidth;
        worldHeight = data.world?.height || worldHeight;
        whaleSize = data.whaleSize || whaleSize;
        whaleAnnounced = false;
        joined = true;

        for (const id in players) {
            players[id].targetX = players[id].x;
            players[id].targetY = players[id].y;
        }

        if (!worldBuilt) {
            buildWorld();
            worldBuilt = true;
        }

        sceneRef.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        menu.style.display = "none";

        clearAllSprites();
        syncFood();
        syncPlayers();
        renderLeaderboard();
        updateScoreBadge();
    });

    socket.on("update", (data) => {
        const incomingPlayers = data.players || {};
        food = data.food || [];
        leaderboard = data.leaderboard || [];
        leaderId = data.leaderId || null;
        worldWidth = data.world?.width || worldWidth;
        worldHeight = data.world?.height || worldHeight;
        whaleSize = data.whaleSize || whaleSize;

        for (const id in players) {
            if (!incomingPlayers[id]) {
                delete players[id];
            }
        }

        for (const id in incomingPlayers) {
            const incoming = incomingPlayers[id];

            if (!players[id]) {
                players[id] = {
                    ...incoming,
                    targetX: incoming.x,
                    targetY: incoming.y
                };
            } else {
                players[id].size = incoming.size;
                players[id].score = incoming.score;
                players[id].username = incoming.username;
                players[id].hat = incoming.hat;
                players[id].color = incoming.color;
                players[id].face = incoming.face;
                players[id].accessory = incoming.accessory;

                if (id !== myId) {
                    players[id].targetX = incoming.x;
                    players[id].targetY = incoming.y;
                }
            }
        }

        if (joined) {
            syncFood();
            syncPlayers();
            renderLeaderboard();
            updateScoreBadge();
        }
    });

    socket.on("eliminated", (data) => {
        joined = false;
        whaleAnnounced = false;
        resetJoystick();
        stopLoop();
        playBurpFallback(0.7);
        showToast("DAMN YOU ARE FAT");
        deathText.textContent = `${data.by || "Somebody"} turned you into a combo meal.`;
        deathScreen.style.display = "flex";
        clearAllSprites();
    });

    socket.on("burgerTime", () => {
        showToast("BURGER TIMEEE");
    });
}

function setupCustomizationControls() {
    setupSingleSelect(".hatBtn", "selected", (value) => {
        selectedHat = value;
        updatePreview();
    }, "hat");

    setupSingleSelect(".faceBtn", "selected", (value) => {
        selectedFace = value;
        updatePreview();
    }, "face");

    setupSingleSelect(".accessoryBtn", "selected", (value) => {
        selectedAccessory = value;
        updatePreview();
    }, "accessory");

    setupSingleSelect(".colorBtn", "selected", (value) => {
        selectedColor = value;
        updatePreview();
    }, "color");
}

function setupSingleSelect(selector, selectedClass, onChange, dataKey) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove(selectedClass));
            btn.classList.add(selectedClass);
            onChange(btn.dataset[dataKey]);
        });
    });
}

function updatePreview() {
    const name = (usernameInput.value.trim() || "PLAYER").slice(0, 14);

    previewHat.textContent = selectedHat;
    previewBody.style.background = selectedColor;
    previewFace.textContent = selectedFace;
    previewAccessory.textContent = selectedAccessory === "none" ? "" : selectedAccessory;
    previewName.textContent = name;
}

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
}

function playLoop(name, volume = 0.5) {
    if (!audioUnlocked) return;

    const src = audioTracks[name];
    if (!src) return;

    if (currentLoop && currentLoopName === name) {
        return;
    }

    stopLoop();

    currentLoop = new Audio(src);
    currentLoop.loop = true;
    currentLoop.volume = volume;
    currentLoopName = name;

    currentLoop.play().catch((err) => {
        console.log(`Failed to play loop "${name}"`, err);
    });
}

function stopLoop() {
    if (!currentLoop) return;
    currentLoop.pause();
    currentLoop.currentTime = 0;
    currentLoop = null;
    currentLoopName = null;
}

function playBurpFallback(volume = 0.6) {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.08 * volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);

        setTimeout(() => {
            ctx.close().catch(() => {});
        }, 500);
    } catch (e) {
        console.log("Burp fallback failed", e);
    }
}

function joinFromMenu() {
    const username = usernameInput.value.trim() || "PLAYER";

    unlockAudio();
    whaleAnnounced = false;
    playLoop("normal", 0.45);

    socket.emit("joinGame", {
        username,
        hat: selectedHat,
        face: selectedFace,
        accessory: selectedAccessory,
        color: selectedColor
    });
}

function buildMenuFoodBackground() {
    const emojis = ["🍔", "🍟", "🍕", "🍩", "🥤"];
    for (let i = 0; i < 32; i++) {
        const span = document.createElement("span");
        span.className = "menuFood";
        span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        span.style.left = `${Math.random() * 100}%`;
        span.style.top = `${Math.random() * 100}%`;
        span.style.fontSize = `${28 + Math.random() * 40}px`;
        span.style.setProperty("--rot", `${-35 + Math.random() * 70}deg`);
        menuFoodBg.appendChild(span);
    }
}

function setupJoystick() {
    if (!joystickEl) return;

    const getPoint = (touch) => {
        const rect = joystickEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > joystickMaxRadius) {
            const scale = joystickMaxRadius / dist;
            dx *= scale;
            dy *= scale;
        }

        joystickVector.x = dx / joystickMaxRadius;
        joystickVector.y = dy / joystickMaxRadius;

        joystickKnobEl.style.left = `calc(50% + ${dx}px)`;
        joystickKnobEl.style.top = `calc(50% + ${dy}px)`;
    };

    joystickEl.addEventListener("touchstart", (e) => {
        if (!e.changedTouches.length) return;
        const touch = e.changedTouches[0];
        joystickActive = true;
        joystickTouchId = touch.identifier;
        getPoint(touch);
        e.preventDefault();
    }, { passive: false });

    joystickEl.addEventListener("touchmove", (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                getPoint(touch);
                e.preventDefault();
                break;
            }
        }
    }, { passive: false });

    const endTouch = (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                resetJoystick();
                e.preventDefault();
                break;
            }
        }
    };

    joystickEl.addEventListener("touchend", endTouch, { passive: false });
    joystickEl.addEventListener("touchcancel", endTouch, { passive: false });
}

function resetJoystick() {
    joystickActive = false;
    joystickTouchId = null;
    joystickVector.x = 0;
    joystickVector.y = 0;
    joystickKnobEl.style.left = "50%";
    joystickKnobEl.style.top = "50%";
}

function buildWorld() {
    const g = sceneRef.add.graphics().setDepth(-1000);

    g.fillStyle(0x5a2815, 1);
    g.fillRect(0, 0, worldWidth, worldHeight);

    for (let y = 0; y < worldHeight; y += 120) {
        g.fillStyle(y % 240 === 0 ? 0x6c3118 : 0x4e2213, 0.28);
        g.fillRect(0, y, worldWidth, 60);
    }

    for (let i = 0; i < 110; i++) {
        g.fillStyle(0x2f160d, 0.18);
        g.fillCircle(
            Math.random() * worldWidth,
            Math.random() * worldHeight,
            10 + Math.random() * 38
        );
    }

    const deco = ["🍔", "🍟", "🍕", "🍩", "🥤"];
    for (let i = 0; i < 85; i++) {
        sceneRef.add.text(
            Math.random() * worldWidth,
            Math.random() * worldHeight,
            deco[Math.floor(Math.random() * deco.length)],
            {
                fontSize: `${28 + Math.random() * 34}px`
            }
        )
        .setAlpha(0.08)
        .setAngle(-25 + Math.random() * 50)
        .setDepth(-900)
        .setOrigin(0.5);
    }
}

function clearSpriteParts(sprite) {
    if (!sprite) return;

    if (sprite.body) sprite.body.destroy();
    if (sprite.face) sprite.face.destroy();
    if (sprite.hat) sprite.hat.destroy();
    if (sprite.name) sprite.name.destroy();
    if (sprite.crown) sprite.crown.destroy();
    if (sprite.accessory) sprite.accessory.destroy();
}

function clearAllSprites() {
    for (const id in playerSprites) {
        clearSpriteParts(playerSprites[id]);
    }
    playerSprites = {};

    for (const id in foodSprites) {
        foodSprites[id].destroy();
    }
    foodSprites = {};
}

function getDefaultFaceBySize(size) {
    if (size < 50) return "😐";
    if (size < 80) return "🙂";
    if (size < 120) return "😋";
    if (size < whaleSize) return "🥴";
    return "😵";
}

function getRenderedFace(player) {
    if (player.size >= whaleSize) return "😵";
    return player.face || getDefaultFaceBySize(player.size);
}

function getVisualFontSize(size) {
    return Math.min(138, 28 + size * 0.34);
}

function createFaceSprite(x, y, isWhaleMode, faceText, fontSize) {
    if (isWhaleMode) {
        return sceneRef.add.image(x, y, "weirdAl").setOrigin(0.5);
    }

    return sceneRef.add.text(x, y, faceText, {
        fontSize: fontSize + "px"
    }).setOrigin(0.5);
}

function rebuildFaceSpriteIfNeeded(id, p, isWhaleMode, faceText, fontSize) {
    const sprite = playerSprites[id];
    if (!sprite) return;

    const currentMode = sprite.faceMode || "normal";
    const neededMode = isWhaleMode ? "whale" : "normal";

    if (currentMode !== neededMode) {
        const oldX = sprite.face.x;
        const oldY = sprite.face.y;
        sprite.face.destroy();
        sprite.face = createFaceSprite(oldX, oldY, isWhaleMode, faceText, fontSize);
        sprite.faceMode = neededMode;
    }
}

function syncPlayers() {
    for (const id in playerSprites) {
        if (!players[id]) {
            clearSpriteParts(playerSprites[id]);
            delete playerSprites[id];
        }
    }

    for (const id in players) {
        const p = players[id];
        const isWhaleMode = p.size >= whaleSize;
        const fontSize = getVisualFontSize(p.size);
        const faceText = getRenderedFace(p);
        const bodyRadius = Math.max(22, fontSize * 0.52);
        const bodyColor = Phaser.Display.Color.HexStringToColor(p.color || "#ffcc4d").color;
        const accessoryText = isWhaleMode
            ? ""
            : (p.accessory && p.accessory !== "none" ? p.accessory : "");

        if (!playerSprites[id]) {
            playerSprites[id] = {
                faceMode: isWhaleMode ? "whale" : "normal",

                crown: sceneRef.add.text(p.x, p.y - 72, "👑", {
                    fontSize: "34px"
                }).setOrigin(0.5),

                hat: sceneRef.add.text(p.x, p.y - 38, isWhaleMode ? "" : (p.hat || "🧢"), {
                    fontSize: Math.max(24, fontSize * 0.45) + "px"
                }).setOrigin(0.5),

                body: sceneRef.add.circle(p.x, p.y, bodyRadius, bodyColor)
                    .setStrokeStyle(4, 0x000000, 0.25),

                face: createFaceSprite(p.x, p.y, isWhaleMode, faceText, fontSize),

                accessory: sceneRef.add.text(p.x, p.y + 8, accessoryText, {
                    fontSize: Math.max(18, fontSize * 0.34) + "px"
                }).setOrigin(0.5),

                name: sceneRef.add.text(p.x, p.y + 38, p.username || "Player", {
                    fontSize: "18px",
                    color: "#ffffff",
                    stroke: "#000000",
                    strokeThickness: 4,
                    fontFamily: "Arial"
                }).setOrigin(0.5)
            };
        }

        rebuildFaceSpriteIfNeeded(id, p, isWhaleMode, faceText, fontSize);

        if (id === myId) {
            playerSprites[id].body.x = p.x;
            playerSprites[id].body.y = p.y;
            playerSprites[id].face.x = p.x;
            playerSprites[id].face.y = p.y;
        } else {
            playerSprites[id].body.x = Phaser.Math.Linear(playerSprites[id].body.x, p.targetX ?? p.x, 0.22);
            playerSprites[id].body.y = Phaser.Math.Linear(playerSprites[id].body.y, p.targetY ?? p.y, 0.22);
            playerSprites[id].face.x = playerSprites[id].body.x;
            playerSprites[id].face.y = playerSprites[id].body.y;
        }

        const fx = playerSprites[id].face.x;
        const fy = playerSprites[id].face.y;

        playerSprites[id].body.setRadius(bodyRadius);
        playerSprites[id].body.setFillStyle(bodyColor);

        if (isWhaleMode) {
            playerSprites[id].face.setDisplaySize(fontSize * 1.15, fontSize * 1.15);
            playerSprites[id].face.setAngle(0);
        } else {
            playerSprites[id].face.setText(faceText);
            playerSprites[id].face.setFontSize(fontSize);
        }

        playerSprites[id].hat.x = fx;
        playerSprites[id].hat.y = fy - (fontSize * 0.80);
        playerSprites[id].hat.setText(isWhaleMode ? "" : (p.hat || "🧢"));
        playerSprites[id].hat.setFontSize(Math.max(24, fontSize * 0.45));

        playerSprites[id].accessory.x = fx;
        playerSprites[id].accessory.y = fy + (fontSize * 0.18);
        playerSprites[id].accessory.setText(accessoryText);
        playerSprites[id].accessory.setFontSize(Math.max(18, fontSize * 0.34));

        playerSprites[id].name.x = fx;
        playerSprites[id].name.y = fy + (fontSize * 0.96);
        playerSprites[id].name.setText(p.username || "Player");

        playerSprites[id].crown.x = fx;
        playerSprites[id].crown.y = fy - (fontSize * 1.30);
        playerSprites[id].crown.setVisible(id === leaderId);
    }

    const me = players[myId];
    if (me && me.size >= whaleSize && !whaleAnnounced) {
        whaleAnnounced = true;
        playLoop("whale", 0.75);
        showToast("FAT WEIRD AL MODE");
    }

    if (me && me.size < whaleSize && whaleAnnounced) {
        whaleAnnounced = false;
        playLoop("normal", 0.45);
        showToast("BACK TO REGULAR FAT");
    }
}

function syncFood() {
    const currentFoodIds = new Set();

    for (const f of food) {
        currentFoodIds.add(f.id);

        if (!foodSprites[f.id]) {
            foodSprites[f.id] = sceneRef.add.text(
                f.x,
                f.y,
                f.emoji,
                { fontSize: "22px" }
            ).setOrigin(0.5);
        }

        foodSprites[f.id].x = f.x;
        foodSprites[f.id].y = f.y;
        foodSprites[f.id].setText(f.emoji);
    }

    for (const id in foodSprites) {
        if (!currentFoodIds.has(Number(id))) {
            foodSprites[id].destroy();
            delete foodSprites[id];
        }
    }
}

function renderLeaderboard() {
    const rows = leaderboard.length
        ? leaderboard.map((p, index) => {
            const badge = index === 0 ? "👑 " : "";
            const dot = p.color
                ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color};margin-right:8px;vertical-align:middle;border:1px solid rgba(0,0,0,0.25);"></span>`
                : "";

            return `
                <div class="lb-row">
                    <div class="lb-rank">${index + 1}</div>
                    <div class="lb-name">${dot}${badge}${escapeHtml(p.username)}</div>
                    <div class="lb-score">${Math.floor(p.score)}</div>
                </div>
            `;
        }).join("")
        : `<div class="lb-row"><div class="lb-rank">-</div><div class="lb-name">No orders yet</div><div class="lb-score">0</div></div>`;

    leaderboardEl.innerHTML = `
        <div class="lb-card">
            <div class="lb-head">DOLLAR MENU</div>
            <div class="lb-sub">BIGGEST BACKS IN THE BUILDING</div>
            ${rows}
        </div>
    `;
}

function updateScoreBadge() {
    const me = players[myId];
    if (!me) {
        scoreBadge.textContent = "Score: 0 | Size: 30";
        return;
    }

    scoreBadge.textContent = `Score: ${Math.floor(me.score)} | Size: ${Math.floor(me.size)}`;
}

function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2000);
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function update() {
    if (!joined) return;

    const me = players[myId];
    if (!me) return;

    let speed = 10 / (1 + me.size / 60);
    if (speed < 1.9) speed = 1.9;

    let moveX = 0;
    let moveY = 0;

    if (cursors.left.isDown) moveX -= 1;
    if (cursors.right.isDown) moveX += 1;
    if (cursors.up.isDown) moveY -= 1;
    if (cursors.down.isDown) moveY += 1;

    if (joystickActive) {
        moveX += joystickVector.x;
        moveY += joystickVector.y;
    }

    const length = Math.sqrt(moveX * moveX + moveY * moveY);
    if (length > 0) {
        moveX /= length;
        moveY /= length;

        me.x += moveX * speed;
        me.y += moveY * speed;
    }

    me.x = Phaser.Math.Clamp(me.x, 0, worldWidth);
    me.y = Phaser.Math.Clamp(me.y, 0, worldHeight);

    socket.emit("move", { x: me.x, y: me.y });

    syncPlayers();
    updateCamera();
}

function updateCamera() {
    const me = players[myId];
    if (!me) return;

    const cam = sceneRef.cameras.main;
    const targetX = me.x - cam.width / 2;
    const targetY = me.y - cam.height / 2;

    cam.scrollX = Phaser.Math.Linear(cam.scrollX, targetX, 0.12);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetY, 0.12);
}