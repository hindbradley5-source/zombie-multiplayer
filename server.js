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
    mage: { color: '#9b59b6', speed: 5.5, maxHp: 120, bulletSpeed: 9, bulletSize: 18, damage: 110, mana: 120, maxMana: 120, manaCost: 12, weaponType: 'orb' },
    melee: { color: '#95a5a6', speed: 7, maxHp: 220, bulletSpeed: 18, bulletSize: 12, damage: 160, weaponType: 'dagger' },
    marksman: { color: '#f1c40f', speed: 5, maxHp: 100, bulletSpeed: 20, bulletSize: 4, damage: 30, ammo: 15, maxAmmo: 15, weaponType: 'pistol', reloading: false }
};

function generatePartyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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
            wave: 1,
            zombiesToSpawn: 15,
            waveActive: false,
            gameStarted: false,
            bossSpawnedThisWave: false,
            shopTimer: 30
        };
        socket.roomCode = code;
        socket.join(code);

        const stats = classData['marksman'];
        rooms[code].players[socket.id] = {
            x: ARENA_CENTER_X, y: ARENA_CENTER_Y,
            size: 35,
            hp: stats.maxHp,
            money: 0,
            class: 'marksman',
            baseClass: 'marksman',
            weaponType: 'pistol',
            hasForceField: false,
            dashCooldown: 0,
            powerUpType: null,
            powerUpTimer: 0,
            ...stats 
        };

        for(let i=0; i<6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let dist = Math.random() * (ARENA_RADIUS - 200);
            rooms[code].barrels.push({
                x: ARENA_CENTER_X + Math.cos(angle) * dist,
                y: ARENA_CENTER_Y + Math.sin(angle) * dist,
                hp: 50,
                maxHp: 50,
                size: 35
            });
        }

        socket.emit('partyCreated', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    socket.on('joinParty', (code) => {
        const upperCode = code ? code.trim().toUpperCase() : '';
        
        if (rooms[upperCode] && !rooms[upperCode].gameStarted) {
            socket.roomCode = upperCode;
            socket.join(upperCode);

            const stats = classData['marksman'];
            rooms[upperCode].players[socket.id] = {
                x: ARENA_CENTER_X + (Math.random() * 40 - 20), 
                y: ARENA_CENTER_Y + (Math.random() * 40 - 20),
                size: 35,
                hp: stats.maxHp,
                money: 0,
                class: 'marksman',
                baseClass: 'marksman',
                weaponType: 'pistol',
                hasForceField: false,
                dashCooldown: 0,
                powerUpType: null,
                powerUpTimer: 0,
                ...stats 
            };

            socket.emit('partyJoined', upperCode);
            io.to(upperCode).emit('lobbyUpdate', rooms[upperCode].players);
        } else {
            socket.emit('partyError', 'Party code not found or game already started!');
        }
    });

    socket.on('selectClass', (playerClass) => {
        const room = rooms[socket.roomCode];
        if (!room || room.gameStarted) return;

        const stats = classData[playerClass];
        if (room.players[socket.id]) {
            room.players[socket.id].class = playerClass;
            room.players[socket.id].baseClass = playerClass;
            room.players[socket.id].color = stats.color;
            room.players[socket.id].speed = stats.speed;
            room.players[socket.id].maxHp = stats.maxHp;
            room.players[socket.id].hp = stats.maxHp;
            room.players[socket.id].bulletSpeed = stats.bulletSpeed;
            room.players[socket.id].bulletSize = stats.bulletSize;
            room.players[socket.id].damage = stats.damage;
            room.players[socket.id].mana = stats.mana !== undefined ? stats.mana : 0;
            room.players[socket.id].maxMana = stats.maxMana !== undefined ? stats.maxMana : 0;
            room.players[socket.id].manaCost = stats.manaCost !== undefined ? stats.manaCost : 0;
            room.players[socket.id].ammo = stats.ammo !== undefined ? stats.ammo : 0;
            room.players[socket.id].maxAmmo = stats.maxAmmo !== undefined ? stats.maxAmmo : 0;
            room.players[socket.id].weaponType = stats.weaponType || 'pistol';
            room.players[socket.id].hasForceField = false;
            room.players[socket.id].dashCooldown = 0;
            room.players[socket.id].reloading = false;
        }

        io.to(socket.roomCode).emit('lobbyUpdate', room.players);
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (!room) return;

        room.gameStarted = true;
        room.waveActive = true;
        room.zombiesToSpawn = 15 + (room.wave * 15);

        io.to(socket.roomCode).emit('gameStarted');
    });

    socket.on('move', (input) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted) return;
        let p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        let currentSpeed = p.speed;
        if (p.powerUpType === 'speed') currentSpeed *= 1.6;

        if (p.dashCooldown > 0) p.dashCooldown--;

        if (input.dash && p.dashCooldown === 0) {
            let dx = 0, dy = 0;
            if (input.up) dy -= 1;
            if (input.down) dy += 1;
            if (input.left) dx -= 1;
            if (input.right) dx += 1;
            if (dx !== 0 || dy !== 0) {
                let len = Math.hypot(dx, dy);
                p.x += (dx / len) * 140; 
                p.y += (dy / len) * 140;
                p.dashCooldown = 45; 
            }
        }

        if (input.up) p.y -= currentSpeed;
        if (input.down) p.y += currentSpeed;
        if (input.left) p.x -= currentSpeed;
        if (input.right) p.x += currentSpeed;

        let distFromCenter = Math.hypot((p.x + p.size/2) - ARENA_CENTER_X, (p.y + p.size/2) - ARENA_CENTER_Y);
        let maxDist = ARENA_RADIUS - (p.size / 2);
        if (distFromCenter > maxDist) {
            let angle = Math.atan2((p.y + p.size/2) - ARENA_CENTER_Y, (p.x + p.size/2) - ARENA_CENTER_X);
            p.x = ARENA_CENTER_X + Math.cos(angle) * maxDist - p.size/2;
            p.y = ARENA_CENTER_Y + Math.sin(angle) * maxDist - p.size/2;
        }
    });

    socket.on('shoot', (target) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted) return;
        let p = room.players[socket.id];
        if (!p || p.hp <= 0 || p.reloading) return;

        let reloadTime = 500;
        if (p.class === 'marksman' && p.weaponType !== 'megaWeapon') {
            if (p.weaponType === 'shotgun') reloadTime = 900;
            if (p.weaponType === 'minigun') reloadTime = 200;

            if (p.ammo <= 0) {
                p.reloading = true;
                setTimeout(() => {
                    if (room.players[socket.id]) {
                        room.players[socket.id].ammo = room.players[socket.id].maxAmmo;
                        room.players[socket.id].reloading = false;
                    }
                }, reloadTime);
                return;
            }
            p.ammo--;
            if (p.ammo === 0) {
                p.reloading = true;
                setTimeout(() => {
                    if (room.players[socket.id]) {
                        room.players[socket.id].ammo = room.players[socket.id].maxAmmo;
                        room.players[socket.id].reloading = false;
                    }
                }, reloadTime);
            }
        } else if (p.class === 'mage' && p.weaponType !== 'megaWeapon') {
            if (p.mana < p.manaCost) return;
            p.mana -= p.manaCost;
        }

        const baseAngle = Math.atan2(target.y - (p.y + p.size/2), target.x - (p.x + p.size/2));
        let dmgMultiplier = p.powerUpType === 'doubleDamage' ? 2 : 1;
        let finalDamage = p.damage * dmgMultiplier;

        if (p.weaponType === 'megaWeapon') {
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                room.bullets.push({
                    x: p.x + p.size/2,
                    y: p.y + p.size/2,
                    dx: Math.cos(angle),
                    dy: Math.sin(angle),
                    speed: p.bulletSpeed * 1.5,
                    size: p.bulletSize * 2,
                    damage: finalDamage,
                    owner: socket.id,
                    life: 80
                });
            }
        } else if (p.class === 'marksman' && p.weaponType === 'shotgun') {
            for (let i = -1; i <= 1; i++) {
                const angle = baseAngle + (i * 0.15);
                room.bullets.push({
                    x: p.x + p.size/2,
                    y: p.y + p.size/2,
                    dx: Math.cos(angle),
                    dy: Math.sin(angle),
                    speed: p.bulletSpeed,
                    size: p.bulletSize,
                    damage: finalDamage,
                    owner: socket.id,
                    life: 60
                });
            }
        } else {
            room.bullets.push({
                x: p.x + p.size/2,
                y: p.y + p.size/2,
                dx: Math.cos(baseAngle),
                dy: Math.sin(baseAngle),
                speed: p.bulletSpeed,
                size: p.bulletSize,
                damage: finalDamage,
                owner: socket.id,
                life: p.class === 'melee' ? 12 : 60
            });
        }
    });

    socket.on('respawn', () => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        let p = room.players[socket.id];
        if (p && p.hp <= 0) {
            p.hp = p.maxHp;
            p.x = ARENA_CENTER_X;
            p.y = ARENA_CENTER_Y;
            if (p.class === 'marksman') p.ammo = p.maxAmmo;
            if (p.class === 'mage') p.mana = p.maxMana;
            p.reloading = false;
        }
    });

    socket.on('buy', (item) => {
        const room = rooms[socket.roomCode];
        if (!room || room.waveActive) return;
        let p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        let base = classData[p.baseClass];

        if (item === 'health' && p.money >= 50) {
            p.money -= 50;
            p.hp = p.maxHp;
        } else if (item === 'maxHealth' && p.money >= 120) {
            p.money -= 120;
            p.maxHp += Math.round(base.maxHp * 0.10);
            p.hp = p.maxHp;
        } else if (item === 'damage' && p.money >= 100) {
            p.money -= 100;
            p.damage += Math.max(1, Math.round(base.damage * 0.01));
        } else if (item === 'speed' && p.money >= 75) {
            p.money -= 75;
            p.speed += Number((base.speed * 0.01).toFixed(2));
        } else if (item === 'shotgun' && p.class === 'marksman' && p.money >= 150 && p.weaponType !== 'shotgun' && p.weaponType !== 'minigun' && p.weaponType !== 'megaWeapon') {
            p.money -= 150;
            p.weaponType = 'shotgun';
            p.maxAmmo = 8;
            p.ammo = 8;
            p.damage = 22;
        } else if (item === 'minigun' && p.class === 'marksman' && p.money >= 250 && p.weaponType !== 'minigun' && p.weaponType !== 'megaWeapon') {
            p.money -= 250;
            p.weaponType = 'minigun';
            p.maxAmmo = 200;
            p.ammo = 200;
            p.damage = 15;
            p.bulletSize = base.bulletSize * 3;
        } else if (item === 'fireStaff' && p.class === 'mage' && p.money >= 160 && p.weaponType !== 'fireStaff' && p.weaponType !== 'lightning' && p.weaponType !== 'megaWeapon') {
            p.money -= 160;
            p.weaponType = 'fireStaff';
            p.bulletSize = 26;
            p.damage = 180;
            p.manaCost = 22;
        } else if (item === 'lightning' && p.class === 'mage' && p.money >= 260 && p.weaponType !== 'lightning' && p.weaponType !== 'megaWeapon') {
            p.money -= 260;
            p.weaponType = 'lightning';
            p.bulletSize = 10;
            p.damage = 140;
            p.manaCost = 18;
        } else if (item === 'fireAx' && p.class === 'melee' && p.money >= 130 && p.weaponType !== 'fireAx' && p.weaponType !== 'katana' && p.weaponType !== 'megaWeapon') {
            p.money -= 130;
            p.weaponType = 'fireAx';
            p.bulletSize = 18;
            p.damage = 240;
        } else if (item === 'katana' && p.class === 'melee' && p.money >= 240 && p.weaponType !== 'katana' && p.weaponType !== 'megaWeapon') {
            p.money -= 240;
            p.weaponType = 'katana';
            p.bulletSize = 16;
            p.damage = 320;
            p.speed += base.speed * 0.05; 
        } else if (item === 'megaWeapon' && p.money >= 100000 && p.weaponType !== 'megaWeapon') {
            p.money -= 100000;
            p.weaponType = 'megaWeapon';
            p.damage *= 2.5;
            p.hasForceField = true;
        }
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
        let room = rooms[code];
        if (!room.gameStarted) continue;

        for (let id in room.players) {
            let p = room.players[id];
            if (p.class === 'mage' && p.mana < p.maxMana && p.hp > 0) {
                p.mana = Math.min(p.maxMana, p.mana + 0.6); 
            }
            if (p.powerUpTimer > 0) {
                p.powerUpTimer--;
                if (p.powerUpTimer === 0) p.powerUpType = null;
            }
        }

        if (!room.waveActive) {
            room.shopTimer -= 1/30;
            if (room.shopTimer <= 0) {
                room.wave++;
                room.waveActive = true;
                room.zombiesToSpawn = 15 + (room.wave * 18);
                room.bossSpawnedThisWave = false;
                room.shopTimer = 30;
            }
        } else {
            if (room.zombiesToSpawn > 0 && Math.random() < 0.25) {
                let zType = 'normal';
                let roll = Math.random(); 
                
                if (room.wave % 10 === 0 && !room.bossSpawnedThisWave) {
                    zType = 'boss';
                    room.bossSpawnedThisWave = true;
                } else if (room.wave >= 2 && roll < 0.30) {
                    zType = 'tank';
                } else if (room.wave >= 3 && roll > 0.60) {
                    zType = 'runner';
                }

                let zHp = 35 + (room.wave * 12);
                let zSpeed = 1.2 + (room.wave * 0.12);
                let zSize = 40;

                if (zType === 'boss') {
                    zHp = 3500 + (room.wave * 800);
                    zSpeed = 1.8 + (room.wave * 0.03);
                    zSize = 120;
                } else if (zType === 'tank') {
                    zHp = zHp * 5;       
                    zSpeed = zSpeed * 0.35; 
                    zSize = 65;          
                } else if (zType === 'runner') {
                    zHp = zHp * 0.6;     
                    zSpeed = zSpeed * 1.9; 
                    zSize = 30;          
                }

                let spawnAngle = Math.random() * Math.PI * 2;
                let spawnX = ARENA_CENTER_X + Math.cos(spawnAngle) * ARENA_RADIUS;
                let spawnY = ARENA_CENTER_Y + Math.sin(spawnAngle) * ARENA_RADIUS;

                room.zombies.push({
                    x: spawnX,
                    y: spawnY,
                    size: zSize,
                    hp: zHp,
                    maxHp: zHp,
                    speed: zSpeed,
                    type: zType,
                    rewarded: false
                });
                room.zombiesToSpawn--;
            }
        }

        room.zombies.forEach(z => {
            let closest = null;
            let minDist = Infinity;
            
            for (let id in room.players) {
                let p = room.players[id];
                if (p.hp > 0) {
                    let dist = Math.hypot(p.x - z.x, p.y - z.y);
                    if (dist < minDist) { minDist = dist; closest = p; }
                }
            }

            if (closest) {
                let angle = Math.atan2(closest.y - z.y, closest.x - z.x);
                z.x += Math.cos(angle) * z.speed;
                z.y += Math.sin(angle) * z.speed;

                let hitDistance = z.type === 'boss' ? 80 : 40;
                if (minDist < hitDistance) {
                    if (closest.hasForceField) {
                        z.hp -= 40;
                        z.x -= Math.cos(angle) * 35;
                        z.y -= Math.sin(angle) * 35;
                    } else {
                        closest.hp -= (z.type === 'boss' ? 6 : 1);
                    }
                }
            }
        });

        room.bullets.forEach((b) => {
            b.x += b.dx * b.speed;
            b.y += b.dy * b.speed;
            b.life--;

            let distFromCenter = Math.hypot(b.x - ARENA_CENTER_X, b.y - ARENA_CENTER_Y);
            if (b.life <= 0 || distFromCenter > ARENA_RADIUS) {
                b.markedForDeletion = true;
                return;
            }

            room.barrels.forEach(barrel => {
                if (b.x > barrel.x && b.x < barrel.x + barrel.size && b.y > barrel.y && b.y < barrel.y + barrel.size) {
                    barrel.hp -= b.damage;
                    b.markedForDeletion = true;
                    if (barrel.hp <= 0 && !barrel.exploded) {
                        barrel.exploded = true;
                        room.zombies.forEach(z => {
                            if (Math.hypot(z.x - barrel.x, z.y - barrel.y) < 160) {
                                z.hp -= 500;
                            }
                        });
                    }
                }
            });

            room.zombies.forEach((z) => {
                if (b.x > z.x && b.x < z.x + z.size && b.y > z.y && b.y < z.y + z.size) {
                    z.hp -= b.damage;
                    b.markedForDeletion = true; 

                    if (z.hp <= 0 && !z.rewarded) {
                        z.rewarded = true;
                        if (b.owner && room.players[b.owner]) {
                            room.players[b.owner].money += (z.type === 'boss' ? 500 : 20);
                            
                            if (Math.random() < 0.20) {
                                let pTypes = ['speed', 'doubleDamage', 'nuke'];
                                let chosenType = pTypes[Math.floor(Math.random() * pTypes.length)];
                                if (chosenType === 'nuke') {
                                    room.zombies.forEach(zm => zm.hp = 0);
                                } else {
                                    room.pickups.push({ x: z.x, y: z.y, type: chosenType });
                                }
                            }
                        }
                    }
                }
            });
        });

        room.bullets = room.bullets.filter(b => !b.markedForDeletion);
        room.zombies = room.zombies.filter(z => z.hp > 0);
        room.barrels = room.barrels.filter(barrel => !barrel.exploded);

        for (let id in room.players) {
            let p = room.players[id];
            if (p.hp <= 0) continue;

            room.pickups.forEach((pickup, index) => {
                let dist = Math.hypot(p.x - pickup.x, p.y - pickup.y);
                if (dist < 40) {
                    if (pickup.type === 'health') {
                        p.hp = Math.min(p.maxHp, p.hp + 50);
                    } else {
                        p.powerUpType = pickup.type;
                        p.powerUpTimer = 300; 
                    }
                    room.pickups.splice(index, 1); 
                }
            });
        }

        if (room.waveActive && room.zombiesToSpawn <= 0 && room.zombies.length === 0) {
            room.waveActive = false;
            room.shopTimer = 30; // 30 seconds shop break
            
            let roundBonus = 60 + (room.wave * 35);
            for (let id in room.players) {
                if (room.players[id].hp > 0) {
                    room.players[id].money += roundBonus;
                }
            }

            room.pickups.push({
                x: ARENA_CENTER_X + (Math.random() * 200 - 100),
                y: ARENA_CENTER_Y + (Math.random() * 200 - 100),
                type: 'health'
            });

            for(let i=0; i<3; i++) {
                let angle = Math.random() * Math.PI * 2;
                let dist = Math.random() * (ARENA_RADIUS - 200);
                room.barrels.push({
                    x: ARENA_CENTER_X + Math.cos(angle) * dist,
                    y: ARENA_CENTER_Y + Math.sin(angle) * dist,
                    hp: 50,
                    maxHp: 50,
                    size: 35
                });
            }
        }

        io.to(code).emit('stateUpdate', {
            players: room.players,
            bullets: room.bullets,
            zombies: room.zombies,
            pickups: room.pickups,
            barrels: room.barrels,
            wave: room.wave,
            waveActive: room.waveActive,
            shopTimer: Math.ceil(room.shopTimer)
        });
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
