const TARGET_SIZE = 40;

const playArea = document.getElementById("play-area");
const countInput = document.getElementById("count-input");
const speedInput = document.getElementById("speed-input");
const lifetimeInput = document.getElementById("lifetime-input");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const scoreValue = document.getElementById("score-value");
const statusText = document.getElementById("status-text");

const state = {
  running: false,
  targets: new Map(),
  frameId: null,
  lastTimestamp: null,
  score: 0,
  desiredCount: 3,
  speed: 200,
  lifetimeSeconds: 2,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateScoreDisplay() {
  scoreValue.textContent = String(state.score);
}

function updateStatus(message) {
  statusText.textContent = message;
}

function readSettings() {
  const count = clamp(Number(countInput.value) || 1, Number(countInput.min), Number(countInput.max));
  const speed = clamp(Number(speedInput.value) || 10, Number(speedInput.min), Number(speedInput.max));
  const lifetime = clamp(Number(lifetimeInput.value) || 0.5, Number(lifetimeInput.min), Number(lifetimeInput.max));
  return { count, speed, lifetime };
}

function applySettings(settings) {
  state.desiredCount = settings.count;
  state.speed = settings.speed;
  state.lifetimeSeconds = settings.lifetime;
}

function startGame() {
  const settings = readSettings();
  countInput.value = String(settings.count);
  speedInput.value = String(settings.speed);
  lifetimeInput.value = String(settings.lifetime);

  if (state.running) {
    stopGame(false);
  }

  state.score = 0;
  updateScoreDisplay();
  applySettings(settings);

  state.running = true;
  state.lastTimestamp = null;
  updateStatus("训练进行中，尽可能多地点击小圆！");

  ensureTargetCount();
  state.frameId = requestAnimationFrame(animationLoop);
}

function stopGame(showSummary = true) {
  if (!state.running) {
    return;
  }

  state.running = false;
  if (state.frameId !== null) {
    cancelAnimationFrame(state.frameId);
    state.frameId = null;
  }
  state.targets.forEach((_, element) => {
    element.remove();
  });
  state.targets.clear();

  if (showSummary) {
    updateStatus(`训练已停止，总得分：${state.score}。`);
  }
}

function ensureTargetCount() {
  if (!state.running) {
    return;
  }
  const width = playArea.clientWidth;
  const height = playArea.clientHeight;
  if (!width || !height) {
    return;
  }
  while (state.targets.size < state.desiredCount) {
    spawnTarget(width, height);
  }
  if (state.targets.size > state.desiredCount) {
    const excess = state.targets.size - state.desiredCount;
    const toRemove = Array.from(state.targets.keys()).slice(0, excess);
    toRemove.forEach((element) => removeTarget(element, false));
  }
}

function spawnTarget(areaWidth, areaHeight) {
  const element = document.createElement("div");
  element.className = "target";

  const maxX = Math.max(0, areaWidth - TARGET_SIZE);
  const maxY = Math.max(0, areaHeight - TARGET_SIZE);
  const x = Math.random() * maxX;
  const y = Math.random() * maxY;
  const angle = Math.random() * Math.PI * 2;
  const speed = state.speed;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;

  playArea.appendChild(element);

  const targetData = {
    x,
    y,
    vx,
    vy,
    createdAt: performance.now(),
    lifetime: state.lifetimeSeconds * 1000,
  };

  state.targets.set(element, targetData);

  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!state.running || !state.targets.has(element)) {
      return;
    }
    state.score += 1;
    updateScoreDisplay();
    updateStatus("好样的！继续点击目标。");
    removeTarget(element, true);
  });
}

function removeTarget(element, shouldRespawn) {
  const targetData = state.targets.get(element);
  if (!targetData) {
    return;
  }

  element.remove();
  state.targets.delete(element);

  if (state.running && shouldRespawn) {
    ensureTargetCount();
  }
}

function animationLoop(timestamp) {
  if (!state.running) {
    return;
  }

  if (state.lastTimestamp === null) {
    state.lastTimestamp = timestamp;
  }
  const delta = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;

  const width = playArea.clientWidth;
  const height = playArea.clientHeight;
  const now = performance.now();

  const expired = [];

  state.targets.forEach((data, element) => {
    data.x += data.vx * delta;
    data.y += data.vy * delta;

    if (data.x <= 0 && data.vx < 0) {
      data.x = 0;
      data.vx *= -1;
    }
    if (data.x >= width - TARGET_SIZE && data.vx > 0) {
      data.x = width - TARGET_SIZE;
      data.vx *= -1;
    }
    if (data.y <= 0 && data.vy < 0) {
      data.y = 0;
      data.vy *= -1;
    }
    if (data.y >= height - TARGET_SIZE && data.vy > 0) {
      data.y = height - TARGET_SIZE;
      data.vy *= -1;
    }

    element.style.left = `${data.x}px`;
    element.style.top = `${data.y}px`;

    if (now - data.createdAt >= data.lifetime) {
      expired.push(element);
    }
  });

  expired.forEach((element) => removeTarget(element, true));
  ensureTargetCount();

  state.frameId = requestAnimationFrame(animationLoop);
}

startButton.addEventListener("click", () => {
  startGame();
});

stopButton.addEventListener("click", () => {
  stopGame(true);
});

[countInput, speedInput, lifetimeInput].forEach((input) => {
  input.addEventListener("change", () => {
    const settings = readSettings();
    countInput.value = String(settings.count);
    speedInput.value = String(settings.speed);
    lifetimeInput.value = String(settings.lifetime);
    applySettings(settings);
    if (state.running) {
      const now = performance.now();
      state.targets.forEach((data) => {
        const angle = Math.atan2(data.vy, data.vx);
        data.vx = Math.cos(angle) * state.speed;
        data.vy = Math.sin(angle) * state.speed;
        data.createdAt = now;
        data.lifetime = state.lifetimeSeconds * 1000;
      });
      ensureTargetCount();
      updateStatus("参数已更新，继续加油！");
    }
  });
});

updateStatus("点击“开始训练”开始游戏。");
