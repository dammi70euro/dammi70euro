const SONGS = [
    "zio o .mp3",
    "A cena da Gaia.mp3",
    "alle vene.mp3",
    "Auguri Enke ,.mp3",
    "Bassi Buoni.mp3",
    "briaco.mp3",
    "cachorro.mp3",
    "di-troit (1).mp3",
    "di-troit.mp3",
    "facciamo un ragionamento sensato.mp3",
    "Fast_Drums_Trap_Beat_04_165_BPM_NA.wav",
    "frocio.mp3",
    "Giochi sull'acqua.mp3",
    "mette carne.mp3",
    "no a letto.mp3",
    "no.mp3",
    "non mi sento tanto bene.mp3",
    "Paolo paolo paolo.mp3",
    "pippa qui pippa la.mp3",
    "pippaAncheTu.mpeg",
    "quando siamo fro ci stà.mp3",
    "Scusa ma ero in capié,.mp3",
    "secondo te è meglio andare a prostitute.mp3",
    "skukk no.wav",
    "ti garba fumà, eh!.mp3",
    "una pizza non mi sazia.mp3",
    "Vado_.mp3"
];

const MAX_LEVEL = SONGS.length;

const Sys = {
    width: 0,
    height: 0,
    score: 0,
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    loopId: null,
    state: 'select',
    level: 1,
    audio: new Audio(),
    shakeX: 0,
    shakeY: 0,
    particles: [],
    bgParticles: [],
    bgSparks: []
};

const Input = { x: 0, y: 0 };
let gyroEnabled = false;
let gyroCalibration = { beta: 0, gamma: 0 };

const characters = [];
let selectedCharacter = null;
let characterImages = {};
const CUSTOM_USER_ID = 'user_custom';
let customUserImage = null;
let stream = null;

// Sistema di salvataggio consensi liberatoria
const ConsentStorage = {
    hasConsent: function(character) {
        const consents = JSON.parse(localStorage.getItem('hunter_consents') || '{}');
        const charName = character.replace('.jpeg', '');
        return consents[charName] === true;
    },
    saveConsent: function(character) {
        const consents = JSON.parse(localStorage.getItem('hunter_consents') || '{}');
        const charName = character.replace('.jpeg', '');
        consents[charName] = true;
        localStorage.setItem('hunter_consents', JSON.stringify(consents));
    },
    showConsentModal: function(character) {
        const modal = document.getElementById('consent-modal');
        const charName = character.replace('.jpeg', '');
        let displayName;
        if(charName === CUSTOM_USER_ID) {
            displayName = 'Tu';
        } else {
            displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
        }
        document.getElementById('consent-char-name').textContent = displayName;
        modal.classList.remove('hidden');
        
        // Imposta il volume del video al massimo e fai partire la riproduzione
        const video = document.getElementById('consent-video-player');
        if(video) {
            video.volume = 1.0;
            video.muted = false;
            video.play().catch(err => {
                // Se l'autoplay fallisce (policy del browser), l'utente dovrà cliccare play
                console.log('Autoplay non permesso dal browser');
            });
        }
    },
    hideConsentModal: function() {
        const modal = document.getElementById('consent-modal');
        modal.classList.add('hidden');
        
        // Ferma il video quando si chiude la modal
        const video = document.getElementById('consent-video-player');
        if(video) {
            video.pause();
            video.currentTime = 0; // Reset al'inizio
        }
    }
};

