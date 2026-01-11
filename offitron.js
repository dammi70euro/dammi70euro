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
    audio: new Audio()
};

const Input = { x: 0, y: 0 };

const characters = [];
let selectedCharacter = null;
let characterImages = {};

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
        for(let i=0; i<this.target+2; i++) this.spawnCoin();
    }
    spawnCoin() { this.coins.push({x:Math.random()*(Sys.width-40)+20, y:Math.random()*(Sys.height-40)+20, a:true}); }
    update() {
        this.p.x += Input.x*4; this.p.y += Input.y*4;
        this.p.x = Math.max(10, Math.min(Sys.width-10, this.p.x));
        this.p.y = Math.max(10, Math.min(Sys.height-10, this.p.y));

        let dx = this.p.x-this.e.x, dy = this.p.y-this.e.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < 20) this.lost=true;
        this.e.x += (dx/dist)*this.e.s; this.e.y += (dy/dist)*this.e.s;

        this.coins.forEach(c => {
            if(!c.a) return;
            let cdx = this.p.x-c.x, cdy = this.p.y-c.y;
            if(Math.sqrt(cdx*cdx+cdy*cdy) < 20) {
                c.a=false; this.progress++; Sys.score+=20;
                if(this.progress>=this.target) this.won=true;
            }
        });
    }
    draw(ctx) {
        ctx.fillStyle='gold'; this.coins.forEach(c => { if(c.a) { ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, 7); ctx.fill(); }});
        if(characterImages[selectedCharacter]) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.p.x, this.p.y, 20, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(characterImages[selectedCharacter], this.p.x - 20, this.p.y - 20, 40, 40);
            ctx.restore();
        } else {
            ctx.fillStyle='#0f0'; ctx.beginPath(); ctx.arc(this.p.x, this.p.y, 10, 0, 7); ctx.fill();
        }
        if(characterImages[this.enemyChar]) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.e.x, this.e.y, 20, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(characterImages[this.enemyChar], this.e.x - 20, this.e.y - 20, 40, 40);
            ctx.restore();
        } else {
            ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(this.e.x, this.e.y, 10, 0, 7); ctx.fill();
        }
        this.drawInfo(ctx, `Monete: ${this.progress}/${this.target}`);
    }
}

let game = null;

function resize() {
    const w = document.getElementById('game-wrap');
    Sys.width = w.clientWidth; Sys.height = w.clientHeight;
    Sys.canvas.width = Sys.width; Sys.canvas.height = Sys.height;
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
    
    Sys.ctx.fillStyle = '#000';
    Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);

    if(game) {
        game.update();
        game.draw(Sys.ctx);

        if(game.won) {
            Sys.level++;
            if(Sys.level > MAX_LEVEL) {
                Sys.state = 'over';
                Sys.audio.pause();
                Sys.ctx.fillStyle = 'rgba(0,0,0,0.8)';
                Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
                Sys.ctx.fillStyle = '#0f0';
                Sys.ctx.font = "24px monospace";
                Sys.ctx.textAlign = 'center';
                Sys.ctx.fillText('VITTORIA!', Sys.width/2, Sys.height/2);
                Sys.ctx.fillText('Punti: ' + Sys.score, Sys.width/2, Sys.height/2 + 30);
                return;
            }
            playMusic(Sys.level);
            game = new GameHunter(Sys.level);
        }
        if(game.lost) {
            Sys.state = 'over';
            Sys.audio.pause();
            Sys.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            Sys.ctx.fillRect(0, 0, Sys.width, Sys.height);
            Sys.ctx.fillStyle = '#fff';
            Sys.ctx.font = "24px monospace";
            Sys.ctx.textAlign = 'center';
            Sys.ctx.fillText('GAME OVER', Sys.width/2, Sys.height/2);
            Sys.ctx.fillText('Punti: ' + Sys.score, Sys.width/2, Sys.height/2 + 30);
            return;
        }
    }
    Sys.loopId = requestAnimationFrame(loop);
}

function startGame() {
    document.getElementById('char-select').classList.add('hidden');
    Sys.state = 'play';
    resize();
    playMusic(Sys.level);
    game = new GameHunter(Sys.level);
    loop();
}

function loadCharacters() {
    const names = ['ricka.jpeg', 'franco.jpeg', 'frizze.jpeg', 'lastrue.jpeg', 'lotti.jpeg', 'mache.jpeg', 'paolo.jpeg'];
    const grid = document.getElementById('char-grid');
    let loaded = 0;
    
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
            setTimeout(startGame, 200);
        });
        
        item.addEventListener('touchstart', (e) => {
            e.preventDefault();
            document.querySelectorAll('.char-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedCharacter = name;
            setTimeout(startGame, 200);
        }, {passive: false});
        
        grid.appendChild(item);
        img.onload = () => {
            loaded++;
        };
    });
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

resize();
loadCharacters();
