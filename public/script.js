const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let gameState = {};
let myId = null;
let selectedClass = 'marksman';
let keys = { up: false, down: false, left: false, right: false, dash: false };
let mouseX = 0, mouseY = 0;
let pulseTick = 0;
let fxParticles = [];
let autoFireEnabled = false;
let lastAutoFireTime = 0;

// 🎥 Smooth 60+ FPS Camera Lerp Variables
let camX = 1600;
let camY = 1600;
let targetCamX = 1600;
let targetCamY = 1600;

// 💻 FPS & Latency Counter Variables
let frameCount = 0;
let lastFpsUpdate = Date.now();
let currentFps = 60;

function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    if (toast) {
        toast.innerText = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }
}

// Persistent Survivor Name Handling
const nameInput = document.getElementById('player-name-input');
const savedName = localStorage.getItem('survivorName');
if (savedName && nameInput) {
    nameInput.value = savedName;
}

function getPlayerName() {
    const val = nameInput ? nameInput.value.trim() : '';
    const finalName = val || 'Survivor';
    localStorage.setItem('survivorName', finalName);
    return finalName;
}

if (nameInput) {
    nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        if (val) localStorage.setItem('survivorName', val);
    });
}

function copyPartyCode() {
    const info = document.getElementById('lobby-info');
    if (info && info.innerText.includes(': ')) {
        const code = info.innerText.split(': ')[1];
        if (code) {
            navigator.clipboard.writeText(code);
            showToast('Party Code ' + code + ' Copied!');
        }
    }
}

// Web Audio API Synthesizer Engine
let audioCtx = null;
let audioEnabled = true;

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const btn = document.getElementById('audio-toggle-btn');
    if (btn) btn.innerText = audioEnabled ? '🔊 SFX ON' : '🔇 SFX OFF';
}

function togglePause() {
    const pauseModal = document.getElementById('pause-modal');
    if (pauseModal) pauseModal.classList.toggle('hidden');
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
window.addEventListener('click', initAudio, { once: false });
window.addEventListener('keydown', initAudio, { once: false });

function playSFX(type) {
    if (!audioEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        if (type === 'shoot') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.08);
        } else if (type === 'flame') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'nuke') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 1.2);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 1.2);
        } else if (type === 'waveClear') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.4);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.4);
        }
    } catch (e) {}
}

function spawnFXParticle(x, y, vx, vy, color, size, life, shape = 'circle') {
    fxParticles.push({ x, y, vx, vy, color, size, life, maxLife: life, shape });
}

socket.on('connect', () => { myId = socket.id; });

socket.on('leaderboardUpdate', (board) => {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    if (!board || board.length === 0) {
        list.innerHTML = `<div style="color: #64748b;">No high scores recorded yet. Be the first!</div>`;
        return;
    }
    list.innerHTML = board.map((item, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`;
        const borderCol = idx === 0 ? '#f1c40f' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'rgba(255,255,255,0.1)';
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:12px; border:1px solid ${borderCol}; shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <div>
                <span style="font-weight:900; color:var(--accent-gold); margin-right:8px;">${medal}</span>
                <span style="font-weight:800; color:#fff;">${item.name}</span>
            </div>
            <div style="font-weight:800; color:var(--accent-green);">Wave ${item.wave} (${item.kills} Kills)</div>
        </div>
    `;}).join('');
});

function chooseClass(c, btn) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('selected'));
    if (btn) btn.classList.add('selected');
}

function startSoloGame() {
    initAudio();
    camX = 1600; camY = 1600; targetCamX = 1600; targetCamY = 1600;
    socket.emit('startSoloGame', { class: selectedClass, name: getPlayerName() });
}

function startBossRush() {
    initAudio();
    camX = 1600; camY = 1600; targetCamX = 1600; targetCamY = 1600;
    socket.emit('startBossRush', { class: selectedClass, name: getPlayerName() });
}