// Sistema di salvataggio punteggi
const ScoreStorage = {
    saveScore: function(character, score) {
        const scores = JSON.parse(localStorage.getItem('hunter_scores') || '{}');
        const charName = character.replace('.jpeg', '');
        if(!scores[charName] || score > scores[charName]) {
            scores[charName] = score;
            localStorage.setItem('hunter_scores', JSON.stringify(scores));
        }
        this.updateLeaderboard();
    },
    getScores: function() {
        return JSON.parse(localStorage.getItem('hunter_scores') || '{}');
    },
    updateLeaderboard: function() {
        const scores = this.getScores();
        const leaderboardEl = document.getElementById('leaderboard-list');
        if(!leaderboardEl) return;
        
        const names = ['ricka', 'franco', 'frizze', 'lastrue', 'lotti', 'mache', 'paolo'];
        // Aggiungi utente personalizzato se esiste
        if(customUserImage) {
            names.push(CUSTOM_USER_ID);
        }
        const entries = names
            .filter(name => scores[name] !== undefined)
            .map(name => ({ name, score: scores[name] }))
            .sort((a, b) => b.score - a.score);
        
        if(entries.length === 0) {
            leaderboardEl.innerHTML = '<div class="leaderboard-empty">Nessun punteggio ancora</div>';
            return;
        }
        
        leaderboardEl.innerHTML = entries.map((entry, index) => {
            let displayName;
            if(entry.name === CUSTOM_USER_ID) {
                displayName = 'Tu';
            } else {
                displayName = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
            }
            return `<div class="leaderboard-item">
                <span class="leaderboard-rank">#${index + 1}</span>
                <span class="leaderboard-name">${displayName}</span>
                <span class="leaderboard-score">${entry.score}</span>
            </div>`;
        }).join('');
    }
};

class GameBase {
    constructor(lvl) {
        this.lvl = lvl;
        this.won = false; this.lost = false;
        this.target = 0; this.progress = 0;
        this.diff = 1 + (lvl * 0.1);
    }
    update() {}
    draw(ctx) {}
    drawInfo(ctx, txt) {
        ctx.fillStyle = '#fff'; ctx.font = "14px monospace";
        ctx.fillText(txt, 10, 20);
    }
}

