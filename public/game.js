const LIVE_SOCKET_URL = "https://fat-io-game.onrender.com";
const socket = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? io()
    : io(LIVE_SOCKET_URL);

let players = {};
let food = [];
let leaderboard = [];
let leaderId = null;
let playerSprites = {};
let foodSprites = {};
let avatarTextureState = {};
let recentChats = [];

let cursors;
let wasdKeys;
let sceneRef;
let phaserGame;
let myId = null;
let joined = false;

let selectedHat = "🧢";
let selectedFace = "😐";
let selectedAccessory = "none";
let selectedColor = "#ffcc4d";
let selectedAvatarData = null;
let selectedGameMode = "normal";

let worldWidth = 2400;
let worldHeight = 1400;
let whaleSize = 300;
let toastTimer = null;
let worldBuilt = false;
let scoreBadge;
let flashEl = null;
let modeBadge = null;
let infectedOverlayEl = null;

let joystickActive = false;
let joystickTouchId = null;
let joystickVector = { x: 0, y: 0 };
const joystickMaxRadius = 42;

// AUDIO
let audioUnlocked = false;
let isMuted = localStorage.getItem("fatio_muted") === "1";
let currentLoop = null;
let currentLoopName = null;
let currentLoopSyncStartedAt = null;

const audioTracks = {
    normal: "/audio/eat.mp3",
    whale: "/audio/fat.mp3"
};

const burgerToasts = [
    "BURGER TIMEEE",
    "YOU ATE THAT MAN",
    "COMBO MEAL SECURED",
    "BIG BACK BEHAVIOR",
    "ABSOLUTE DRIVE THRU VIOLENCE"
];

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
const previewWrap = document.getElementById("previewWrap");

let avatarUploadBtn = null;
let avatarClearBtn = null;
let avatarFileInput = null;
let previewAvatarImg = null;
let avatarStatusText = null;
let modePickerWrap = null;
let muteBtn = null;
let chatToggleBtn = null;
let chatPanel = null;
let chatMessagesEl = null;
let chatInput = null;

buildMenuFoodBackground();
setupJoystick();
setupCustomizationControls();
setupModeControls();
setupAvatarUploadControls();
createFlashOverlay();
createModeBadge();
createInfectedOverlay();
createMuteButton();
createChatUI();
updatePreview();
updateMuteButton();
updateModeBadge();
updateInfectedOverlay();

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

phaserGame = new Phaser.Game(config);

window.addEventListener("resize", handleGameResize);
document.addEventListener("fullscreenchange", () => {
    setTimeout(handleGameResize, 60);
});

function preload() {}

function create() {
    sceneRef = this;
    cursors = this.input.keyboard.createCursorKeys();
    wasdKeys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    socket.on("init", (data) => {
        players = {};
        const incomingPlayers = data.players || {};

        for (const id in incomingPlayers) {
            players[id] = {
                ...incomingPlayers[id],
                targetX: incomingPlayers[id].x,
                targetY: incomingPlayers[id].y,
                avatarData: incomingPlayers[id].avatarData || null,
                infected: !!incomingPlayers[id].infected,
                isFatFook: !!incomingPlayers[id].isFatFook
            };
        }

        food = data.food || [];
        leaderboard = data.leaderboard || [];
        leaderId = data.leaderId || null;
        myId = data.myId;
        worldWidth = data.world?.width || worldWidth;
        worldHeight = data.world?.height || worldHeight;
        whaleSize = data.whaleSize || whaleSize;
        gameState = data.gameState || gameState;
        recentChats = data.recentChats || [];

        if (!worldBuilt) {
            buildWorld();
            worldBuilt = true;
        }

        sceneRef.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        menu.style.display = "none";
        joined = true;

        renderChatMessages();
        clearAllSprites();
        syncFood();
        syncPlayers();
        renderLeaderboard();
        updateScoreBadge();
        updateModeBadge();
        updateInfectedOverlay();
        updateAudioState();
        handleGameResize();
        updateCamera(true);
    });

    socket.on("playerJoined", ({ id, player }) => {
        players[id] = {
            ...player,
            targetX: player.x,
            targetY: player.y,
            avatarData: player.avatarData || null,
            infected: !!player.infected,
            isFatFook: !!player.isFatFook
        };
    });

    socket.on("update", (data) => {
        const incomingPlayers = data.players || {};
        leaderboard = data.leaderboard || [];
        leaderId = data.leaderId || null;
        worldWidth = data.world?.width || worldWidth;
        worldHeight = data.world?.height || worldHeight;
        whaleSize = data.whaleSize || whaleSize;
        gameState = data.gameState || gameState;

        const oldFoodIds = new Set(Object.keys(foodSprites).map(Number));
        const newFoodIds = new Set((data.food || []).map((f) => f.id));

        for (const oldId of oldFoodIds) {
            if (!newFoodIds.has(oldId)) {
                const oldFoodSprite = foodSprites[oldId];
                if (oldFoodSprite && oldFoodSprite.text && players[myId] && shouldShowFood()) {
                    createEatBurst(oldFoodSprite.text.x, oldFoodSprite.text.y, oldFoodSprite.text.text || "🍔");
                }
            }
        }

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
                    targetY: incoming.y,
                    avatarData: null
                };
            } else {
                const oldSize = players[id].size;
                const oldScore = players[id].score;

                players[id].size = incoming.size;
                players[id].score = incoming.score;
                players[id].username = incoming.username;
                players[id].hat = incoming.hat;
                players[id].color = incoming.color;
                players[id].face = incoming.face;
                players[id].accessory = incoming.accessory;
                players[id].infected = !!incoming.infected;
                players[id].isFatFook = !!incoming.isFatFook;

                if (incoming.size > oldSize || incoming.score > oldScore) {
                    players[id].justAteAt = performance.now();
                    players[id].eatPop = Math.min(1, (incoming.size - oldSize) * 0.08 + (incoming.score - oldScore) * 0.04);
                }

                if (id !== myId) {
                    players[id].targetX = incoming.x;
                    players[id].targetY = incoming.y;
                }
            }
        }

        food = data.food || [];

        if (joined) {
            syncFood();
            syncPlayers();
            renderLeaderboard();
            updateScoreBadge();
            updateModeBadge();
            updateInfectedOverlay();
            updateAudioState();
        }
    });

    socket.on("gameAnnouncement", (data) => {
        const text = data?.text || "SOMETHING HAPPENED";
        showToast(text);

        if (data?.flash) {
            flashScreen(data.flashColor || "rgba(255, 210, 80, 0.28)", data.flashDuration || 220);
        }

        if (data?.shake) {
            shakeCamera(data.shakeDuration || 220, data.shakeIntensity || 0.01);
        }

        if (data?.burp) {
            unlockAudio();
            if (!isMuted) {
                playBurpFallback(data.burpVolume || 1.0);
            }
        }
    });

    socket.on("chatMessage", (msg) => {
        recentChats.push(msg);
        if (recentChats.length > 40) recentChats.shift();
        appendChatMessage(msg);
    });

    socket.on("eliminated", (data) => {
        joined = false;
        stopLoop();
        if (!isMuted) {
            playBurpFallback(0.7);
        }
        flashScreen("rgba(170, 0, 0, 0.35)", 160);
        shakeCamera(130, 0.009);
        showToast("DAMN YOU ARE FAT");
        deathText.textContent = `${data.by || "Somebody"} turned you into a combo meal.`;
        deathScreen.style.display = "flex";
        clearAllSprites();
    });

    socket.on("burgerTime", () => {
        showToast(randomFrom(burgerToasts));
        shakeCamera(80, 0.003);
    });
}