function createParty() { initAudio(); socket.emit('createParty', getPlayerName()); }
function joinParty() { initAudio(); socket.emit('joinParty', { code: document.getElementById('party-code-input').value, name: getPlayerName() }); }
function startGame() { initAudio(); socket.emit('startGame'); }
function retryGame() {
    document.getElementById('death-screen').classList.add('hidden');
    camX = 1600; camY = 1600; targetCamX = 1600; targetCamY = 1600;
    socket.emit('restartGame');
}

function leaveToMenu() {
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('pause-modal').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    socket.emit('leaveRoom');
}

socket.on('leftRoom', () => {
    document.getElementById('lobby-screen').classList.remove('hidden');
});

function buy(item) { initAudio(); socket.emit('buy', item); }
function startWaveEarly() { initAudio(); socket.emit('startWaveEarly'); }
function placeTurret() { initAudio(); socket.emit('placeTurret'); }
function placeBarricade() { initAudio(); socket.emit('placeBarricade'); }

socket.on('partyCreated', (code) => {
    document.getElementById('lobby-info').innerText = 'PARTY CODE: ' + code;
    document.getElementById('start-btn').classList.remove('hidden');
    socket.emit('selectClass', { class: selectedClass, name: getPlayerName() });
});

socket.on('partyJoined', (code) => {
    document.getElementById('lobby-info').innerText = 'JOINED PARTY: ' + code;
    socket.emit('selectClass', { class: selectedClass, name: getPlayerName() });
});

socket.on('gameStarted', () => {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    camX = 1600; camY = 1600; targetCamX = 1600; targetCamY = 1600;
});

socket.on('killstreak', (data) => {
    const kb = document.getElementById('killstreak-banner');
    kb.innerText = data.player + ' ' + data.title;
    kb.style.opacity = 1;
    if (data.title.includes('NUKE')) playSFX('nuke');
    setTimeout(() => { kb.style.opacity = 0; }, 2500);
});

socket.on('perkPhase', (perks) => {
    playSFX('waveClear');
    const container = document.getElementById('perk-cards-container');
    container.innerHTML = '';
    perks.forEach(p => {
        const card = document.createElement('div');
        card.className = 'perk-card';
        card.innerHTML = `<div style="font-size:42px; margin-bottom:10px;">${p.icon}</div><h4 style="margin:0 0 8px 0; color:#f1c40f;">${p.title}</h4><p style="font-size:13px; color:#aaa; margin:0;">${p.desc}</p>`;
        card.onclick = () => {
            socket.emit('selectPerk', p.id);
            document.getElementById('perk-modal').classList.add('hidden');
        };
        container.appendChild(card);
    });
    document.getElementById('perk-modal').classList.remove('hidden');
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') keys.up = true;
    if (e.key === 's' || e.key === 'S') keys.down = true;
    if (e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === ' ') keys.dash = true;
    if (e.key === 'f' || e.key === 'F') socket.emit('useUltimate');
    if (e.key === 't' || e.key === 'T') {
        autoFireEnabled = !autoFireEnabled;
        showToast(autoFireEnabled ? '⚡ AUTO-FIRE ON' : '⚡ AUTO-FIRE OFF');
    }
    if (e.key === 'h' || e.key === 'H') socket.emit('quickHeal');
    if (e.key === 'Escape') togglePause();
    if (e.key === 'b' || e.key === 'B') {
        const shop = document.getElementById('shop');
        if (shop) shop.classList.toggle('hidden');
    }
    if (e.key === 'v' || e.key === 'V') {
        const pings = ["HELP ME!", "FALL BACK!", "NUKE READY!", "DEFEND HERE!"];
        const p = pings[Math.floor(Math.random()*pings.length)];
        socket.emit('sendPing', p);
    }
    if (e.key === 'e' || e.key === 'E') placeTurret();
    if (e.key === 'q' || e.key === 'Q') placeBarricade();
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W') keys.up = false;
    if (e.key === 's' || e.key === 'S') keys.down = false;
    if (e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === ' ') keys.dash = false;
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        const me = gameState.players ? gameState.players[myId] : null;
        if (me) {
            const worldX = mouseX - canvas.width/2 + (me.x + me.size/2);
            const worldY = mouseY - canvas.height/2 + (me.y + me.size/2);
            socket.emit('shoot', { x: worldX, y: worldY });
            playSFX(me.weaponType === 'flamethrower' ? 'flame' : 'shoot');

            const angle = me.aimAngle || 0;
            const pX = me.x + me.size/2 + Math.cos(angle) * 30;
            const pY = me.y + me.size/2 + Math.sin(angle) * 30;
            for (let i = 0; i < 4; i++) {
                spawnFXParticle(pX, pY, (Math.random()-0.5)*4, (Math.random()-0.5)*4, me.weaponType === 'freezeRay' ? '#38bdf8' : '#f1c40f', 6, 10);
            }
            if (me.weaponType === 'minigun' || me.weaponType === 'shotgun' || me.weaponType === 'pistol') {
                spawnFXParticle(me.x + me.size/2, me.y + me.size/2, -Math.cos(angle)*3 + (Math.random()-0.5), -Math.sin(angle)*3 + (Math.random()-0.5), '#eab308', 4, 18, 'casing');
            }
        }
    } else if (e.button === 2) {
        const me = gameState.players ? gameState.players[myId] : null;
        if (me) {
            const worldX = mouseX - canvas.width/2 + (me.x + me.size/2);
            const worldY = mouseY - canvas.height/2 + (me.y + me.size/2);
            socket.emit('useSkill', { x: worldX, y: worldY });
        }
    }
});
window.addEventListener('contextmenu', e => e.preventDefault());

