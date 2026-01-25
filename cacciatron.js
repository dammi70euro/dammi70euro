const SONGS = [
    "zio o .mp3", "A cena da Gaia.mp3", "alle vene.mp3", "Auguri Enke ,.mp3", "Bassi Buoni.mp3",
    "briaco.mp3", "cachorro.mp3", "di-troit (1).mp3", "di-troit.mp3", "facciamo un ragionamento sensato.mp3",
    "Fast_Drums_Trap_Beat_04_165_BPM_NA.wav", "frocio.mp3", "Giochi sull'acqua.mp3", "mette carne.mp3",
    "no a letto.mp3", "no.mp3", "non mi sento tanto bene.mp3", "Paolo paolo paolo.mp3", "pippa qui pippa la.mp3",
    "pippaAncheTu.mpeg", "quando siamo fro ci stà.mp3", "Scusa ma ero in capié,.mp3",
    "secondo te è meglio andare a prostitute.mp3", "skukk no.wav", "ti garba fumà, eh!.mp3",
    "una pizza non mi sazia.mp3", "Vado_.mp3"
];

const Sys = {
    width: 0, height: 0, score: 0,
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    loopId: null, state: 'select',
    audio: new Audio(),
    shakeX: 0, shakeY: 0, particles: [],
    bgParticles: [], bgSparks: []
};

const Input = { x: 0, y: 0 };

const characters = [];
let selectedCharacter = null;
let characterImages = {};
const CUSTOM_USER_ID = 'user_custom';
let customUserImage = null;
let stream = null;

const ConsentStorage = {
    hasConsent: function(character) {
        const consents = JSON.parse(localStorage.getItem('cacciatron_consents') || '{}');
        const charName = character.replace('.jpeg', '');
        return consents[charName] === true;
    },
    saveConsent: function(character) {
        const consents = JSON.parse(localStorage.getItem('cacciatron_consents') || '{}');
        const charName = character.replace('.jpeg', '');
        consents[charName] = true;
        localStorage.setItem('cacciatron_consents', JSON.stringify(consents));
    },
    showConsentModal: function(character) {
        const modal = document.getElementById('consent-modal');
        const charName = character.replace('.jpeg', '');
        let displayName = charName === CUSTOM_USER_ID ? 'Tu' : (charName.charAt(0).toUpperCase() + charName.slice(1));
        document.getElementById('consent-char-name').textContent = displayName;
        modal.classList.remove('hidden');
        const video = document.getElementById('consent-video-player');
        if (video) { video.volume = 1.0; video.muted = false; video.play().catch(() => {}); }
    },
    hideConsentModal: function() {
        document.getElementById('consent-modal').classList.add('hidden');
        const video = document.getElementById('consent-video-player');
        if (video) { video.pause(); video.currentTime = 0; }
    }
};

const ScoreStorage = {
    saveScore: function(character, score) {
        const scores = JSON.parse(localStorage.getItem('cacciatron_scores') || '{}');
        const charName = character.replace('.jpeg', '');
        if (!scores[charName] || score > scores[charName]) {
            scores[charName] = score;
            localStorage.setItem('cacciatron_scores', JSON.stringify(scores));
        }
        this.updateLeaderboard();
    },
    getScores: function() {
        return JSON.parse(localStorage.getItem('cacciatron_scores') || '{}');
    },
    updateLeaderboard: function() {
        const scores = this.getScores();
        const leaderboardEl = document.getElementById('leaderboard-list');
        if (!leaderboardEl) return;
        const names = ['ricka', 'franco', 'frizze', 'lastrue', 'lotti', 'mache', 'paolo'];
        if (customUserImage) names.push(CUSTOM_USER_ID);
        const entries = names
            .filter(name => scores[name] !== undefined)
            .map(name => ({ name, score: scores[name] }))
            .sort((a, b) => b.score - a.score);
        if (entries.length === 0) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">Nessun punteggio ancora</div>';
            return;
        }
        leaderboardEl.innerHTML = entries.map((entry, index) => {
            let displayName = entry.name === CUSTOM_USER_ID ? 'Tu' : (entry.name.charAt(0).toUpperCase() + entry.name.slice(1));
            return `<div class="leaderboard-item"><span class="leaderboard-rank">#${index + 1}</span><span class="leaderboard-name">${displayName}</span><span class="leaderboard-score">${entry.score}</span></div>`;
        }).join('');
    }
};