class GameHunter extends GameBase {
    constructor(lvl) {
        super(lvl);
        this.p = {x:50, y:50};
        this.e = {x:Sys.width-50, y:Sys.height-50, s: 1 + (lvl*0.05)};
        this.coins = [];
        this.target = 5 + Math.floor(lvl/2);
        const availableEnemies = characters.filter(c => c !== selectedCharacter);
        this.enemyChar = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];
        this.name = this.enemyChar.replace('.jpeg', '') + 'tron';
        this.rotation = 0;
        this.scale = 1;
        this.captureEffect = 0;
        for(let i=0; i<this.target+2; i++) this.spawnCoin();
    }
    spawnCoin() { this.coins.push({x:Math.random()*(Sys.width-40)+20, y:Math.random()*(Sys.height-40)+20, a:true}); }
    update() {
        // Usa giroscopio se attivo, altrimenti usa controlli normali
        const inputX = gyroActive ? gyroInput.x : Input.x;
        const inputY = gyroActive ? gyroInput.y : Input.y;
        this.p.x += inputX*4; this.p.y += inputY*4;
        this.p.x = Math.max(10, Math.min(Sys.width-10, this.p.x));
        this.p.y = Math.max(10, Math.min(Sys.height-10, this.p.y));

        let dx = this.p.x-this.e.x, dy = this.p.y-this.e.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 20) {
            if(this.captureEffect === 0) {
                this.captureEffect = 1;
                createCaptureParticles(this.p.x, this.p.y);
                screenShake(15);
            }
            this.lost=true;
        }
        this.e.x += (dx/dist)*this.e.s; this.e.y += (dy/dist)*this.e.s;

        this.coins.forEach(c => {
            if(!c.a) return;
            let cdx = this.p.x-c.x, cdy = this.p.y-c.y;
            if(Math.sqrt(cdx*cdx+cdy*cdy) < 20) {
                c.a=false; this.progress++; Sys.score+=20;
                if(this.progress>=this.target) this.won=true;
            }
        });

        if(this.captureEffect > 0) {
            this.captureEffect -= 0.05;
            if(this.captureEffect < 0) this.captureEffect = 0;
        }

        this.rotation += 0.02;
        const time = Date.now() * 0.003;
        this.scale = 1 + Math.sin(time) * 0.05;
    }
    draw(ctx) {
        const time = Date.now() * 0.003;
        const pulse = Math.sin(time * 2) * 3;
        
        ctx.fillStyle='gold';
        this.coins.forEach(c => {
            if(!c.a) return;
            const coinPulse = 8 + Math.sin(time * 3 + c.x * 0.1) * 2;
            ctx.beginPath();
            ctx.arc(c.x, c.y, coinPulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'gold';
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        if(this.captureEffect > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${this.captureEffect * 0.3})`;
            ctx.fillRect(0, 0, Sys.width, Sys.height);
        }

        if(characterImages[selectedCharacter]) {
            ctx.save();
            ctx.translate(this.p.x, this.p.y);
            ctx.rotate(this.rotation * 0.1);
            ctx.scale(this.scale, this.scale);
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(characterImages[selectedCharacter], -20, -20, 40, 40);
            ctx.restore();
            
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(time * 2) * 0.2;
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2 + Math.sin(time * 3) * 1;
            ctx.beginPath();
            ctx.arc(this.p.x, this.p.y, 22 + pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillStyle='#0f0'; ctx.beginPath(); ctx.arc(this.p.x, this.p.y, 10, 0, 7); ctx.fill();
        }

        if(characterImages[this.enemyChar]) {
            ctx.save();
            ctx.translate(this.e.x, this.e.y);
            ctx.rotate(-this.rotation * 0.15);
            ctx.scale(1 + Math.sin(time * 2.5) * 0.1, 1 + Math.sin(time * 2.5) * 0.1);
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(characterImages[this.enemyChar], -20, -20, 40, 40);
            ctx.restore();
            
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin(time * 2.5) * 0.3;
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 2 + Math.sin(time * 3.5) * 2;
            ctx.beginPath();
            ctx.arc(this.e.x, this.e.y, 22 + pulse * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(this.e.x, this.e.y, 10, 0, 7); ctx.fill();
        }

        drawParticles(ctx);
        this.drawInfo(ctx, `Monete: ${this.progress}/${this.target}`);
    }
}

let game = null;

function resize() {
    const w = document.getElementById('game-wrap');
    Sys.width = w.clientWidth; Sys.height = w.clientHeight;
    Sys.canvas.width = Sys.width; Sys.canvas.height = Sys.height;
    if(Sys.bgParticles.length > 0) {
        Sys.bgParticles.forEach(p => {
            p.x = Math.min(p.x, Sys.width);
            p.y = Math.min(p.y, Sys.height);
        });
    }
    if(Sys.bgSparks.length > 0) {
        Sys.bgSparks.forEach(s => {
            s.x = Math.min(s.x, Sys.width);
            s.y = Math.min(s.y, Sys.height);
        });
    }
    if(game && game.p) {
        game.p.x = Math.max(10, Math.min(Sys.width-10, game.p.x));
        game.p.y = Math.max(10, Math.min(Sys.height-10, game.p.y));
        if(game.e) {
            game.e.x = Math.max(10, Math.min(Sys.width-10, game.e.x));
            game.e.y = Math.max(10, Math.min(Sys.height-10, game.e.y));
        }
    }
}
window.addEventListener('resize', resize);

function createCaptureParticles(x, y) {
    for(let i = 0; i < 20; i++) {
        Sys.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1,
            size: Math.random() * 5 + 3,
            color: `hsl(${Math.random() * 60}, 100%, 50%)`
        });
    }
}

function drawParticles(ctx) {
    for(let i = Sys.particles.length - 1; i >= 0; i--) {
        const p = Sys.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        p.vx *= 0.95;
        p.vy *= 0.95;
        
        if(p.life > 0) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            Sys.particles.splice(i, 1);
        }
    }
}

function screenShake(intensity) {
    Sys.shakeX = (Math.random() - 0.5) * intensity;
    Sys.shakeY = (Math.random() - 0.5) * intensity;
    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
        Sys.shakeX = (Math.random() - 0.5) * intensity * (1 - shakeCount / 10);
        Sys.shakeY = (Math.random() - 0.5) * intensity * (1 - shakeCount / 10);
        shakeCount++;
        if(shakeCount > 10) {
            Sys.shakeX = 0;
            Sys.shakeY = 0;
            clearInterval(shakeInterval);
        }
    }, 50);
}

function playMusic(level) {
    if(level > MAX_LEVEL) return;
    const songIndex = level - 1;
    const songFile = SONGS[songIndex];
    Sys.audio.pause();
    Sys.audio.src = 'canzoni/' + songFile;
    Sys.audio.loop = true;
    Sys.audio.volume = 0.5;
    Sys.audio.play().catch(() => {});
}

function loop() {
    if(Sys.state !== 'play') return;
    
    Sys.ctx.save();
    Sys.ctx.translate(Sys.shakeX, Sys.shakeY);
    
    // Traccia semi-trasparente per effetto scia
    Sys.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
    
    updateBackgroundParticles();
    drawBackgroundParticles(Sys.ctx);

    if(game) {
        game.update();
        game.draw(Sys.ctx);

        if(game.won) {
            Sys.level++;
            if(Sys.level > MAX_LEVEL) {
                Sys.state = 'over';
                Sys.audio.pause();
                if(selectedCharacter) {
                    ScoreStorage.saveScore(selectedCharacter, Sys.score);
                }
                Sys.ctx.fillStyle = 'rgba(0,0,0,0.8)';
                Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
                Sys.ctx.fillStyle = '#0f0';
                Sys.ctx.font = "24px monospace";
                Sys.ctx.textAlign = 'center';
                Sys.ctx.fillText('VITTORIA!', Sys.width/2, Sys.height/2);
                Sys.ctx.fillText('Punti: ' + Sys.score, Sys.width/2, Sys.height/2 + 30);
                Sys.ctx.font = "16px monospace";
                Sys.ctx.fillText('Clicca per tornare', Sys.width/2, Sys.height/2 + 60);
                return;
            }
            playMusic(Sys.level);
            game = new GameHunter(Sys.level);
        }
        if(game.lost) {
            Sys.state = 'over';
            Sys.audio.pause();
            if(selectedCharacter) {
                ScoreStorage.saveScore(selectedCharacter, Sys.score);
            }
            Sys.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
            Sys.ctx.fillStyle = '#fff';
            Sys.ctx.font = "24px monospace";
            Sys.ctx.textAlign = 'center';
            Sys.ctx.fillText('GAME OVER', Sys.width/2, Sys.height/2);
            Sys.ctx.fillText('Punti: ' + Sys.score, Sys.width/2, Sys.height/2 + 30);
            Sys.ctx.font = "16px monospace";
            Sys.ctx.fillText('Clicca per tornare', Sys.width/2, Sys.height/2 + 60);
            return;
        }
    }
    
    Sys.ctx.restore();
    Sys.loopId = requestAnimationFrame(loop);
}

function initBackgroundParticles() {
    Sys.bgParticles = [];
    for(let i = 0; i < 30; i++) {
        Sys.bgParticles.push({
            x: Math.random() * Sys.width,
            y: Math.random() * Sys.height,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.5 + 0.3,
            hue: Math.random() * 120
        });
    }
    
    Sys.bgSparks = [];
    for(let i = 0; i < 8; i++) {
        Sys.bgSparks.push({
            x: Math.random() * Sys.width,
            y: Math.random() * Sys.height,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: Math.random(),
            size: Math.random() * 3 + 1.5
        });
    }
}

function updateBackgroundParticles() {
    Sys.bgParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if(p.x < 0 || p.x > Sys.width) p.vx *= -1;
        if(p.y < 0 || p.y > Sys.height) p.vy *= -1;
        p.x = Math.max(0, Math.min(Sys.width, p.x));
        p.y = Math.max(0, Math.min(Sys.height, p.y));
    });
    
    Sys.bgSparks.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.015;
        s.vx *= 0.98;
        s.vy *= 0.98;
        
        if(s.life <= 0) {
            s.x = Math.random() * Sys.width;
            s.y = Math.random() * Sys.height;
            s.vx = (Math.random() - 0.5) * 6;
            s.vy = (Math.random() - 0.5) * 6;
            s.life = 1;
        }
    });
}

function drawBackgroundParticles(ctx) {
    const time = Date.now() * 0.001;
    
    // Un solo gradiente leggero
    const angle = time * 0.5;
    const gradient = ctx.createRadialGradient(
        Sys.width/2 + Math.cos(angle) * 150,
        Sys.height/2 + Math.sin(angle) * 150,
        0,
        Sys.width/2,
        Sys.height/2,
        Math.max(Sys.width, Sys.height)
    );
    const r = Math.sin(time) * 30 + 30;
    const b = Math.cos(time) * 30 + 30;
    gradient.addColorStop(0, `rgba(${r}, 0, ${b}, 0.2)`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, Sys.width, Sys.height);
    
    // Particelle colorate (senza shadow per performance)
    Sys.bgParticles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity + Math.sin(time * 2 + p.x * 0.01) * 0.2;
        ctx.fillStyle = `hsl(${p.hue + time * 30}, 100%, 50%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
    
    // Scintille (senza shadow)
    Sys.bgSparks.forEach(s => {
        if(s.life > 0) {
            ctx.save();
            ctx.globalAlpha = s.life * 0.8;
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
    
    // Linee di connessione (ridotte, solo per particelle vicine)
    for(let i = 0; i < Sys.bgParticles.length; i += 2) {
        for(let j = i + 1; j < Math.min(i + 3, Sys.bgParticles.length); j++) {
            const dx = Sys.bgParticles[i].x - Sys.bgParticles[j].x;
            const dy = Sys.bgParticles[i].y - Sys.bgParticles[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < 100) {
                ctx.save();
                ctx.globalAlpha = (1 - dist/100) * 0.2;
                ctx.strokeStyle = `hsl(${Sys.bgParticles[i].hue}, 100%, 60%)`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(Sys.bgParticles[i].x, Sys.bgParticles[i].y);
                ctx.lineTo(Sys.bgParticles[j].x, Sys.bgParticles[j].y);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}

function startGame() {
    document.getElementById('char-select').classList.add('hidden');
    Sys.state = 'play';
    Sys.score = 0;
    Sys.level = 1;
    resize();
    initBackgroundParticles();
    playMusic(Sys.level);
    game = new GameHunter(Sys.level);
    
    // Richiedi permesso giroscopio su iOS quando il gioco parte
    if(!gyroEnabled && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        requestGyroPermission();
    }
    
    loop();
}

function returnToSelection() {
    Sys.state = 'select';
    Sys.score = 0;
    Sys.level = 1;
    game = null;
    document.getElementById('char-select').classList.remove('hidden');
    ScoreStorage.updateLeaderboard();
}

function loadCharacters() {
    const names = ['ricka.jpeg', 'franco.jpeg', 'frizze.jpeg', 'lastrue.jpeg', 'lotti.jpeg', 'mache.jpeg', 'paolo.jpeg'];
    const grid = document.getElementById('char-grid');
    let loaded = 0;
    
    // Carica utente personalizzato se esiste
    const savedCustomImage = localStorage.getItem('hunter_custom_user_image');
    if(savedCustomImage) {
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
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = customName;
            
            if(!ConsentStorage.hasConsent(customName)) {
                ConsentStorage.showConsentModal(customName);
            } else {
                setTimeout(startGame, 200);
            }
        });
        
        item.addEventListener('touchstart', (e) => {
            e.preventDefault();
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = customName;
            
            if(!ConsentStorage.hasConsent(customName)) {
                ConsentStorage.showConsentModal(customName);
            } else {
                setTimeout(startGame, 200);
            }
        }, {passive: false});
        
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
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = name;
            
            if(!ConsentStorage.hasConsent(name)) {
                ConsentStorage.showConsentModal(name);
            } else {
                setTimeout(startGame, 200);
            }
        });
        
        item.addEventListener('touchstart', (e) => {
            e.preventDefault();
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = name;
            
            if(!ConsentStorage.hasConsent(name)) {
                ConsentStorage.showConsentModal(name);
            } else {
                setTimeout(startGame, 200);
            }
        }, {passive: false});
        
        grid.appendChild(item);
        img.onload = () => {
            loaded++;
        };
    });
    
    // Aggiungi bottone "Skuccati anche tu"
    const addUserItem = document.createElement('div');
    addUserItem.className = 'char-item add-user';
    addUserItem.innerHTML = '<div class="add-user-icon">➕</div><div>Skuccati<br>anche tu</div>';
    
    addUserItem.addEventListener('click', () => {
        showPhotoModal();
    });
    
    addUserItem.addEventListener('touchstart', (e) => {
        e.preventDefault();
        showPhotoModal();
    }, {passive: false});
    
    grid.appendChild(addUserItem);
    
    ScoreStorage.updateLeaderboard();
}

const setInp = (k, v) => {
    if(k.includes('Up')||k=='w') Input.y=-v;
    if(k.includes('Down')||k=='s') Input.y=v;
    if(k.includes('Left')||k=='a') Input.x=-v;
    if(k.includes('Right')||k=='d') Input.x=v;
};
window.addEventListener('keydown', e => setInp(e.key, 1));
window.addEventListener('keyup', e => setInp(e.key, 0));

const touch = (id, dx, dy) => {
    const el = document.getElementById(id);
    const s = (e) => { e.preventDefault(); Input.x=dx; Input.y=dy; };
    const e = (e) => { e.preventDefault(); Input.x=0; Input.y=0; };
    el.addEventListener('touchstart', s, {passive:false});
    el.addEventListener('touchend', e);
    el.addEventListener('mousedown', s);
    el.addEventListener('mouseup', e);
};
touch('b-up',0,-1); touch('b-down',0,1); touch('b-left',-1,0); touch('b-right',1,0);

// Supporto giroscopio per mobile (modalità alternativa)
let gyroInput = { x: 0, y: 0 };
let gyroActive = false;
let gyroCalibrating = false;
let gyroCalibrationCount = 0;
const gyroCalibrationSamples = 30;

function handleGyroOrientation(e) {
    if(!gyroEnabled || Sys.state !== 'play') {
        gyroActive = false;
        gyroInput.x = 0;
        gyroInput.y = 0;
        return;
    }
    
    if(gyroCalibrating) {
        // Calibra prendendo la media delle prime misurazioni
        gyroCalibrationCount++;
        gyroCalibration.beta += e.beta || 0;
        gyroCalibration.gamma += e.gamma || 0;
        
        if(gyroCalibrationCount >= gyroCalibrationSamples) {
            gyroCalibration.beta /= gyroCalibrationSamples;
            gyroCalibration.gamma /= gyroCalibrationSamples;
            gyroCalibrating = false;
        }
        return;
    }
    
    // Applica calibrazione
    const beta = (e.beta || 0) - gyroCalibration.beta;
    const gamma = (e.gamma || 0) - gyroCalibration.gamma;
    
    // Sensibilità (regolabile)
    const sensitivity = 0.08;
    
    // Converti orientamento in input
    // Gamma: inclinazione sinistra/destra -> movimento orizzontale
    // Beta: inclinazione avanti/indietro -> movimento verticale
    gyroInput.x = Math.max(-1, Math.min(1, gamma * sensitivity));
    gyroInput.y = Math.max(-1, Math.min(1, beta * sensitivity));
    
    // Attiva giroscopio solo se c'è movimento significativo
    gyroActive = Math.abs(gyroInput.x) > 0.01 || Math.abs(gyroInput.y) > 0.01;
}

function initGyroscope() {
    // Rileva se siamo su mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if(!isMobile) return;
    
    // Verifica se l'API è disponibile
    if(typeof DeviceOrientationEvent === 'undefined') return;
    
    // Browser che non richiedono permesso - attiva subito
    if(typeof DeviceOrientationEvent.requestPermission !== 'function') {
        gyroEnabled = true;
        gyroCalibrating = true;
        gyroCalibrationCount = 0;
        gyroCalibration = { beta: 0, gamma: 0 };
        window.addEventListener('deviceorientation', handleGyroOrientation);
    }
}

// Funzione per richiedere permesso giroscopio (necessario su iOS 13+)
function requestGyroPermission() {
    if(typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if(response === 'granted') {
                    gyroEnabled = true;
                    gyroCalibrating = true;
                    gyroCalibrationCount = 0;
                    gyroCalibration = { beta: 0, gamma: 0 };
                    window.addEventListener('deviceorientation', handleGyroOrientation);
                }
            })
            .catch(err => console.log('Giroscopio non disponibile:', err));
    }
}

function initCharSelectBackground() {
    const canvas = document.getElementById('char-select-bg');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    for(let i = 0; i < 100; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 3 + 1,
            opacity: Math.random() * 0.8 + 0.3,
            hue: Math.random() * 120
        });
    }
    
    const sparks = [];
    for(let i = 0; i < 20; i++) {
        sparks.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: Math.random(),
            size: Math.random() * 4 + 2
        });
    }
    
    function animate() {
        if(document.getElementById('char-select').classList.contains('hidden')) {
            requestAnimationFrame(animate);
            return;
        }
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const time = Date.now() * 0.002;
        const pulse = Math.sin(time * 3) * 0.5 + 0.5;
        
        for(let i = 0; i < 3; i++) {
            const angle = time + i * Math.PI * 2 / 3;
            const gradient = ctx.createRadialGradient(
                canvas.width/2 + Math.cos(angle) * 200,
                canvas.height/2 + Math.sin(angle) * 200,
                0,
                canvas.width/2,
                canvas.height/2,
                Math.max(canvas.width, canvas.height) * 1.5
            );
            const r = Math.sin(time * 2 + i) * 100 + 100;
            const b = Math.cos(time * 2 + i) * 100 + 100;
            gradient.addColorStop(0, `rgba(${r}, 0, ${b}, ${0.4 * pulse})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if(p.x < 0 || p.x > canvas.width) p.vx *= -1.1;
            if(p.y < 0 || p.y > canvas.height) p.vy *= -1.1;
            p.vx *= 1.001;
            p.vy *= 1.001;
            
            ctx.save();
            const alpha = p.opacity + Math.sin(time * 5 + p.x * 0.02) * 0.4;
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.fillStyle = `hsl(${p.hue + time * 50}, 100%, 50%)`;
            ctx.shadowBlur = 20;
            ctx.shadowColor = `hsl(${p.hue + time * 50}, 100%, 50%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        
        sparks.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;
            s.life -= 0.02;
            s.vx *= 0.98;
            s.vy *= 0.98;
            
            if(s.life > 0) {
                ctx.save();
                ctx.globalAlpha = s.life;
                ctx.fillStyle = '#0f0';
                ctx.shadowBlur = 30;
                ctx.shadowColor = '#0f0';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                s.x = Math.random() * canvas.width;
                s.y = Math.random() * canvas.height;
                s.vx = (Math.random() - 0.5) * 8;
                s.vy = (Math.random() - 0.5) * 8;
                s.life = 1;
            }
        });
        
        for(let i = 0; i < particles.length; i++) {
            for(let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if(dist < 150) {
                    ctx.save();
                    const alpha = (1 - dist/150) * 0.5 * pulse;
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = `hsl(${particles[i].hue}, 100%, 60%)`;
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `hsl(${particles[i].hue}, 100%, 60%)`;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
        
        const flash = Math.sin(time * 10) * 0.3 + 0.3;
        if(flash > 0.5) {
            ctx.save();
            ctx.globalAlpha = (flash - 0.5) * 0.2;
            ctx.fillStyle = '#0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
        
        requestAnimationFrame(animate);
    }
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        particles.forEach(p => {
            p.x = Math.min(p.x, canvas.width);
            p.y = Math.min(p.y, canvas.height);
        });
    });
    
    animate();
}

// Click listener per tornare alla selezione dopo game over
Sys.canvas.addEventListener('click', () => {
    if(Sys.state === 'over') {
        returnToSelection();
    }
});

Sys.canvas.addEventListener('touchstart', (e) => {
    if(Sys.state === 'over') {
        e.preventDefault();
        returnToSelection();
    }
}, {passive: false});

// Gestione pulsanti liberatoria
document.getElementById('consent-accept').addEventListener('click', () => {
    if(selectedCharacter) {
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

// Gestione modal caricamento foto
function showPhotoModal() {
    const modal = document.getElementById('photo-modal');
    modal.classList.remove('hidden');
    document.getElementById('photo-preview').classList.remove('show');
    document.getElementById('photo-video').classList.remove('show');
    document.getElementById('use-photo-btn').style.display = 'none';
}

function hidePhotoModal() {
    const modal = document.getElementById('photo-modal');
    modal.classList.add('hidden');
    stopCamera();
    document.getElementById('photo-preview').classList.remove('show');
    document.getElementById('photo-video').classList.remove('show');
    document.getElementById('use-photo-btn').style.display = 'none';
    document.getElementById('file-input').value = '';
}

function stopCamera() {
    if(stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    const video = document.getElementById('photo-video');
    if(video) {
        video.srcObject = null;
    }
}

// Gestione caricamento file
document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const preview = document.getElementById('photo-preview');
            preview.src = event.target.result;
            preview.classList.add('show');
            document.getElementById('photo-video').classList.remove('show');
            document.getElementById('use-photo-btn').style.display = 'block';
            stopCamera();
        };
        reader.readAsDataURL(file);
    }
});

// Gestione fotocamera
document.getElementById('camera-btn').addEventListener('click', async () => {
    try {
        stopCamera();
        const video = document.getElementById('photo-video');
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 640 }
            } 
        });
        video.srcObject = stream;
        video.classList.add('show');
        document.getElementById('photo-preview').classList.remove('show');
        document.getElementById('use-photo-btn').style.display = 'block';
    } catch(err) {
        alert('Impossibile accedere alla fotocamera. Assicurati di aver concesso i permessi.');
        console.error('Errore accesso fotocamera:', err);
    }
});