socket.on('stateUpdate', (state) => {
    gameState = state;

    const me = gameState.players ? gameState.players[myId] : null;
    if (me) {
        const worldX = mouseX - canvas.width/2 + (me.x + me.size/2);
        const worldY = mouseY - canvas.height/2 + (me.y + me.size/2);
        const aimAngle = Math.atan2(worldY - (me.y + me.size/2), worldX - (me.x + me.size/2));
        socket.emit('move', { ...keys, aimAngle });

        const now = Date.now();
        if (autoFireEnabled && me.hp > 0 && (now - lastAutoFireTime > 150)) {
            lastAutoFireTime = now;
            socket.emit('shoot', { x: worldX, y: worldY });
        }

        document.getElementById('hp-bar').style.width = Math.max(0, (me.hp / Math.max(1, me.maxHp)) * 100) + '%';
        document.getElementById('hud-class').innerText = me.class.toUpperCase() + ' (' + me.weaponType + ')';
        document.getElementById('hud-money').innerText = '$' + me.money;
        document.getElementById('hud-wave').innerText = (state.isBossRush ? '👹 BOSS RUSH W' : 'Wave ') + state.wave + (state.waveActive ? ' (Active)' : ' (' + state.shopTimer + 's)');

        const hpRatio = me.hp / Math.max(1, me.maxHp);
        const lowHpDiv = document.getElementById('low-hp-vignette');
        if (lowHpDiv) {
            lowHpDiv.style.display = (hpRatio < 0.3 && me.hp > 0) ? 'block' : 'none';
        }

        const bossBanner = document.getElementById('boss-hp-banner');
        if (bossBanner) {
            if (state.bossHpRatio !== null && state.bossHpRatio !== undefined) {
                bossBanner.style.display = 'block';
                document.getElementById('boss-hp-bar').style.width = (state.bossHpRatio * 100) + '%';
            } else {
                bossBanner.style.display = 'none';
            }
        }

        const dashCD = document.getElementById('hud-dash-cd');
        if (me.dashCooldown > 0) {
            dashCD.innerText = (me.dashCooldown / 30).toFixed(1) + 's';
            dashCD.style.color = 'var(--accent-red)';
        } else {
            dashCD.innerText = 'READY';
            dashCD.style.color = 'var(--accent-green)';
        }

        const skillCD = document.getElementById('hud-skill-cd');
        if (me.skillCooldown > 0) {
            skillCD.innerText = (me.skillCooldown / 30).toFixed(1) + 's';
            skillCD.style.color = 'var(--accent-red)';
        } else {
            skillCD.innerText = 'READY';
            skillCD.style.color = 'var(--accent-blue)';
        }

        const ultCharge = me.ultCharge || 0;
        document.getElementById('ult-bar').style.width = ultCharge + '%';
        const ultStatus = document.getElementById('hud-ult-status');
        if (ultCharge >= 100) {
            ultStatus.innerText = 'READY (F)';
            ultStatus.style.color = 'var(--accent-gold)';
        } else {
            ultStatus.innerText = ultCharge + '%';
            ultStatus.style.color = 'var(--accent-purple)';
        }

        if (me.hp <= 0 || state.gameOver) {
            document.getElementById('death-screen').classList.remove('hidden');
            document.getElementById('death-wave').innerText = 'Wave ' + state.wave;
            document.getElementById('death-kills').innerText = me.totalKills || 0;
            document.getElementById('death-damage').innerText = me.totalDamage || 0;
        } else {
            document.getElementById('death-screen').classList.add('hidden');
        }
    }

    const eb = document.getElementById('event-banner');
    if (state.isBossRush) {
        eb.style.display = 'block'; eb.innerText = '👹 BOSS RUSH MODE (DOUBLE CASH)';
    } else if (state.environmentalEvent === 'bloodMoon') {
        eb.style.display = 'block'; eb.innerText = '🩸 BLOOD MOON ACTIVE (+2.5x CASH)';
    } else if (state.environmentalEvent === 'toxicStorm') {
        eb.style.display = 'block'; eb.innerText = '☣️ TOXIC STORM ACTIVE';
    } else { eb.style.display = 'none'; }

    const shop = document.getElementById('shop');
    if (!state.waveActive && state.shopTimer > 0 && me && me.hp > 0) shop.classList.remove('hidden');
    else if (state.waveActive) shop.classList.add('hidden');
});