function handleGameResize() {
    if (!phaserGame || !sceneRef) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    phaserGame.scale.resize(width, height);
    sceneRef.cameras.main.setSize(width, height);
    updateCamera(true);
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

function setupModeControls() {
    const label = document.createElement("div");
    label.className = "sectionLabel";
    label.textContent = "GAME MODE";

    modePickerWrap = document.createElement("div");
    modePickerWrap.style.display = "grid";
    modePickerWrap.style.gridTemplateColumns = "1fr 1fr";
    modePickerWrap.style.gap = "10px";
    modePickerWrap.style.marginBottom = "14px";

    const normalBtn = document.createElement("button");
    normalBtn.type = "button";
    normalBtn.textContent = "NORMAL";
    styleModeButton(normalBtn, true);

    const infectedBtn = document.createElement("button");
    infectedBtn.type = "button";
    infectedBtn.textContent = "INFECTED";
    styleModeButton(infectedBtn, false);

    normalBtn.addEventListener("click", () => {
        selectedGameMode = "normal";
        styleModeButton(normalBtn, true);
        styleModeButton(infectedBtn, false);
    });

    infectedBtn.addEventListener("click", () => {
        selectedGameMode = "infected";
        styleModeButton(normalBtn, false);
        styleModeButton(infectedBtn, true);
    });

    modePickerWrap.appendChild(normalBtn);
    modePickerWrap.appendChild(infectedBtn);

    playBtn.parentNode.insertBefore(label, playBtn);
    playBtn.parentNode.insertBefore(modePickerWrap, playBtn);
}

function styleModeButton(btn, selected) {
    btn.style.border = "none";
    btn.style.borderRadius = "14px";
    btn.style.padding = "12px 14px";
    btn.style.cursor = "pointer";
    btn.style.fontFamily = "Arial, sans-serif";
    btn.style.fontWeight = "900";
    btn.style.transition = "transform 0.15s ease, filter 0.15s ease";
    btn.style.background = selected
        ? "linear-gradient(180deg, #ffd466 0%, #f4a93d 100%)"
        : "#564944";
    btn.style.color = selected ? "#331708" : "#fff4d5";
    btn.style.outline = selected ? "3px solid rgba(255, 232, 154, 0.7)" : "none";
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

function setupAvatarUploadControls() {
    const label = document.createElement("div");
    label.className = "sectionLabel";
    label.textContent = "CUSTOM AVATAR";

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr 1fr";
    wrap.style.gap = "10px";
    wrap.style.marginBottom = "10px";

    avatarUploadBtn = document.createElement("button");
    avatarUploadBtn.type = "button";
    avatarUploadBtn.textContent = "UPLOAD IMAGE";
    avatarUploadBtn.style.border = "none";
    avatarUploadBtn.style.borderRadius = "14px";
    avatarUploadBtn.style.padding = "12px 14px";
    avatarUploadBtn.style.cursor = "pointer";
    avatarUploadBtn.style.fontFamily = "Arial, sans-serif";
    avatarUploadBtn.style.fontWeight = "900";
    avatarUploadBtn.style.background = "#f7d06b";
    avatarUploadBtn.style.color = "#4b2412";

    avatarClearBtn = document.createElement("button");
    avatarClearBtn.type = "button";
    avatarClearBtn.textContent = "CLEAR IMAGE";
    avatarClearBtn.style.border = "none";
    avatarClearBtn.style.borderRadius = "14px";
    avatarClearBtn.style.padding = "12px 14px";
    avatarClearBtn.style.cursor = "pointer";
    avatarClearBtn.style.fontFamily = "Arial, sans-serif";
    avatarClearBtn.style.fontWeight = "900";
    avatarClearBtn.style.background = "#564944";
    avatarClearBtn.style.color = "#fff4d5";

    avatarStatusText = document.createElement("div");
    avatarStatusText.style.fontFamily = "Arial, sans-serif";
    avatarStatusText.style.fontSize = "12px";
    avatarStatusText.style.fontWeight = "800";
    avatarStatusText.style.color = "#f3dca9";
    avatarStatusText.style.marginBottom = "14px";
    avatarStatusText.textContent = "No custom image selected.";

    avatarFileInput = document.createElement("input");
    avatarFileInput.type = "file";
    avatarFileInput.accept = "image/png,image/jpeg,image/webp,image/jpg";
    avatarFileInput.style.display = "none";

    wrap.appendChild(avatarUploadBtn);
    wrap.appendChild(avatarClearBtn);

    playBtn.parentNode.insertBefore(label, playBtn);
    playBtn.parentNode.insertBefore(wrap, playBtn);
    playBtn.parentNode.insertBefore(avatarStatusText, playBtn);
    playBtn.parentNode.appendChild(avatarFileInput);

    previewAvatarImg = document.createElement("img");
    previewAvatarImg.alt = "Avatar preview";
    previewAvatarImg.style.position = "absolute";
    previewAvatarImg.style.left = "50%";
    previewAvatarImg.style.top = "58%";
    previewAvatarImg.style.width = "68px";
    previewAvatarImg.style.height = "68px";
    previewAvatarImg.style.transform = "translate(-50%, -50%)";
    previewAvatarImg.style.borderRadius = "50%";
    previewAvatarImg.style.objectFit = "cover";
    previewAvatarImg.style.display = "none";
    previewAvatarImg.style.pointerEvents = "none";
    previewAvatarImg.style.zIndex = "2";
    previewWrap.appendChild(previewAvatarImg);

    avatarUploadBtn.addEventListener("click", () => {
        avatarFileInput.click();
    });

    avatarClearBtn.addEventListener("click", () => {
        selectedAvatarData = null;
        avatarFileInput.value = "";
        updatePreview();
        showToast("CUSTOM AVATAR CLEARED");
    });

    avatarFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showToast("THAT AINT AN IMAGE");
            return;
        }

        try {
            avatarStatusText.textContent = "Compressing image...";
            selectedAvatarData = await compressImageToDataUrl(file, 256, 0.82);
            avatarStatusText.textContent = "Custom image ready.";
            updatePreview();
            showToast("CUSTOM AVATAR READY");
        } catch (err) {
            console.error(err);
            avatarStatusText.textContent = "Image failed to load.";
            showToast("IMAGE LOAD FAILED");
        }
    });
}