// ---- Game Shooter ----
const BASE_PLAYER_SPEED = 4;
const BASE_ENEMY_SPEED = 1.2;
const SPEED_INCREASE_PER_SEC = 0.04;
const BULLET_SPEED = 14;
const BULLET_RADIUS = 5;
const PLAYER_RADIUS = 22;
const ENEMY_RADIUS = 22;
const INITIAL_ENEMIES = 2;
const DUPLICATE_INTERVAL_MS = 30000;
const SHOOT_COOLDOWN_MS = 350;

let game = null;
let gameStartTime = 0;
let lastDuplicateTime = 0;
let lastShootTime = 0;
let musicIntervalId = null;

function playRandomMusic() {
    if (SONGS.length === 0) return;
    const songFile = SONGS[Math.floor(Math.random() * SONGS.length)];
    Sys.audio.pause();
    Sys.audio.src = 'canzoni/' + songFile;
    Sys.audio.loop = true;
    Sys.audio.volume = 0.5;
    Sys.audio.play().catch(() => {});
}

function getSpeedMultiplier() {
    const elapsed = (Date.now() - gameStartTime) / 1000;
    return 1 + elapsed * SPEED_INCREASE_PER_SEC;
}

function spawnEnemy() {
    const available = characters.filter(c => c !== selectedCharacter);
    if (available.length === 0) return;
    const char = available[Math.floor(Math.random() * available.length)];
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = Math.random() * Sys.width; y = -30; }
    else if (side === 1) { x = Sys.width + 30; y = Math.random() * Sys.height; }
    else if (side === 2) { x = Math.random() * Sys.width; y = Sys.height + 30; }
    else { x = -30; y = Math.random() * Sys.height; }
    game.enemies.push({ x, y, char });
}

class GameShooter {
    constructor() {
        this.p = { x: Sys.width / 2, y: Sys.height / 2 };
        this.bullets = [];
        this.enemies = [];
        const available = characters.filter(c => c !== selectedCharacter);
        for (let i = 0; i < INITIAL_ENEMIES && available.length > 0; i++) {
            const char = available[Math.floor(Math.random() * available.length)];
            const x = Math.random() * (Sys.width - 80) + 40;
            const y = Math.random() * (Sys.height - 80) + 40;
            this.enemies.push({ x, y, char });
        }
        this.rotation = 0;
    }

