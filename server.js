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
    mage:      { color: '#9b59b6', speed: 5.5, maxHp: 120, bulletSpeed: 9,  bulletSize: 18, damage: 110, mana: 120, maxMana: 120, manaCost: 12, weaponType: 'orb',    attackSpeed: 'Slow (1.2s)'     },
    melee:     { color: '#95a5a6', speed: 7,   maxHp: 220, bulletSpeed: 18, bulletSize: 12, damage: 160,                                                                weaponType: 'dagger', attackSpeed: 'Fast (0.4s)'  },
    marksman:  { color: '#f1c40f', speed: 5,   maxHp: 100, bulletSpeed: 20, bulletSize: 4,  damage: 30,  ammo: 15, maxAmmo: 15, weaponType: 'pistol', reloading: false, attackSpeed: 'Medium (0.6s)'   }
};

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
        powerUpType: null,
        powerUpTimer: 0,
        ...stats
    };
}

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('createParty', () => {
        const code = generatePartyCode();
        rooms[code] = {
            players: {},
            bullets: [],
            zombies: [],
            pickups: [],
            barrels: [],
            explosions: [],
            speechBubbles: [],
            wave: 1,
            zombiesToSpawn: 5,
            totalZombiesThisWave: 5,
            waveActive: false,
            gameStarted: false,
            bossSpawnedThisWave: false,
            shopTimer: 30,
            waveClearHandled: false,
            gameOver: false
        };
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

    socket.on('selectAvatar', (avatar) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.players[socket.id]) return;
        room.players[socket.id].avatar = avatar;
        io.to(socket.roomCode).emit('lobbyUpdate', room.players);
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        room.gameStarted = true;
        room.waveActive = true;
        room.wave = 1;
        room.zombiesToSpawn = 5;
        room.totalZombiesThisWave = 5;
        room.waveClearHandled = false;
        room.gameOver = false;
        io.to(socket.roomCode).emit('gameStarted');
    });

    socket.on('startWaveEarly', () => {
        const room = rooms[socket.roomCode];
        if (!room || room.waveActive || room.gameOver) return;
        room.shopTimer = 0;
    });

    socket.on('retryGame', () => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameOver) return;

        room.wave = 1;
        room.zombies = [];
        room.bullets = [];
        room.pickups = [];
        room.explosions = [];
        room.speechBubbles = [];
        room.zombiesToSpawn = 5;
        room.totalZombiesThisWave = 5;
        room.bossSpawnedThisWave = false;
        room.waveActive = false;
        room.shopTimer = 30;
        room.gameOver = false;
        room.waveClearHandled = false;

        for (let id in room.players) {
            const p = room.players[id];
            const baseStats = classData[p.baseClass || 'marksman'];
            Object.assign(p, {
                hp: baseStats.maxHp,
                maxHp: baseStats.maxHp,
                damage: baseStats.damage,
                speed: baseStats.speed,
                money: 0,
                moneyGainMultiplier: 1.0,
                x: ARENA_CENTER_X + (Math.random() * 60 - 30),
                y: ARENA_CENTER_Y + (Math.random() * 60 - 30),
                weaponType: baseStats.weaponType || 'pistol',
                ammo: baseStats.ammo || 0,
                maxAmmo: baseStats.maxAmmo || 0,
                mana: baseStats.mana || 0,
                maxMana: baseStats.maxMana || 0,
                hasForceField: false,
                reloading: false
            });
        }
    });

    socket.on('move', (input) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

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
                p.x += (dx / len) * 140;
                p.y += (dy / len) * 140;
                p.dashCooldown = 45;
            }
        }

        if (input.up)    p.y -= currentSpeed;
        if (input.down)  p.y += currentSpeed;
        if (input.left)  p.x -= currentSpeed;
        if (input.right) p.x += currentSpeed;

        const distFromCenter = Math.hypot((p.x + p.size / 2) - ARENA_CENTER_X, (p.y + p.size / 2) - ARENA_CENTER_Y);
        const maxDist = ARENA_RADIUS - (p.size / 2);
        if (distFromCenter > maxDist) {
            const angle = Math.atan2((p.y + p.size / 2) - ARENA_CENTER_Y, (p.x + p.size / 2) - ARENA_CENTER_X);
            p.x = ARENA_CENTER_X + Math.cos(angle) * maxDist - p.size / 2;
            p.y = ARENA_CENTER_Y + Math.sin(angle) * maxDist - p.size / 2;
        }
    });

    socket.on('shoot', (target) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.reloading) return;

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
        } else if (p.class === 'mage' && p.weaponType !== 'megaWeapon') {
            if (p.mana < p.manaCost) return;
            p.mana -= p.manaCost;
        }

        const baseAngle = Math.atan2(target.y - (p.y + p.size / 2), target.x - (p.x + p.size / 2));
        const finalDamage = p.damage * (p.powerUpType === 'doubleDamage' ? 2 : 1);

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
            room.bullets.push({ x: p.x + p.size / 2, y: p.y + p.size / 2, dx: Math.cos(baseAngle), dy: Math.sin(baseAngle), speed: p.bulletSpeed, size: p.bulletSize, damage: finalDamage, owner: socket.id, life: p.class === 'melee' ? 12 : 60 });
        }
    });

    socket.on('buy', (item) => {
        const room = rooms[socket.roomCode];
        if (!room || room.gameOver) return;
        const p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        if (!room.waveActive && (item === 'mage' || item === 'melee' || item === 'marksman')) {
            if (p.money >= 10000) {
                p.money -= 10000;
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
        else if (item === 'shotgun'   && p.class === 'marksman' && p.money >= 150  && !['shotgun','minigun','megaWeapon'].includes(p.weaponType))   { p.money -= 150;  p.weaponType = 'shotgun';  p.maxAmmo = 8;   p.ammo = 8;   p.damage = 22;  p.attackSpeed = 'Slow (0.9s)'; }
        else if (item === 'minigun'   && p.class === 'marksman' && p.money >= 250  && !['minigun','megaWeapon'].includes(p.weaponType))             { p.money -= 250;  p.weaponType = 'minigun';  p.maxAmmo = 200; p.ammo = 200; p.damage = 15;  p.bulletSize = base.bulletSize * 3; p.attackSpeed = 'Very Fast (0.2s)'; }
        else if (item === 'fireStaff' && p.class === 'mage'     && p.money >= 160  && !['fireStaff','lightning','megaWeapon'].includes(p.weaponType)) { p.money -= 160;  p.weaponType = 'fireStaff'; p.bulletSize = 26; p.damage = 180; p.manaCost = 22; p.attackSpeed = 'Slow (1.2s)'; }
        else if (item === 'lightning' && p.class === 'mage'     && p.money >= 260  && !['lightning','megaWeapon'].includes(p.weaponType))            { p.money -= 260;  p.weaponType = 'lightning'; p.bulletSize = 10; p.damage = 140; p.manaCost = 18; p.attackSpeed = 'Medium (0.8s)'; }
        else if (item === 'fireAx'    && p.class === 'melee'    && p.money >= 130  && !['fireAx','katana','megaWeapon'].includes(p.weaponType))       { p.money -= 130;  p.weaponType = 'fireAx';   p.bulletSize = 18; p.damage = 240; p.attackSpeed = 'Medium (0.6s)'; }
        else if (item === 'katana'    && p.class === 'melee'    && p.money >= 240  && !['katana','megaWeapon'].includes(p.weaponType))                { p.money -= 240;  p.weaponType = 'katana';   p.bulletSize = 16; p.damage = 320; p.speed += base.speed * 0.05; p.attackSpeed = 'Fast (0.3s)'; }
        else if (item === 'megaWeapon' && p.money >= 100000 && p.weaponType !== 'megaWeapon') { p.money -= 100000; p.weaponType = 'megaWeapon'; p.damage *= 2.5; p.hasForceField = true; p.attackSpeed = 'Rapid Spread'; }
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
    for (let code in rooms) {
        const room = rooms[code];
        if (!room.gameStarted || room.gameOver) continue;

        // Check if all players are dead -> Trigger Game Over
        const playerList = Object.values(room.players);
        if (playerList.length > 0 && playerList.every(p => p.hp <= 0)) {
            room.gameOver = true;
        }

        for (let id in room.players) {
            const p = room.players[id];
            if (p.class === 'mage' && p.mana < p.maxMana && p.hp > 0) p.mana = Math.min(p.maxMana, p.mana + 0.6);
            if (p.powerUpTimer > 0) { p.powerUpTimer--; if (p.powerUpTimer === 0) p.powerUpType = null; }
        }

        if (!room.waveActive) {
            room.shopTimer -= 1 / 30;
            if (room.shopTimer <= 0) {
                room.wave++;
                room.waveActive = true;
                room.zombiesToSpawn = room.wave * 5;
                room.totalZombiesThisWave = room.zombiesToSpawn;
                room.bossSpawnedThisWave = false;
                room.shopTimer = 30;
                room.waveClearHandled = false;
            }
        } else {
            if (room.zombiesToSpawn > 0 && Math.random() < 0.25) {
                let zType = 'normal';
                const roll = Math.random();
                if      (room.wave % 10 === 0 && !room.bossSpawnedThisWave) { zType = 'boss';   room.bossSpawnedThisWave = true; }
                else if (room.wave >= 2 && roll < 0.30)                      { zType = 'tank';   }
                else if (room.wave >= 3 && roll > 0.60)                      { zType = 'runner'; }

                let zHp    = 35 + (room.wave * 12);
                let zSpeed = 1.2 + (room.wave * 0.12);
                let zSize  = 40;

                if      (zType === 'boss')   { zHp = 3500 + (room.wave * 800); zSpeed = 1.8 + (room.wave * 0.03); zSize = 120; }
                else if (zType === 'tank')   { zHp *= 5;   zSpeed *= 0.35; zSize = 65; }
                else if (zType === 'runner') { zHp *= 0.6; zSpeed *= 1.9;  zSize = 30; }

                const spawnAngle = Math.random() * Math.PI * 2;
                room.zombies.push({
                    x: ARENA_CENTER_X + Math.cos(spawnAngle) * ARENA_RADIUS,
                    y: ARENA_CENTER_Y + Math.sin(spawnAngle) * ARENA_RADIUS,
                    size: zSize, hp: zHp, maxHp: zHp, speed: zSpeed, type: zType, rewarded: false
                });
                room.zombiesToSpawn--;
            }
        }

        room.zombies.forEach(z => {
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
                z.x += Math.cos(angle) * z.speed;
                z.y += Math.sin(angle) * z.speed;
                const hitDistance = z.type === 'boss' ? 80 : 40;
                if (minDist < hitDistance) {
                    const wasAlive = closest.hp > 0;
                    if (closest.hasForceField) {
                        z.hp -= 40;
                        z.x -= Math.cos(angle) * 35;
                        z.y -= Math.sin(angle) * 35;
                    } else {
                        closest.hp -= (z.type === 'boss' ? 6 : 1);
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
                    b.markedForDeletion = true;

                    if (z.hp <= 0 && !z.rewarded) {
                        z.rewarded = true;
                        const baseReward = z.type === 'boss' ? 800 : 35;
                        
                        for (let id in room.players) {
                            const recipient = room.players[id];
                            if (recipient.hp > 0) {
                                const mult = recipient.moneyGainMultiplier || 1.0;
                                recipient.money += Math.round(baseReward * mult);
                            }
                        }

                        if (Math.random() < 0.20) {
                            const pTypes = ['speed', 'doubleDamage', 'health'];
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
                    else { p.powerUpType = pickup.type; p.powerUpTimer = 300; }
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
            
            // Respawn all dead players for the next round & reward alive/respawned players
            for (let id in room.players) {
                const recipient = room.players[id];
                if (recipient.hp <= 0) {
                    recipient.hp = recipient.maxHp;
                    recipient.x = ARENA_CENTER_X + (Math.random() * 60 - 30);
                    recipient.y = ARENA_CENTER_Y + (Math.random() * 60 - 30);
                    if (recipient.class === 'marksman') recipient.ammo = recipient.maxAmmo;
                    if (recipient.class === 'mage') recipient.mana = recipient.maxMana;
                    recipient.reloading = false;
                }
                const mult = recipient.moneyGainMultiplier || 1.0;
                recipient.money += Math.round(baseRoundBonus * mult);
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
            pickups: room.pickups,
            barrels: room.barrels,
            explosions: room.explosions,
            speechBubbles: room.speechBubbles,
            wave: room.wave,
            waveActive: room.waveActive,
            shopTimer: Math.ceil(room.shopTimer),
            gameOver: room.gameOver
        });
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
