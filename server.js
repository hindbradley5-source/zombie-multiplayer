const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Game State
const players = {};
let bullets = [];
let zombies = [];
let pickups = [];
let wave = 1;
let zombiesToSpawn = 5;
let waveActive = false;

// Class Stats
const classData = {
    mage: { color: '#9b59b6', speed: 4, maxHp: 80, bulletSpeed: 6, bulletSize: 15, damage: 50 },
    melee: { color: '#95a5a6', speed: 6, maxHp: 150, bulletSpeed: 15, bulletSize: 5, damage: 100, range: 10 },
    marksman: { color: '#f1c40f', speed: 5, maxHp: 100, bulletSpeed: 20, bulletSize: 4, damage: 25 }
};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('joinGame', (playerClass) => {
        const stats = classData[playerClass];
        players[socket.id] = {
            x: 400, y: 300,
            size: 25,
            hp: stats.maxHp,
            money: 0, // Starting money
            class: playerClass,
            ...stats 
        };
        if (!waveActive && wave === 1) startWave();
    });

    socket.on('move', (input) => {
        let p = players[socket.id];
        if (!p || p.hp <= 0) return;

        if (input.up) p.y -= p.speed;
        if (input.down) p.y += p.speed;
        if (input.left) p.x -= p.speed;
        if (input.right) p.x += p.speed;

        p.x = Math.max(0, Math.min(800 - p.size, p.x));
        p.y = Math.max(0, Math.min(600 - p.size, p.y));
    });

    socket.on('shoot', (target) => {
        let p = players[socket.id];
        if (!p || p.hp <= 0) return;

        const angle = Math.atan2(target.y - (p.y + p.size/2), target.x - (p.x + p.size/2));
        const lifespan = p.class === 'melee' ? 5 : 60; 

        bullets.push({
            x: p.x + p.size/2,
            y: p.y + p.size/2,
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            speed: p.bulletSpeed,
            size: p.bulletSize,
            damage: p.damage,
            owner: socket.id, // Tracks who shot the bullet to award money
            life: lifespan 
        });
    });

    // Handle Shop Purchases (Only allowed when wave is not active)
    socket.on('buy', (item) => {
        let p = players[socket.id];
        if (!p || waveActive) return; // Cannot buy during an active wave

        if (item === 'health' && p.money >= 50) {
            p.money -= 50;
            p.hp = p.maxHp; // Full heal
        } else if (item === 'damage' && p.money >= 100) {
            p.money -= 100;
            p.damage += 15; // Weapon damage upgrade
        } else if (item === 'speed' && p.money >= 75) {
            p.money -= 75;
            p.speed += 1; // Speed boost upgrade
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
    });
});

function startWave() {
    waveActive = true;
    zombiesToSpawn = 5 + (wave * 3);
}

// MAIN GAME LOOP
setInterval(() => {
    // 1. Spawn Zombies
    if (waveActive && zombiesToSpawn > 0 && Math.random() < 0.02) {
        let zType = 'normal';
        let roll = Math.random(); 
        
        if (wave >= 2 && roll < 0.20) {
            zType = 'tank';
        } else if (wave >= 3 && roll > 0.70) {
            zType = 'runner';
        }

        let zHp = 30 + (wave * 10);
        let zSpeed = 1 + (wave * 0.1);
        let zSize = 25;
        let zColor = '#e74c3c'; // Red

        if (zType === 'tank') {
            zHp = zHp * 4;       
            zSpeed = zSpeed * 0.4; 
            zSize = 45;          
            zColor = '#27ae60';  // Green
        } else if (zType === 'runner') {
            zHp = zHp * 0.5;     
            zSpeed = zSpeed * 1.8; 
            zSize = 18;          
            zColor = '#e67e22';  // Orange
        }

        zombies.push({
            x: Math.random() < 0.5 ? -30 : 830,
            y: Math.random() * 600,
            size: zSize,
            hp: zHp,
            speed: zSpeed,
            color: zColor,
            rewarded: false
        });
        zombiesToSpawn--;
    }

    // 2. Move Zombies
    zombies.forEach(z => {
        let closest = null;
        let minDist = Infinity;
        
        for (let id in players) {
            let p = players[id];
            if (p.hp > 0) {
                let dist = Math.hypot(p.x - z.x, p.y - z.y);
                if (dist < minDist) { minDist = dist; closest = p; }
            }
        }

        if (closest) {
            let angle = Math.atan2(closest.y - z.y, closest.x - z.x);
            z.x += Math.cos(angle) * z.speed;
            z.y += Math.sin(angle) * z.speed;

            if (minDist < 30) closest.hp -= 1;
        }
    });

    // 3. Move Bullets & Collisions
    bullets.forEach((b, index) => {
        b.x += b.dx * b.speed;
        b.y += b.dy * b.speed;
        b.life--;

        if (b.life <= 0 || b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
            bullets.splice(index, 1);
            return;
        }

        zombies.forEach((z) => {
            if (b.x > z.x && b.x < z.x + z.size && b.y > z.y && b.y < z.y + z.size) {
                z.hp -= b.damage;
                b.markedForDeletion = true; 

                // Award money to the player who killed the zombie
                if (z.hp <= 0 && !z.rewarded) {
                    z.rewarded = true;
                    if (b.owner && players[b.owner]) {
                        players[b.owner].money += 20; // $20 per kill
                    }
                }
            }
        });
    });

    bullets = bullets.filter(b => !b.markedForDeletion);
    zombies = zombies.filter(z => z.hp > 0);

    // 4. Handle Health Pickups
    for (let id in players) {
        let p = players[id];
        if (p.hp <= 0) continue;

        pickups.forEach((pickup, index) => {
            let dist = Math.hypot(p.x - pickup.x, p.y - pickup.y);
            if (dist < 30) {
                p.hp = Math.min(p.maxHp, p.hp + 50); 
                pickups.splice(index, 1); 
            }
        });
    }

    // 5. Wave Logic & Shop Phase
    if (waveActive && zombiesToSpawn <= 0 && zombies.length === 0) {
        waveActive = false;
        
        pickups.push({
            x: Math.random() * 700 + 50,
            y: Math.random() * 500 + 50,
            type: 'health'
        });

        // 10 second shop break between waves
        setTimeout(() => {
            wave++;
            startWave();
        }, 10000); 
    }

    // 6. Send data to clients (including waveActive status)
    io.emit('stateUpdate', { players, bullets, zombies, pickups, wave, waveActive });

}, 1000 / 60); 

http.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