    update() {
        const mult = getSpeedMultiplier();
        const playerSpeed = BASE_PLAYER_SPEED * mult;
        const enemySpeed = BASE_ENEMY_SPEED * mult;

        this.p.x += Input.x * playerSpeed;
        this.p.y += Input.y * playerSpeed;
        this.p.x = Math.max(PLAYER_RADIUS, Math.min(Sys.width - PLAYER_RADIUS, this.p.x));
        this.p.y = Math.max(PLAYER_RADIUS, Math.min(Sys.height - PLAYER_RADIUS, this.p.y));

        // Movimento nemici: inseguono il giocatore ma si respingono tra loro (niente sovrapposizione)
        const SEPARATION_RADIUS = 55;
        const SEPARATION_FORCE = 2.2 * mult;
        this.enemies.forEach((e, i) => {
            const dxPlayer = this.p.x - e.x, dyPlayer = this.p.y - e.y;
            const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dyPlayer * dyPlayer) || 1;
            let vx = (dxPlayer / distPlayer) * enemySpeed;
            let vy = (dyPlayer / distPlayer) * enemySpeed;
            this.enemies.forEach((other, j) => {
                if (i === j) return;
                const dx = e.x - other.x, dy = e.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < SEPARATION_RADIUS && dist > 0) {
                    const strength = (1 - dist / SEPARATION_RADIUS) * SEPARATION_FORCE;
                    vx += (dx / dist) * strength;
                    vy += (dy / dist) * strength;
                }
            });
            const len = Math.sqrt(vx * vx + vy * vy) || 1;
            const cap = enemySpeed * 1.8;
            if (len > cap) {
                vx = (vx / len) * cap;
                vy = (vy / len) * cap;
            }
            e.x += vx;
            e.y += vy;
        });

        this.bullets.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
        });
        this.bullets = this.bullets.filter(b =>
            b.x >= -20 && b.x <= Sys.width + 20 && b.y >= -20 && b.y <= Sys.height + 20
        );

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const d = Math.sqrt((b.x - e.x) ** 2 + (b.y - e.y) ** 2);
                if (d < ENEMY_RADIUS + BULLET_RADIUS) {
                    this.bullets.splice(i, 1);
                    this.enemies.splice(j, 1);
                    Sys.score += 100;
                    screenShake(8);
                    spawnEnemy(); // il cattivo rientra subito = più difficile
                    break;
                }
            }
        }

        for (const e of this.enemies) {
            const d = Math.sqrt((this.p.x - e.x) ** 2 + (this.p.y - e.y) ** 2);
            if (d < PLAYER_RADIUS + ENEMY_RADIUS) {
                this.lost = true;
                break;
            }
        }

        if ((Date.now() - lastDuplicateTime) >= DUPLICATE_INTERVAL_MS) {
            lastDuplicateTime = Date.now();
            spawnEnemy();
            playRandomMusic();
        }

        this.rotation += 0.05;
    }

    draw(ctx) {
        const time = Date.now() * 0.003;

        // Proiettili = pallino classico
        this.bullets.forEach(b => {
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });

        // Giocatore = omino con testa = foto del giocatore
        const headR = 14;
        ctx.save();
        ctx.translate(this.p.x, this.p.y);
        ctx.rotate(this.rotation * 0.1);
        // Corpo omino: torso, gambe e braccia
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, headR);
        ctx.lineTo(0, headR + 18);
        ctx.moveTo(0, headR + 10);
        ctx.lineTo(-10, headR + 6);
        ctx.moveTo(0, headR + 10);
        ctx.lineTo(10, headR + 6);
        ctx.moveTo(0, headR + 18);
        ctx.lineTo(-8, headR + 28);
        ctx.moveTo(0, headR + 18);
        ctx.lineTo(8, headR + 28);
        ctx.stroke();
        // Testa = cerchio con faccia del giocatore
        ctx.beginPath();
        ctx.arc(0, 0, headR, 0, Math.PI * 2);
        if (characterImages[selectedCharacter]) {
            ctx.save();
            ctx.clip();
            ctx.drawImage(characterImages[selectedCharacter], -headR, -headR, headR * 2, headR * 2);
            ctx.restore();
            ctx.beginPath();
            ctx.arc(0, 0, headR, 0, Math.PI * 2);
        } else {
            ctx.fillStyle = '#0f0';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, headR, 0, Math.PI * 2);
        }
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Disegna insetti attorno a ogni cattivo (circondati dagli insetti)
        function drawInsect(ctx, ix, iy, angle, size) {
            ctx.save();
            ctx.translate(ix, iy);
            ctx.rotate(angle);
            ctx.fillStyle = '#2a0a0a';
            ctx.strokeStyle = '#4a2020';
            ctx.lineWidth = 1;
            const b = size * 0.6;
            ctx.beginPath();
            ctx.ellipse(0, 0, size, b, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-size, 0);
            ctx.lineTo(-size - 3, -2);
            ctx.moveTo(-size, 0);
            ctx.lineTo(-size - 2, 2);
            ctx.moveTo(size, 0);
            ctx.lineTo(size + 3, -2);
            ctx.moveTo(size, 0);
            ctx.lineTo(size + 2, 2);
            ctx.moveTo(0, -b);
            ctx.lineTo(-2, -b - 3);
            ctx.moveTo(0, -b);
            ctx.lineTo(2, -b - 2);
            ctx.moveTo(0, b);
            ctx.lineTo(-2, b + 3);
            ctx.moveTo(0, b);
            ctx.lineTo(2, b + 2);
            ctx.stroke();
            ctx.restore();
        }
        const insectRadius = ENEMY_RADIUS + 18;
        const numInsects = 6;
        this.enemies.forEach((e, ei) => {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(-time * 0.2 + ei * 0.5);
            for (let i = 0; i < numInsects; i++) {
                const a = (i / numInsects) * Math.PI * 2 + time * 0.8;
                const ix = Math.cos(a) * insectRadius;
                const iy = Math.sin(a) * insectRadius;
                drawInsect(ctx, ix, iy, a + time, 4);
            }
            ctx.restore();
            // Zampette da bug attorno a ogni cattivo (partono dal bordo e si piegano)
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(-time * 0.15);
            const numLegs = 8;
            const legOut = ENEMY_RADIUS + 2;
            const legLen = 14;
            ctx.strokeStyle = '#8b0000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            for (let i = 0; i < numLegs; i++) {
                const a = (i / numLegs) * Math.PI * 2;
                const startX = Math.cos(a) * legOut;
                const startY = Math.sin(a) * legOut;
                const bend = 0.4;
                const endX = startX + Math.cos(a + bend) * legLen + Math.sin(i + time) * 2;
                const endY = startY + Math.sin(a + bend) * legLen;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo((startX + endX) / 2 + Math.sin(a) * 3, (startY + endY) / 2 - Math.cos(a) * 3);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
            ctx.restore();
            if (characterImages[e.char]) {
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(-time * 0.2);
                ctx.beginPath();
                ctx.arc(0, 0, ENEMY_RADIUS - 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(characterImages[e.char], -(ENEMY_RADIUS - 2), -(ENEMY_RADIUS - 2), (ENEMY_RADIUS - 2) * 2, (ENEMY_RADIUS - 2) * 2);
                ctx.restore();
                ctx.strokeStyle = '#f00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(e.x, e.y, ENEMY_RADIUS + 2, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = '#f00';
                ctx.beginPath();
                ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        const elapsed = ((Date.now() - gameStartTime) / 1000).toFixed(1);
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.fillText('Punti: ' + Sys.score + '  Tempo: ' + elapsed + 's  Cattivi: ' + this.enemies.length, 10, 22);
    }
}

function resize() {
    const w = document.getElementById('game-wrap');
    Sys.width = w.clientWidth;
    Sys.height = w.clientHeight;
    Sys.canvas.width = Sys.width;
    Sys.canvas.height = Sys.height;
    if (game && game.p) {
        game.p.x = Math.max(PLAYER_RADIUS, Math.min(Sys.width - PLAYER_RADIUS, game.p.x));
        game.p.y = Math.max(PLAYER_RADIUS, Math.min(Sys.height - PLAYER_RADIUS, game.p.y));
    }
}
window.addEventListener('resize', resize);

function screenShake(intensity) {
    Sys.shakeX = (Math.random() - 0.5) * intensity;
    Sys.shakeY = (Math.random() - 0.5) * intensity;
    let c = 0;
    const id = setInterval(() => {
        Sys.shakeX = (Math.random() - 0.5) * intensity * (1 - c / 10);
        Sys.shakeY = (Math.random() - 0.5) * intensity * (1 - c / 10);
        c++;
        if (c > 10) { Sys.shakeX = Sys.shakeY = 0; clearInterval(id); }
    }, 50);
}

function getCanvasCoords(e) {
    const rect = Sys.canvas.getBoundingClientRect();
    const scaleX = Sys.canvas.width / rect.width;
    const scaleY = Sys.canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function shoot(targetX, targetY) {
    if (Sys.state !== 'play' || !game) return;
    const now = Date.now();
    if (now - lastShootTime < SHOOT_COOLDOWN_MS) return;
    lastShootTime = now;
    const dx = targetX - game.p.x, dy = targetY - game.p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    game.bullets.push({
        x: game.p.x + (dx / len) * (PLAYER_RADIUS + 5),
        y: game.p.y + (dy / len) * (PLAYER_RADIUS + 5),
        vx: (dx / len) * BULLET_SPEED,
        vy: (dy / len) * BULLET_SPEED,
        angle: Math.atan2(dy, dx)
    });
}

Sys.canvas.addEventListener('click', (e) => {
    if (Sys.state === 'over') { returnToSelection(); return; }
    if (Sys.state === 'play') {
        const { x, y } = getCanvasCoords(e);
        shoot(x, y);
    }
});

Sys.canvas.addEventListener('touchstart', (e) => {
    if (Sys.state === 'over') { e.preventDefault(); returnToSelection(); return; }
    if (Sys.state === 'play') {
        e.preventDefault();
        const { x, y } = getCanvasCoords(e);
        shoot(x, y);
    }
}, { passive: false });

function initBackgroundParticles() {
    Sys.bgParticles = [];
    for (let i = 0; i < 25; i++) {
        Sys.bgParticles.push({
            x: Math.random() * Sys.width, y: Math.random() * Sys.height,
            vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
            size: Math.random() * 2 + 1, opacity: Math.random() * 0.5 + 0.3, hue: Math.random() * 60 + 20
        });
    }
    Sys.bgSparks = [];
    for (let i = 0; i < 6; i++) {
        Sys.bgSparks.push({
            x: Math.random() * Sys.width, y: Math.random() * Sys.height,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: Math.random(), size: 2
        });
    }
}

function updateBackgroundParticles() {
    Sys.bgParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > Sys.width) p.vx *= -1;
        if (p.y < 0 || p.y > Sys.height) p.vy *= -1;
        p.x = Math.max(0, Math.min(Sys.width, p.x));
        p.y = Math.max(0, Math.min(Sys.height, p.y));
    });
    Sys.bgSparks.forEach(s => {
        s.x += s.vx; s.y += s.vy; s.life -= 0.015; s.vx *= 0.98; s.vy *= 0.98;
        if (s.life <= 0) {
            s.x = Math.random() * Sys.width; s.y = Math.random() * Sys.height;
            s.vx = (Math.random() - 0.5) * 6; s.vy = (Math.random() - 0.5) * 6; s.life = 1;
        }
    });
}

