// Luis’s Locker — Drip Maze Run (Pacman style)
// Pure HTML5 canvas. No libraries.

// ====== Canvas ======
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// HUD
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

// Controls buttons
document.getElementById("startBtn").addEventListener("click", () => startGame(true));
const muteBtn = document.getElementById("muteBtn");

let SOUND_ON = true;
muteBtn.addEventListener("click", () => {
  SOUND_ON = !SOUND_ON;
  muteBtn.textContent = `Sound: ${SOUND_ON ? "ON" : "OFF"}`;
});

// Mobile D-pad
document.querySelectorAll(".dp").forEach(btn=>{
  btn.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    setDir(btn.dataset.dir);
  }, {passive:false});
  btn.addEventListener("click", ()=>setDir(btn.dataset.dir));
});

// ====== Simple sound (WebAudio) ======
let audioCtx;
function beep(freq=440, duration=0.06, type="sine", vol=0.04){
  if(!SOUND_ON) return;
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + duration);
}
function dripSound(){ beep(740, 0.05, "triangle", 0.05); }
function powerSound(){ beep(220, 0.12, "square", 0.06); setTimeout(()=>beep(330,0.12,"square",0.05),110); }
function hitSound(){ beep(110, 0.2, "sawtooth", 0.05); }
function winSound(){ beep(523,0.1,"triangle",0.05); setTimeout(()=>beep(659,0.1,"triangle",0.05),120); setTimeout(()=>beep(784,0.12,"triangle",0.06),250); }

// ====== Map ======
// Legend:
// # wall
// . drip pellet
// o power pellet (LL)
//   empty
const MAP = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################"
];

// Tile sizing based on canvas
const cols = MAP[0].length;
const rows = MAP.length;
const TILE = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
const OFFX = Math.floor((canvas.width - cols*TILE)/2);
const OFFY = Math.floor((canvas.height - rows*TILE)/2);

function tileToPx(tx, ty){
  return { x: OFFX + tx*TILE + TILE/2, y: OFFY + ty*TILE + TILE/2 };
}
function pxToTile(x,y){
  return {
    tx: Math.floor((x - OFFX)/TILE),
    ty: Math.floor((y - OFFY)/TILE)
  };
}

function isWall(tx, ty){
  if(ty<0 || ty>=rows || tx<0 || tx>=cols) return true;
  return MAP[ty][tx] === "#";
}

// ====== Game State ======
let score = 0;
let lives = 3;
let level = 1;

let running = false;
let lastTime = 0;

let pellets = new Set();   // key "x,y"
let powers  = new Set();

function resetCollectibles(){
  pellets.clear(); powers.clear();
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const ch = MAP[y][x];
      if(ch === ".") pellets.add(`${x},${y}`);
      if(ch === "o") powers.add(`${x},${y}`);
    }
  }
}

const player = {
  x:0, y:0,
  dir:{x:1,y:0},
  nextDir:{x:1,y:0},
  speed: 105, // px/s
  radius: TILE*0.38,
  mouth: 0
};

const ghosts = [
  {name:"Hater",  x:0,y:0, dir:{x:-1,y:0}, speed: 88, scared:false, color:"#ef4444"},
  {name:"Lurker", x:0,y:0, dir:{x:1,y:0},  speed: 86, scared:false, color:"#a855f7"},
  {name:"Goon",   x:0,y:0, dir:{x:0,y:1},  speed: 84, scared:false, color:"#22c55e"},
  {name:"Snitch", x:0,y:0, dir:{x:0,y:-1}, speed: 82, scared:false, color:"#f97316"}
];

let scaredTimer = 0; // seconds

function setSpawn(){
  // Player spawn near bottom center
  const p = tileToPx(13, 23);
  player.x = p.x; player.y = p.y;
  player.dir = {x:1,y:0};
  player.nextDir = {x:1,y:0};

  // Ghosts spawn in middle pen
  const spawns = [ [13,13],[14,13],[13,14],[14,14] ];
  ghosts.forEach((g,i)=>{
    const s = tileToPx(spawns[i][0], spawns[i][1]);
    g.x=s.x; g.y=s.y;
    g.dir = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][i];
    g.scared=false;
  });
}

function updateHUD(){
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
}

// ====== Input ======
const KEYS = {
  ArrowUp:"up", ArrowDown:"down", ArrowLeft:"left", ArrowRight:"right",
  w:"up", a:"left", s:"down", d:"right"
};

window.addEventListener("keydown", (e)=>{
  const k = KEYS[e.key];
  if(k) { e.preventDefault(); setDir(k); }
});

function setDir(d){
  if(d==="up") player.nextDir={x:0,y:-1};
  if(d==="down") player.nextDir={x:0,y:1};
  if(d==="left") player.nextDir={x:-1,y:0};
  if(d==="right") player.nextDir={x:1,y:0};
}

