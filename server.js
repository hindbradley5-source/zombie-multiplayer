const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};

const ARENA_CENTER_X = 1000;
const ARENA_CENTER_Y = 1000;
const ARENA_RADIUS = 950;

const classData = {
    mage:        { color: '#9b59b6', speed: 5.5, maxHp: 120, bulletSpeed: 9,  bulletSize: 18, damage: 110, mana: 120, maxMana: 120, manaCost: 12, weaponType: 'orb',       attackSpeed: 'Slow (1.2s)'     },
    melee:       { color: '#95a5a6', speed: 7,   maxHp: 220, bulletSpeed: 18, bulletSize: 12, damage: 160,                                                                  weaponType: 'dagger',    attackSpeed: 'Fast (0.4s)'  },
    marksman:    { color: '#f1c40f', speed: 5,   maxHp: 100, bulletSpeed: 20, bulletSize: 4,  damage: 30,  ammo: 15, maxAmmo: 15, weaponType: 'pistol', reloading: false, attackSpeed: 'Medium (0.6s)'   },
    necromancer: { color: '#2ecc71', speed: 5.2, maxHp: 110, bulletSpeed: 12, bulletSize: 14, damage: 95,  mana: 140, maxMana: 140, manaCost: 15, weaponType: 'shadowOrb', attackSpeed: 'Medium (0.8s)'   }
};

const perkPool = [
    { id: 'vampirism', title: 'Vampiric Touch', icon: '🩸', desc: 'Restores 4 HP on every zombie kill.' },
    { id: 'chainLightning', title: 'Chain Lightning', icon: '⚡', desc: 'Attacks have a 25% chance to arc 90 damage to 3 nearby zombies.' },
    { id: 'fireDash', title: 'Flame Dash', icon: '🔥', desc: 'Dashing leaves a trail of burning fire on the arena floor.' },
    { id: 'thornArmor', title: 'Thorn Plating', icon: '🛡️', desc: 'Reflects 50% contact damage back to attacking zombies.' },
    { id: 'clusterGrenades', title: 'Cluster Ordnance', icon: '💣', desc: 'Explosions trigger 3 secondary bomblet blasts.' }
];

const funnyQuotes = [
    "Skill issue detected!",
    "Bro forgot how to use WASD.",
    "That zombie totally styled on you.",
    "Alt+F4 won't save you now.",
    "Rest in pixels.",
    "Did you try dodging?",
    "Absolute cinema of a fail.",
    "Keyboard disconnected or just bad?",
    "Oof size: Mega."
];

function generatePartyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function makePlayer(stats, x, y) {
    return {
        x, y,
        aimAngle: 0,
        size: 35,
        hp: stats.maxHp,
        money: 0,
        moneyGainMultiplier: 1.0,
        class: 'marksman',
        baseClass: 'marksman',
        avatar: '🤠',
        weaponType: 'pistol',
        hasForceField: false,
        dashCooldown: 0,
        skillCooldown: 0,
        maxSkillCooldown: 300,
        powerUpType: null,
        powerUpTimer: 0,
        perks: [],
        totalKills: 0,
        totalDamage: 0,
        recentKills: 0,
        lastKillTime: 0,
        ...stats
    };
}