function drawBackgroundParticles(ctx) {
    const time = Date.now() * 0.001;
    const gradient = ctx.createRadialGradient(
        Sys.width / 2, Sys.height / 2, 0, Sys.width / 2, Sys.height / 2, Math.max(Sys.width, Sys.height)
    );
    gradient.addColorStop(0, 'rgba(80, 20, 0, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, Sys.width, Sys.height);
    Sys.bgParticles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity + Math.sin(time * 2 + p.x * 0.01) * 0.2;
        ctx.fillStyle = `hsl(${p.hue + time * 20}, 100%, 50%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
    Sys.bgSparks.forEach(s => {
        if (s.life > 0) {
            ctx.save();
            ctx.globalAlpha = s.life * 0.8;
            ctx.fillStyle = '#f80';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

function loop() {
    if (Sys.state !== 'play') return;
    Sys.ctx.save();
    Sys.ctx.translate(Sys.shakeX, Sys.shakeY);
    Sys.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
    updateBackgroundParticles();
    drawBackgroundParticles(Sys.ctx);

    if (game) {
        game.update();
        game.draw(Sys.ctx);

        if (game.lost) {
            Sys.state = 'over';
            Sys.audio.pause();
            if (musicIntervalId) clearInterval(musicIntervalId);
            if (selectedCharacter) ScoreStorage.saveScore(selectedCharacter, Sys.score);
            Sys.ctx.fillStyle = 'rgba(0,0,0,0.85)';
            Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
            Sys.ctx.fillStyle = '#fff';
            Sys.ctx.font = '26px monospace';
            Sys.ctx.textAlign = 'center';
            Sys.ctx.fillText('GAME OVER', Sys.width / 2, Sys.height / 2 - 20);
            Sys.ctx.fillText('Punti: ' + Sys.score, Sys.width / 2, Sys.height / 2 + 15);
            Sys.ctx.font = '16px monospace';
            Sys.ctx.fillText('Tocca per tornare', Sys.width / 2, Sys.height / 2 + 55);
            Sys.ctx.restore();
            return;
        }
    }
    Sys.ctx.restore();
    Sys.loopId = requestAnimationFrame(loop);
}

function startGame() {
    document.getElementById('char-select').classList.add('hidden');
    Sys.state = 'play';
    Sys.score = 0;
    gameStartTime = Date.now();
    lastDuplicateTime = gameStartTime;
    resize();
    initBackgroundParticles();
    game = new GameShooter();
    playRandomMusic();
    if (musicIntervalId) clearInterval(musicIntervalId);
    musicIntervalId = setInterval(playRandomMusic, DUPLICATE_INTERVAL_MS);
    loop();
}

function returnToSelection() {
    Sys.state = 'select';
    Sys.score = 0;
    game = null;
    if (musicIntervalId) { clearInterval(musicIntervalId); musicIntervalId = null; }
    document.getElementById('char-select').classList.remove('hidden');
    ScoreStorage.updateLeaderboard();
}

function loadCharacters() {
    const names = ['ricka.jpeg', 'franco.jpeg', 'frizze.jpeg', 'lastrue.jpeg', 'lotti.jpeg', 'mache.jpeg', 'paolo.jpeg'];
    const grid = document.getElementById('char-grid');
    if (!grid) return;

    const savedCustomImage = localStorage.getItem('cacciatron_custom_user_image');
    if (savedCustomImage) {
        customUserImage = savedCustomImage;
        const customName = CUSTOM_USER_ID + '.jpeg';
        characters.push(customName);
        const img = new Image();
        img.src = savedCustomImage;
        characterImages[customName] = img;
        const item = document.createElement('div');
        item.className = 'char-item';
        const itemImg = document.createElement('img');
        itemImg.src = savedCustomImage;
        item.appendChild(itemImg);
        const selectAndStart = () => {
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = customName;
            if (!ConsentStorage.hasConsent(customName)) ConsentStorage.showConsentModal(customName);
            else setTimeout(startGame, 200);
        };
        item.addEventListener('click', selectAndStart);
        item.addEventListener('touchstart', (e) => { e.preventDefault(); selectAndStart(); }, { passive: false });
        grid.appendChild(item);
    }

    names.forEach(name => {
        characters.push(name);
        const img = new Image();
        img.src = 'officinari/' + name;
        characterImages[name] = img;
        const item = document.createElement('div');
        item.className = 'char-item';
        const itemImg = document.createElement('img');
        itemImg.src = 'officinari/' + name;
        item.appendChild(itemImg);
        const selectAndStart = () => {
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = name;
            if (!ConsentStorage.hasConsent(name)) ConsentStorage.showConsentModal(name);
            else setTimeout(startGame, 200);
        };
        item.addEventListener('click', selectAndStart);
        item.addEventListener('touchstart', (e) => { e.preventDefault(); selectAndStart(); }, { passive: false });
        grid.appendChild(item);
    });

    const addUserItem = document.createElement('div');
    addUserItem.className = 'char-item add-user';
    addUserItem.innerHTML = '<div class="add-user-icon">➕</div><div>Skuccati<br>anche tu</div>';
    addUserItem.addEventListener('click', showPhotoModal);
    addUserItem.addEventListener('touchstart', (e) => { e.preventDefault(); showPhotoModal(); }, { passive: false });
    grid.appendChild(addUserItem);
    ScoreStorage.updateLeaderboard();
}

const setInp = (k, v) => {
    if (k.includes('Up') || k === 'w') Input.y = -v;
    if (k.includes('Down') || k === 's') Input.y = v;
    if (k.includes('Left') || k === 'a') Input.x = -v;
    if (k.includes('Right') || k === 'd') Input.x = v;
};
window.addEventListener('keydown', e => setInp(e.key, 1));
window.addEventListener('keyup', e => setInp(e.key, 0));

const touch = (id, dx, dy) => {
    const el = document.getElementById(id);
    if (!el) return;
    const s = (e) => { e.preventDefault(); Input.x = dx; Input.y = dy; };
    const e = (e) => { e.preventDefault(); Input.x = 0; Input.y = 0; };
    el.addEventListener('touchstart', s, { passive: false });
    el.addEventListener('touchend', e);
    el.addEventListener('mousedown', s);
    el.addEventListener('mouseup', e);
};
touch('b-up', 0, -1);
touch('b-down', 0, 1);
touch('b-left', -1, 0);
touch('b-right', 1, 0);

document.getElementById('consent-accept').addEventListener('click', () => {
    if (selectedCharacter) {
        ConsentStorage.saveConsent(selectedCharacter);
        ConsentStorage.hideConsentModal();
        setTimeout(startGame, 200);
    }
});
document.getElementById('consent-cancel').addEventListener('click', () => {
    ConsentStorage.hideConsentModal();
    document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
    selectedCharacter = null;
});

function showPhotoModal() {
    const modal = document.getElementById('photo-modal');
    modal.classList.remove('hidden');
    document.getElementById('photo-preview').classList.remove('show');
    document.getElementById('photo-video').classList.remove('show');
    document.getElementById('use-photo-btn').style.display = 'none';
}
function hidePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const video = document.getElementById('photo-video');
    if (video) video.srcObject = null;
    document.getElementById('photo-preview').classList.remove('show');
    document.getElementById('photo-video').classList.remove('show');
    document.getElementById('use-photo-btn').style.display = 'none';
    document.getElementById('file-input').value = '';
}
document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = document.getElementById('photo-preview');
            preview.src = ev.target.result;
            preview.classList.add('show');
            document.getElementById('photo-video').classList.remove('show');
            document.getElementById('use-photo-btn').style.display = 'block';
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        };
        reader.readAsDataURL(file);
    }
});
document.getElementById('camera-btn').addEventListener('click', async () => {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } });
        const video = document.getElementById('photo-video');
        video.srcObject = stream;
        video.classList.add('show');
        document.getElementById('photo-preview').classList.remove('show');
        document.getElementById('use-photo-btn').style.display = 'block';
    } catch (err) {
        alert('Impossibile accedere alla fotocamera.');
    }
});
document.getElementById('use-photo-btn').addEventListener('click', () => {
    const preview = document.getElementById('photo-preview');
    const video = document.getElementById('photo-video');
    let imageData = null;
    if (preview.classList.contains('show') && preview.src) imageData = preview.src;
    else if (video.classList.contains('show') && video.srcObject) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        imageData = canvas.toDataURL('image/jpeg', 0.9);
    }
    if (imageData) {
        localStorage.setItem('cacciatron_custom_user_image', imageData);
        customUserImage = imageData;
        const customName = CUSTOM_USER_ID + '.jpeg';
        if (!characters.includes(customName)) {
            characters.push(customName);
            const img = new Image();
            img.src = imageData;
            characterImages[customName] = img;
            const grid = document.getElementById('char-grid');
            const item = document.createElement('div');
            item.className = 'char-item';
            item.setAttribute('data-custom-user', 'true');
            const itemImg = document.createElement('img');
            itemImg.src = imageData;
            item.appendChild(itemImg);
            const selectAndStart = () => {
                document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedCharacter = customName;
                if (!ConsentStorage.hasConsent(customName)) ConsentStorage.showConsentModal(customName);
                else setTimeout(startGame, 200);
            };
            item.addEventListener('click', selectAndStart);
            item.addEventListener('touchstart', (e) => { e.preventDefault(); selectAndStart(); }, { passive: false });
            const addBtn = grid.querySelector('.add-user');
            if (addBtn) grid.insertBefore(item, addBtn);
            else grid.appendChild(item);
        } else {
            const grid = document.getElementById('char-grid');
            const existing = grid.querySelector('[data-custom-user="true"]');
            if (existing) { const im = existing.querySelector('img'); if (im) im.src = imageData; }
            const img = new Image();
            img.src = imageData;
            characterImages[customName] = img;
        }
        hidePhotoModal();
        ScoreStorage.updateLeaderboard();
    }
});
document.getElementById('photo-cancel').addEventListener('click', hidePhotoModal);

function initCharSelectBackground() {
    const canvas = document.getElementById('char-select-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let t = 0;
    function animate() {
        if (document.getElementById('char-select').classList.contains('hidden')) { requestAnimationFrame(animate); return; }
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        t += 0.01;
        const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width);
        g.addColorStop(0, 'rgba(255,80,0,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(animate);
    }
    animate();
}

resize();
loadCharacters();
initCharSelectBackground();
ScoreStorage.updateLeaderboard();
