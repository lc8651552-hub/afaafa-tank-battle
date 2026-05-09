const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const overlay = document.querySelector("#overlay");
const livesEl = document.querySelector("#lives");
const levelEl = document.querySelector("#level");
const scoreEl = document.querySelector("#score");
const enemiesEl = document.querySelector("#enemies");

const TILE = 36;
const SIZE = 20;
const WORLD = TILE * SIZE;
const PLAYER_SPEED = 2.4;
const ENEMY_SPEED = 1.25;
const BULLET_SPEED = 5.8;
const TANK_SIZE = 30;
const keys = new Set();

const tileColors = {
  brick: "#9a5a38",
  steel: "#8b938c",
  water: "#315f8a",
  forest: "#3e7a42",
  base: "#e7cf72",
};

let state = createState();
let lastTime = 0;
let animationId = 0;

function createState() {
  return {
    running: false,
    paused: false,
    over: false,
    won: false,
    level: 1,
    score: 0,
    lives: 3,
    enemiesLeft: 0,
    enemySpawnTimer: 0,
    playerCooldown: 0,
    enemies: [],
    bullets: [],
    map: [],
    player: makeTank(9 * TILE + 3, 17 * TILE + 3, "up", "player"),
  };
}

function makeTank(x, y, dir, team) {
  return {
    x,
    y,
    dir,
    team,
    size: TANK_SIZE,
    hp: team === "player" ? 1 : 1,
    cooldown: 0,
    turnTimer: 0,
    shootTimer: 0,
  };
}

function buildLevel(level) {
  const map = Array.from({ length: SIZE }, () => Array(SIZE).fill(""));
  const bricks = [
    [4, 3], [5, 3], [14, 3], [15, 3], [2, 6], [3, 6], [7, 6], [12, 6],
    [16, 6], [17, 6], [5, 9], [6, 9], [13, 9], [14, 9], [2, 13], [3, 13],
    [8, 13], [11, 13], [16, 13], [17, 13], [8, 16], [11, 16],
  ];
  const steel = [[9, 7], [10, 7], [9, 11], [10, 11], [1, 10], [18, 10]];
  const water = level % 2 === 0 ? [[8, 4], [9, 4], [10, 4], [11, 4], [8, 5], [11, 5]] : [[8, 10], [9, 10], [10, 10], [11, 10]];
  const forest = [[4, 15], [5, 15], [14, 15], [15, 15], [6, 4], [13, 4]];

  for (const [x, y] of bricks) map[y][x] = "brick";
  for (const [x, y] of steel) map[y][x] = "steel";
  for (const [x, y] of water) map[y][x] = "water";
  for (const [x, y] of forest) map[y][x] = "forest";

  map[18][9] = "brick";
  map[18][10] = "brick";
  map[17][9] = "brick";
  map[17][10] = "brick";
  map[18][9] = "base";
  return map;
}

function startGame() {
  state = createState();
  loadLevel(1);
  state.running = true;
  overlay.classList.add("hidden");
  pauseButton.textContent = "\u6682\u505c";
  pauseButton.setAttribute("aria-pressed", "false");
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function loadLevel(level) {
  state.level = level;
  state.map = buildLevel(level);
  state.player = makeTank(9 * TILE + 3, 17 * TILE + 3, "up", "player");
  state.enemies = [];
  state.bullets = [];
  state.enemiesLeft = 8 + level * 2;
  state.enemySpawnTimer = 0;
  updateHud();
}

function loop(now) {
  const dt = Math.min(32, now - lastTime);
  lastTime = now;
  if (state.running && !state.paused && !state.over) update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

function update(dt) {
  handlePlayer(dt);
  spawnEnemies(dt);
  updateEnemies(dt);
  updateBullets();
  checkLevel();
  updateHud();
}

function handlePlayer(dt) {
  const player = state.player;
  player.cooldown = Math.max(0, player.cooldown - dt);
  const dir = getInputDir();
  if (dir) {
    player.dir = dir;
    moveTank(player, dir, PLAYER_SPEED);
  }
  if (keys.has(" ") && player.cooldown <= 0) {
    fire(player);
    player.cooldown = 320;
  }
}

function getInputDir() {
  if (keys.has("arrowup") || keys.has("w")) return "up";
  if (keys.has("arrowdown") || keys.has("s")) return "down";
  if (keys.has("arrowleft") || keys.has("a")) return "left";
  if (keys.has("arrowright") || keys.has("d")) return "right";
  return "";
}

function spawnEnemies(dt) {
  state.enemySpawnTimer -= dt;
  if (state.enemySpawnTimer > 0 || state.enemiesLeft <= state.enemies.length || state.enemies.length >= 4) return;
  const spawns = [
    { x: 0, y: 0 },
    { x: 9 * TILE, y: 0 },
    { x: 18 * TILE, y: 0 },
  ];
  const spot = spawns[Math.floor(Math.random() * spawns.length)];
  const enemy = makeTank(spot.x + 3, spot.y + 3, "down", "enemy");
  if (!collides(enemy.x, enemy.y, enemy.size, enemy)) {
    state.enemies.push(enemy);
    state.enemySpawnTimer = 900;
  }
}

function updateEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.turnTimer -= dt;
    enemy.shootTimer -= dt;

    if (enemy.turnTimer <= 0 || !moveTank(enemy, enemy.dir, ENEMY_SPEED)) {
      enemy.dir = chooseEnemyDir(enemy);
      enemy.turnTimer = 420 + Math.random() * 760;
    }

    if (enemy.shootTimer <= 0 && enemy.cooldown <= 0) {
      fire(enemy);
      enemy.cooldown = 780;
      enemy.shootTimer = 460 + Math.random() * 1000;
    }
  }
}

