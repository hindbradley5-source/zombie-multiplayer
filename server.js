const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};

const classData = {
    mage: { color: '#9b59b6', speed: 4, maxHp: 80, bulletSpeed: 6, bulletSize: 15, damage: 50 },
    melee: { color: '#95a5a6', speed: 6, maxHp: 150, bulletSpeed: 15, bulletSize: 5, damage: 100, range: 10 },
    marksman: { color: '#f1c40f', speed: 5, maxHp: 100, bulletSpeed: 20, bulletSize: 4, damage: 25 }
};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('createParty', () => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[code] = {
            players: {},
            bullets: [],
            zombies: [],
            pickups: [],
            wave: 1,
            zombiesToSpawn: 5,
            waveActive: false,
            gameStarted: false
        };
        socket.roomCode = code;
        socket.join(code);

        // Add creator as default marksman in the lobby
        const stats = classData['marksman'];
        rooms[code].players[socket.id] = {
            x: 400, y: 300,
            size: 25,
            hp: stats.maxHp,
            money: 0,
            class: 'marksman',
            ...stats 
        };

        socket.emit('partyCreated', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    socket.on('joinParty', (code) => {
        const upperCode = code.toUpperCase();
        if (rooms[upperCode] && !rooms[upperCode].gameStarted) {
            socket.roomCode = upperCode;
            socket.join(upperCode);

            const stats = classData['marksman'];
            rooms[upperCode].players[socket.id] = {
                x: 400 + Math.random() * 50 - 25, 
                y: 300 + Math.random() * 50 - 25,
                size: 25,
                hp: stats.maxHp,
                money: 0,
                class: 'marksman',
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
            room.players[socket.id].color = stats.color;
            room.players[socket.id].speed = stats.speed;
            room.players[socket.id].maxHp = stats.maxHp;
            room.players[socket.id].hp = stats.maxHp;
            room.players[socket.id].bulletSpeed = stats.bulletSpeed;
            room.players[socket.id].bulletSize = stats.bulletSize;
            room.players[socket.id].damage = stats.damage;
        }

        io.to(socket.roomCode).emit('lobbyUpdate', room.players);
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (!room) return;

        room.gameStarted = true;
        room.waveActive = true;
        room.zombiesToSpawn = 5 + (room.wave * 3);

        io.to(socket.roomCode).emit('gameStarted');
    });

    socket.on('move', (input) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted) return;
        let p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        if (input.up) p.y -= p.speed;
        if (input.down) p.y += p.speed;
        if (input.left) p.x -= p.speed;
        if (input.right) p.x += p.speed;

        p.x = Math.max(0, Math.min(800 - p.size, p.x));
        p.y = Math.max(0, Math.min(600 - p.size, p.y));
    });

    socket.on('shoot', (target) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.gameStarted) return;
        let p = room.players[socket.id];
        if (!p || p.hp <= 0) return;

        const angle = Math.atan2(target.y - (p.y + p.size/2), target.x - (p.x + p.size/2));
        const lifespan = p.class === 'melee' ? 5 : 60; 

        room.bullets.push({
            x: p.x + p.size/2,
            y: p.y + p.size/2,
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            speed: p.bulletSpeed,
            size: p.bulletSize,
            damage: p.damage,
            owner: socket.id,
            life: lifespan 
        });
    });

    socket.on('buy', (item) => {
        const room = rooms[socket.roomCode];
        if (!room || room.waveActive) return;
        let p = room.players[socket.id];
        if (!p) return;

        if (item === 'health' && p.money >= 50) {
            p.money -= 50;
            p.hp = p.maxHp;
        } else if (item === 'damage' && p.money >= 100) {
            p.money -= 100;
            p.damage += 15;
        } else if (item === 'speed' && p.money >= 75) {
            p.money -= 75;
            p.speed += 1;
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
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

        if (room.waveActive && room.zombiesToSpawn > 0 && Math.random() < 0.02) {
            let zType = 'normal';
            let roll = Math.random(); 
            
            if (room.wave >= 2 && roll < 0.20) {
                zType = 'tank';
            } else if (room.wave >= 3 && roll > 0.70) {
                zType = 'runner';
            }

            let zHp = 30 + (room.wave * 10);
            let zSpeed = 1 + (room.wave * 0.1);
            let zSize = 25;
            let zColor = '#e74c3c';

            if (zType === 'tank') {
                zHp = zHp * 4;       
                zSpeed = zSpeed * 0.4; 
                zSize = 45;          
                zColor = '#27ae60';  
            } else if (zType === 'runner') {
                zHp = zHp * 0.5;     
                zSpeed = zSpeed * 1.8; 
                zSize = 18;          
                zColor = '#e67e22';  
            }

            room.zombies.push({
                x: Math.random() < 0.5 ? -30 : 830,
                y: Math.random() * 600,
                size: zSize,
                hp: zHp,
                speed: zSpeed,
                color: zColor,
                rewarded: false
            });
            room.zombiesToSpawn--;
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

                if (minDist < 30) closest.hp -= 1;
            }
        });

        room.bullets.forEach((b) => {
            b.x += b.dx * b.speed;
            b.y += b.dy * b.speed;
            b.life--;

            if (b.life <= 0 || b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
                b.markedForDeletion = true;
                return;
            }

            room.zombies.forEach((z) => {
                if (b.x > z.x && b.x < z.x + z.size && b.y > z.y && b.y < z.y + z.size) {
                    z.hp -= b.damage;
                    b.markedForDeletion = true; 

                    if (z.hp <= 0 && !z.rewarded) {
                        z.rewarded = true;
                        if (b.owner && room.players[b.owner]) {
                            room.players[b.owner].money += 20;
                        }
                    }
                }
            });
        });

        room.bullets = room.bullets.filter(b => !b.markedForDeletion);
        room.zombies = room.zombies.filter(z => z.hp > 0);

        for (let id in room.players) {
            let p = room.players[id];
            if (p.hp <= 0) continue;

            room.pickups.forEach((pickup, index) => {
                let dist = Math.hypot(p.x - pickup.x, p.y - pickup.y);
                if (dist < 30) {
                    p.hp = Math.min(p.maxHp, p.hp + 50); 
                    room.pickups.splice(index, 1); 
                }
            });
        }

        if (room.waveActive && room.zombiesToSpawn <= 0 && room.zombies.length === 0) {
            room.waveActive = false;
            
            room.pickups.push({
                x: Math.random() * 700 + 50,
                y: Math.random() * 500 + 50,
                type: 'health'
            });

            setTimeout(() => {
                if (rooms[code] && rooms[code].gameStarted) {
                    rooms[code].wave++;
                    rooms[code].waveActive = true;
                    rooms[code].zombiesToSpawn = 5 + (rooms[code].wave * 3);
                }
            }, 10000); 
        }

        io.to(code).emit('stateUpdate', {
            players: room.players,
            bullets: room.bullets,
            zombies: room.zombies,
            pickups: room.pickups,
            wave: room.wave,
            waveActive: room.waveActive
        });
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