// 🗺️ MINI-MAP RADAR DRAWING ROUTINE
function drawMinimap() {
    if (!minimapCtx) return;
    minimapCtx.clearRect(0, 0, 130, 130);
    minimapCtx.fillStyle = '#06060c'; minimapCtx.fillRect(0, 0, 130, 130);
    minimapCtx.strokeStyle = '#38bdf8'; minimapCtx.lineWidth = 2;
    minimapCtx.beginPath(); minimapCtx.arc(65, 65, 60, 0, Math.PI*2); minimapCtx.stroke();

    const scale = 120 / 3200;

    // Supply Crates
    (gameState.supplyCrates || []).forEach(sc => {
        minimapCtx.fillStyle = '#f1c40f';
        minimapCtx.fillRect(sc.x * scale - 3, sc.y * scale - 3, 6, 6);
    });

    // Zombies
    (gameState.zombies || []).forEach(z => {
        minimapCtx.fillStyle = z.type === 'boss' ? '#f1c40f' : '#ef4444';
        const size = z.type === 'boss' ? 7 : 3;
        minimapCtx.beginPath(); minimapCtx.arc(z.x * scale, z.y * scale, size, 0, Math.PI*2); minimapCtx.fill();
    });

    // Players
    if (gameState.players) {
        Object.values(gameState.players).forEach(p => {
            if (p.hp <= 0) return;
            minimapCtx.fillStyle = p.socketId === myId ? '#38bdf8' : '#22c55e';
            minimapCtx.beginPath(); minimapCtx.arc(p.x * scale, p.y * scale, 4, 0, Math.PI*2); minimapCtx.fill();
        });
    }
}

// 🎨 REFINED DRAWING HELPERS