function chooseEnemyDir(enemy) {
  const player = state.player;
  const chase = Math.random() < 0.5;
  if (chase) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }
  return ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
}

function moveTank(tank, dir, speed) {
  const next = { x: tank.x, y: tank.y };
  if (dir === "up") next.y -= speed;
  if (dir === "down") next.y += speed;
  if (dir === "left") next.x -= speed;
  if (dir === "right") next.x += speed;
  if (collides(next.x, next.y, tank.size, tank)) return false;
  tank.x = next.x;
  tank.y = next.y;
  return true;
}

function fire(tank) {
  const center = tank.size / 2;
  const bullet = {
    x: tank.x + center - 4,
    y: tank.y + center - 4,
    size: 8,
    dir: tank.dir,
    team: tank.team,
  };
  if (tank.dir === "up") bullet.y = tank.y - 7;
  if (tank.dir === "down") bullet.y = tank.y + tank.size - 1;
  if (tank.dir === "left") bullet.x = tank.x - 7;
  if (tank.dir === "right") bullet.x = tank.x + tank.size - 1;
  state.bullets.push(bullet);
}

function updateBullets() {
  for (const bullet of state.bullets) {
    if (bullet.dir === "up") bullet.y -= BULLET_SPEED;
    if (bullet.dir === "down") bullet.y += BULLET_SPEED;
    if (bullet.dir === "left") bullet.x -= BULLET_SPEED;
    if (bullet.dir === "right") bullet.x += BULLET_SPEED;
  }

  state.bullets = state.bullets.filter((bullet) => {
    if (bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD || bullet.y > WORLD) return false;
    if (hitTile(bullet)) return false;
    if (bullet.team === "player") return !hitEnemies(bullet);
    return !hitPlayer(bullet);
  });
}

function hitTile(bullet) {
  const tx = Math.floor((bullet.x + bullet.size / 2) / TILE);
  const ty = Math.floor((bullet.y + bullet.size / 2) / TILE);
  const tile = state.map[ty]?.[tx];
  if (!tile || tile === "water" || tile === "forest") return false;
  if (tile === "base") {
    endGame(false);
    return true;
  }
  if (tile === "brick") state.map[ty][tx] = "";
  return tile === "brick" || tile === "steel";
}

function hitEnemies(bullet) {
  const index = state.enemies.findIndex((enemy) => intersects(bullet, enemy));
  if (index === -1) return false;
  state.enemies.splice(index, 1);
  state.enemiesLeft -= 1;
  state.score += 100;
  return true;
}

function hitPlayer(bullet) {
  if (!intersects(bullet, state.player)) return false;
  state.lives -= 1;
  if (state.lives <= 0) {
    endGame(false);
  } else {
    state.player = makeTank(9 * TILE + 3, 17 * TILE + 3, "up", "player");
  }
  return true;
}

function collides(x, y, size, self) {
  if (x < 0 || y < 0 || x + size > WORLD || y + size > WORLD) return true;
  const box = { x, y, size };
  for (const point of corners(x, y, size)) {
    const tx = Math.floor(point.x / TILE);
    const ty = Math.floor(point.y / TILE);
    const tile = state.map[ty]?.[tx];
    if (tile && tile !== "forest") return true;
  }
  const tanks = [state.player, ...state.enemies].filter((tank) => tank && tank !== self);
  return tanks.some((tank) => intersects(box, tank));
}

function corners(x, y, size) {
  return [
    { x: x + 2, y: y + 2 },
    { x: x + size - 2, y: y + 2 },
    { x: x + 2, y: y + size - 2 },
    { x: x + size - 2, y: y + size - 2 },
  ];
}