function createRoomObject(isBossRush = false) {
    return {
        players: {},
        bullets: [],
        zombies: [],
        minions: [],
        turrets: [],
        barricades: [],
        reviveBeacons: [],
        orbitalStrikes: [],
        bloodSplatters: [],
        pickups: [],
        barrels: [],
        explosions: [],
        speechBubbles: [],
        fireTrails: [],
        acidPools: [],
        wave: 1,
        zombiesToSpawn: isBossRush ? 2 : 5,
        totalZombiesThisWave: isBossRush ? 2 : 5,
        waveActive: true,
        gameStarted: true,
        bossSpawnedThisWave: false,
        shopTimer: 30,
        waveClearHandled: false,
        gameOver: false,
        perkPhaseActive: false,
        environmentalEvent: isBossRush ? 'bloodMoon' : null,
        isBossRush
    };
}

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('startSoloGame', (playerClass) => {
        const code = 'SOLO_' + Math.floor(1000 + Math.random() * 9000);
        const pClass = playerClass && classData[playerClass] ? playerClass : 'marksman';
        rooms[code] = createRoomObject(false);
        socket.roomCode = code;
        socket.join(code);

        const stats = classData[pClass];
        rooms[code].players[socket.id] = makePlayer(stats, ARENA_CENTER_X, ARENA_CENTER_Y);
        rooms[code].players[socket.id].class = pClass;
        rooms[code].players[socket.id].baseClass = pClass;

        for (let i = 0; i < 6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let dist  = Math.random() * (ARENA_RADIUS - 200);
            rooms[code].barrels.push({ x: ARENA_CENTER_X + Math.cos(angle) * dist, y: ARENA_CENTER_Y + Math.sin(angle) * dist, hp: 50, maxHp: 50, size: 35 });
        }

        socket.emit('partyCreated', code);
        socket.emit('gameStarted');
    });

    socket.on('startBossRush', (playerClass) => {
        const code = 'BOSSRUSH_' + Math.floor(1000 + Math.random() * 9000);
        const pClass = playerClass && classData[playerClass] ? playerClass : 'marksman';
        rooms[code] = createRoomObject(true);
        socket.roomCode = code;
        socket.join(code);

        const stats = classData[pClass];
        rooms[code].players[socket.id] = makePlayer(stats, ARENA_CENTER_X, ARENA_CENTER_Y);
        rooms[code].players[socket.id].class = pClass;
        rooms[code].players[socket.id].baseClass = pClass;
        rooms[code].players[socket.id].money = 500;

        for (let i = 0; i < 6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let dist  = Math.random() * (ARENA_RADIUS - 200);
            rooms[code].barrels.push({ x: ARENA_CENTER_X + Math.cos(angle) * dist, y: ARENA_CENTER_Y + Math.sin(angle) * dist, hp: 50, maxHp: 50, size: 35 });
        }

        socket.emit('partyCreated', code);
        socket.emit('gameStarted');
    });

    socket.on('createParty', () => {
        const code = generatePartyCode();
        rooms[code] = createRoomObject(false);
        rooms[code].gameStarted = false;
        rooms[code].waveActive = false;
        socket.roomCode = code;
        socket.join(code);

        rooms[code].players[socket.id] = makePlayer(classData['marksman'], ARENA_CENTER_X, ARENA_CENTER_Y);

        for (let i = 0; i < 6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let dist  = Math.random() * (ARENA_RADIUS - 200);
            rooms[code].barrels.push({ x: ARENA_CENTER_X + Math.cos(angle) * dist, y: ARENA_CENTER_Y + Math.sin(angle) * dist, hp: 50, maxHp: 50, size: 35 });
        }

        socket.emit('partyCreated', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    socket.on('joinParty', (code) => {
        const upperCode = code ? code.trim().toUpperCase() : '';
        if (rooms[upperCode] && !rooms[upperCode].gameStarted) {
            socket.roomCode = upperCode;
            socket.join(upperCode);
            if (!rooms[upperCode].players[socket.id]) {
                rooms[upperCode].players[socket.id] = makePlayer(
                    classData['marksman'],
                    ARENA_CENTER_X + (Math.random() * 40 - 20),
                    ARENA_CENTER_Y + (Math.random() * 40 - 20)
                );
            }
            socket.emit('partyJoined', upperCode);
            io.to(upperCode).emit('lobbyUpdate', rooms[upperCode].players);
        } else {
            socket.emit('partyError', 'Party not found or game already in progress!');
        }
    });

    socket.on('selectClass', (playerClass) => {
        const room = rooms[socket.roomCode];
        if (!room || room.gameStarted) return;
        const stats = classData[playerClass];
        if (!stats || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        Object.assign(p, {
            class: playerClass, baseClass: playerClass,
            color: stats.color, speed: stats.speed,
            maxHp: stats.maxHp, hp: stats.maxHp,
            bulletSpeed: stats.bulletSpeed, bulletSize: stats.bulletSize, damage: stats.damage,
            mana: stats.mana ?? 0, maxMana: stats.maxMana ?? 0, manaCost: stats.manaCost ?? 0,
            ammo: stats.ammo ?? 0, maxAmmo: stats.maxAmmo ?? 0,
            weaponType: stats.weaponType || 'pistol',
            hasForceField: false, dashCooldown: 0, reloading: false,
            attackSpeed: stats.attackSpeed
        });
        io.to(socket.roomCode).emit('lobbyUpdate', room.players);
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        room.gameStarted = true;
        room.waveActive = true;
        room.wave = 1;
        room.zombiesToSpawn = room.isBossRush ? 2 : 5;
        room.totalZombiesThisWave = room.zombiesToSpawn;
        room.waveClearHandled = false;
        room.gameOver = false;
        io.to(socket.roomCode).emit('gameStarted');
    });

    socket.on('startWaveEarly', () => {
        const room = rooms[socket.roomCode];
        if (!room || room.waveActive || room.gameOver) return;
        room.shopTimer = 0;
    });

    socket.on('selectPerk', (perkId) => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        const p = room.players[socket.id];
        if (!p || p.perks.includes(perkId)) return;
        p.perks.push(perkId);
        socket.emit('perkSelected', perkId);
    });

    socket.on('placeTurret', () => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.money < 600) return;
        p.money -= 600;
        room.turrets.push({
            id: 'turret_' + Date.now() + '_' + Math.random(),
            x: p.x + p.size/2,
            y: p.y + p.size/2,
            hp: 250,
            maxHp: 250,
            fireTimer: 0,
            owner: socket.id
        });
    });

    socket.on('placeBarricade', () => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.money < 250) return;
        p.money -= 250;
        room.barricades.push({
            id: 'barricade_' + Date.now() + '_' + Math.random(),
            x: p.x + p.size/2 - 25,
            y: p.y + p.size/2 - 25,
            size: 50,
            hp: 400,
            maxHp: 400
        });
    });

    socket.on('move', (input) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        if (typeof input.aimAngle === 'number') p.aimAngle = input.aimAngle;

        let currentSpeed = p.speed;
        if (p.powerUpType === 'speed') currentSpeed *= 1.6;

        if (p.dashCooldown > 0) p.dashCooldown--;

        if (input.dash && p.dashCooldown === 0) {
            let dx = 0, dy = 0;
            if (input.up)    dy -= 1;
            if (input.down)  dy += 1;
            if (input.left)  dx -= 1;
            if (input.right) dx += 1;
            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                const startX = p.x + p.size/2;
                const startY = p.y + p.size/2;
                p.x += (dx / len) * 140;
                p.y += (dy / len) * 140;
                p.dashCooldown = 45;

                if (p.perks.includes('fireDash')) {
                    room.fireTrails.push({ x: startX, y: startY, endX: p.x + p.size/2, endY: p.y + p.size/2, life: 90 });
                }
            }
        }

        let nextX = p.x;
        let nextY = p.y;

        if (input.up)    nextY -= currentSpeed;
        if (input.down)  nextY += currentSpeed;
        if (input.left)  nextX -= currentSpeed;
        if (input.right) nextX += currentSpeed;

        let blocked = false;
        room.barricades.forEach(b => {
            if (nextX + p.size > b.x && nextX < b.x + b.size && nextY + p.size > b.y && nextY < b.y + b.size) {
                blocked = true;
            }
        });

        if (!blocked) {
            p.x = nextX;
            p.y = nextY;
        }

        const distFromCenter = Math.hypot((p.x + p.size / 2) - ARENA_CENTER_X, (p.y + p.size / 2) - ARENA_CENTER_Y);
        const maxDist = ARENA_RADIUS - (p.size / 2);
        if (distFromCenter > maxDist) {
            const angle = Math.atan2((p.y + p.size / 2) - ARENA_CENTER_Y, (p.x + p.size / 2) - ARENA_CENTER_X);
            p.x = ARENA_CENTER_X + Math.cos(angle) * maxDist - p.size / 2;
            p.y = ARENA_CENTER_Y + Math.sin(angle) * maxDist - p.size / 2;
        }
    });

    socket.on('useSkill', (target) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.skillCooldown > 0) return;

        if (p.class === 'marksman') {
            p.skillCooldown = 300;
            const angle = Math.atan2(target.y - (p.y + p.size/2), target.x - (p.x + p.size/2));
            const dist = Math.min(400, Math.hypot(target.x - (p.x + p.size/2), target.y - (p.y + p.size/2)));
            const targetX = p.x + p.size/2 + Math.cos(angle) * dist;
            const targetY = p.y + p.size/2 + Math.sin(angle) * dist;
            
            setTimeout(() => {
                if (!rooms[socket.roomCode]) return;
                const r = rooms[socket.roomCode];
                r.explosions.push({ x: targetX, y: targetY, radius: 180, life: 15, isGrenade: true });
                if (p.perks.includes('clusterGrenades')) {
                    for (let i = 0; i < 3; i++) {
                        const subAngle = (i / 3) * Math.PI * 2;
                        r.explosions.push({ x: targetX + Math.cos(subAngle) * 60, y: targetY + Math.sin(subAngle) * 60, radius: 100, life: 12 });
                    }
                }
                r.zombies.forEach(z => {
                    if (Math.hypot((z.x + z.size/2) - targetX, (z.y + z.size/2) - targetY) < 180) {
                        z.hp -= 450;
                        p.totalDamage += 450;
                    }
                });
            }, 400);
        } else if (p.class === 'mage') {
            p.skillCooldown = 360;
            const pX = p.x + p.size / 2;
            const pY = p.y + p.size / 2;
            room.explosions.push({ x: pX, y: pY, radius: 280, life: 20, isFrostNova: true });
            room.zombies.forEach(z => {
                if (Math.hypot((z.x + z.size/2) - pX, (z.y + z.size/2) - pY) < 280) {
                    z.frozenTimer = 90;
                    z.hp -= 150;
                    p.totalDamage += 150;
                }
            });
        } else if (p.class === 'melee') {
            p.skillCooldown = 240;
            const pX = p.x + p.size / 2;
            const pY = p.y + p.size / 2;
            room.explosions.push({ x: pX, y: pY, radius: 160, life: 12, isWhirlwind: true });
            room.zombies.forEach(z => {
                const dist = Math.hypot((z.x + z.size/2) - pX, (z.y + z.size/2) - pY);
                if (dist < 160) {
                    z.hp -= 380;
                    p.totalDamage += 380;
                    const angle = Math.atan2((z.y + z.size/2) - pY, (z.x + z.size/2) - pX);
                    z.x += Math.cos(angle) * 80;
                    z.y += Math.sin(angle) * 80;
                }
            });
        } else if (p.class === 'necromancer') {
            p.skillCooldown = 360;
            const pX = p.x + p.size / 2;
            const pY = p.y + p.size / 2;
            room.explosions.push({ x: pX, y: pY, radius: 100, life: 15, isNecroSummon: true });
            for (let i = 0; i < 2; i++) {
                const angle = (i / 2) * Math.PI * 2;
                room.minions.push({
                    x: pX + Math.cos(angle) * 40,
                    y: pY + Math.sin(angle) * 40,
                    size: 28,
                    hp: 180,
                    maxHp: 180,
                    damage: 65,
                    life: 360,
                    owner: socket.id
                });
            }
        }
        io.to(socket.roomCode).emit('skillUsed', { id: socket.id, class: p.class });
    });

    socket.on('shoot', (target) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.reloading) return;

        const nowTime = Date.now();
        const weaponCooldowns = {
            pistol: 400, shotgun: 750, minigun: 160, fireStaff: 850,
            lightning: 600, fireAx: 550, katana: 350, shadowOrb: 450,
            scythe: 400, megaWeapon: 300
        };
        const cd = weaponCooldowns[p.weaponType] || 400;
        if (nowTime - (p.lastShotTime || 0) < cd) return;
        p.lastShotTime = nowTime;

        if (p.class === 'marksman' && p.weaponType !== 'megaWeapon') {
            let reloadTime = p.weaponType === 'shotgun' ? 900 : p.weaponType === 'minigun' ? 200 : 500;
            if (p.ammo <= 0) {
                p.reloading = true;
                setTimeout(() => { if (room.players[socket.id]) { room.players[socket.id].ammo = room.players[socket.id].maxAmmo; room.players[socket.id].reloading = false; } }, reloadTime);
                return;
            }
            p.ammo--;
            if (p.ammo === 0) {
                p.reloading = true;
                setTimeout(() => { if (room.players[socket.id]) { room.players[socket.id].ammo = room.players[socket.id].maxAmmo; room.players[socket.id].reloading = false; } }, reloadTime);
            }
        } else if ((p.class === 'mage' || p.class === 'necromancer') && p.weaponType !== 'megaWeapon') {
            if (p.mana < p.manaCost) return;
            p.mana -= p.manaCost;
        }

        const baseAngle = Math.atan2(target.y - (p.y + p.size / 2), target.x - (p.x + p.size / 2));
        const finalDamage = p.damage * (p.powerUpType === 'doubleDamage' ? 2 : 1);

        if ((p.class === 'melee' || p.weaponType === 'scythe') && p.weaponType !== 'megaWeapon') {
            const pX = p.x + p.size / 2;
            const pY = p.y + p.size / 2;
            const range = p.weaponType === 'katana' ? 140 : p.weaponType === 'scythe' ? 150 : 100;
            room.slashArcs.push({ x: pX, y: pY, angle: baseAngle, range, weapon: p.weaponType, life: 6, owner: socket.id });

            room.zombies.forEach(z => {
                const zX = z.x + z.size / 2;
                const zY = z.y + z.size / 2;
                const dist = Math.hypot(zX - pX, zY - pY);
                if (dist <= range + z.size / 2) {
                    const angleToZ = Math.atan2(zY - pY, zX - pX);
                    let diff = Math.abs(baseAngle - angleToZ);
                    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                    if (diff <= Math.PI / 3) {
                        z.hp -= finalDamage;
                        p.totalDamage += Math.round(finalDamage);
                        z.x += Math.cos(angleToZ) * 35;
                        z.y += Math.sin(angleToZ) * 35;

                        if (z.hp <= 0 && !z.rewarded) {
                            z.rewarded = true;
                            p.totalKills++;
                            p.hp = Math.min(p.maxHp, p.hp + (p.perks.includes('vampirism') ? 4 : 0));
                            
                            room.bloodSplatters.push({ x: z.x + z.size/2, y: z.y + z.size/2, radius: z.size/2 + Math.random()*15 });
                            if (room.bloodSplatters.length > 50) room.bloodSplatters.shift();

                            const baseReward = (z.type === 'boss' ? 800 : 35) * (room.environmentalEvent === 'bloodMoon' ? 2.5 : 1);
                            for (let id in room.players) {
                                const recipient = room.players[id];
                                if (recipient.hp > 0) recipient.money += Math.round(baseReward * (recipient.moneyGainMultiplier || 1.0));
                            }
                        }
                    }
                }
            });
            return;
        }

        if (p.class === 'mage' && p.weaponType === 'lightning') {
            const pX = p.x + p.size / 2;
            const pY = p.y + p.size / 2;
            const beamEndX = pX + Math.cos(baseAngle) * 450;
            const beamEndY = pY + Math.sin(baseAngle) * 450;
            room.lightningBeams.push({ startX: pX, startY: pY, endX: beamEndX, endY: beamEndY, life: 8 });

            room.zombies.forEach(z => {
                const zX = z.x + z.size / 2;
                const zY = z.y + z.size / 2;
                if (Math.hypot(zX - pX, zY - pY) <= 450) {
                    const angleToZ = Math.atan2(zY - pY, zX - pX);
                    let diff = Math.abs(baseAngle - angleToZ);
                    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                    if (diff <= 0.3) {
                        z.hp -= finalDamage;
                        p.totalDamage += Math.round(finalDamage);
                    }
                }
            });
            return;
        }

        if (p.weaponType === 'megaWeapon') {
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                room.bullets.push({ x: p.x + p.size / 2, y: p.y + p.size / 2, dx: Math.cos(angle), dy: Math.sin(angle), speed: p.bulletSpeed * 1.5, size: p.bulletSize * 2, damage: finalDamage, owner: socket.id, life: 80 });
            }
        } else if (p.class === 'marksman' && p.weaponType === 'shotgun') {
            for (let i = -1; i <= 1; i++) {
                const angle = baseAngle + (i * 0.15);
                room.bullets.push({ x: p.x + p.size / 2, y: p.y + p.size / 2, dx: Math.cos(angle), dy: Math.sin(angle), speed: p.bulletSpeed, size: p.bulletSize, damage: finalDamage, owner: socket.id, life: 60 });
            }
        } else {
            room.bullets.push({
                x: p.x + p.size / 2, y: p.y + p.size / 2,
                dx: Math.cos(baseAngle), dy: Math.sin(baseAngle),
                speed: p.bulletSpeed, size: p.bulletSize, damage: finalDamage,
                owner: socket.id, life: 60,
                isMagicOrb: p.class === 'mage' || p.class === 'necromancer',
                element: p.class === 'necromancer' ? 'shadow' : p.weaponType === 'fireStaff' ? 'fire' : 'arcane',
                pierce: p.class === 'necromancer' ? 2 : 1
            });
        }
    });

    socket.on('buy', (item) => {
        const room = rooms[socket.roomCode];
        if (!room || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        if (!room.waveActive && (item === 'mage' || item === 'melee' || item === 'marksman' || item === 'necromancer')) {
            if (p.money >= 15000) {
                p.money -= 15000;
                const stats = classData[item];
                Object.assign(p, {
                    class: item, baseClass: item,
                    color: stats.color, speed: stats.speed,
                    maxHp: stats.maxHp, hp: stats.maxHp,
                    bulletSpeed: stats.bulletSpeed, bulletSize: stats.bulletSize, damage: stats.damage,
                    mana: stats.mana ?? 0, maxMana: stats.maxMana ?? 0, manaCost: stats.manaCost ?? 0,
                    ammo: stats.ammo ?? 0, maxAmmo: stats.maxAmmo ?? 0,
                    weaponType: stats.weaponType || 'pistol',
                    hasForceField: false, dashCooldown: 0, reloading: false,
                    attackSpeed: stats.attackSpeed
                });
                io.to(socket.roomCode).emit('lobbyUpdate', room.players);
            }
            return;
        }

        if (room.waveActive) return;
        const base = classData[p.baseClass];

        if      (item === 'health'    && p.money >= 50)    { p.money -= 50;  p.hp = p.maxHp; }
        else if (item === 'maxHealth' && p.money >= 120)   { p.money -= 120; p.maxHp += Math.round(base.maxHp * 0.10); p.hp = p.maxHp; }
        else if (item === 'damage'    && p.money >= 100)   { p.money -= 100; p.damage += Math.max(1, Math.round(base.damage * 0.01)); }
        else if (item === 'speed'     && p.money >= 75)    { p.money -= 75;  p.speed += Number((base.speed * 0.01).toFixed(2)); }
        else if (item === 'moneyGain' && p.money >= 100)   { p.money -= 100; p.moneyGainMultiplier = Number(((p.moneyGainMultiplier || 1.0) + 0.01).toFixed(2)); }
        else if (item === 'shotgun'   && p.class === 'marksman'    && p.money >= 350  && !['shotgun','minigun','megaWeapon'].includes(p.weaponType))   { p.money -= 350;  p.weaponType = 'shotgun';  p.maxAmmo = 8;   p.ammo = 8;   p.damage = 22;  p.attackSpeed = 'Slow (0.8s)'; }
        else if (item === 'minigun'   && p.class === 'marksman'    && p.money >= 650  && !['minigun','megaWeapon'].includes(p.weaponType))             { p.money -= 650;  p.weaponType = 'minigun';  p.maxAmmo = 200; p.ammo = 200; p.damage = 15;  p.bulletSize = base.bulletSize * 3; p.attackSpeed = 'Very Fast (0.16s)'; }
        else if (item === 'fireStaff' && p.class === 'mage'        && p.money >= 400  && !['fireStaff','lightning','megaWeapon'].includes(p.weaponType)) { p.money -= 400;  p.weaponType = 'fireStaff'; p.bulletSize = 26; p.damage = 180; p.manaCost = 22; p.attackSpeed = 'Slow (0.9s)'; }
        else if (item === 'lightning' && p.class === 'mage'        && p.money >= 700  && !['lightning','megaWeapon'].includes(p.weaponType))            { p.money -= 700;  p.weaponType = 'lightning'; p.bulletSize = 10; p.damage = 140; p.manaCost = 18; p.attackSpeed = 'Medium (0.6s)'; }
        else if (item === 'scythe'    && p.class === 'necromancer' && p.money >= 500  && !['scythe','megaWeapon'].includes(p.weaponType))                { p.money -= 500;  p.weaponType = 'scythe';   p.bulletSize = 20; p.damage = 280; p.manaCost = 14; p.attackSpeed = 'Medium (0.5s)'; }
        else if (item === 'fireAx'    && p.class === 'melee'       && p.money >= 300  && !['fireAx','katana','megaWeapon'].includes(p.weaponType))       { p.money -= 300;  p.weaponType = 'fireAx';   p.bulletSize = 18; p.damage = 240; p.attackSpeed = 'Medium (0.55s)'; }
        else if (item === 'katana'    && p.class === 'melee'       && p.money >= 600  && !['katana','megaWeapon'].includes(p.weaponType))                { p.money -= 600;  p.weaponType = 'katana';   p.bulletSize = 16; p.damage = 320; p.speed += base.speed * 0.05; p.attackSpeed = 'Fast (0.35s)'; }
        else if (item === 'megaWeapon' && p.money >= 150000 && p.weaponType !== 'megaWeapon') { p.money -= 150000; p.weaponType = 'megaWeapon'; p.damage *= 2.5; p.hasForceField = true; p.attackSpeed = 'Rapid Spread'; }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            delete rooms[socket.roomCode].players[socket.id];
            if (Object.keys(rooms[socket.roomCode].players).length === 0) {
                delete rooms[socket.roomCode];
            } else {
                io.to(socket.roomCode).emit('lobbyUpdate', rooms[socket.roomCode].players);
            }
        }
    });
});