// ====== Helpers ======
function canMove(px, py, dir, radius){
  // look ahead to next position
  const nx = px + dir.x * (radius + 1);
  const ny = py + dir.y * (radius + 1);
  const {tx, ty} = pxToTile(nx, ny);
  return !isWall(tx, ty);
}

function moveEntity(ent, dt){
  // attempt turn at tile centers
  if(ent === player){
    const {tx, ty} = pxToTile(ent.x, ent.y);
    const center = tileToPx(tx, ty);
    const distToCenter = Math.hypot(ent.x-center.x, ent.y-center.y);

    if(distToCenter < TILE*0.18){
      // snap
      ent.x = center.x; ent.y = center.y;

      // try change dir
      if(canMove(ent.x, ent.y, ent.nextDir, ent.radius)){
        ent.dir = {...ent.nextDir};
      }
    }
  }

  // Move forward if possible
  const speed = ent.speed;
  if(canMove(ent.x, ent.y, ent.dir, ent.radius)){
    ent.x += ent.dir.x * speed * dt;
    ent.y += ent.dir.y * speed * dt;
  }else{
    // stop at wall
  }

  // Warp tunnel (left/right)
  if(ent.x < OFFX - TILE/2) ent.x = OFFX + cols*TILE + TILE/2;
  if(ent.x > OFFX + cols*TILE + TILE/2) ent.x = OFFX - TILE/2;
}

function chooseGhostDir(g){
  // simple AI: at intersections, choose direction
  // if scared: run away randomly
  const {tx, ty} = pxToTile(g.x, g.y);
  const center = tileToPx(tx, ty);
  const distToCenter = Math.hypot(g.x-center.x, g.y-center.y);
  if(distToCenter > TILE*0.18) return;

  g.x=center.x; g.y=center.y;

  const dirs = [
    {x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}
  ];

  // don't reverse unless forced
  const rev = {x:-g.dir.x, y:-g.dir.y};

  const options = dirs.filter(d=>{
    if(d.x===rev.x && d.y===rev.y) return false;
    const r = TILE*0.34;
    return canMove(g.x, g.y, d, r);
  });

  const valid = options.length ? options : dirs.filter(d=>canMove(g.x,g.y,d,TILE*0.34));
  if(!valid.length) return;

  if(g.scared){
    // random
    g.dir = valid[Math.floor(Math.random()*valid.length)];
    return;
  }

  // chase (greedy): pick dir that reduces distance to player
  let best = valid[0];
  let bestDist = Infinity;
  for(const d of valid){
    const testX = g.x + d.x*TILE;
    const testY = g.y + d.y*TILE;
    const dist = Math.hypot(player.x-testX, player.y-testY);
    if(dist < bestDist){
      bestDist = dist;
      best = d;
    }
  }
  g.dir = best;
}

// ====== Collisions ======
function eatCheck(){
  const {tx, ty} = pxToTile(player.x, player.y);
  const key = `${tx},${ty}`;
  if(pellets.has(key)){
    pellets.delete(key);
    score += 10;
    dripSound();
  }
  if(powers.has(key)){
    powers.delete(key);
    score += 50;
    scaredTimer = 8.0;
    ghosts.forEach(g=>g.scared=true);
    powerSound();
  }

  if(pellets.size === 0 && powers.size === 0){
    // Level cleared
    running = false;
    winSound();
    setTimeout(()=>{
      level++;
      startGame(false);
    }, 650);
  }
}

function ghostCollision(){
  for(const g of ghosts){
    const dist = Math.hypot(player.x - g.x, player.y - g.y);
    if(dist < player.radius + TILE*0.28){
      if(g.scared){
        // collect enemy
        score += 200;
        beep(520,0.05,"triangle",0.06);
        // respawn ghost in pen
        const s = tileToPx(13 + Math.floor(Math.random()*2), 13 + Math.floor(Math.random()*2));
        g.x=s.x; g.y=s.y;
        g.dir = {x:1,y:0};
      }else{
        // lose life
        lives--;
        hitSound();
        updateHUD();
        if(lives <= 0){
          running = false;
          setTimeout(()=>showCenterText("GAME OVER — Tap Start"), 20);
        }else{
          running = false;
          setTimeout(()=>{
            setSpawn();
            running = true;
            lastTime = performance.now();
            requestAnimationFrame(loop);
          }, 700);
        }
        return;
      }
    }
  }
}

// ====== Draw ======
function drawMap(){
  // walls
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const ch = MAP[y][x];
      const px = OFFX + x*TILE;
      const py = OFFY + y*TILE;

      if(ch === "#"){
        ctx.fillStyle = "rgba(83,172,177,.10)";
        ctx.fillRect(px, py, TILE, TILE);

        ctx.strokeStyle = "rgba(83,172,177,.25)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px+1, py+1, TILE-2, TILE-2);
      }
    }
  }
}