// Usa foto selezionata/scattata
document.getElementById('use-photo-btn').addEventListener('click', () => {
    const preview = document.getElementById('photo-preview');
    const video = document.getElementById('photo-video');
    let imageData = null;
    
    if(preview.classList.contains('show') && preview.src) {
        // Foto caricata
        imageData = preview.src;
    } else if(video.classList.contains('show') && stream) {
        // Foto scattata dalla fotocamera
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        imageData = canvas.toDataURL('image/jpeg', 0.9);
    }
    
    if(imageData) {
        // Salva immagine
        localStorage.setItem('hunter_custom_user_image', imageData);
        customUserImage = imageData;
        
        // Aggiungi personaggio
        const customName = CUSTOM_USER_ID + '.jpeg';
        if(!characters.includes(customName)) {
            characters.push(customName);
            const img = new Image();
            img.src = imageData;
            characterImages[customName] = img;
            
            // Aggiungi alla griglia
            const grid = document.getElementById('char-grid');
            const existingCustom = grid.querySelector(`[data-custom-user="true"]`);
            if(existingCustom) {
                existingCustom.remove();
            }
            
            const item = document.createElement('div');
            item.className = 'char-item';
            item.setAttribute('data-custom-user', 'true');
            const itemImg = document.createElement('img');
            itemImg.src = imageData;
            item.appendChild(itemImg);
            
            item.addEventListener('click', () => {
                document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedCharacter = customName;
                
                if(!ConsentStorage.hasConsent(customName)) {
                    ConsentStorage.showConsentModal(customName);
                } else {
                    setTimeout(startGame, 200);
                }
            });
            
            item.addEventListener('touchstart', (e) => {
                e.preventDefault();
                document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedCharacter = customName;
                
                if(!ConsentStorage.hasConsent(customName)) {
                    ConsentStorage.showConsentModal(customName);
                } else {
                    setTimeout(startGame, 200);
                }
            }, {passive: false});
            
            // Inserisci prima del bottone "Skuccati anche tu"
            const addUserBtn = grid.querySelector('.add-user');
            if(addUserBtn) {
                grid.insertBefore(item, addUserBtn);
            } else {
                grid.appendChild(item);
            }
        } else {
            // Aggiorna immagine esistente
            const existingItem = grid.querySelector(`[data-custom-user="true"]`);
            if(existingItem) {
                const existingImg = existingItem.querySelector('img');
                if(existingImg) {
                    existingImg.src = imageData;
                }
            }
            const img = new Image();
            img.src = imageData;
            characterImages[customName] = img;
        }
        
        hidePhotoModal();
        ScoreStorage.updateLeaderboard();
    }
});

// Annulla caricamento foto
document.getElementById('photo-cancel').addEventListener('click', () => {
    hidePhotoModal();
});

resize();
loadCharacters();
initCharSelectBackground();
ScoreStorage.updateLeaderboard();
initGyroscope();