function drawRefinedPowerUp(ctx, pu, tick) {
    ctx.save();
    ctx.translate(pu.x, pu.y);
    const pulse = Math.sin(tick * 0.1) * 3;

    if (pu.type === 'speed') {
        ctx.fillStyle = 'rgba(52, 152, 219, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 18 + pulse, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '12px Outfit'; ctx.fillText('⚡', -5, 4);
    } else if (pu.type === 'doubleDamage') {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 18 + pulse, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '12px Outfit'; ctx.fillText('💥', -5, 4);
    } else if (pu.type === 'orbital') {
        ctx.fillStyle = 'rgba(241, 196, 15, 0.5)'; ctx.beginPath(); ctx.arc(0, 0, 20 + pulse, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = '12px Outfit'; ctx.fillText('💣', -5, 4);
    } else {
        ctx.fillStyle = 'rgba(46, 204, 113, 0.4)'; ctx.beginPath(); ctx.arc(0, 0, 18 + pulse, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '12px Outfit'; ctx.fillText('❤️', -5, 4);
    }
    ctx.restore();
}

function drawDetailedPlayer(ctx, p) {
    ctx.save();
    const pX = p.x + p.size/2;
    const pY = p.y + p.size/2;
    const angle = p.aimAngle || 0;

    // 💡 FLASHLIGHT / SPOTLIGHT LIGHTING CONE
    if (p.socketId === myId) {
        ctx.save();
        const flashGrad = ctx.createRadialGradient(pX, pY, 15, pX + Math.cos(angle)*300, pY + Math.sin(angle)*300, 350);
        flashGrad.addColorStop(0, 'rgba(255, 243, 191, 0.22)');
        flashGrad.addColorStop(0.7, 'rgba(241, 196, 15, 0.08)');
        flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.moveTo(pX, pY);
        ctx.arc(pX, pY, 450, angle - 0.4, angle + 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    if (p.hasForceField) {
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.9)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(pX, pY, p.size/2 + 16, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(241, 196, 15, 0.25)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pX, pY, p.size/2 + 22, 0, Math.PI*2); ctx.stroke();
    }

    // 🎯 Aiming Laser Sight
    if (p.socketId === myId) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(pX, pY);
        ctx.lineTo(pX + Math.cos(angle)*350, pY + Math.sin(angle)*350);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.translate(pX, pY);
    ctx.rotate(angle);

    // Hands and Weapon
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.arc(16, -14, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, 14, 5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#2c3e50';
    if (p.weaponType === 'flamethrower') {
        ctx.fillStyle = '#e67e22'; ctx.fillRect(10, -6, 28, 12);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(32, -4, 6, 8);
    } else if (p.weaponType === 'freezeRay') {
        ctx.fillStyle = '#3498db'; ctx.fillRect(10, -5, 30, 10);
        ctx.fillStyle = '#00d2d3'; ctx.beginPath(); ctx.arc(36, 0, 6, 0, Math.PI*2); ctx.fill();
    } else if (p.weaponType === 'lichStaff') {
        ctx.fillStyle = '#4a154b'; ctx.fillRect(10, -4, 28, 8);
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(40, 0, 8, 0, Math.PI*2); ctx.fill();
    } else if (p.weaponType === 'warMace') {
        ctx.fillStyle = '#94a3b8'; ctx.fillRect(10, -4, 26, 8);
        ctx.fillStyle = '#475569'; ctx.fillRect(32, -10, 12, 20);
    } else if (p.weaponType === 'thunderHammer') {
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(10, -4, 28, 8);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(34, -14, 16, 28);
    } else if (p.weaponType === 'hammer') {
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(10, -3, 24, 6);
        ctx.fillStyle = '#e67e22'; ctx.fillRect(30, -12, 14, 24);
    } else if (p.weaponType === 'shotgun') {
        ctx.fillRect(10, -4, 26, 8);
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(20, -5, 16, 10);
    } else if (p.weaponType === 'minigun') {
        ctx.fillRect(10, -6, 32, 12);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(34, -4, 8, 8);
    } else if (p.weaponType === 'katana' || p.weaponType === 'scythe' || p.weaponType === 'fireAx') {
        ctx.fillStyle = p.weaponType === 'scythe' ? '#9b59b6' : p.weaponType === 'katana' ? '#ecf0f1' : '#e67e22';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(38, -18); ctx.lineTo(44, -14); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
    } else if (p.weaponType === 'fireStaff' || p.weaponType === 'lightning' || p.weaponType === 'shadowOrb') {
        ctx.fillStyle = '#8e44ad'; ctx.fillRect(10, -3, 24, 6);
        ctx.fillStyle = p.weaponType === 'shadowOrb' ? '#2ecc71' : p.weaponType === 'fireStaff' ? '#e74c3c' : '#3498db';
        ctx.beginPath(); ctx.arc(36, 0, 8, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.fillRect(10, -3, 18, 6);
    }

    // Body Base & Shoulder Armor
    ctx.rotate(-angle);
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, p.size/2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, p.color || '#3498db');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, p.size/2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();

    // 🎩 HD CLASS HEADGEAR & HELMETS
    if (p.class === 'marksman') {
        ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 + 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 - 2, 0, Math.PI*2); ctx.fill();
    } else if (p.class === 'mage') {
        ctx.fillStyle = '#581c87'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 + 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#06b6d4'; ctx.beginPath(); ctx.arc(0, -6, 4, 0, Math.PI*2); ctx.fill();
    } else if (p.class === 'melee') {
        ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 + 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#dc2626'; ctx.fillRect(-3, -p.size/2 - 6, 6, 10);
    } else if (p.class === 'necromancer') {
        ctx.fillStyle = '#14532d'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 + 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(0, -2, 6, 0, Math.PI*2); ctx.fill();
    } else if (p.class === 'paladin') {
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, 0, p.size/2 + 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(0, -2, 5, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();

    // 🪪 Overhead Custom Player Name Tag
    ctx.fillStyle = '#f1c40f';
    ctx.font = '900 13px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || 'Survivor', pX, pY - p.size/2 - 22);

    const hpRatio = Math.max(0, p.hp / Math.max(1, p.maxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pX - 22, pY - p.size/2 - 16, 44, 6);
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f1c40f' : '#ef4444';
    ctx.fillRect(pX - 22, pY - p.size/2 - 16, 44 * hpRatio, 6);
}

// 🧟 REAL HD ZOMBIE CANVAS GRAPHICS
function drawDetailedZombie(ctx, z) {
    ctx.save();
    const zX = z.x + z.size/2;
    const zY = z.y + z.size/2;

    ctx.translate(zX, zY);

    if (z.isStealth) {
        ctx.globalAlpha = 0.35;
    }

    if (z.type === 'boss') { // 👹 HUGE DEMON SKULL BOSS
        if (z.isBerserk) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 20, 0, Math.PI*2); ctx.stroke();
        }
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 4, 0, Math.PI*2); ctx.fill();
        const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, z.size/2);
        grad.addColorStop(0, '#dc2626'); grad.addColorStop(0.7, '#7f1d1d'); grad.addColorStop(1, '#000');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath(); ctx.moveTo(-z.size/3, -z.size/2); ctx.lineTo(-z.size/2, -z.size); ctx.lineTo(-z.size/4, -z.size/1.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(z.size/3, -z.size/2); ctx.lineTo(z.size/2, -z.size); ctx.lineTo(z.size/4, -z.size/1.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(-18, -12, 10, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -12, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-18, -12, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -12, 4, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'stalker') {
        ctx.fillStyle = '#581c87'; ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(-6, -4, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -4, 4, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'tank') {
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#475569'; ctx.fillRect(-z.size/3, -z.size/3, z.size*0.66, z.size*0.66);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(-12, -4, 24, 8);

    } else if (z.type === 'spitter') {
        ctx.fillStyle = '#14532d'; ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(0, 6, z.size/3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(-8, -6, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -6, 4, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'runner') {
        ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(-6, -4, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -4, 4, 0, Math.PI*2); ctx.fill();

    } else {
        ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(0, 0, z.size/2 - 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f43f5e'; ctx.beginPath(); ctx.arc(-5, -z.size/3, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.arc(-7, -4, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(7, -4, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-7, -4, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(7, -4, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#7f1d1d'; ctx.fillRect(-8, 5, 16, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(-6, 5, 3, 3); ctx.fillRect(3, 5, 3, 3);
    }

    ctx.restore();

    const hpRatio = Math.max(0, z.hp / Math.max(1, z.maxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(zX - z.size/2, zY - z.size/2 - 12, z.size, 5);
    ctx.fillStyle = z.type === 'boss' ? '#f1c40f' : '#ef4444';
    ctx.fillRect(zX - z.size/2, zY - z.size/2 - 12, z.size * hpRatio, 5);
}

// 🎨 MAIN RENDERING LOOP
function render() {
    pulseTick++;
    frameCount++;

    // Calculate Real-Time FPS & Latency Counter
    const now = Date.now();
    if (now - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        const fpsBadge = document.getElementById('fps-badge');
        if (fpsBadge) fpsBadge.innerText = `${currentFps} FPS | 12ms`;
    }

    requestAnimationFrame(render);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawMinimap();

    const me = gameState.players ? gameState.players[myId] : null;
    if (me) {
        targetCamX = me.x + me.size/2;
        targetCamY = me.y + me.size/2;
    }
    // 🎥 60 FPS Smooth Camera Lerping
    camX += (targetCamX - camX) * 0.18;
    camY += (targetCamY - camY) * 0.18;

    ctx.save();
    ctx.translate(canvas.width/2 - camX, canvas.height/2 - camY);

    // Textured Cobblestone Arena Floor (1600 Radius)
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath(); ctx.arc(1600, 1600, 1550, 0, Math.PI * 2); ctx.fill();
    
    ctx.strokeStyle = gameState.environmentalEvent === 'bloodMoon' ? 'rgba(231, 76, 60, 0.35)' : 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 2;
    for (let x = 100; x < 3100; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, 3150); ctx.stroke();
    }
    for (let y = 100; y < 3100; y += 100) {
        ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(3150, y); ctx.stroke();
    }

    // Accumulated Blood Splatters
    (gameState.bloodSplatters || []).forEach(bs => {
        ctx.fillStyle = 'rgba(146, 43, 33, 0.55)';
        ctx.beginPath(); ctx.arc(bs.x, bs.y, bs.radius, 0, Math.PI*2); ctx.fill();
    });

    // Arena Ring Border with Pulsing Neon Glow
    ctx.strokeStyle = gameState.isBossRush || gameState.environmentalEvent === 'bloodMoon' ? '#e74c3c' : '#3498db';
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(1600, 1600, 1550, 0, Math.PI * 2); ctx.stroke();

    // Render Particle System
    fxParticles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        if (p.shape === 'casing') {
            ctx.fillRect(p.x, p.y, 6, 3);
        } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });
    fxParticles = fxParticles.filter(p => p.life > 0);

    // 📦 Air-Drop Supply Crates & Fall Shadows
    (gameState.supplyCrates || []).forEach(sc => {
        ctx.save();
        // Fall Shadow on ground
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath(); ctx.arc(sc.x, sc.y, 25, 0, Math.PI*2); ctx.fill();

        ctx.translate(sc.x, sc.y + sc.fallY);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(-22, -22, 44, 44);
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.strokeRect(-22, -22, 44, 44);
        ctx.fillStyle = '#000'; ctx.font = '700 20px Outfit';
        const crateIcon = sc.type === 'flamethrower' ? '🔥' : sc.type === 'freezeRay' ? '❄️' : '☢️';
        ctx.fillText(crateIcon, -10, 7);
        if (sc.fallY < 0) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-20, -22); ctx.lineTo(0, -60); ctx.lineTo(20, -22); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(0, -60, 25, Math.PI, 0); ctx.fill();
        }
        ctx.restore();
    });

    // Render Damage Texts
    (gameState.damageTexts || []).forEach(dt => {
        ctx.fillStyle = dt.color || '#f1c40f';
        ctx.font = '900 16px Outfit';
        ctx.fillText(dt.text, dt.x, dt.y);
    });

    // Acid Pools
    (gameState.acidPools || []).forEach(ap => {
        ctx.fillStyle = 'rgba(46, 204, 113, 0.35)';
        ctx.beginPath(); ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.stroke();
    });

    // Fire Trails
    (gameState.fireTrails || []).forEach(ft => {
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)'; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(ft.endX, ft.endY); ctx.stroke();
    });

    // Barricades & Overhead HP Bars
    (gameState.barricades || []).forEach(b => {
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x, b.y, b.size, b.size);
        ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 4; ctx.strokeRect(b.x, b.y, b.size, b.size);
        const bHpRatio = b.hp / Math.max(1, b.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x, b.y - 8, b.size, 4);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(b.x, b.y - 8, b.size * bHpRatio, 4);
    });

    // Sentry Turrets & Overhead HP Bars
    (gameState.turrets || []).forEach(t => {
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(t.x-4, t.y-4, 8, 8);
        ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 3; ctx.stroke();
        const tHpRatio = t.hp / Math.max(1, t.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(t.x - 20, t.y - 28, 40, 4);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(t.x - 20, t.y - 28, 40 * tHpRatio, 4);
    });

    // Revive Beacons
    (gameState.reviveBeacons || []).forEach(rb => {
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(rb.x, rb.y, 48, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(46, 204, 113, 0.25)'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 13px Outfit'; ctx.fillText('HOLD TO REVIVE', rb.x-45, rb.y-55);
    });

    // Refined Animated Power-Ups
    (gameState.pickups || []).forEach(pu => {
        drawRefinedPowerUp(ctx, pu, pulseTick);
    });

    // Orbital Laser Strikes
    (gameState.orbitalStrikes || []).forEach(os => {
        ctx.fillStyle = 'rgba(241, 196, 15, 0.55)';
        ctx.beginPath(); ctx.arc(os.x, os.y, os.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    });

    // Minions
    (gameState.minions || []).forEach(m => {
        ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.arc(m.x, m.y, m.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(m.x-3, m.y-3, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(m.x+3, m.y-3, 3, 0, Math.PI*2); ctx.fill();
    });

    // Render Melee & Paladin Slash Arcs
    (gameState.slashArcs || []).forEach(sa => {
        ctx.save();
        ctx.translate(sa.x, sa.y);
        ctx.rotate(sa.angle);
        ctx.strokeStyle = sa.weapon === 'thunderHammer' ? '#f1c40f' : sa.weapon === 'scythe' ? '#a855f7' : sa.weapon === 'katana' ? '#38bdf8' : '#ef4444';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, sa.range || 120, -Math.PI/3, Math.PI/3); ctx.stroke();
        ctx.restore();
    });

    // Render Lightning Beams
    (gameState.lightningBeams || []).forEach(lb => {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(lb.startX, lb.startY); ctx.lineTo(lb.endX, lb.endY); ctx.stroke();
    });

    // Detailed Zombies
    (gameState.zombies || []).forEach(z => {
        drawDetailedZombie(ctx, z);
    });

    // 🎯 Target Lock Reticle on Nearest Zombie
    if (me && gameState.zombies && gameState.zombies.length > 0) {
        const pX = me.x + me.size/2;
        const pY = me.y + me.size/2;
        const worldX = mouseX - canvas.width/2 + pX;
        const worldY = mouseY - canvas.height/2 + pY;
        let nearestZ = null, minDist = Infinity;
        gameState.zombies.forEach(z => {
            const d = Math.hypot((z.x + z.size/2) - worldX, (z.y + z.size/2) - worldY);
            if (d < minDist) { minDist = d; nearestZ = z; }
        });
        if (nearestZ && minDist < 200) {
            const zX = nearestZ.x + nearestZ.size/2;
            const zY = nearestZ.y + nearestZ.size/2;
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(zX, zY, nearestZ.size/2 + 8, 0, Math.PI*2); ctx.stroke();
        }
    }

    // Bullets & Flames
    (gameState.bullets || []).forEach(b => {
        ctx.save();
        if (b.isFlame) {
            ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.5, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = b.element === 'shadow' ? '#a855f7' : b.isMagicOrb ? '#38bdf8' : '#f1c40f';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });

    // Detailed Players
    if (gameState.players) {
        Object.values(gameState.players).forEach(p => {
            if (p.hp <= 0) return;
            drawDetailedPlayer(ctx, p);
        });
    }

    ctx.restore();
}
render();