setInterval(() => {
    const nowTime = Date.now();
    for (let code in rooms) {
        const room = rooms[code];
        if (!room.gameStarted || room.gameOver) continue;

        const playerList = Object.values(room.players);
        
        playerList.forEach(p => {
            if (p.hp <= 0 && !room.reviveBeacons.some(b => b.targetPlayerId === p.socketId)) {
                room.reviveBeacons.push({
                    x: p.x + p.size/2,
                    y: p.y + p.size/2,
                    targetPlayerId: p.socketId,
                    progress: 0,
                    maxProgress: 90
                });
            }
        });

        room.reviveBeacons.forEach(b => {
            let reviverNear = false;
            for (let id in room.players) {
                const helper = room.players[id];
                if (helper.hp > 0 && Math.hypot((helper.x + helper.size/2) - b.x, (helper.y + helper.size/2) - b.y) < 60) {
                    reviverNear = true;
                    b.progress++;
                    if (b.progress >= b.maxProgress) {
                        const targetP = room.players[b.targetPlayerId];
                        if (targetP) {
                            targetP.hp = Math.round(targetP.maxHp * 0.6);
                            targetP.x = b.x - targetP.size/2;
                            targetP.y = b.y - targetP.size/2;
                        }
                        b.revived = true;
                    }
                    break;
                }
            }
            if (!reviverNear && b.progress > 0) b.progress = Math.max(0, b.progress - 1);
        });
        room.reviveBeacons = room.reviveBeacons.filter(b => !b.revived && room.players[b.targetPlayerId] && room.players[b.targetPlayerId].hp <= 0);

        if (playerList.length > 0 && playerList.every(p => p.hp <= 0)) {
            room.gameOver = true;
        }

        for (let id in room.players) {
            const p = room.players[id];
            p.socketId = id;
            if ((p.class === 'mage' || p.class === 'necromancer') && p.mana < p.maxMana && p.hp > 0) p.mana = Math.min(p.maxMana, p.mana + 0.6);
            if (p.powerUpTimer > 0) { p.powerUpTimer--; if (p.powerUpTimer === 0) p.powerUpType = null; }
            if (p.skillCooldown > 0) p.skillCooldown--;
        }

        if (room.isBossRush) {
            room.environmentalEvent = 'bloodMoon';
        } else if (room.wave % 4 === 0 && room.waveActive) {
            if (!room.environmentalEvent) {
                room.environmentalEvent = (room.wave % 8 === 0) ? 'toxicStorm' : 'bloodMoon';
            }
        } else {
            room.environmentalEvent = null;
        }

        if (!room.waveActive) {
            room.shopTimer -= 1 / 30;
            if (room.shopTimer <= 0) {
                room.wave++;
                room.waveActive = true;
                room.zombiesToSpawn = room.isBossRush ? Math.min(6, room.wave + 1) : room.wave * 5;
                room.totalZombiesThisWave = room.zombiesToSpawn;
                room.bossSpawnedThisWave = false;
                room.shopTimer = 30;
                room.waveClearHandled = false;
            }
        } else {
            if (room.zombiesToSpawn > 0 && Math.random() < 0.25) {
                let zType = 'normal';
                const roll = Math.random();

                if (room.isBossRush) {
                    zType = 'boss';
                } else {
                    if      (room.wave % 10 === 0 && !room.bossSpawnedThisWave) { zType = 'boss';   room.bossSpawnedThisWave = true; }
                    else if (room.wave >= 4 && roll < 0.25)                      { zType = 'spitter'; }
                    else if (room.wave >= 2 && roll < 0.50)                      { zType = 'tank';   }
                    else if (room.wave >= 3 && roll > 0.70)                      { zType = 'runner'; }
                }

                let zHp    = 35 + (room.wave * 12);
                let zSpeed = (1.2 + (room.wave * 0.12)) * (room.environmentalEvent === 'bloodMoon' ? 1.35 : 1);
                let zSize  = 40;

                if      (zType === 'boss')   { zHp = (room.isBossRush ? 2000 : 3500) + (room.wave * 600); zSpeed = 1.8 + (room.wave * 0.03); zSize = 110; }
                else if (zType === 'tank')   { zHp *= 5;   zSpeed *= 0.35; zSize = 65; }
                else if (zType === 'spitter'){ zHp *= 1.2; zSpeed *= 0.9;  zSize = 42; }
                else if (zType === 'runner') { zHp *= 0.6; zSpeed *= 1.9;  zSize = 30; }

                const spawnAngle = Math.random() * Math.PI * 2;
                room.zombies.push({
                    x: ARENA_CENTER_X + Math.cos(spawnAngle) * ARENA_RADIUS,
                    y: ARENA_CENTER_Y + Math.sin(spawnAngle) * ARENA_RADIUS,
                    size: zSize, hp: zHp, maxHp: zHp, speed: zSpeed, type: zType, rewarded: false, frozenTimer: 0,
                    spitTimer: 0, stompTimer: 0
                });
                room.zombiesToSpawn--;
            }
        }

        room.minions.forEach(m => {
            m.life--;
            let closestZ = null, minDist = Infinity;
            room.zombies.forEach(z => {
                const dist = Math.hypot(z.x - m.x, z.y - m.y);
                if (dist < minDist) { minDist = dist; closestZ = z; }
            });
            if (closestZ) {
                const angle = Math.atan2(closestZ.y - m.y, closestZ.x - m.x);
                m.x += Math.cos(angle) * 3.5;
                m.y += Math.sin(angle) * 3.5;
                if (minDist < 35) {
                    closestZ.hp -= m.damage;
                    m.x -= Math.cos(angle) * 20;
                    m.y -= Math.sin(angle) * 20;
                }
            }
        });
        room.minions = room.minions.filter(m => m.life > 0 && m.hp > 0);

        room.turrets.forEach(t => {
            t.fireTimer++;
            if (t.fireTimer >= 15) {
                t.fireTimer = 0;
                let closestZ = null, minDist = 450;
                room.zombies.forEach(z => {
                    const dist = Math.hypot(z.x - t.x, z.y - t.y);
                    if (dist < minDist) { minDist = dist; closestZ = z; }
                });
                if (closestZ) {
                    const angle = Math.atan2(closestZ.y - t.y, closestZ.x - t.x);
                    room.bullets.push({
                        x: t.x, y: t.y,
                        dx: Math.cos(angle), dy: Math.sin(angle),
                        speed: 18, size: 6, damage: 45, owner: t.owner, life: 50
                    });
                }
            }
        });
        room.turrets = room.turrets.filter(t => t.hp > 0);
        room.barricades = room.barricades.filter(b => b.hp > 0);

        room.orbitalStrikes.forEach(os => {
            os.life--;
            os.radius = Math.min(300, os.radius + 15);
            room.zombies.forEach(z => {
                if (z.type !== 'boss' && Math.hypot((z.x + z.size/2) - os.x, (z.y + z.size/2) - os.y) < os.radius) {
                    z.hp = 0;
                }
            });
        });
        room.orbitalStrikes = room.orbitalStrikes.filter(os => os.life > 0);

        room.fireTrails.forEach(ft => {
            ft.life--;
            room.zombies.forEach(z => {
                if (Math.hypot((z.x + z.size/2) - ft.x, (z.y + z.size/2) - ft.y) < 40) {
                    z.hp -= 2;
                }
            });
        });
        room.fireTrails = room.fireTrails.filter(ft => ft.life > 0);

        room.acidPools.forEach(ap => {
            ap.life--;
            for (let id in room.players) {
                const p = room.players[id];
                if (p.hp > 0 && Math.hypot((p.x + p.size/2) - ap.x, (p.y + p.size/2) - ap.y) < ap.radius) {
                    p.hp -= 0.15;
                }
            }
        });
        room.acidPools = room.acidPools.filter(ap => ap.life > 0);

        room.zombies.forEach(z => {
            if (z.frozenTimer > 0) {
                z.frozenTimer--;
                return;
            }

            if (z.type === 'boss') {
                if (z.hp / z.maxHp < 0.5 && !z.isBerserk) {
                    z.isBerserk = true;
                    z.speed *= 1.4;
                }
                if (z.isBerserk) {
                    z.stompTimer = (z.stompTimer || 0) + 1;
                    if (z.stompTimer >= 150) {
                        z.stompTimer = 0;
                        const zX = z.x + z.size/2;
                        const zY = z.y + z.size/2;
                        room.explosions.push({ x: zX, y: zY, radius: 250, life: 18 });
                        for (let id in room.players) {
                            const p = room.players[id];
                            if (p.hp > 0) {
                                const dist = Math.hypot((p.x + p.size/2) - zX, (p.y + p.size/2) - zY);
                                if (dist < 250) {
                                    p.hp -= 15;
                                    const pushAngle = Math.atan2((p.y + p.size/2) - zY, (p.x + p.size/2) - zX);
                                    p.x += Math.cos(pushAngle) * 90;
                                    p.y += Math.sin(pushAngle) * 90;
                                }
                            }
                        }
                    }
                }
            }

            if (z.type === 'spitter') {
                z.spitTimer = (z.spitTimer || 0) + 1;
                if (z.spitTimer >= 90) {
                    z.spitTimer = 0;
                    let closest = null, minDist = Infinity;
                    for (let id in room.players) {
                        const p = room.players[id];
                        if (p.hp > 0) {
                            const dist = Math.hypot(p.x - z.x, p.y - z.y);
                            if (dist < minDist) { minDist = dist; closest = p; }
                        }
                    }
                    if (closest) {
                        room.acidPools.push({ x: closest.x + closest.size/2, y: closest.y + closest.size/2, radius: 50, life: 120 });
                    }
                }
            }

            let closest = null, minDist = Infinity;
            for (let id in room.players) {
                const p = room.players[id];
                if (p.hp > 0) {
                    const dist = Math.hypot(p.x - z.x, p.y - z.y);
                    if (dist < minDist) { minDist = dist; closest = p; }
                }
            }
            if (closest) {
                const angle = Math.atan2(closest.y - z.y, closest.x - z.x);
                let nextZX = z.x + Math.cos(angle) * z.speed;
                let nextZY = z.y + Math.sin(angle) * z.speed;

                let barricadeHit = false;
                room.barricades.forEach(b => {
                    if (nextZX + z.size > b.x && nextZX < b.x + b.size && nextZY + z.size > b.y && nextZY < b.y + b.size) {
                        barricadeHit = true;
                        b.hp -= 0.5;
                    }
                });

                if (!barricadeHit) {
                    z.x = nextZX;
                    z.y = nextZY;
                }

                const hitDistance = z.type === 'boss' ? 80 : 40;
                if (minDist < hitDistance) {
                    const wasAlive = closest.hp > 0;
                    if (closest.hasForceField) {
                        z.hp -= 40;
                        z.x -= Math.cos(angle) * 35;
                        z.y -= Math.sin(angle) * 35;
                    } else {
                        closest.hp -= (z.type === 'boss' ? 6 : 1);
                        if (closest.perks.includes('thornArmor')) {
                            z.hp -= (z.type === 'boss' ? 30 : 15);
                        }
                    }
                    if (wasAlive && closest.hp <= 0) {
                        room.speechBubbles.push({
                            x: closest.x + closest.size / 2,
                            y: closest.y - 15,
                            text: funnyQuotes[Math.floor(Math.random() * funnyQuotes.length)],
                            life: 90
                        });
                    }
                }
            }
        });

        room.bullets.forEach(b => {
            b.x += b.dx * b.speed;
            b.y += b.dy * b.speed;
            b.life--;

            if (b.life <= 0 || Math.hypot(b.x - ARENA_CENTER_X, b.y - ARENA_CENTER_Y) > ARENA_RADIUS) {
                b.markedForDeletion = true;
                return;
            }

            room.barrels.forEach(barrel => {
                if (b.markedForDeletion) return;
                if (b.x > barrel.x && b.x < barrel.x + barrel.size && b.y > barrel.y && b.y < barrel.y + barrel.size) {
                    barrel.hp -= b.damage;
                    b.markedForDeletion = true;
                    if (barrel.hp <= 0 && !barrel.exploded) {
                        barrel.exploded = true;
                        room.explosions.push({ x: barrel.x + barrel.size / 2, y: barrel.y + barrel.size / 2, radius: 160, life: 15 });
                        room.zombies.forEach(z => {
                            if (Math.hypot((z.x + z.size / 2) - (barrel.x + barrel.size / 2), (z.y + z.size / 2) - (barrel.y + barrel.size / 2)) < 160) z.hp -= 600;
                        });
                    }
                }
            });

            room.zombies.forEach(z => {
                if (b.markedForDeletion) return;
                if (b.x > z.x && b.x < z.x + z.size && b.y > z.y && b.y < z.y + z.size) {
                    z.hp -= b.damage;
                    if (b.pierce) {
                        b.pierce--;
                        if (b.pierce <= 0) b.markedForDeletion = true;
                    } else {
                        b.markedForDeletion = true;
                    }

                    const shooter = room.players[b.owner];
                    if (shooter) shooter.totalDamage += Math.round(b.damage);

                    if (shooter && shooter.perks.includes('chainLightning') && Math.random() < 0.25) {
                        let chainHits = 0;
                        room.zombies.forEach(otherZ => {
                            if (otherZ !== z && chainHits < 3 && Math.hypot(otherZ.x - z.x, otherZ.y - z.y) < 180) {
                                otherZ.hp -= 90;
                                shooter.totalDamage += 90;
                                chainHits++;
                            }
                        });
                    }

                    if (z.hp <= 0 && !z.rewarded) {
                        z.rewarded = true;
                        
                        room.bloodSplatters.push({ x: z.x + z.size/2, y: z.y + z.size/2, radius: z.size/2 + Math.random()*15 });
                        if (room.bloodSplatters.length > 50) room.bloodSplatters.shift();

                        const baseReward = (z.type === 'boss' ? 800 : 35) * (room.environmentalEvent === 'bloodMoon' ? 2.5 : 1);
                        
                        if (shooter) {
                            shooter.totalKills++;
                            shooter.hp = Math.min(shooter.maxHp, shooter.hp + (shooter.perks.includes('vampirism') ? 4 : 0));

                            if (nowTime - shooter.lastKillTime < 2500) shooter.recentKills++;
                            else shooter.recentKills = 1;
                            shooter.lastKillTime = nowTime;

                            if (shooter.recentKills >= 2) {
                                const streakNames = { 2: 'DOUBLE KILL!', 3: 'TRIPLE KILL!', 4: 'QUAD KILL!', 5: 'RAMPAGE!' };
                                const title = streakNames[shooter.recentKills] || 'ZOMBIE SLAYER!';
                                io.to(code).emit('killstreak', { player: shooter.avatar, title });
                                shooter.money += 25 * shooter.recentKills;
                            }
                        }

                        for (let id in room.players) {
                            const recipient = room.players[id];
                            if (recipient.hp > 0) {
                                const mult = recipient.moneyGainMultiplier || 1.0;
                                recipient.money += Math.round(baseReward * mult);
                            }
                        }

                        if (Math.random() < 0.25) {
                            const pTypes = ['speed', 'doubleDamage', 'health', 'orbital'];
                            const chosen = pTypes[Math.floor(Math.random() * pTypes.length)];
                            if (chosen === 'health') {
                                room.pickups.push({ x: z.x, y: z.y, type: 'health' });
                            } else {
                                room.pickups.push({ x: z.x, y: z.y, type: chosen });
                            }
                        }
                    }
                }
            });
        });

        room.slashArcs = room.slashArcs || [];
        room.slashArcs.forEach(sa => sa.life--);
        room.slashArcs = room.slashArcs.filter(sa => sa.life > 0);

        room.lightningBeams = room.lightningBeams || [];
        room.lightningBeams.forEach(lb => lb.life--);
        room.lightningBeams = room.lightningBeams.filter(lb => lb.life > 0);

        room.explosions.forEach(ex => ex.life--);
        room.explosions = room.explosions.filter(ex => ex.life > 0);
        room.speechBubbles.forEach(sb => { sb.y -= 0.4; sb.life--; });
        room.speechBubbles = room.speechBubbles.filter(sb => sb.life > 0);

        room.bullets  = room.bullets.filter(b => !b.markedForDeletion);
        room.zombies  = room.zombies.filter(z => z.hp > 0);
        room.barrels  = room.barrels.filter(barrel => !barrel.exploded);

        for (let id in room.players) {
            const p = room.players[id];
            if (p.hp <= 0) continue;
            let pickedUp = false;
            room.pickups = room.pickups.filter(pickup => {
                if (pickedUp) return true;
                if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < 40) {
                    if (pickup.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 50);
                    else if (pickup.type === 'orbital') {
                        room.orbitalStrikes.push({ x: p.x + p.size/2, y: p.y + p.size/2, radius: 20, life: 60 });
                    } else { p.powerUpType = pickup.type; p.powerUpTimer = 300; }
                    pickedUp = true;
                    return false;
                }
                return true;
            });
        }

        const spawnedSoFar = room.totalZombiesThisWave - room.zombiesToSpawn;
        if (room.waveActive && !room.waveClearHandled && room.zombiesToSpawn <= 0 && spawnedSoFar > 0 && room.zombies.length === 0) {
            room.waveActive = false;
            room.waveClearHandled = true;
            room.shopTimer = 30;

            const baseRoundBonus = 100 + (room.wave * 50);
            
            for (let id in room.players) {
                const recipient = room.players[id];
                if (recipient.hp <= 0) {
                    recipient.hp = recipient.maxHp;
                    recipient.x = ARENA_CENTER_X + (Math.random() * 60 - 30);
                    recipient.y = ARENA_CENTER_Y + (Math.random() * 60 - 30);
                    if (recipient.class === 'marksman') recipient.ammo = recipient.maxAmmo;
                    if (recipient.class === 'mage' || recipient.class === 'necromancer') recipient.mana = recipient.maxMana;
                    recipient.reloading = false;
                }
                const mult = recipient.moneyGainMultiplier || 1.0;
                recipient.money += Math.round(baseRoundBonus * mult);
            }

            if (room.isBossRush || room.wave % 3 === 0) {
                const shuffled = [...perkPool].sort(() => 0.5 - Math.random());
                const perkOptions = shuffled.slice(0, 3);
                io.to(code).emit('perkPhase', perkOptions);
            }

            room.pickups.push({ x: ARENA_CENTER_X + (Math.random() * 200 - 100), y: ARENA_CENTER_Y + (Math.random() * 200 - 100), type: 'health' });

            for (let i = 0; i < 3; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist  = Math.random() * (ARENA_RADIUS - 200);
                room.barrels.push({ x: ARENA_CENTER_X + Math.cos(angle) * dist, y: ARENA_CENTER_Y + Math.sin(angle) * dist, hp: 50, maxHp: 50, size: 35 });
            }
        }

        io.to(code).emit('stateUpdate', {
            players: room.players,
            bullets: room.bullets,
            zombies: room.zombies,
            minions: room.minions,
            turrets: room.turrets,
            barricades: room.barricades,
            reviveBeacons: room.reviveBeacons,
            orbitalStrikes: room.orbitalStrikes,
            bloodSplatters: room.bloodSplatters,
            pickups: room.pickups,
            barrels: room.barrels,
            explosions: room.explosions,
            speechBubbles: room.speechBubbles,
            fireTrails: room.fireTrails,
            acidPools: room.acidPools,
            slashArcs: room.slashArcs,
            lightningBeams: room.lightningBeams,
            wave: room.wave,
            waveActive: room.waveActive,
            shopTimer: Math.ceil(room.shopTimer),
            gameOver: room.gameOver,
            environmentalEvent: room.environmentalEvent,
            isBossRush: room.isBossRush
        });
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