function intersects(a, b) {
  return a.x < b.x + b.size && a.x + a.size > b.x && a.y < b.y + b.size && a.y + a.size > b.y;
}

function checkLevel() {
  if (state.enemiesLeft <= 0 && state.enemies.length === 0) {
    if (state.level >= 3) {
      endGame(true);
    } else {
      loadLevel(state.level + 1);
    }
  }
}

function endGame(won) {
  state.over = true;
  state.won = won;
  overlay.querySelector("h1").textContent = won ? "\u80dc\u5229" : "\u4efb\u52a1\u5931\u8d25";
  overlay.querySelector("p").textContent = won ? `\u6700\u7ec8\u5f97\u5206 ${state.score}` : "\u57fa\u5730\u88ab\u6bc1\u6216\u751f\u547d\u8017\u5c3d\u3002";
  startButton.textContent = "\u91cd\u65b0\u5f00\u59cb";
  overlay.classList.remove("hidden");
}

function draw() {
  ctx.fillStyle = "#10110f";
  ctx.fillRect(0, 0, WORLD, WORLD);
  drawGrid();
  drawMap(false);
  drawTank(state.player);
  for (const enemy of state.enemies) drawTank(enemy);
  drawMap(true);
  for (const bullet of state.bullets) drawBullet(bullet);
}

function drawGrid() {
  ctx.strokeStyle = "rgba(240, 241, 220, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * TILE, 0);
    ctx.lineTo(i * TILE, WORLD);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * TILE);
    ctx.lineTo(WORLD, i * TILE);
    ctx.stroke();
  }
}

function drawMap(foreground) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const tile = state.map[y][x];
      if (!tile || (foreground ? tile !== "forest" : tile === "forest")) continue;
      drawTile(x, y, tile);
    }
  }
}

function drawTile(x, y, tile) {
  const px = x * TILE;
  const py = y * TILE;
  ctx.fillStyle = tileColors[tile];
  ctx.fillRect(px, py, TILE, TILE);
  if (tile === "brick") {
    ctx.strokeStyle = "#63351f";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(px, py + i * 12);
      ctx.lineTo(px + TILE, py + i * 12);
      ctx.stroke();
    }
  }
  if (tile === "steel") {
    ctx.strokeStyle = "#c4cbc4";
    ctx.strokeRect(px + 5, py + 5, TILE - 10, TILE - 10);
  }
  if (tile === "water") {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(px + 5, py + 12, TILE - 10, 3);
    ctx.fillRect(px + 8, py + 23, TILE - 16, 3);
  }
  if (tile === "forest") {
    ctx.globalAlpha = 0.76;
    ctx.fillStyle = tileColors.forest;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.globalAlpha = 1;
  }
  if (tile === "base") {
    ctx.fillStyle = "#2d2510";
    ctx.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
    ctx.fillStyle = tileColors.base;
    ctx.fillRect(px + 15, py + 5, 6, 26);
    ctx.fillRect(px + 8, py + 14, 20, 6);
  }
}

function drawTank(tank) {
  const isPlayer = tank.team === "player";
  ctx.save();
  ctx.translate(tank.x + tank.size / 2, tank.y + tank.size / 2);
  ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[tank.dir]);
  ctx.fillStyle = isPlayer ? "#73b36b" : "#d85d4f";
  ctx.fillRect(-15, -15, 30, 30);
  ctx.fillStyle = isPlayer ? "#3d6f3a" : "#87372f";
  ctx.fillRect(-16, -14, 6, 28);
  ctx.fillRect(10, -14, 6, 28);
  ctx.fillStyle = "#161812";
  ctx.fillRect(-4, -20, 8, 22);
  ctx.fillStyle = "#f0f1dc";
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();
}

function drawBullet(bullet) {
  ctx.fillStyle = bullet.team === "player" ? "#f7e083" : "#ff8a75";
  ctx.fillRect(bullet.x, bullet.y, bullet.size, bullet.size);
}

function updateHud() {
  livesEl.textContent = state.lives;
  levelEl.textContent = state.level;
  scoreEl.textContent = state.score;
  enemiesEl.textContent = Math.max(0, state.enemiesLeft);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", () => {
  if (!state.running || state.over) return;
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? "\u7ee7\u7eed" : "\u6682\u505c";
  pauseButton.setAttribute("aria-pressed", String(state.paused));
  overlay.querySelector("h1").textContent = "\u5df2\u6682\u505c";
  overlay.querySelector("p").textContent = "\u4f11\u6574\u4e00\u4e0b\uff0c\u51c6\u5907\u7ee7\u7eed\u63a8\u8fdb\u3002";
  startButton.textContent = "\u91cd\u65b0\u5f00\u59cb";
  overlay.classList.toggle("hidden", !state.paused);
});

draw();
updateHud();