function createMuteButton() {
    muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.style.position = "absolute";
    muteBtn.style.right = "18px";
    muteBtn.style.bottom = "18px";
    muteBtn.style.zIndex = "25";
    muteBtn.style.border = "none";
    muteBtn.style.borderRadius = "14px";
    muteBtn.style.padding = "10px 14px";
    muteBtn.style.cursor = "pointer";
    muteBtn.style.fontFamily = "Arial, sans-serif";
    muteBtn.style.fontWeight = "900";
    muteBtn.style.background = "rgba(44, 18, 9, 0.82)";
    muteBtn.style.color = "#ffdf81";
    muteBtn.style.border = "2px solid rgba(255, 206, 92, 0.5)";
    muteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        localStorage.setItem("fatio_muted", isMuted ? "1" : "0");
        updateMuteButton();
        updateAudioState();
    });
    document.body.appendChild(muteBtn);
}

function updateMuteButton() {
    if (!muteBtn) return;
    muteBtn.textContent = isMuted ? "🔇 MUTED" : "🔊 SOUND";
}

function createChatUI() {
    chatToggleBtn = document.createElement("button");
    chatToggleBtn.type = "button";
    chatToggleBtn.textContent = "CHAT";
    chatToggleBtn.style.position = "absolute";
    chatToggleBtn.style.right = "18px";
    chatToggleBtn.style.bottom = "70px";
    chatToggleBtn.style.zIndex = "25";
    chatToggleBtn.style.border = "none";
    chatToggleBtn.style.borderRadius = "14px";
    chatToggleBtn.style.padding = "10px 14px";
    chatToggleBtn.style.cursor = "pointer";
    chatToggleBtn.style.fontFamily = "Arial, sans-serif";
    chatToggleBtn.style.fontWeight = "900";
    chatToggleBtn.style.background = "rgba(44, 18, 9, 0.82)";
    chatToggleBtn.style.color = "#ffdf81";
    chatToggleBtn.style.border = "2px solid rgba(255, 206, 92, 0.5)";
    document.body.appendChild(chatToggleBtn);

    chatPanel = document.createElement("div");
    chatPanel.style.position = "absolute";
    chatPanel.style.right = "18px";
    chatPanel.style.bottom = "122px";
    chatPanel.style.width = "320px";
    chatPanel.style.maxWidth = "calc(100vw - 36px)";
    chatPanel.style.height = "320px";
    chatPanel.style.display = "none";
    chatPanel.style.flexDirection = "column";
    chatPanel.style.background = "rgba(24, 12, 8, 0.88)";
    chatPanel.style.border = "3px solid rgba(255, 206, 92, 0.55)";
    chatPanel.style.borderRadius = "18px";
    chatPanel.style.overflow = "hidden";
    chatPanel.style.zIndex = "25";
    chatPanel.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
    document.body.appendChild(chatPanel);

    const chatHeader = document.createElement("div");
    chatHeader.textContent = "GLOBAL CHAT";
    chatHeader.style.padding = "10px 12px";
    chatHeader.style.background = "rgba(255, 206, 92, 0.14)";
    chatHeader.style.color = "#ffdf81";
    chatHeader.style.fontFamily = "Arial, sans-serif";
    chatHeader.style.fontWeight = "900";
    chatHeader.style.fontSize = "14px";

    chatMessagesEl = document.createElement("div");
    chatMessagesEl.style.flex = "1";
    chatMessagesEl.style.padding = "10px";
    chatMessagesEl.style.overflowY = "auto";
    chatMessagesEl.style.fontFamily = "Arial, sans-serif";
    chatMessagesEl.style.fontSize = "13px";
    chatMessagesEl.style.color = "#fff6db";
    chatMessagesEl.style.display = "flex";
    chatMessagesEl.style.flexDirection = "column";
    chatMessagesEl.style.gap = "8px";

    chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.maxLength = 120;
    chatInput.placeholder = "Type message and press Enter";
    chatInput.style.border = "none";
    chatInput.style.borderTop = "1px solid rgba(255,255,255,0.08)";
    chatInput.style.padding = "12px";
    chatInput.style.outline = "none";
    chatInput.style.background = "#f7f0e8";
    chatInput.style.color = "#2c1a15";
    chatInput.style.fontFamily = "Arial, sans-serif";
    chatInput.style.fontWeight = "700";

    chatPanel.appendChild(chatHeader);
    chatPanel.appendChild(chatMessagesEl);
    chatPanel.appendChild(chatInput);

    chatToggleBtn.addEventListener("click", () => {
        const isOpen = chatPanel.style.display === "flex";
        chatPanel.style.display = isOpen ? "none" : "flex";
        chatToggleBtn.textContent = isOpen ? "CHAT" : "CLOSE CHAT";
        if (!isOpen) {
            renderChatMessages();
            setTimeout(() => chatInput.focus(), 20);
        }
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const text = chatInput.value.trim();
        if (!text) return;
        socket.emit("chatMessage", { text });
        chatInput.value = "";
    });
}

