const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// Web Audio API Synthesizer
let audioCtx = null;
let audioEnabled = true;

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
        } else if (type === 'hit') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(30, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.1);
        }
    } catch (e) {}
}

socket.on('connect', () => { myId = socket.id; });

function chooseClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(btn => btn.classList.remove('selected'));
    if (event && event.target) event.target.classList.add('selected');
}

function startSoloGame() { initAudio(); socket.emit('startSoloGame', selectedClass); }
function startBossRush() { initAudio(); socket.emit('startBossRush', selectedClass); }
function createParty() { initAudio(); socket.emit('createParty'); }
function joinParty() { initAudio(); socket.emit('joinParty', document.getElementById('party-code-input').value); }
function startGame() { initAudio(); socket.emit('startGame'); }
function buy(item) { initAudio(); socket.emit('buy', item); }
function startWaveEarly() { initAudio(); socket.emit('startWaveEarly'); }
function placeTurret() { initAudio(); socket.emit('placeTurret'); }
function placeBarricade() { initAudio(); socket.emit('placeBarricade'); }

socket.on('partyCreated', (code) => {
    document.getElementById('lobby-info').innerText = 'PARTY CODE: ' + code;
    document.getElementById('start-btn').classList.remove('hidden');
    socket.emit('selectClass', selectedClass);
});

socket.on('partyJoined', (code) => {
    document.getElementById('lobby-info').innerText = 'JOINED PARTY: ' + code;
    socket.emit('selectClass', selectedClass);
});

socket.on('gameStarted', () => {
    document.getElementById('lobby-screen').classList.add('hidden');
});

socket.on('killstreak', (data) => {
    const kb = document.getElementById('killstreak-banner');
    kb.innerText = data.player + ' ' + data.title;
    kb.style.opacity = 1;
    setTimeout(() => { kb.style.opacity = 0; }, 2200);
});

socket.on('perkPhase', (perks) => {
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
            playSFX('shoot');
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

        document.getElementById('hp-bar').style.width = Math.max(0, (me.hp / me.maxHp) * 100) + '%';
        document.getElementById('hud-class').innerText = me.class.toUpperCase() + ' (' + me.weaponType + ')';
        document.getElementById('hud-money').innerText = '$' + me.money;
        document.getElementById('hud-wave').innerText = (state.isBossRush ? '👹 BOSS RUSH W' : 'Wave ') + state.wave + (state.waveActive ? ' (Active)' : ' (' + state.shopTimer + 's)');

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
    if (!state.waveActive && state.shopTimer > 0) shop.classList.remove('hidden');
    else shop.classList.add('hidden');
});

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

    if (p.hasForceField) {
        ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pX, pY, p.size/2 + 10, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.15)'; ctx.fill();
    }

    ctx.translate(pX, pY);
    ctx.rotate(angle);

    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.arc(14, -12, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, 12, 5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#2c3e50';
    if (p.weaponType === 'shotgun') {
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

    ctx.rotate(-angle);
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, p.size/2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, p.color || '#3498db');
    grad.addColorStop(1, '#1a252f');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, p.size/2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#fff'; ctx.font = '16px Outfit';
    ctx.fillText(p.avatar || '🤠', -8, 6);

    ctx.restore();

    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pX - 22, pY - p.size/2 - 16, 44, 6);
    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f1c40f' : '#e74c3c';
    ctx.fillRect(pX - 22, pY - p.size/2 - 16, 44 * hpRatio, 6);
}

function drawDetailedZombie(ctx, z) {
    ctx.save();
    const zX = z.x + z.size/2;
    const zY = z.y + z.size/2;

    ctx.translate(zX, zY);

    if (z.type === 'boss') {
        if (z.isBerserk) {
            ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, z.size/2 + 15, 0, Math.PI*2); ctx.stroke();
        }

        const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, z.size/2);
        grad.addColorStop(0, '#e74c3c');
        grad.addColorStop(0.6, '#922b21');
        grad.addColorStop(1, '#110202');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(-z.size/3, -z.size/2, 10, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(z.size/3, -z.size/2, 10, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-18, -10, 8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -10, 8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(-18, -10, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -10, 4, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'tank') {
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#34495e';
        ctx.fillRect(-z.size/3, -z.size/3, z.size*0.66, z.size*0.66);
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'spitter') {
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#27ae60'; ctx.beginPath(); ctx.arc(0, 0, z.size/3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(-8, -6, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -6, 3, 0, Math.PI*2); ctx.fill();

    } else if (z.type === 'runner') {
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#d35400';
        ctx.beginPath(); ctx.arc(-6, -4, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -4, 3, 0, Math.PI*2); ctx.fill();

    } else {
        ctx.fillStyle = '#27ae60';
        ctx.beginPath(); ctx.arc(0, 0, z.size/2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(-6, -5, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -5, 3, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();

    const hpRatio = Math.max(0, z.hp / z.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(zX - z.size/2, zY - z.size/2 - 12, z.size, 5);
    ctx.fillStyle = z.type === 'boss' ? '#f1c40f' : '#e74c3c';
    ctx.fillRect(zX - z.size/2, zY - z.size/2 - 12, z.size * hpRatio, 5);
}

// 🎨 MAIN RENDERING LOOP
function render() {
    pulseTick++;
    requestAnimationFrame(render);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const me = gameState.players ? gameState.players[myId] : null;
    const camX = me ? me.x + me.size/2 : 1000;
    const camY = me ? me.y + me.size/2 : 1000;

    ctx.save();
    ctx.translate(canvas.width/2 - camX, canvas.height/2 - camY);

    // Textured Cobblestone Arena Floor
    ctx.fillStyle = '#0e0e18';
    ctx.beginPath(); ctx.arc(1000, 1000, 950, 0, Math.PI * 2); ctx.fill();
    
    ctx.strokeStyle = gameState.environmentalEvent === 'bloodMoon' ? 'rgba(231, 76, 60, 0.35)' : 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 2;
    for (let x = 100; x < 1900; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, 1950); ctx.stroke();
    }
    for (let y = 100; y < 1900; y += 80) {
        ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(1950, y); ctx.stroke();
    }

    // Accumulated Blood Splatters
    (gameState.bloodSplatters || []).forEach(bs => {
        ctx.fillStyle = 'rgba(146, 43, 33, 0.55)';
        ctx.beginPath(); ctx.arc(bs.x, bs.y, bs.radius, 0, Math.PI*2); ctx.fill();
    });

    // Arena Ring Border with Pulsing Neon Glow
    ctx.strokeStyle = gameState.isBossRush || gameState.environmentalEvent === 'bloodMoon' ? '#e74c3c' : '#3498db';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(1000, 1000, 950, 0, Math.PI * 2); ctx.stroke();

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

    // Barricades
    (gameState.barricades || []).forEach(b => {
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x, b.y, b.size, b.size);
        ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 4; ctx.strokeRect(b.x, b.y, b.size, b.size);
    });

    // Sentry Turrets
    (gameState.turrets || []).forEach(t => {
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(t.x-4, t.y-4, 8, 8);
        ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 3; ctx.stroke();
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

    // Detailed Zombies
    (gameState.zombies || []).forEach(z => {
        drawDetailedZombie(ctx, z);
    });

    // Bullets
    (gameState.bullets || []).forEach(b => {
        ctx.fillStyle = b.element === 'shadow' ? '#9b59b6' : b.isMagicOrb ? '#3498db' : '#f1c40f';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill();
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