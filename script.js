const CONFIG_PATH = "config.json";
const DEFAULT_TARGET_COUNT = 3;
const FIGURE_HEIGHT_RATIO = 1.8;
const DEFAULT_SCORES = {
  head: 3,
  body: 2,
  four: 1,
};
const SCORE_LABELS = {
  head: "头部",
  body: "躯干",
  four: "四肢",
};

const playArea = document.getElementById("play-area");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const scoreValue = document.getElementById("score-value");
const statusText = document.getElementById("status-text");
const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');

startButton.disabled = true;

const state = {
  running: false,
  targets: new Map(),
  frameId: null,
  lastTimestamp: null,
  score: 0,
  desiredCount: DEFAULT_TARGET_COUNT,
  speed: 200,
  lifetimeSeconds: 2,
  targetSize: 60,
  targetHeight: Math.round(60 * FIGURE_HEIGHT_RATIO),
  scores: { ...DEFAULT_SCORES },
  config: {},
  currentDifficulty: "simple",
  configLoaded: false,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDifficultyLabel(key) {
  const entry = state.config[key];
  if (entry && entry.label) {
    return entry.label;
  }
  return key;
}

function updateScoreDisplay() {
  scoreValue.textContent = String(state.score);
}

function updateStatus(message) {
  statusText.textContent = message;
}

function setDifficulty(difficultyKey) {
  const configEntry = state.config[difficultyKey];
  if (!configEntry) {
    return false;
  }

  state.currentDifficulty = difficultyKey;
  state.speed = Number(configEntry.speed) || state.speed;
  state.lifetimeSeconds = Number(configEntry.lifetime) || state.lifetimeSeconds;

  const sizeValue = Number(configEntry.size);
  if (Number.isFinite(sizeValue) && sizeValue > 0) {
    state.targetSize = sizeValue;
  }
  state.targetHeight = Math.round(state.targetSize * FIGURE_HEIGHT_RATIO);

  const mergedScores = {
    ...DEFAULT_SCORES,
    ...(configEntry.scores || {}),
  };
  const headScore = Number(mergedScores.head);
  const bodyScore = Number(mergedScores.body);
  const limbScore = Number(mergedScores.four);
  state.scores = {
    head: Number.isFinite(headScore) ? headScore : DEFAULT_SCORES.head,
    body: Number.isFinite(bodyScore) ? bodyScore : DEFAULT_SCORES.body,
    four: Number.isFinite(limbScore) ? limbScore : DEFAULT_SCORES.four,
  };
  const countValue = Number(configEntry.count);
  state.desiredCount = Number.isFinite(countValue) && countValue > 0 ? countValue : DEFAULT_TARGET_COUNT;

  document.documentElement.style.setProperty("--target-width", `${state.targetSize}px`);
  document.documentElement.style.setProperty("--target-height", `${state.targetHeight}px`);

  if (state.running) {
    const now = performance.now();
    const width = playArea.clientWidth;
    const height = playArea.clientHeight;
    state.targets.forEach((data, element) => {
      const angle = Math.atan2(data.vy, data.vx) || 0;
      data.vx = Math.cos(angle) * state.speed;
      data.vy = Math.sin(angle) * state.speed;
      data.createdAt = now;
      data.lifetime = state.lifetimeSeconds * 1000;
      data.width = state.targetSize;
      data.height = state.targetHeight;
      element.style.width = `${state.targetSize}px`;
      element.style.height = `${state.targetHeight}px`;
      data.x = clamp(data.x, 0, Math.max(0, width - data.width));
      data.y = clamp(data.y, 0, Math.max(0, height - data.height));
      element.style.left = `${data.x}px`;
      element.style.top = `${data.y}px`;
    });
    ensureTargetCount();
  }

  difficultyRadios.forEach((radio) => {
    radio.checked = radio.value === difficultyKey;
  });

  return true;
}

function getScoreForPart(partKey) {
  const value = Number(state.scores?.[partKey]);
  return Number.isFinite(value) ? value : 0;
}

function getPartLabel(partKey) {
  return SCORE_LABELS[partKey] || partKey;
}

function handleTargetHit(element, partKey) {
  if (!state.running || !state.targets.has(element)) {
    return;
  }

  const scoreValue = getScoreForPart(partKey);
  state.score += scoreValue;
  updateScoreDisplay();
  const deltaText = scoreValue >= 0 ? `+${scoreValue}` : `${scoreValue}`;
  updateStatus(`击中了${getPartLabel(partKey)}！${deltaText}分。`);
  removeTarget(element, true);
}

function createTargetFigure(element) {
  const parts = [
    { className: "target-part target-head", key: "head" },
    { className: "target-part target-body", key: "body" },
    { className: "target-part target-limb target-arm target-arm-left", key: "four" },
    { className: "target-part target-limb target-arm target-arm-right", key: "four" },
    { className: "target-part target-limb target-leg target-leg-left", key: "four" },
    { className: "target-part target-limb target-leg target-leg-right", key: "four" },
  ];

  parts.forEach((part) => {
    const partElement = document.createElement("div");
    partElement.className = part.className;
    partElement.dataset.part = part.key;
    partElement.addEventListener("click", (event) => {
      event.stopPropagation();
      handleTargetHit(element, part.key);
    });
    element.appendChild(partElement);
  });
}

function startGame() {
  if (!state.configLoaded) {
    updateStatus("配置尚未加载完成，请稍后再试。");
    return;
  }

  if (state.running) {
    stopGame(false);
  }

  state.score = 0;
  updateScoreDisplay();

  state.running = true;
  state.lastTimestamp = null;
  updateStatus(`当前难度：${getDifficultyLabel(state.currentDifficulty)}，尽可能多地点击人形目标！`);

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

  const width = state.targetSize;
  const height = state.targetHeight;
  const maxX = Math.max(0, areaWidth - width);
  const maxY = Math.max(0, areaHeight - height);
  const x = Math.random() * maxX;
  const y = Math.random() * maxY;
  const angle = Math.random() * Math.PI * 2;
  const speed = state.speed;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;

  createTargetFigure(element);
  playArea.appendChild(element);

  const targetData = {
    x,
    y,
    vx,
    vy,
    createdAt: performance.now(),
    lifetime: state.lifetimeSeconds * 1000,
    width,
    height,
  };

  state.targets.set(element, targetData);
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
    const targetWidth = data.width ?? state.targetSize;
    const targetHeight = data.height ?? state.targetHeight;
    data.width = targetWidth;
    data.height = targetHeight;
    data.x += data.vx * delta;
    data.y += data.vy * delta;

    if (data.x <= 0 && data.vx < 0) {
      data.x = 0;
      data.vx *= -1;
    }
    if (data.x >= width - targetWidth && data.vx > 0) {
      data.x = width - targetWidth;
      data.vx *= -1;
    }
    if (data.y <= 0 && data.vy < 0) {
      data.y = 0;
      data.vy *= -1;
    }
    if (data.y >= height - targetHeight && data.vy > 0) {
      data.y = height - targetHeight;
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

async function initialize() {
  try {
    const response = await fetch(CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`加载配置失败：${response.status}`);
    }
    const config = await response.json();
    state.config = config;
    if (!config[state.currentDifficulty]) {
      const firstKey = Object.keys(config)[0];
      if (firstKey) {
        state.currentDifficulty = firstKey;
      }
    }
    state.configLoaded = true;
    setDifficulty(state.currentDifficulty);
    startButton.disabled = false;
    updateStatus(`配置已加载，当前难度：${getDifficultyLabel(state.currentDifficulty)}。`);
  } catch (error) {
    console.error(error);
    updateStatus("配置加载失败，请刷新页面重试。");
    startButton.disabled = true;
  }
}

startButton.addEventListener("click", () => {
  startGame();
});

stopButton.addEventListener("click", () => {
  stopGame(true);
});

difficultyRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    if (!state.configLoaded) {
      updateStatus("配置尚未加载完成，请稍后再试。");
      difficultyRadios.forEach((other) => {
        other.checked = other.value === state.currentDifficulty;
      });
      return;
    }
    const changed = setDifficulty(radio.value);
    if (!changed) {
      return;
    }
    if (state.running) {
      updateStatus(`已切换到${getDifficultyLabel(radio.value)}难度，继续加油！`);
    } else {
      updateStatus(`已选择${getDifficultyLabel(radio.value)}难度，点击“开始训练”开始游戏。`);
    }
  });
});

updateScoreDisplay();
initialize();