function renderChatMessages() {
    if (!chatMessagesEl) return;
    chatMessagesEl.innerHTML = "";
    for (const msg of recentChats) {
        appendChatMessage(msg, false);
    }
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function appendChatMessage(msg, scroll = true) {
    if (!chatMessagesEl) return;

    const row = document.createElement("div");
    row.style.padding = "6px 8px";
    row.style.borderRadius = "10px";
    row.style.background = "rgba(255,255,255,0.04)";

    const name = document.createElement("div");
    name.textContent = msg.username || "Player";
    name.style.color = "#ffdf81";
    name.style.fontWeight = "900";
    name.style.marginBottom = "2px";

    const text = document.createElement("div");
    text.textContent = msg.text || "";
    text.style.whiteSpace = "pre-wrap";
    text.style.wordBreak = "break-word";

    row.appendChild(name);
    row.appendChild(text);
    chatMessagesEl.appendChild(row);

    if (scroll) {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
}

function createFlashOverlay() {
    flashEl = document.createElement("div");
    flashEl.style.position = "absolute";
    flashEl.style.inset = "0";
    flashEl.style.pointerEvents = "none";
    flashEl.style.opacity = "0";
    flashEl.style.transition = "opacity 140ms ease";
    flashEl.style.zIndex = "17";
    document.body.appendChild(flashEl);
}

function createModeBadge() {
    modeBadge = document.createElement("div");
    modeBadge.style.position = "absolute";
    modeBadge.style.left = "16px";
    modeBadge.style.top = "88px";
    modeBadge.style.zIndex = "12";
    modeBadge.style.pointerEvents = "none";
    modeBadge.style.background = "rgba(44, 18, 9, 0.68)";
    modeBadge.style.border = "3px solid rgba(255, 206, 92, 0.5)";
    modeBadge.style.borderRadius = "16px";
    modeBadge.style.padding = "8px 12px";
    modeBadge.style.color = "#ffdf81";
    modeBadge.style.fontFamily = "Arial, sans-serif";
    modeBadge.style.fontWeight = "900";
    modeBadge.style.fontSize = "14px";
    modeBadge.style.lineHeight = "1.25";
    document.body.appendChild(modeBadge);
}

function createInfectedOverlay() {
    infectedOverlayEl = document.createElement("div");
    infectedOverlayEl.style.position = "absolute";
    infectedOverlayEl.style.inset = "0";
    infectedOverlayEl.style.pointerEvents = "none";
    infectedOverlayEl.style.zIndex = "10";
    infectedOverlayEl.style.opacity = "0";
    infectedOverlayEl.style.transition = "opacity 240ms ease";
    infectedOverlayEl.style.background = "radial-gradient(circle at center, rgba(0,0,0,0.10) 0%, rgba(0, 40, 0, 0.18) 45%, rgba(0,0,0,0.42) 100%)";
    document.body.appendChild(infectedOverlayEl);
}

function updateInfectedOverlay() {
    if (!infectedOverlayEl) return;
    infectedOverlayEl.style.opacity = gameState.mode === "infected" ? "1" : "0";
}

function updatePreview() {
    const name = (usernameInput.value.trim() || "PLAYER").slice(0, 14);

    previewHat.textContent = selectedHat;
    previewBody.style.background = selectedColor;
    previewFace.textContent = selectedFace;
    previewAccessory.textContent = selectedAccessory === "none" ? "" : selectedAccessory;
    previewName.textContent = name;

    if (selectedAvatarData) {
        previewAvatarImg.src = selectedAvatarData;
        previewAvatarImg.style.display = "block";
        previewFace.style.display = "none";
        if (avatarStatusText) avatarStatusText.textContent = "Custom image ready.";
    } else {
        previewAvatarImg.style.display = "none";
        previewFace.style.display = "block";
        if (avatarStatusText) avatarStatusText.textContent = "No custom image selected.";
    }
}

function flashScreen(color = "rgba(255, 225, 120, 0.26)", duration = 150) {
    if (!flashEl) return;
    flashEl.style.background = color;
    flashEl.style.opacity = "1";

    setTimeout(() => {
        if (flashEl) flashEl.style.opacity = "0";
    }, duration);
}

function shakeCamera(duration = 140, intensity = 0.004) {
    if (!sceneRef || !sceneRef.cameras || !sceneRef.cameras.main) return;
    sceneRef.cameras.main.shake(duration, intensity);
}

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
}

function stopLoop() {
    if (!currentLoop) return;
    currentLoop.pause();
    currentLoop.currentTime = 0;
    currentLoop = null;
    currentLoopName = null;
    currentLoopSyncStartedAt = null;
}

function playLoop(name, volume = 0.5) {
    if (!audioUnlocked || isMuted) return;
    const src = audioTracks[name];
    if (!src) return;

    if (currentLoop && currentLoopName === name && currentLoopSyncStartedAt === null) {
        currentLoop.volume = volume;
        return;
    }

    stopLoop();

    currentLoop = new Audio(src);
    currentLoop.loop = true;
    currentLoop.volume = volume;
    currentLoopName = name;
    currentLoopSyncStartedAt = null;

    currentLoop.play().catch((err) => {
        console.log(`Failed to play loop "${name}"`, err);
    });
}

function playLoopSynced(name, volume = 0.5, startedAt = 0) {
    if (!audioUnlocked || isMuted) return;
    const src = audioTracks[name];
    if (!src || !startedAt) return;

    if (currentLoop && currentLoopName === name && currentLoopSyncStartedAt === startedAt) {
        currentLoop.volume = volume;
        return;
    }

    stopLoop();

    currentLoop = new Audio(src);
    currentLoop.loop = true;
    currentLoop.volume = volume;
    currentLoopName = name;
    currentLoopSyncStartedAt = startedAt;

    const startPlayback = () => {
        try {
            if (currentLoop.duration && isFinite(currentLoop.duration) && currentLoop.duration > 0) {
                const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
                currentLoop.currentTime = elapsed % currentLoop.duration;
            }
        } catch (e) {
            console.log("sync seek failed", e);
        }

        currentLoop.play().catch((err) => {
            console.log(`Failed to play synced loop "${name}"`, err);
        });
    };

    currentLoop.addEventListener("loadedmetadata", startPlayback, { once: true });
    currentLoop.load();
}

function updateAudioState() {
    if (!audioUnlocked) return;

    if (isMuted) {
        stopLoop();
        return;
    }

    const me = players[myId];

    if (gameState.mode === "infected" && gameState.music?.track && gameState.music?.startedAt) {
        playLoopSynced(gameState.music.track, 0.72, gameState.music.startedAt);
        return;
    }

    if (me && (me.isFatFook || me.infected)) {
        playLoop("whale", 0.72);
        return;
    }

    playLoop("normal", 0.42);
}

function playBurpFallback(volume = 0.6) {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(850, now);
        filter.frequency.exponentialRampToValueAtTime(240, now + 0.4);

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.42);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.11 * volume, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.46);

        setTimeout(() => {
            ctx.close().catch(() => {});
        }, 550);
    } catch (e) {
        console.log("Burp fallback failed", e);
    }
}