function drawCollectibles(){
  // pellets
  ctx.fillStyle = "rgba(229,231,235,.95)";
  pellets.forEach(key=>{
    const [x,y] = key.split(",").map(Number);
    const p = tileToPx(x,y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, TILE*0.10, 0, Math.PI*2);
    ctx.fill();
  });

  // power pellets (LL)
  powers.forEach(key=>{
    const [x,y] = key.split(",").map(Number);
    const p = tileToPx(x,y);
    // teal ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, TILE*0.22, 0, Math.PI*2);
    ctx.fillStyle = "rgba(83,172,177,.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(83,172,177,.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // LL text
    ctx.fillStyle = "rgba(83,172,177,.95)";
    ctx.font = `900 ${Math.floor(TILE*0.26)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LL", p.x, p.y+1);
  });
}

function drawPlayer(dt){
  // mouth animation
  player.mouth += dt*8;
  const open = (Math.sin(player.mouth)+1)/2; // 0..1
  const angle = open*0.55;

  // direction angle
  let base = 0;
  if(player.dir.x===1) base = 0;
  if(player.dir.x===-1) base = Math.PI;
  if(player.dir.y===1) base = Math.PI/2;
  if(player.dir.y===-1) base = -Math.PI/2;

  ctx.beginPath();
  ctx.fillStyle = "#fbbf24";
  ctx.moveTo(player.x, player.y);
  ctx.arc(player.x, player.y, player.radius, base+angle, base+(Math.PI*2)-angle);
  ctx.closePath();
  ctx.fill();

  // eye highlight
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.arc(player.x + player.radius*0.18, player.y - player.radius*0.35, player.radius*0.12, 0, Math.PI*2);
  ctx.fill();
}

function drawGhost(g){
  const r = TILE*0.36;
  const color = g.scared ? "rgba(96,165,250,.95)" : g.color;

  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(g.x, g.y, r, Math.PI, 0);
  ctx.lineTo(g.x + r, g.y + r);
  ctx.lineTo(g.x - r, g.y + r);
  ctx.closePath();
  ctx.fill();

  // eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(g.x - r*0.30, g.y - r*0.10, r*0.18, 0, Math.PI*2);
  ctx.arc(g.x + r*0.30, g.y - r*0.10, r*0.18, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(g.x - r*0.30 + (g.dir.x*2), g.y - r*0.10 + (g.dir.y*2), r*0.09, 0, Math.PI*2);
  ctx.arc(g.x + r*0.30 + (g.dir.x*2), g.y - r*0.10 + (g.dir.y*2), r*0.09, 0, Math.PI*2);
  ctx.fill();

  // name
  ctx.fillStyle = "rgba(229,231,235,.55)";
  ctx.font = `700 ${Math.floor(TILE*0.18)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(g.name, g.x, g.y + r*1.35);
}

function showCenterText(text){
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.fillStyle = "rgba(229,231,235,.96)";
  ctx.font = "900 26px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width/2, canvas.height/2 - 8);

  ctx.fillStyle = "rgba(83,172,177,.96)";
  ctx.font = "800 14px system-ui";
  ctx.fillText("Collect Drip Drops • Grab LL Power-Up • Avoid Haters", canvas.width/2, canvas.height/2 + 24);
  ctx.restore();
}

// ====== Loop ======
function loop(t){
  if(!running) return;

  const dt = Math.min(0.033, (t - lastTime)/1000);
  lastTime = t;

  // update scared
  if(scaredTimer > 0){
    scaredTimer -= dt;
    if(scaredTimer <= 0){
      ghosts.forEach(g=>g.scared=false);
      scaredTimer = 0;
    }
  }

  // move
  moveEntity(player, dt);

  ghosts.forEach(g=>{
    chooseGhostDir(g);
    // speed slightly increases each level
    const base = g.speed;
    const bonus = (level-1)*4;
    const scaredPenalty = g.scared ? -14 : 0;
    g.speed = base + bonus + scaredPenalty;
    g.radius = TILE*0.34;
    moveEntity(g, dt);
  });

  // collisions
  eatCheck();
  ghostCollision();

  updateHUD();

  // draw
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawMap();
  drawCollectibles();
  drawPlayer(dt);
  ghosts.forEach(drawGhost);

  // scared bar
  if(scaredTimer>0){
    ctx.fillStyle = "rgba(83,172,177,.25)";
    ctx.fillRect(OFFX, OFFY-10, cols*TILE, 6);
    ctx.fillStyle = "rgba(83,172,177,.95)";
    ctx.fillRect(OFFX, OFFY-10, cols*TILE * (scaredTimer/8), 6);
  }

  requestAnimationFrame(loop);
}

// ====== Start / Reset ======
function startGame(fullReset){
  if(fullReset){
    score = 0;
    lives = 3;
    level = 1;
  }

  resetCollectibles();
  setSpawn();
  updateHUD();

  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// Initial screen
resetCollectibles();
setSpawn();
drawMap();
drawCollectibles();
drawPlayer(0);
ghosts.forEach(drawGhost);
showCenterText("Tap Start");
