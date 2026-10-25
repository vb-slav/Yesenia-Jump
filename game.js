(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('game-shell');
  const platform = window.GamePlatform || {
    initialize: () => Promise.resolve(null),
    ready: () => {},
    startGameplay: () => {},
    stopGameplay: () => {},
    showInterstitial: onComplete => { if (onComplete) onComplete(); return false; },
    isPaused: () => false
  };
  const scoreNode = document.getElementById('score');
  const bestNode = document.getElementById('best-score');
  const startScreen = document.getElementById('start-screen');
  const resultScreen = document.getElementById('result-screen');
  const finalScoreNode = document.getElementById('final-score');
  const zoneNode = document.getElementById('zone-label');
  const floatScore = document.getElementById('float-score');
  const beeBalanceNode = document.getElementById('bee-balance');

  const palette = {
    skyTop: '#07091f', skyMid: '#111638', skyBottom: '#17163f',
    stable: '#75e5ff', crumble: '#ffc27c', spring: '#c7a0ff',
    danger: '#ff668e', bloom: '#ffe99c'
  };
  const platformStyles = {
    stable: { top: '#8cecff', base: '#327ca9', glow: 'rgba(86,218,255,.24)', shine: 'rgba(232,253,255,.7)' },
    crumble: { top: '#ffc27c', base: '#925978', glow: 'rgba(255,173,117,.25)', shine: 'rgba(255,244,213,.68)' },
    spring: { top: '#c9aaff', base: '#6255a5', glow: 'rgba(184,145,255,.34)', shine: 'rgba(245,232,255,.82)' }
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = 0;
  let animationId = 0;
  let screenMode = 'intro';
  let platformPaused = false;
  let pendingStartAfterPause = false;
  let restartPending = false;
  let completedRuns = 0;
  let best = 0;
  try { best = Number(localStorage.getItem('lumen-garden-best')) || 0; } catch (_) { best = 0; }
  bestNode.textContent = pad(best);
  let beeBalance = 0;
  try { beeBalance = Math.max(0, Number.parseInt(localStorage.getItem('lumen-garden-bees'), 10) || 0); } catch (_) { beeBalance = 0; }

  const keys = new Set();
  const pointers = new Map();
  const stars = [];
  const platforms = [];
  const traps = [];
  const enemies = [];
  const bees = [];
  const particles = [];
  const floatTexts = [];

  const physics = { gravity: 1480, jump: 710, maxSpeed: 350, acceleration: 2500 };
  const playerCollisionScale = (4 / 3) * 1.15;
  const playerHitbox = {
    halfWidth: 12 * playerCollisionScale,
    halfHeight: 11 * playerCollisionScale,
    trapHorizontal: 9 * playerCollisionScale,
    trapTop: 9 * playerCollisionScale,
    trapBottom: 6 * playerCollisionScale,
    hazardPadding: 10 * playerCollisionScale,
    collectiblePadding: 13 * playerCollisionScale
  };
  const startingGroundY = 64;
  const playerSpawnY = startingGroundY + playerHitbox.halfHeight + 1;
  const playerVisual = { width: 55, height: 77, bottom: 25, auraRadius: 48 };
  const minPlatformWidth = 72;
  let cameraY = 0;
  let generatedTo = 0;
  let lastSafe = null;
  let nextId = 1;
  let score = 0;
  let runBest = false;
  let elapsed = 0;
  let screenShake = 0;
  let glowPulse = 0;
  let branchCountdown = 0;

  const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1, squash: 0, invuln: 0, trail: [] };
  const playerSprite = new Image();
  playerSprite.src = new URL('./assets/player-girl.svg', document.baseURI).href;
  const playerBodySprite = new Image();
  playerBodySprite.src = new URL('./assets/player-girl-body.svg', document.baseURI).href;

  function pad(value) { return String(Math.max(0, Math.floor(value))).padStart(4, '0'); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function random(min, max) { return min + Math.random() * (max - min); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease01(value) { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); }
  function jumpVelocityFor(type) { return type === 'spring' ? physics.jump * Math.SQRT2 : physics.jump; }
  function difficulty() { return clamp(score / 4200, 0, 1); }
  function fmtScore(value) { return String(Math.max(0, Math.floor(value))); }

  function resize() {
    const oldWidth = width || shell.clientWidth;
    const oldHeight = height || shell.clientHeight;
    width = Math.max(1, shell.clientWidth);
    height = Math.max(1, shell.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (oldWidth > 0 && width !== oldWidth && platforms.length) {
      const ratio = width / oldWidth;
      player.x *= ratio;
      platforms.forEach(p => {
        p.x *= ratio; p.baseX *= ratio; p.previousX *= ratio;
        if (p.motion && p.motion.axis === 'x') p.motion.amplitude *= ratio;
      });
      traps.forEach(trap => { trap.x *= ratio; });
      enemies.forEach(e => { e.x *= ratio; e.baseX *= ratio; e.range *= ratio; });
      bees.forEach(bee => { bee.x *= ratio; });
    }
    if (oldHeight > 0 && height !== oldHeight && platforms.length) {
      const ratio = height / oldHeight;
      platforms.forEach(p => { if (p.motion && p.motion.axis === 'y') p.motion.amplitude *= ratio; });
    }
    createStars();
  }

  function createStars() {
    stars.length = 0;
    const count = Math.round(width * height / 5900);
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * width, y: Math.random() * height, r: random(.35, 1.5), alpha: random(.18, .72), phase: random(0, Math.PI * 2), drift: random(1, 7) });
    }
  }

  function resetWorld() {
    platforms.length = 0; traps.length = 0; enemies.length = 0; bees.length = 0; particles.length = 0; floatTexts.length = 0;
    const groundY = startingGroundY;
    player.x = width * .5; player.y = playerSpawnY; player.vx = 0; player.vy = 0;
    player.squash = 0; player.invuln = 0; player.trail = [];
    cameraY = 0; generatedTo = groundY; score = 0; elapsed = 0; runBest = false; screenShake = 0; glowPulse = 0; nextId = 1; branchCountdown = 0;
    lastSafe = makePlatform(width * .5, groundY, 'stable', 136);
    for (let i = 0; i < 10; i++) generateRow(true);
    updateHUD();
  }

  function makePlatform(x, y, type, platformWidth, motion = null) {
    const p = {
      id: nextId++, x, y, baseX: x, baseY: y, previousX: x, previousY: y,
      type, width: platformWidth, motion,
      hits: 0, broken: false
    };
    platforms.push(p);
    return p;
  }

  function randomPlatformWidth() {
    const max = Math.max(minPlatformWidth + 18, Math.min(170, width * .44));
    return random(minPlatformWidth, max);
  }

  function createStableMotion() {
    const roll = Math.random();
    if (roll < .04) {
      return { axis: 'y', amplitude: height * random(.01, .02), phase: random(0, Math.PI * 2), speed: random(.55, .9) };
    }
    if (roll < .26) {
      return { axis: 'x', amplitude: width * random(.04, .09), phase: random(0, Math.PI * 2), speed: random(.55, .95) };
    }
    return null;
  }

  function horizontalAmplitude(platform) {
    return platform.motion && platform.motion.axis === 'x' ? platform.motion.amplitude : 0;
  }

  function verticalAmplitude(platform) {
    return platform.motion && platform.motion.axis === 'y' ? platform.motion.amplitude : 0;
  }

  function safeGap() {
    const d = difficulty();
    const maxJumpHeight = physics.jump ** 2 / (2 * physics.gravity);
    const maxSafeGap = Math.min(130, maxJumpHeight * .78);
    const minSafeGap = Math.min(118, maxSafeGap - 12);
    const maxDifficultyGap = Math.min(118, maxSafeGap - 12);
    const minDifficultyGap = Math.min(106, maxDifficultyGap - 12);
    return random(mix(minSafeGap, minDifficultyGap, d), mix(maxSafeGap, maxDifficultyGap, d));
  }

  function freeFieldBounds(motion = null) {
    const margin = width * .2;
    const motionMargin = motion && motion.axis === 'x' ? motion.amplitude : 0;
    return { left: margin + motionMargin, right: width - margin - motionMargin };
  }

  function horizontalTravel(jumpForce, verticalGap) {
    const discriminant = jumpForce ** 2 - 2 * physics.gravity * verticalGap;
    if (discriminant < 0) return 0;
    const time = (jumpForce + Math.sqrt(discriminant)) / physics.gravity;
    const accelerationTime = physics.maxSpeed / physics.acceleration;
    if (time <= accelerationTime) return .5 * physics.acceleration * time ** 2;
    return .5 * physics.acceleration * accelerationTime ** 2 + physics.maxSpeed * (time - accelerationTime);
  }

  function canReachLanding(from, to, jumpForce) {
    const fromY = from.baseY ?? from.y;
    const toY = to.baseY ?? to.y;
    const verticalGap = toY + verticalAmplitude(to) - (fromY - verticalAmplitude(from));
    if (verticalGap < 0 || verticalGap > jumpForce ** 2 / (2 * physics.gravity)) return false;
    const travel = horizontalTravel(jumpForce, verticalGap);
    const centerReach = travel + to.width * .5 - 6;
    const fromX = from.baseX ?? from.x;
    const toX = to.baseX ?? to.x;
    const maxDistance = Math.abs(wrapDistance(toX, fromX)) + horizontalAmplitude(from) + horizontalAmplitude(to);
    return maxDistance <= centerReach;
  }

  function chooseSafeX(source, targetY, targetWidth, targetMotion) {
    const { left, right } = freeFieldBounds(targetMotion);
    const sourceY = source.baseY ?? source.y;
    const verticalGap = targetY + verticalAmplitude({ motion: targetMotion }) - (sourceY - verticalAmplitude(source));
    if (verticalGap > physics.jump ** 2 / (2 * physics.gravity)) return null;
    const centerReach = Math.min(width * .3, horizontalTravel(physics.jump, verticalGap) + targetWidth * .5 - 6 - horizontalAmplitude(source) - horizontalAmplitude({ motion: targetMotion }));
    const sourceX = source.baseX ?? source.x;
    const minShift = Math.min(width * .12, 84, centerReach * .45);
    const candidates = [];
    for (let i = 0; i < 80; i++) {
      const x = random(left, right);
      const dx = Math.abs(wrapDistance(x, sourceX));
      if (dx >= minShift && dx <= centerReach) candidates.push(x);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];

    const nearby = [];
    for (let i = 0; i < 40; i++) {
      const x = random(left, right);
      if (Math.abs(wrapDistance(x, sourceX)) <= centerReach) nearby.push(x);
    }
    if (nearby.length) return nearby[Math.floor(Math.random() * nearby.length)];
    const nearest = clamp(sourceX, left, right);
    if (Math.abs(wrapDistance(nearest, sourceX)) <= centerReach) return nearest;
    const reachableEdges = [left, right].filter(x => Math.abs(wrapDistance(x, sourceX)) <= centerReach);
    return reachableEdges.length ? reachableEdges[Math.floor(Math.random() * reachableEdges.length)] : null;
  }

  function chooseBranchX(source, target, branchY, branchWidth, type, branchMotion) {
    const { left, right } = freeFieldBounds(branchMotion);
    const sourceX = source.baseX ?? source.x;
    const targetX = target.baseX ?? target.x;
    const midpoint = wrapX(sourceX + wrapDistance(targetX, sourceX) * .5);
    const minOffset = Math.min(width * .1, 84);
    const jumpForce = jumpVelocityFor(type);
    const candidates = [];

    for (let i = 0; i < 100; i++) {
      const x = random(left, right);
      if (Math.abs(wrapDistance(x, midpoint)) < minOffset) continue;
      const branch = { x, y: branchY, baseX: x, baseY: branchY, width: branchWidth, motion: branchMotion };
      if (canReachLanding(source, branch, physics.jump) && canReachLanding(branch, target, jumpForce)) candidates.push(x);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];

    for (let i = 0; i < 100; i++) {
      const x = random(left, right);
      const branch = { x, y: branchY, baseX: x, baseY: branchY, width: branchWidth, motion: branchMotion };
      if (canReachLanding(source, branch, physics.jump) && canReachLanding(branch, target, jumpForce)) candidates.push(x);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    return midpoint;
  }

  function generateRow(initial = false) {
    if (!lastSafe) return;
    const d = difficulty();
    const gap = safeGap();
    const routeFrom = lastSafe;
    const sourceY = routeFrom.baseY;
    const y = sourceY + gap;
    const safeWidth = randomPlatformWidth();
    let safeMotion = createStableMotion();
    let safeX = chooseSafeX(routeFrom, y, safeWidth, safeMotion);
    if (safeX === null && safeMotion) {
      safeMotion = null;
      safeX = chooseSafeX(routeFrom, y, safeWidth, safeMotion);
    }
    if (safeX === null) {
      const bounds = freeFieldBounds();
      safeX = clamp(routeFrom.baseX, bounds.left, bounds.right);
    }
    const safePlatform = makePlatform(safeX, y, 'stable', safeWidth, safeMotion);
    const routeTo = safePlatform;
    const routeMidpoint = wrapX(routeFrom.baseX + wrapDistance(safeX, routeFrom.baseX) * .5);
    const routeMotionClearance = horizontalAmplitude(routeFrom) + horizontalAmplitude(safePlatform);

    // Keep the stable anchors as a guaranteed route. Scattered side ledges appear
    // every two or three anchor jumps and are placed only when both adjacent hops work.
    const hasBranch = initial || branchCountdown <= 0;
    if (hasBranch) branchCountdown = Math.random() < .5 ? 1 : 2;
    else branchCountdown--;

    if (hasBranch) {
      const types = ['stable', 'crumble', 'spring'];
      const weights = [38, 30 + d * 6, 32 - d * 6];
      const type = initial ? 'stable' : weightedPick(types, weights);
      const branchWidth = randomPlatformWidth();
      const branchY = sourceY + gap * random(.4, .58);
      const branchMotion = type === 'stable' ? createStableMotion() : null;
      const branchX = chooseBranchX(routeFrom, routeTo, branchY, branchWidth, type, branchMotion);
      const branch = { x: branchX, y: branchY, baseX: branchX, baseY: branchY, width: branchWidth, motion: branchMotion };
      if (canReachLanding(routeFrom, branch, physics.jump) && canReachLanding(branch, routeTo, jumpVelocityFor(type))) {
        makePlatform(branchX, branchY, type, branchWidth, branchMotion);
      }
    }

    if (!initial) {
      const hazardChance = .055 + d * .15;
      if (width > 390 && Math.random() < hazardChance) {
        const hazardWidth = random(66, 94);
        const hazardX = findOffRouteX(routeFrom.baseX, safePlatform.baseX, hazardWidth * .5 + 30 + routeMotionClearance);
        if (hazardX !== null) traps.push({ x: hazardX, y: y - random(12, 32), width: hazardWidth, wobble: random(0, Math.PI * 2) });
      }

      if (Math.random() < .14 + d * .19) {
        const beeX = wrapX(routeMidpoint + random(-Math.min(width * .025, 14), Math.min(width * .025, 14)));
        bees.push({ x: beeX, y: sourceY + gap * random(.55, .82), phase: random(0, 6.28), collected: false, size: random(14, 15.2), hitRadius: random(8, 10) });
      }

      const enemyChance = .16 + d * .34;
      if (width > 420 && Math.random() < enemyChance) {
        const enemyX = findOffRouteX(routeFrom.baseX, safePlatform.baseX, 88 + routeMotionClearance);
        if (enemyX !== null) {
          const radius = random(12, 16);
          const clearance = distanceToSafeCorridor(enemyX, routeFrom.baseX, safePlatform.baseX) - routeMotionClearance;
          const range = Math.min(random(26, 62) + d * 24, clearance - radius - 26);
          if (range > 7) enemies.push({ x: enemyX, baseX: enemyX, y: sourceY + gap * random(.25, .74), phase: random(0, 6.28), speed: random(1.2, 2.1) * (1 + d * .7), range, radius, type: Math.random() < .5 ? 'moth' : 'drone', direction: Math.random() > .5 ? 1 : -1 });
        }
      }
    }
    lastSafe = safePlatform;
    generatedTo = y;
  }

  function weightedPick(values, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < values.length; i++) { roll -= weights[i]; if (roll <= 0) return values[i]; }
    return values[values.length - 1];
  }

  function distanceToSafeCorridor(x, fromX, toX) {
    const end = fromX + wrapDistance(toX, fromX);
    const point = fromX + wrapDistance(x, fromX);
    return Math.abs(point - clamp(point, Math.min(fromX, end), Math.max(fromX, end)));
  }

  function findOffRouteX(fromX, toX, clearance) {
    const candidates = [];
    const steps = Math.max(24, Math.floor(width / 12));
    for (let i = 0; i <= steps; i++) {
      const x = 24 + (width - 48) * i / steps;
      if (distanceToSafeCorridor(x, fromX, toX) >= clearance) candidates.push(x);
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function updateHUD() {
    scoreNode.textContent = pad(score);
    bestNode.textContent = pad(best);
    beeBalanceNode.textContent = pad(beeBalance);
    const zones = ['ТИХАЯ ОРБИТА', 'САД СПОР', 'МХИ НУЛЕВОЙ ГРАВИТАЦИИ', 'ЛИСТЬЯ НЕБУЛЫ', 'КРАЙ СВЕТОВОГО ЛЕСА'];
    zoneNode.textContent = zones[Math.min(zones.length - 1, Math.floor(score / 700))];
  }

  function startGame() {
    if (screenMode === 'playing' || restartPending) return;
    if (screenMode === 'result' && completedRuns > 0 && completedRuns % 3 === 0) {
      restartPending = true;
      platform.showInterstitial(() => {
        restartPending = false;
        beginGame();
      });
      return;
    }
    beginGame();
  }

  function beginGame() {
    if (screenMode === 'playing') return;
    if (platformPaused || platform.isPaused()) {
      pendingStartAfterPause = true;
      return;
    }
    pendingStartAfterPause = false;
    resetWorld();
    screenMode = 'playing';
    startScreen.classList.add('is-hidden');
    resultScreen.classList.add('is-hidden');
    shell.classList.add('is-playing');
    player.vy = physics.jump;
    player.squash = .15;
    platform.startGameplay();
    lastTime = performance.now();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(frame);
  }

  function endGame() {
    if (screenMode !== 'playing') return;
    screenMode = 'result';
    completedRuns += 1;
    platform.stopGameplay();
    finalScoreNode.textContent = fmtScore(score);
    document.getElementById('record-line').textContent = runBest ? 'Новый рекорд — сохранён в этом браузере' : `Лучший полёт: ${fmtScore(best)} м`;
    resultScreen.classList.remove('is-hidden');
    shell.classList.remove('is-playing');
    pointers.clear(); keys.clear();
    draw();
    startIdleLoop();
  }

  function directionInput() {
    let left = keys.has('ArrowLeft') || keys.has('KeyA');
    let right = keys.has('ArrowRight') || keys.has('KeyD');
    for (const dir of pointers.values()) { if (dir < 0) left = true; if (dir > 0) right = true; }
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  function updatePlatformMotion(dt) {
    for (const p of platforms) {
      p.previousX = p.x;
      p.previousY = p.y;
      if (!p.motion) continue;
      p.motion.phase += dt * p.motion.speed;
      const offset = Math.sin(p.motion.phase) * p.motion.amplitude;
      p.x = p.motion.axis === 'x' ? p.baseX + offset : p.baseX;
      p.y = p.motion.axis === 'y' ? p.baseY + offset : p.baseY;
    }
  }

  function update(dt) {
    elapsed += dt;
    glowPulse += dt;
    updatePlatformMotion(dt);
    const input = directionInput();
    if (input) {
      player.vx += input * physics.acceleration * dt;
      player.facing = input;
    } else player.vx *= Math.exp(-5.2 * dt);
    player.vx = clamp(player.vx, -physics.maxSpeed, physics.maxSpeed);
    player.x += player.vx * dt;
    const wrapMargin = playerHitbox.halfWidth + 2;
    if (player.x < -wrapMargin) player.x = width + wrapMargin;
    if (player.x > width + wrapMargin) player.x = -wrapMargin;

    const prevY = player.y;
    player.vy -= physics.gravity * dt;
    player.y += player.vy * dt;
    player.squash = Math.max(0, player.squash - dt * 4.8);
    player.invuln = Math.max(0, player.invuln - dt);

    for (const trap of traps) trap.wobble += dt * 2.4;
    for (const e of enemies) {
      e.phase += dt * e.speed;
      e.x = e.baseX + Math.sin(e.phase) * e.range;
      if (e.x < e.radius + 2) e.x = e.radius + 2;
      if (e.x > width - e.radius - 2) e.x = width - e.radius - 2;
    }

    if (player.vy < 0) landOnPlatforms(prevY);
    collectBees();
    updateHazards();
    updateParticles(dt);
    player.trail.push({ x: player.x, y: player.y, age: 0 });
    if (player.trail.length > 12) player.trail.shift();
    player.trail.forEach(t => t.age += dt);

    const desiredCamera = Math.max(cameraY, 0, player.y - height * .59);
    cameraY += (desiredCamera - cameraY) * Math.min(1, dt * 4.4);
    const altitude = Math.max(0, player.y - playerSpawnY);
    const nextScore = Math.floor(altitude);
    if (nextScore > score) {
      score = nextScore;
      if (score > best) {
        best = score; runBest = true;
        try { localStorage.setItem('lumen-garden-best', String(best)); } catch (_) { /* Storage may be disabled. */ }
      }
      updateHUD();
    }

    while (generatedTo < cameraY + height * 1.75) generateRow();
    const lowerLimit = cameraY - 160;
    for (let i = platforms.length - 1; i >= 0; i--) if (platforms[i].y < lowerLimit || platforms[i].broken) platforms.splice(i, 1);
    for (let i = traps.length - 1; i >= 0; i--) if (traps[i].y < lowerLimit - 50) traps.splice(i, 1);
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].y < lowerLimit - 50) enemies.splice(i, 1);
    for (let i = bees.length - 1; i >= 0; i--) if (bees[i].y < lowerLimit - 60 || bees[i].collected) bees.splice(i, 1);
    screenShake *= Math.exp(-9 * dt);
    if (player.y < cameraY - (playerHitbox.halfHeight + 28)) endGame();
  }

  function landOnPlatforms(prevY) {
    let candidate = null;
    const bottom = player.y - playerHitbox.halfHeight;
    const prevBottom = prevY - playerHitbox.halfHeight;
    for (const p of platforms) {
      if (p.broken) continue;
      if (prevBottom >= p.previousY - 1 && bottom <= p.y && Math.abs(wrapDistance(player.x, p.x)) < p.width * .5 + playerHitbox.halfWidth) {
        if (!candidate || p.y > candidate.y) candidate = p;
      }
    }
    if (!candidate) return;
    player.y = candidate.y + playerHitbox.halfHeight;
    player.vy = jumpVelocityFor(candidate.type);
    player.squash = candidate.type === 'spring' ? .34 : .22;
    player.invuln = .12;
    if (candidate.type === 'crumble') {
      candidate.hits++;
      if (candidate.hits >= 3) {
        candidate.broken = true;
        burst(candidate.x, candidate.y, palette.crumble, 12, 115);
        floatingText(candidate.x, candidate.y + 18, 'ПЛАТФОРМА РАЗРУШЕНА');
      } else {
        burst(candidate.x, candidate.y, palette.crumble, 5 + candidate.hits * 2, 70 + candidate.hits * 12);
      }
    }
    const bounceColor = candidate.type === 'spring' ? palette.spring : candidate.type === 'crumble' ? palette.crumble : palette.stable;
    burst(player.x, player.y - 8, bounceColor, candidate.type === 'spring' ? 9 : 5, candidate.type === 'spring' ? 76 : 46);
  }

  function updateHazards() {
    if (player.invuln > 0) return;
    for (const trap of traps) {
      const dx = wrapDistance(player.x, trap.x);
      if (Math.abs(dx) < trap.width * .5 + playerHitbox.trapHorizontal && player.y - playerHitbox.trapTop < trap.y + 16 && player.y + playerHitbox.trapBottom > trap.y - 8) {
        hitHazard(trap.x, trap.y); return;
      }
    }
    for (const e of enemies) {
      const dx = Math.abs(wrapDistance(player.x, e.x));
      const dy = Math.abs(player.y - e.y);
      if (dx < e.radius + playerHitbox.hazardPadding && dy < e.radius + playerHitbox.hazardPadding) { hitHazard(e.x, e.y); return; }
    }
  }

  function hitHazard(x, y) {
    screenShake = 8;
    burst(x, y, palette.danger, 18, 155);
    endGame();
  }

  function collectBees() {
    for (const bee of bees) {
      if (bee.collected) continue;
      const dx = Math.abs(wrapDistance(player.x, bee.x));
      if (Math.hypot(dx, player.y - bee.y) < bee.hitRadius + playerHitbox.collectiblePadding) {
        bee.collected = true;
        beeBalance += 1;
        try { localStorage.setItem('lumen-garden-bees', String(beeBalance)); } catch (_) { /* Storage may be disabled. */ }
        player.vy = Math.max(player.vy, physics.jump * 1.16);
        score += 35;
        best = Math.max(best, score);
        try { localStorage.setItem('lumen-garden-best', String(best)); } catch (_) { /* Storage may be disabled. */ }
        runBest = score >= best;
        updateHUD();
        burst(bee.x, bee.y, palette.bloom, 18, 132);
        floatingText(bee.x, bee.y + 18, 'ПЧЕЛА +1 · ИМПУЛЬС');
        floatScore.textContent = '+35';
        floatScore.classList.remove('show');
        void floatScore.offsetWidth;
        floatScore.classList.add('show');
      }
    }
  }

  function wrapDistance(a, b) {
    let d = a - b;
    if (d > width * .5) d -= width;
    if (d < -width * .5) d += width;
    return d;
  }

  function wrapX(value) {
    return ((value % width) + width) % width;
  }

  function burst(x, y, color, amount, speed) {
    for (let i = 0; i < amount; i++) {
      const angle = random(-Math.PI, Math.PI);
      const velocity = random(speed * .25, speed);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, age: 0, life: random(.3, .72), size: random(1.4, 3.5), color });
    }
  }

  function floatingText(x, y, value) { floatTexts.push({ x, y, value, age: 0, life: 1.1 }); }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 115 * dt; p.vx *= Math.exp(-1.5 * dt);
      if (p.age > p.life) particles.splice(i, 1);
    }
    for (let i = floatTexts.length - 1; i >= 0; i--) { floatTexts[i].age += dt; floatTexts[i].y += 22 * dt; if (floatTexts[i].age > floatTexts[i].life) floatTexts.splice(i, 1); }
  }

  function frame(now) {
    if (screenMode !== 'playing' || platformPaused) return;
    const dt = Math.min(.033, Math.max(.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    if (screenMode === 'playing' && !platformPaused) animationId = requestAnimationFrame(frame);
  }

  function draw() {
    if (!width || !height) return;
    ctx.save();
    if (screenShake > .2) ctx.translate(random(-screenShake, screenShake), random(-screenShake, screenShake));
    drawBackground();
    drawDistantGarden();
    for (const p of platforms) drawPlatform(p);
    for (const trap of traps) drawTrap(trap);
    for (const bee of bees) drawBee(bee);
    for (const e of enemies) drawEnemy(e);
    drawParticles();
    drawPlayer();
    ctx.restore();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, palette.skyTop); grad.addColorStop(.57, palette.skyMid); grad.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);
    const halo = ctx.createRadialGradient(width * .5, height * .62, 4, width * .5, height * .62, width * .74);
    halo.addColorStop(0, `rgba(115,102,255,${.14 + Math.sin(glowPulse * .4) * .025})`); halo.addColorStop(1, 'rgba(45,49,127,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
    for (const s of stars) {
      const y = ((s.y + cameraY * .08 * s.drift) % height + height) % height;
      const alpha = s.alpha * (.72 + Math.sin(elapsed * .9 + s.phase) * .28);
      ctx.globalAlpha = alpha; ctx.fillStyle = '#dceaff';
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.25) { ctx.globalAlpha = alpha * .45; ctx.fillRect(s.x - 3, y - .4, 6, .8); ctx.fillRect(s.x - .4, y - 3, .8, 6); }
    }
    ctx.globalAlpha = 1;
  }

  function drawDistantGarden() {
    // Slow parallax silhouettes give each orbit a layered, plant-like horizon.
    const phase = cameraY * .11;
    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      const alpha = layer === 0 ? .09 : .055;
      ctx.fillStyle = layer === 0 ? '#7e8be0' : '#55579f';
      ctx.globalAlpha = alpha;
      const base = height * (.72 + layer * .1) + (phase % 130) * (layer ? .5 : 1);
      for (let i = 0; i < 9; i++) {
        const x = i * (width / 8) + Math.sin(i * 13.1 + layer) * 32;
        const tall = 30 + Math.abs(Math.sin(i * 7.3 + layer)) * (layer ? 80 : 125);
        ctx.beginPath(); ctx.ellipse(x, base - tall * .35, 5 + layer * 3, tall * .5, Math.sin(i + phase * .01) * .12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 13, base - tall * .57, 12, 4, -.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function screenY(worldY) { return height - (worldY - cameraY); }

  function drawPlatform(p) {
    const y = screenY(p.y);
    if (y < -50 || y > height + 50) return;
    const positions = [p.x];
    if (p.x - p.width * .5 < 0) positions.push(p.x + width);
    if (p.x + p.width * .5 > width) positions.push(p.x - width);
    for (const x of positions) drawPlatformAt(p, y, x);
  }

  function drawPlatformAt(p, y, x) {
    const style = platformStyles[p.type];
    const w = p.width;
    const glow = ctx.createRadialGradient(x, y + 2, 2, x, y + 2, w * .72);
    glow.addColorStop(0, style.glow); glow.addColorStop(1, 'rgba(64,77,176,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - w, y - 25, w * 2, 48);
    ctx.save();
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = p.type === 'spring' ? 18 : 10;
    ctx.fillStyle = style.base;
    ctx.beginPath(); ctx.ellipse(x, y + 1, w * .5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.top;
    ctx.beginPath(); ctx.ellipse(x, y - 2, w * .5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = style.shine;
    ctx.beginPath(); ctx.ellipse(x - w * .14, y - 4, w * .21, 1.7, -.08, Math.PI, Math.PI * 2); ctx.fill();

    if (p.type === 'stable') {
      ctx.fillStyle = 'rgba(236,253,255,.78)';
      ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 3, y - 6); ctx.lineTo(x, y - 3); ctx.lineTo(x - 3, y - 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(198,249,255,.64)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - w * .27, y + 4); ctx.lineTo(x + w * .27, y + 4); ctx.stroke();
    } else if (p.type === 'crumble') {
      ctx.strokeStyle = 'rgba(86,48,91,.9)'; ctx.lineWidth = 1.25; ctx.lineCap = 'round';
      for (let i = 0; i < 1 + p.hits; i++) {
        const crackX = x - w * .22 + i * w * .2;
        ctx.beginPath(); ctx.moveTo(crackX, y - 6); ctx.lineTo(crackX - 2, y - 2); ctx.lineTo(crackX + 1, y + 1); ctx.lineTo(crackX - 2, y + 4); ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < 3 - p.hits ? '#fff0cc' : 'rgba(92,50,92,.5)';
        ctx.beginPath(); ctx.arc(x + (i - 1) * 7, y - 11, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.strokeStyle = 'rgba(245,226,255,.96)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y - 3); ctx.lineTo(x + 4, y - 6); ctx.lineTo(x - 4, y - 9);
      ctx.lineTo(x + 4, y - 12); ctx.lineTo(x - 4, y - 15); ctx.lineTo(x, y - 18);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(213,192,255,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y - 19, 7, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrap(trap) {
    const y = screenY(trap.y);
    if (y < -50 || y > height + 50) return;
    const positions = [trap.x];
    if (trap.x - trap.width * .5 < 0) positions.push(trap.x + width);
    if (trap.x + trap.width * .5 > width) positions.push(trap.x - width);
    for (const x of positions) drawTrapAt(trap, y, x);
  }

  function drawTrapAt(trap, y, x) {
    const w = trap.width;
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = 'rgba(255,86,142,.62)';
    ctx.strokeStyle = 'rgba(255,120,176,.62)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - w * .5, y + 4); ctx.quadraticCurveTo(x, y + 12, x + w * .5, y + 4); ctx.stroke();
    ctx.fillStyle = palette.danger;
    const count = Math.max(4, Math.floor(w / 13));
    for (let i = 0; i < count; i++) {
      const sx = x - w * .42 + (w * .84 / count) * i + 5;
      const tipY = y - 11 - Math.sin(trap.wobble + i * .8) * 1.4;
      ctx.beginPath(); ctx.moveTo(sx - 5, y + 1); ctx.quadraticCurveTo(sx - 3, tipY + 4, sx, tipY); ctx.quadraticCurveTo(sx + 2, tipY + 4, sx + 5, y + 1); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawBee(bee) {
    const y = screenY(bee.y) + Math.sin(elapsed * 2.7 + bee.phase) * 3;
    const radius = bee.size * (1 + Math.sin(elapsed * 3.5 + bee.phase) * .05);
    const flutter = Math.sin(elapsed * 20 + bee.phase) * .55;
    const halo = ctx.createRadialGradient(bee.x, y, 1, bee.x, y, radius * 3.6);
    halo.addColorStop(0, 'rgba(255,219,136,.5)'); halo.addColorStop(.42, 'rgba(122,190,255,.24)'); halo.addColorStop(1, 'rgba(116,133,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(bee.x, y, radius * 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(bee.x, y); ctx.rotate(Math.sin(elapsed * 2 + bee.phase) * .08);
    const wingFill = ctx.createLinearGradient(0, -radius, 0, -radius * .08);
    wingFill.addColorStop(0, 'rgba(203,245,255,.88)'); wingFill.addColorStop(.58, 'rgba(150,190,255,.68)'); wingFill.addColorStop(1, 'rgba(188,155,255,.36)');
    ctx.fillStyle = wingFill; ctx.strokeStyle = 'rgba(221,241,255,.9)'; ctx.lineWidth = Math.max(.9, radius * .07);
    ctx.save();
    ctx.rotate(-.55 - flutter);
    ctx.beginPath(); ctx.ellipse(-radius * .28, -radius * .5, radius * .55, radius * .3, -.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(228,246,255,.62)'; ctx.lineWidth = Math.max(.65, radius * .045);
    ctx.beginPath(); ctx.moveTo(-radius * .1, -radius * .48); ctx.quadraticCurveTo(-radius * .34, -radius * .65, -radius * .66, -radius * .7); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(.55 + flutter);
    ctx.beginPath(); ctx.ellipse(radius * .28, -radius * .5, radius * .55, radius * .3, .3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(228,246,255,.62)'; ctx.lineWidth = Math.max(.65, radius * .045);
    ctx.beginPath(); ctx.moveTo(radius * .1, -radius * .48); ctx.quadraticCurveTo(radius * .34, -radius * .65, radius * .66, -radius * .7); ctx.stroke();
    ctx.restore();
    const body = ctx.createLinearGradient(-radius, -radius * .6, radius, radius * .6);
    body.addColorStop(0, '#fff1ad'); body.addColorStop(.56, '#ffd45e'); body.addColorStop(1, '#e9963f');
    ctx.fillStyle = body; ctx.strokeStyle = '#9d6f62'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(85,65,112,.82)'; ctx.lineWidth = Math.max(1.2, radius * .2); ctx.beginPath(); ctx.moveTo(-radius * .23, -radius * .5); ctx.lineTo(-radius * .2, radius * .5); ctx.moveTo(radius * .23, -radius * .5); ctx.lineTo(radius * .2, radius * .5); ctx.stroke();
    const head = ctx.createRadialGradient(radius * .66, -radius * .3, radius * .04, radius * .78, -radius * .04, radius * .43);
    head.addColorStop(0, '#fff0b9'); head.addColorStop(.58, '#ffc85f'); head.addColorStop(1, '#e99a49');
    ctx.fillStyle = head; ctx.strokeStyle = '#9d6f62'; ctx.lineWidth = Math.max(1, radius * .07);
    ctx.beginPath(); ctx.arc(radius * .76, -radius * .05, radius * .39, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#433553'; ctx.beginPath(); ctx.arc(radius * .94, -radius * .15, radius * .105, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8de'; ctx.beginPath(); ctx.arc(radius * .97, -radius * .19, Math.max(.9, radius * .035), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6c5879'; ctx.lineWidth = Math.max(.9, radius * .06); ctx.beginPath();
    ctx.moveTo(radius * .66, -radius * .36); ctx.quadraticCurveTo(radius * .55, -radius * .78, radius * .74, -radius * .82);
    ctx.moveTo(radius * .88, -radius * .34); ctx.quadraticCurveTo(radius * 1.04, -radius * .67, radius * 1.19, -radius * .63); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    const y = screenY(e.y) + Math.sin(e.phase * 2) * 4;
    if (y < -60 || y > height + 60) return;
    ctx.save(); ctx.translate(e.x, y);
    if (e.type === 'moth') {
      const wing = .6 + Math.abs(Math.sin(elapsed * 13 + e.phase)) * .55;
      ctx.shadowColor = 'rgba(220,161,255,.5)'; ctx.shadowBlur = 17;
      ctx.fillStyle = '#d8b3e4';
      ctx.beginPath(); ctx.ellipse(-8, -3, 10 * wing, 6, -.55, 0, Math.PI * 2); ctx.ellipse(8, -3, 10 * wing, 6, .55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1dff4'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#593f6c'; ctx.beginPath(); ctx.arc(-1.2, -1, .8, 0, Math.PI * 2); ctx.arc(1.2, -1, .8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e4c4ec'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, -7); ctx.quadraticCurveTo(-8, -14, -9, -12); ctx.moveTo(1, -7); ctx.quadraticCurveTo(8, -14, 9, -12); ctx.stroke();
    } else {
      ctx.shadowColor = 'rgba(255,140,110,.7)'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#ef8c73'; ctx.beginPath(); ctx.arc(0, 0, e.radius * .76, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#513941'; ctx.beginPath(); ctx.arc(-4, -1, 1.6, 0, Math.PI * 2); ctx.arc(4, -1, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,204,157,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, e.radius + 4, elapsed * 1.4, elapsed * 1.4 + Math.PI * 1.2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(1 - p.age / p.life, 0, 1);
      ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, screenY(p.y), p.size * alpha, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    for (const f of floatTexts) {
      const alpha = clamp(1 - f.age / f.life, 0, 1);
      ctx.globalAlpha = alpha; ctx.fillStyle = '#ccefff'; ctx.font = '600 10px "DM Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.value, f.x, screenY(f.y));
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayerArm(side, shoulderX, shoulderY, shoulderAngle, elbowAngle) {
    ctx.save(); ctx.translate(shoulderX, shoulderY); ctx.scale(side, 1); ctx.rotate(shoulderAngle);
    const upperSkin = ctx.createLinearGradient(0, -8, 0, 9);
    upperSkin.addColorStop(0, '#ffe0c6'); upperSkin.addColorStop(.56, '#efbea2'); upperSkin.addColorStop(1, '#cf917d');
    ctx.fillStyle = upperSkin; ctx.strokeStyle = '#c38a78'; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.bezierCurveTo(5, -9, 11, -7, 15, -4); ctx.quadraticCurveTo(17, 0, 14, 6); ctx.bezierCurveTo(9, 8, 4, 6, 0, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,241,222,.75)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(3, -5); ctx.quadraticCurveTo(9, -5, 13, -2); ctx.stroke();
    ctx.translate(14, 0); ctx.rotate(elbowAngle);
    const lowerSkin = ctx.createLinearGradient(0, -7, 0, 8);
    lowerSkin.addColorStop(0, '#ffe0c6'); lowerSkin.addColorStop(.56, '#efbea2'); lowerSkin.addColorStop(1, '#cf917d');
    ctx.fillStyle = lowerSkin; ctx.strokeStyle = '#c38a78'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.bezierCurveTo(6, -7, 11, -4, 15, -1); ctx.quadraticCurveTo(18, 2, 15, 6); ctx.bezierCurveTo(10, 8, 5, 5, 0, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, -3); ctx.quadraticCurveTo(17, -5, 20, -1); ctx.quadraticCurveTo(23, 3, 20, 7); ctx.quadraticCurveTo(16, 9, 13, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f8d9c2'; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(20, -1); ctx.lineTo(24, -3); ctx.moveTo(21, 2); ctx.lineTo(25, 1); ctx.moveTo(20, 5); ctx.lineTo(23, 6); ctx.stroke();
    ctx.restore();
  }

  function drawPlayerLeg(side, hipX, hipY, hipAngle, kneeAngle) {
    ctx.save(); ctx.translate(hipX, hipY); ctx.scale(side, 1); ctx.rotate(hipAngle);
    const thighSkin = ctx.createLinearGradient(0, 0, 12, 22);
    thighSkin.addColorStop(0, '#ffe1c8'); thighSkin.addColorStop(.62, '#edbda2'); thighSkin.addColorStop(1, '#c98d79');
    ctx.fillStyle = thighSkin; ctx.strokeStyle = '#bd8776'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.bezierCurveTo(-4, 3, 0, 10, 3, 16); ctx.quadraticCurveTo(6, 21, 12, 18); ctx.quadraticCurveTo(14, 16, 11, 10); ctx.bezierCurveTo(7, 3, 5, -2, 4, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.translate(8, 17); ctx.rotate(kneeAngle);
    const lowerSkin = ctx.createLinearGradient(0, 0, 9, 20);
    lowerSkin.addColorStop(0, '#ffe1c8'); lowerSkin.addColorStop(.62, '#edbda2'); lowerSkin.addColorStop(1, '#c98d79');
    ctx.fillStyle = lowerSkin; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.quadraticCurveTo(-5, 4, -2, 11); ctx.lineTo(-2, 16); ctx.quadraticCurveTo(2, 20, 7, 17); ctx.lineTo(8, 9); ctx.quadraticCurveTo(8, 3, 4, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fcff'; ctx.strokeStyle = '#c6d4dc'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-2, 11); ctx.quadraticCurveTo(3, 13, 8, 11); ctx.lineTo(10, 19); ctx.quadraticCurveTo(5, 22, -2, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
    const shoe = ctx.createLinearGradient(0, 18, 0, 33);
    shoe.addColorStop(0, '#fff'); shoe.addColorStop(1, '#c5d6e0');
    ctx.fillStyle = shoe; ctx.strokeStyle = '#b8cbd7'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(-2, 18); ctx.quadraticCurveTo(4, 20, 10, 19); ctx.lineTo(17, 23); ctx.quadraticCurveTo(23, 26, 21, 29); ctx.quadraticCurveTo(18, 33, 2, 32); ctx.quadraticCurveTo(-6, 31, -6, 27); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#bfcfd8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(5, 22); ctx.lineTo(13, 25); ctx.moveTo(4, 25); ctx.lineTo(12, 28); ctx.stroke();
    ctx.restore();
  }

  function drawPlayerLegs() {
    const ascent = ease01(player.vy / (physics.jump * .55));
    const descent = ease01(-player.vy / (physics.jump * .55));
    const apex = screenMode === 'playing' ? 1 - ease01(Math.abs(player.vy) / (physics.jump * .18)) : 0;
    const landing = clamp(player.squash / .34, 0, 1);
    const hipSwing = .08 * ascent + .05 * apex - .04 * descent;
    const kneeFlex = .25 * ascent + .44 * apex + .2 * landing;

    drawPlayerLeg(-1, 78, 196, hipSwing, kneeFlex);
    drawPlayerLeg(1, 102, 196, hipSwing, kneeFlex);
  }

  function drawPlayerArms() {
    const tucked = ease01(player.vy / (physics.jump * .28));
    const shoulderAngle = 1.28 * tucked;
    const elbowAngle = .12 * tucked;
    drawPlayerArm(-1, 65, 132, shoulderAngle, elbowAngle);
    drawPlayerArm(1, 115, 131, shoulderAngle, elbowAngle);
  }

  function drawPlayer() {
    const y = screenY(player.y);
    const tilt = clamp(player.vx / physics.maxSpeed, -1, 1) * .24;
    const squashX = 1 + player.squash * .24;
    const squashY = 1 - player.squash * .2;
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const alpha = (i / player.trail.length) * .17;
      ctx.globalAlpha = alpha; ctx.fillStyle = '#9ce8ff';
      ctx.beginPath(); ctx.arc(t.x, screenY(t.y) + 5, 6 * i / player.trail.length, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(player.x, y); ctx.rotate(tilt); ctx.scale(squashX, squashY);
    const visualCenterY = playerVisual.bottom - playerVisual.height * .5;
    const aura = ctx.createRadialGradient(0, visualCenterY, 3, 0, visualCenterY, playerVisual.auraRadius);
    aura.addColorStop(0, 'rgba(128,201,255,.38)'); aura.addColorStop(1, 'rgba(128,151,255,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, visualCenterY, playerVisual.auraRadius, 0, Math.PI * 2); ctx.fill();
    if (playerBodySprite.complete && playerBodySprite.naturalWidth > 0) {
      ctx.save();
      ctx.translate(-playerVisual.width * .5, playerVisual.bottom - playerVisual.height);
      ctx.scale(playerVisual.width / 180, playerVisual.height / 250);
      drawPlayerLegs();
      ctx.drawImage(playerBodySprite, 0, 0, 180, 250);
      drawPlayerArms();
      ctx.restore();
    } else if (playerSprite.complete && playerSprite.naturalWidth > 0) {
      ctx.drawImage(playerSprite, -playerVisual.width * .5, playerVisual.bottom - playerVisual.height, playerVisual.width, playerVisual.height);
    } else {
      // Keep the existing jumper visible while the local SVG finishes loading.
      ctx.fillStyle = '#91baff'; ctx.beginPath(); ctx.ellipse(-8, -12, 8, 4.2, -.68, 0, Math.PI * 2); ctx.ellipse(7, -14, 8, 4, .61, 0, Math.PI * 2); ctx.fill();
      const body = ctx.createLinearGradient(-12, -4, 12, 15);
      body.addColorStop(0, '#f5f2ff'); body.addColorStop(.42, '#c4eaff'); body.addColorStop(1, '#7786e4');
      ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(13, -9, 15, 5, 9, 13); ctx.quadraticCurveTo(0, 19, -9, 13); ctx.bezierCurveTo(-16, 4, -11, -9, 0, -10); ctx.fill();
      ctx.fillStyle = '#30345f'; ctx.beginPath(); ctx.arc(-4 + player.facing * 1.2, 4, 1.6, 0, Math.PI * 2); ctx.arc(4 + player.facing * 1.2, 4, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function idleFrame() {
    if (platformPaused || (screenMode !== 'intro' && screenMode !== 'result')) return;
    elapsed += .016;
    draw();
    animationId = requestAnimationFrame(idleFrame);
  }

  function startIdleLoop() {
    if (platformPaused || (screenMode !== 'intro' && screenMode !== 'result')) return;
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(idleFrame);
  }

  function pauseFromPlatform() {
    if (platformPaused) return;
    platformPaused = true;
    keys.clear(); pointers.clear();
    cancelAnimationFrame(animationId);
    animationId = 0;
  }

  function resumeFromPlatform() {
    if (!platformPaused) return;
    platformPaused = false;
    if (pendingStartAfterPause) {
      pendingStartAfterPause = false;
      beginGame();
      return;
    }
    lastTime = performance.now();
    if (screenMode === 'playing') animationId = requestAnimationFrame(frame);
    else startIdleLoop();
  }

  function waitForImage(image) {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }

  function renderIdle() {
    resetWorld();
    player.y = playerSpawnY + 1; player.vy = 0;
    draw();
    startIdleLoop();
  }

  function pointerDown(event) {
    if (screenMode !== 'playing') return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, event.clientX < width * .5 ? -1 : 1);
  }
  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, event.clientX < width * .5 ? -1 : 1);
  }
  function pointerUp(event) { pointers.delete(event.pointerId); }

  document.addEventListener('keydown', event => {
    const key = event.code;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Enter'].includes(key)) event.preventDefault();
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'KeyA' || key === 'KeyD') keys.add(key);
    if ((key === 'Space' || key === 'Enter') && (screenMode === 'intro' || screenMode === 'result')) startGame();
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  shell.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('restart-button').addEventListener('click', startGame);
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(shell);

  const platformReady = Promise.resolve(platform.initialize({ onPause: pauseFromPlatform, onResume: resumeFromPlatform })).catch(() => null);
  Promise.all([platformReady, Promise.all([waitForImage(playerSprite), waitForImage(playerBodySprite)])])
    .then(() => platform.ready())
    .catch(() => platform.ready());

  resize();
  renderIdle();
})();