async function compressImageToDataUrl(file, maxSize = 256, quality = 0.82) {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = maxSize;
    canvas.height = maxSize;

    ctx.clearRect(0, 0, maxSize, maxSize);

    const scale = Math.max(maxSize / img.width, maxSize / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const dx = (maxSize - drawWidth) / 2;
    const dy = (maxSize - drawHeight) / 2;

    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

    return canvas.toDataURL("image/jpeg", quality);
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function joinFromMenu() {
    const username = usernameInput.value.trim() || "PLAYER";

    unlockAudio();
    updateAudioState();

    socket.emit("joinGame", {
        username,
        hat: selectedHat,
        face: selectedFace,
        accessory: selectedAccessory,
        color: selectedColor,
        avatarData: selectedAvatarData,
        gameMode: selectedGameMode
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
            { fontSize: `${28 + Math.random() * 34}px` }
        )
        .setAlpha(0.08)
        .setAngle(-25 + Math.random() * 50)
        .setDepth(-900)
        .setOrigin(0.5);
    }
}

function clearSpriteParts(sprite) {
    if (!sprite) return;

    if (sprite.avatar) sprite.avatar.clearMask?.();
    if (sprite.container) sprite.container.destroy(true);
    if (sprite.avatarMaskShape) sprite.avatarMaskShape.destroy();
}

function clearAllSprites() {
    for (const id in playerSprites) {
        clearSpriteParts(playerSprites[id]);
    }
    playerSprites = {};

    for (const id in foodSprites) {
        foodSprites[id].text.destroy();
    }
    foodSprites = {};
}

function getDefaultFaceBySize(size) {
    if (size < 50) return "😐";
    if (size < 90) return "🙂";
    if (size < 150) return "😋";
    if (size < whaleSize) return "🥴";
    return "😵";
}

function getRenderedFace(player) {
    return player.face || getDefaultFaceBySize(player.size);
}

function getVisualFontSize(size) {
    return Math.min(138, 28 + size * 0.34);
}

function getBodyRadius(size) {
    const fontSize = getVisualFontSize(size);
    return Math.max(22, fontSize * 0.52);
}

function getBodyColors(player, isLeader) {
    const hexColor = player.infected ? "#99ff66" : (player.color || "#ffcc4d");
    const base = Phaser.Display.Color.HexStringToColor(hexColor);
    const darker = Phaser.Display.Color.Interpolate.ColorWithColor(base, { r: 0, g: 0, b: 0 }, 100, 22);
    const lighter = Phaser.Display.Color.Interpolate.ColorWithColor(base, { r: 255, g: 255, b: 255 }, 100, 18);

    return {
        fill: Phaser.Display.Color.GetColor(base.red, base.green, base.blue),
        shade: Phaser.Display.Color.GetColor(darker.r, darker.g, darker.b),
        highlight: Phaser.Display.Color.GetColor(lighter.r, lighter.g, lighter.b),
        stroke: player.infected ? 0x66ff88 : (player.isFatFook ? 0xffd54a : (isLeader ? 0xfff176 : 0x000000)),
        strokeAlpha: player.infected ? 1 : (player.isFatFook ? 1 : (isLeader ? 0.6 : 0.35)),
        innerStroke: player.infected ? 0xddffcc : (player.isFatFook ? 0xfff4b5 : 0xffffff),
        innerStrokeAlpha: player.infected ? 0.3 : (player.isFatFook ? 0.24 : 0.12)
    };
}

function getAvatarSignature(player) {
    if (!player?.avatarData) return "none";
    return `${player.avatarData.length}:${player.avatarData.slice(0, 40)}`;
}

function getAvatarTextureKey(id) {
    return `avatar_${id}`;
}

function ensureAvatarTexture(id, dataUrl) {
    if (!sceneRef || !dataUrl) return false;

    const key = getAvatarTextureKey(id);
    const existing = avatarTextureState[id];

    if (existing && existing.dataUrl === dataUrl && existing.ready) return true;
    if (existing && existing.dataUrl === dataUrl && !existing.ready) return false;

    avatarTextureState[id] = { key, dataUrl, ready: false };

    const img = new Image();
    img.onload = () => {
        if (!sceneRef || !sceneRef.textures) return;

        if (sceneRef.textures.exists(key)) sceneRef.textures.remove(key);

        const canvasTexture = sceneRef.textures.createCanvas(key, 256, 256);
        const ctx = canvasTexture.getContext();

        ctx.clearRect(0, 0, 256, 256);

        const scale = Math.max(256 / img.width, 256 / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const dx = (256 - drawWidth) / 2;
        const dy = (256 - drawHeight) / 2;

        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
        canvasTexture.refresh();

        avatarTextureState[id].ready = true;

        if (playerSprites[id]) rebuildAvatarForSprite(id);
    };

    img.onerror = () => {
        if (avatarTextureState[id]) avatarTextureState[id].ready = false;
    };

    img.src = dataUrl;
    return false;
}

function createAvatarDisplay(player, id, faceText, avatarDiameter) {
    if (player.avatarData) {
        const ready = ensureAvatarTexture(id, player.avatarData);
        if (ready && sceneRef.textures.exists(getAvatarTextureKey(id))) {
            const img = sceneRef.add.image(0, 0, getAvatarTextureKey(id))
                .setOrigin(0.5)
                .setDisplaySize(avatarDiameter, avatarDiameter);
            img.avatarKind = "image";
            return img;
        }
    }

    const text = sceneRef.add.text(0, 0, faceText, {
        fontSize: `${Math.max(24, avatarDiameter * 0.9)}px`
    }).setOrigin(0.5);
    text.avatarKind = "text";
    return text;
}

function rebuildAvatarForSprite(id) {
    const sprite = playerSprites[id];
    const player = players[id];
    if (!sprite || !player) return;

    const radius = getBodyRadius(player.size);
    const avatarRadius = Math.max(12, radius - 5);
    const avatarDiameter = avatarRadius * 2;
    const faceText = getRenderedFace(player);

    if (sprite.avatar) {
        sprite.avatar.clearMask?.();
        sprite.avatar.destroy();
    }

    sprite.avatar = createAvatarDisplay(player, id, faceText, avatarDiameter);
    sprite.avatar.setMask(sprite.avatarMask);
    sprite.avatarHolder.add(sprite.avatar);
    sprite.avatarSignature = getAvatarSignature(player);
    sprite.avatarKind = sprite.avatar.avatarKind || "text";
}

function rebuildAvatarIfNeeded(id, p) {
    const sprite = playerSprites[id];
    if (!sprite) return;

    const signatureNeeded = getAvatarSignature(p);

    let avatarKindNeeded = "text";
    if (p.avatarData) {
        avatarKindNeeded = ensureAvatarTexture(id, p.avatarData) ? "image" : "text";
    }

    const needsRebuild =
        sprite.avatarSignature !== signatureNeeded ||
        sprite.avatarKind !== avatarKindNeeded;

    if (needsRebuild) rebuildAvatarForSprite(id);
}

function createEatBurst(x, y, emoji = "🍔") {
    if (!sceneRef) return;

    const burst = sceneRef.add.text(x, y, emoji, {
        fontSize: "24px"
    }).setOrigin(0.5);

    burst.setDepth(2000);

    sceneRef.tweens.add({
        targets: burst,
        y: y - 18,
        alpha: 0,
        scaleX: 1.35,
        scaleY: 1.35,
        angle: -12 + Math.random() * 24,
        duration: 280,
        ease: "Cubic.Out",
        onComplete: () => burst.destroy()
    });
}

function syncFood() {
    const visibleFood = shouldShowFood() ? food : [];
    const currentFoodIds = new Set();

    for (const f of visibleFood) {
        currentFoodIds.add(f.id);

        if (!foodSprites[f.id]) {
            const foodText = sceneRef.add.text(
                f.x,
                f.y,
                f.emoji,
                { fontSize: "22px" }
            ).setOrigin(0.5);

            const wobbleSeed = Math.random() * 1000;

            foodSprites[f.id] = {
                text: foodText,
                wobbleSeed
            };
        }

        const sprite = foodSprites[f.id];
        sprite.text.x = f.x;
        sprite.text.y = f.y;
        sprite.text.setText(f.emoji);

        const t = Date.now() / 280;
        const bob = Math.sin(t + sprite.wobbleSeed) * 1.8;
        const rot = Math.sin(t * 0.7 + sprite.wobbleSeed) * 4;

        sprite.text.y = f.y + bob;
        sprite.text.setAngle(rot);
        sprite.text.setScale(1 + Math.sin(t * 1.15 + sprite.wobbleSeed) * 0.03);
    }

    for (const id in foodSprites) {
        if (!currentFoodIds.has(Number(id))) {
            foodSprites[id].text.destroy();
            delete foodSprites[id];
        }
    }
}

function createPlayerVisual(p, id) {
    const faceText = getRenderedFace(p);
    const radius = getBodyRadius(p.size);
    const avatarRadius = Math.max(12, radius - 5);
    const avatarDiameter = avatarRadius * 2;
    const isLeader = id === leaderId;
    const colors = getBodyColors(p, isLeader);

    const container = sceneRef.add.container(p.x, p.y);
    container.setDepth(id === myId ? 120 : 100);

    const shadow = sceneRef.add.ellipse(0, radius * 0.9, radius * 1.65, radius * 0.55, 0x000000, 0.18);
    const bodyBack = sceneRef.add.circle(0, 2, radius + 2, colors.shade, 0.28);
    const body = sceneRef.add.circle(0, 0, radius, colors.fill);
    const bodyInner = sceneRef.add.circle(0, -radius * 0.14, radius * 0.72, colors.highlight, 0.12);

    body.setStrokeStyle(p.isFatFook || p.infected ? 6 : 4, colors.stroke, colors.strokeAlpha);
    bodyBack.setStrokeStyle(2, 0x000000, 0.18);
    bodyInner.setStrokeStyle(2, colors.innerStroke, colors.innerStrokeAlpha);

    const avatarHolder = sceneRef.add.container(0, 0);
    const avatar = createAvatarDisplay(p, id, faceText, avatarDiameter);

    const avatarMaskShape = sceneRef.add.graphics();
    avatarMaskShape.fillStyle(0xffffff, 1);
    avatarMaskShape.fillCircle(p.x, p.y, avatarRadius);
    avatarMaskShape.visible = false;

    const avatarMask = avatarMaskShape.createGeometryMask();
    avatar.setMask(avatarMask);
    avatarHolder.add(avatar);

    const accessoryText = p.accessory && p.accessory !== "none" ? p.accessory : "";

    const hat = sceneRef.add.text(0, -radius * 0.96, p.hat || "🧢", {
        fontSize: `${Math.max(22, radius * 0.8)}px`
    }).setOrigin(0.5);

    const accessory = sceneRef.add.text(0, radius * 0.28, accessoryText, {
        fontSize: `${Math.max(16, radius * 0.56)}px`
    }).setOrigin(0.5);

    const crown = sceneRef.add.text(0, -radius * 1.7, "👑", {
        fontSize: `${Math.max(28, radius * 0.72)}px`
    }).setOrigin(0.5);

    const name = sceneRef.add.text(0, radius * 1.08, p.username || "Player", {
        fontSize: `${Math.max(16, Math.min(22, radius * 0.42))}px`,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
        fontFamily: "Arial",
        fontStyle: "bold"
    }).setOrigin(0.5);

    crown.setVisible(id === leaderId);

    const sprite = {
        container,
        shadow,
        bodyBack,
        body,
        bodyInner,
        avatarHolder,
        avatar,
        avatarMaskShape,
        avatarMask,
        hat,
        accessory,
        crown,
        name,
        avatarSignature: getAvatarSignature(p),
        avatarKind: avatar.avatarKind || "text",
        wobbleTimeOffset: Math.random() * 1000,
        lastKnownX: p.x,
        lastKnownY: p.y,
        visualPop: 0
    };

    container.add([
        shadow,
        bodyBack,
        body,
        bodyInner,
        avatarHolder,
        hat,
        accessory,
        crown,
        name
    ]);

    return sprite;
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

        if (!playerSprites[id]) {
            playerSprites[id] = createPlayerVisual(p, id);
        }

        updatePlayerVisual(playerSprites[id], p, id);
    }
}

function updatePlayerVisual(sprite, p, id) {
    const isLeader = id === leaderId;
    const radius = getBodyRadius(p.size);
    const avatarRadius = Math.max(12, radius - 5);
    const avatarDiameter = avatarRadius * 2;
    const faceText = getRenderedFace(p);
    const colors = getBodyColors(p, isLeader);

    rebuildAvatarIfNeeded(id, p);

    let targetX = p.x;
    let targetY = p.y;

    if (id !== myId) {
        targetX = p.targetX ?? p.x;
        targetY = p.targetY ?? p.y;
    }

    const moveLerp = id === myId ? 1 : 0.28;
    sprite.container.x = Phaser.Math.Linear(sprite.container.x, targetX, moveLerp);
    sprite.container.y = Phaser.Math.Linear(sprite.container.y, targetY, moveLerp);

    const cx = sprite.container.x;
    const cy = sprite.container.y;

    const dx = cx - (sprite.lastKnownX ?? cx);
    const dy = cy - (sprite.lastKnownY ?? cy);
    sprite.lastKnownX = cx;
    sprite.lastKnownY = cy;

    const speedMag = Math.sqrt(dx * dx + dy * dy);
    const now = performance.now();
    const wobbleClock = now / 180 + sprite.wobbleTimeOffset;

    sprite.avatarMaskShape.clear();
    sprite.avatarMaskShape.fillStyle(0xffffff, 1);
    sprite.avatarMaskShape.fillCircle(cx, cy, avatarRadius);

    sprite.shadow.width = radius * (1.65 + Math.min(0.08, speedMag * 0.01));
    sprite.shadow.height = radius * 0.55;
    sprite.shadow.y = radius * 0.92;
    sprite.shadow.alpha = (p.isFatFook || p.infected) ? 0.24 : 0.18;

    sprite.bodyBack.setRadius(radius + 2);
    sprite.bodyBack.y = 2;
    sprite.bodyBack.setFillStyle(colors.shade, 0.28);
    sprite.bodyBack.setStrokeStyle(2, 0x000000, 0.18);

    sprite.body.setRadius(radius);
    sprite.body.setFillStyle(colors.fill);
    sprite.body.setStrokeStyle((p.isFatFook || p.infected) ? 6 : 4, colors.stroke, colors.strokeAlpha);

    sprite.bodyInner.setRadius(radius * 0.72);
    sprite.bodyInner.y = -radius * 0.14;
    sprite.bodyInner.setFillStyle(colors.highlight, 0.12);
    sprite.bodyInner.setStrokeStyle(2, colors.innerStroke, colors.innerStrokeAlpha);

    if (p.justAteAt && now - p.justAteAt < 220) {
        const eatStrength = Phaser.Math.Clamp((220 - (now - p.justAteAt)) / 220, 0, 1) * (p.eatPop || 0.45);
        sprite.visualPop = Math.max(sprite.visualPop, eatStrength * 0.18);
    }

    sprite.visualPop = Phaser.Math.Linear(sprite.visualPop || 0, 0, 0.12);

    const movementLeanX = Phaser.Math.Clamp(dx * 0.06, -0.08, 0.08);
    const movementLeanY = Phaser.Math.Clamp(dy * 0.06, -0.08, 0.08);

    let baseScaleX = 1 + movementLeanX;
    let baseScaleY = 1 - Math.abs(movementLeanX) * 0.5;

    if (Math.abs(movementLeanY) > Math.abs(movementLeanX)) {
        baseScaleY = 1 + movementLeanY;
        baseScaleX = 1 - Math.abs(movementLeanY) * 0.5;
    }

    let bulgeScale = 0;
    let bulgeAngle = 0;
    let avatarBulgeX = 1;
    let avatarBulgeY = 1;
    let bodyPulse = 1;

    if (p.isFatFook || p.infected) {
        const fatStrength = Phaser.Math.Clamp((p.size - whaleSize) / 180, 0, 1);
        const idleBulge = Math.sin(wobbleClock * 0.9) * (0.03 + fatStrength * 0.035);
        const jiggle = Math.sin(wobbleClock * 1.8) * (0.02 + fatStrength * 0.03);
        const sideJiggle = Math.cos(wobbleClock * 1.25) * (0.018 + fatStrength * 0.022);

        bulgeScale = idleBulge + jiggle + sprite.visualPop * 0.55;
        bulgeAngle = sideJiggle * (p.infected ? 7 : 5.5);

        avatarBulgeX = 1.06 + Math.max(0, bulgeScale * 0.9);
        avatarBulgeY = 1 + Math.max(0, bulgeScale * 0.45);
        bodyPulse = 1 + bulgeScale;

        baseScaleX += 0.04 + fatStrength * 0.045;
        baseScaleY -= 0.015;
    } else {
        bodyPulse = 1 + sprite.visualPop * 0.8;
        avatarBulgeX = 1 + sprite.visualPop * 0.22;
        avatarBulgeY = 1 + sprite.visualPop * 0.14;
    }

    const finalScaleX = Phaser.Math.Clamp(baseScaleX * bodyPulse, 0.9, 1.28);
    const finalScaleY = Phaser.Math.Clamp(baseScaleY * bodyPulse, 0.9, 1.22);

    sprite.container.scaleX = Phaser.Math.Linear(sprite.container.scaleX, finalScaleX, (p.isFatFook || p.infected) ? 0.18 : 0.22);
    sprite.container.scaleY = Phaser.Math.Linear(sprite.container.scaleY, finalScaleY, (p.isFatFook || p.infected) ? 0.18 : 0.22);
    sprite.container.angle = Phaser.Math.Linear(sprite.container.angle, bulgeAngle, (p.isFatFook || p.infected) ? 0.12 : 0.18);

    if (sprite.avatar.avatarKind === "image") {
        sprite.avatar.setDisplaySize(
            avatarDiameter * avatarBulgeX,
            avatarDiameter * avatarBulgeY
        );
        sprite.avatar.setAngle(bulgeAngle * 0.45);
    } else {
        sprite.avatar.setText(faceText);
        sprite.avatar.setFontSize(Math.max(24, avatarDiameter * 0.9));
        sprite.avatar.setScale(avatarBulgeX, avatarBulgeY);
        sprite.avatar.setAngle(bulgeAngle * 0.45);
    }

    sprite.bodyInner.scaleX = Phaser.Math.Linear(sprite.bodyInner.scaleX, 1 + Math.max(0, bulgeScale * 0.22), 0.18);
    sprite.bodyInner.scaleY = Phaser.Math.Linear(sprite.bodyInner.scaleY, 1 + Math.max(0, bulgeScale * 0.1), 0.18);

    sprite.hat.y = -radius * 0.96;
    sprite.hat.setText(p.hat || "🧢");
    sprite.hat.setFontSize(Math.max(22, radius * 0.8));
    sprite.hat.angle = Phaser.Math.Linear(sprite.hat.angle, bulgeAngle * 0.65, 0.16);

    const accessoryText = p.accessory && p.accessory !== "none" ? p.accessory : "";
    sprite.accessory.y = radius * 0.28;
    sprite.accessory.setText(accessoryText);
    sprite.accessory.setFontSize(Math.max(16, radius * 0.56));
    sprite.accessory.angle = Phaser.Math.Linear(sprite.accessory.angle, -bulgeAngle * 0.35, 0.16);

    sprite.name.y = radius * 1.08;
    sprite.name.setText(p.username || "Player");
    sprite.name.setFontSize(Math.max(16, Math.min(22, radius * 0.42)));

    sprite.crown.y = -radius * 1.7;
    sprite.crown.setVisible(id === leaderId);
    sprite.crown.setFontSize(Math.max(28, radius * 0.72));

    if (id === leaderId) {
        sprite.crown.setScale(1 + Math.sin(Date.now() / 180) * 0.06);
        sprite.body.setScale(1 + Math.sin(Date.now() / 220) * 0.015);
    } else {
        sprite.crown.setScale(1);
        sprite.body.setScale(1);
    }

    if (p.isFatFook || p.infected) {
        sprite.bodyBack.scaleX = Phaser.Math.Linear(sprite.bodyBack.scaleX, 1 + Math.max(0, bulgeScale * 0.2), 0.12);
        sprite.bodyBack.scaleY = Phaser.Math.Linear(sprite.bodyBack.scaleY, 1 + Math.max(0, bulgeScale * 0.12), 0.12);
    } else {
        sprite.bodyBack.scaleX = Phaser.Math.Linear(sprite.bodyBack.scaleX, 1, 0.14);
        sprite.bodyBack.scaleY = Phaser.Math.Linear(sprite.bodyBack.scaleY, 1, 0.14);
    }
}

function update() {
    if (!joined) return;

    const me = players[myId];
    if (!me) return;

    let speed = 10 / (1 + me.size / 60);
    if (speed < 1.9) speed = 1.9;

    if (gameState.mode === "infected") {
        if (me.infected) speed += 0.55;
        else speed += 0.15;
    } else if (gameState.tagEvent?.active && gameState.tagEvent.leaderId === myId) {
        speed += 0.7;
    }

    let moveX = 0;
    let moveY = 0;

    if (cursors.left.isDown || wasdKeys.left.isDown) moveX -= 1;
    if (cursors.right.isDown || wasdKeys.right.isDown) moveX += 1;
    if (cursors.up.isDown || wasdKeys.up.isDown) moveY -= 1;
    if (cursors.down.isDown || wasdKeys.down.isDown) moveY += 1;

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
    updateModeBadge();
    updateInfectedOverlay();
}

function updateCamera(forceSnap = false) {
    const me = players[myId];
    if (!me || !sceneRef) return;

    const cam = sceneRef.cameras.main;
    const targetZoom = getTargetZoom();

    if (forceSnap) {
        cam.setZoom(targetZoom);
    } else {
        cam.zoom = Phaser.Math.Linear(cam.zoom, targetZoom, 0.08);
    }

    const visibleWidth = cam.width / cam.zoom;
    const visibleHeight = cam.height / cam.zoom;

    const targetX = me.x - visibleWidth / 2;
    const targetY = me.y - visibleHeight / 2;

    cam.scrollX = Phaser.Math.Linear(cam.scrollX, targetX, 0.12);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetY, 0.12);
}

function shouldShowFood() {
    return gameState.mode !== "infected";
}

function renderLeaderboard() {
    if (!leaderboardEl) return;

    let html = `
        <div class="lb-card">
            <div class="lb-head">LEADERBOARD</div>
            <div class="lb-sub">${gameState.mode === "infected" ? "INFECTED MODE" : "NORMAL MODE"}</div>
    `;

    if (!leaderboard.length) {
        html += `
            <div class="lb-row">
                <div class="lb-rank">-</div>
                <div class="lb-name">No players</div>
                <div class="lb-score">0</div>
            </div>
        `;
    } else {
        leaderboard.forEach((p, index) => {
            const status = p.infected ? " 🦠" : "";
            html += `
                <div class="lb-row">
                    <div class="lb-rank">#${index + 1}</div>
                    <div class="lb-name">${escapeHtml((p.username || "Player") + status)}</div>
                    <div class="lb-score">${Math.round(p.score || 0)}</div>
                </div>
            `;
        });
    }

    html += `</div>`;
    leaderboardEl.innerHTML = html;
}

function updateScoreBadge() {
    if (!scoreBadge) return;

    const me = players[myId];

    if (!me) {
        scoreBadge.innerHTML = `Score: 0 | Size: 30<br><span style="font-size:12px;opacity:.92;">Need 1000 score for HIDE MODE</span>`;
        return;
    }

    if (gameState.mode === "infected") {
        scoreBadge.innerHTML =
            `Score: ${Math.round(me.score || 0)} | Size: ${Math.round(me.size || 30)}<br>` +
            `<span style="font-size:12px;opacity:.92;">Status: ${me.infected ? "INFECTED" : "SURVIVOR"}</span>`;
    } else {
        const needed = Math.max(0, 1000 - (me.score || 0));
        scoreBadge.innerHTML =
            `Score: ${Math.round(me.score || 0)} | Size: ${Math.round(me.size || 30)}<br>` +
            `<span style="font-size:12px;opacity:.92;">${needed > 0 ? `Need ${needed} score for HIDE MODE` : "HIDE MODE READY"}</span>`;
    }
}

function updateModeBadge() {
    if (!modeBadge) return;

    const now = Date.now();
    const lines = [];

    if (gameState.mode === "infected") {
        lines.push("MODE: INFECTED");

        const infected = gameState.infected || {};

        if (infected.phase === "waiting") {
            lines.push("WAITING FOR PLAYERS");
        } else if (infected.phase === "countdown") {
            const secs = Math.max(0, Math.ceil((infected.countdownEndsAt - now) / 1000));
            lines.push(`STARTS IN: ${secs}s`);
        } else if (infected.phase === "active") {
            const secs = Math.max(0, Math.ceil((infected.roundEndsAt - now) / 1000));
            lines.push(`TIME LEFT: ${secs}s`);
            lines.push(`INFECTED: ${Array.isArray(infected.infectedIds) ? infected.infectedIds.length : 0}`);
        } else if (infected.phase === "postRound") {
            const secs = Math.max(0, Math.ceil((infected.postRoundEndsAt - now) / 1000));
            lines.push(`NEXT ROUND: ${secs}s`);
        } else {
            lines.push("ROUND STATUS UNKNOWN");
        }
    } else {
        lines.push("MODE: NORMAL");

        if (gameState.tagEvent?.active) {
            const secs = Math.max(0, Math.ceil((gameState.tagEvent.endsAt - now) / 1000));
            lines.push(`HIDE MODE: ${secs}s`);
        } else {
            lines.push("FREE EAT MODE");
        }
    }

    const me = players[myId];
    if (me) {
        if (me.infected) {
            lines.push("STATUS: INFECTED");
        } else if (me.isFatFook) {
            lines.push("STATUS: FAT FOOK");
        } else {
            lines.push("STATUS: NORMAL");
        }
    }

    modeBadge.innerHTML = lines.join("<br>");
}

function getTargetZoom() {
    const me = players[myId];
    if (!me) return 1;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const size = me.size || 30;

    let zoom = 1.12 - Math.min(0.55, size / 850);

    if (isMobile) {
        zoom -= 0.12;
    }

    return Phaser.Math.Clamp(zoom, 0.42, 1.2);
}

function showToast(text) {
    if (!toastEl) return;

    toastEl.textContent = text;
    toastEl.classList.add("show");

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 1600);
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}