
"use strict";

// =====================================
// 1. HTML 요소 연결
// =====================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const targetElement = document.getElementById("target");
const levelElement = document.getElementById("level");
const coinCountElement = document.getElementById("coinCount");

const progressTrack = document.getElementById("progressTrack");
const progressFill = document.getElementById("progressFill");
const levelNotice = document.getElementById("levelNotice");

const overlay = document.getElementById("overlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const gameArea = document.getElementById("gameArea");

const recordPanel = document.getElementById("recordPanel");
const recordForm = document.getElementById("recordForm");
const recordSummary = document.getElementById("recordSummary");
const nicknameInput = document.getElementById("nickname");
const saveButton = document.getElementById("saveButton");
const recordMessage = document.getElementById("recordMessage");

const rankingBody = document.getElementById("rankingBody");
const resetRankingButton =
  document.getElementById("resetRankingButton");

// =====================================
// 2. 기본 게임 설정
// =====================================

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 290;

const TARGET_SCORE = 15;
const GRAVITY = 1700;
const JUMP_POWER = -650;

// 기존 랭킹 데이터 유지
const RANKING_KEY = "jumpTimingRankingV1";
const MAX_RANKING = 10;

// 신규 기능 설정
const MAX_JUMPS = 2;
const COIN_RADIUS = 13;

const COIN_MIN_SPAWN = 2.2;
const COIN_MAX_SPAWN = 3.3;

// =====================================
// 3. 단계별 난이도 설정
// =====================================

const LEVELS = [
  {
    level: 1,
    minScore: 0,
    speed: 270,
    width: 32,
    height: 42,
    minSpawn: 1.65,
    maxSpawn: 1.90
  },
  {
    level: 2,
    minScore: 5,
    speed: 310,
    width: 40,
    height: 50,
    minSpawn: 1.45,
    maxSpawn: 1.65
  },
  {
    level: 3,
    minScore: 10,
    speed: 350,
    width: 48,
    height: 58,
    minSpawn: 1.25,
    maxSpawn: 1.45
  }
];

// =====================================
// 4. 게임 상태
// =====================================

let gameState = "ready";

let score = 0;
let currentLevel = 1;

// 신규: 코인 획득 개수
let coinCount = 0;

let obstacles = [];
let coins = [];

let spawnTimer = 0;
let nextSpawnDelay = 1.7;

let coinSpawnTimer = 0;
let nextCoinSpawnDelay = 2.5;

let lastTime = 0;
let animationId = null;

let recordSaved = false;
let finishedResult = null;

let noticeRemaining = 0;

// =====================================
// 5. 난이도 관리
// =====================================

function getLevelByScore(value) {
  if (value >= 10) return 3;
  if (value >= 5) return 2;
  return 1;
}

function getLevelSettings() {
  return LEVELS[currentLevel - 1];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomSpawnDelay() {
  const settings = getLevelSettings();

  return randomBetween(
    settings.minSpawn,
    settings.maxSpawn
  );
}

function randomCoinSpawnDelay() {
  return randomBetween(
    COIN_MIN_SPAWN,
    COIN_MAX_SPAWN
  );
}

function changeLevel(newLevel) {
  if (newLevel === currentLevel) return;

  currentLevel = newLevel;

  spawnTimer = 0;
  nextSpawnDelay = randomSpawnDelay();

  levelNotice.textContent =
    `⭐ ${currentLevel}단계 시작!`;

  levelNotice.classList.remove("hidden");
  noticeRemaining = 1.8;

  updateUI();
}

function updateLevelNotice(deltaTime) {
  if (noticeRemaining <= 0) return;

  noticeRemaining -= deltaTime;

  if (noticeRemaining <= 0) {
    levelNotice.classList.add("hidden");
  }
}

// =====================================
// 6. 오디오 시스템
// =====================================

const AudioContextClass =
  window.AudioContext || window.webkitAudioContext;

let audioContext = null;
let activeSounds = [];

function initAudio() {
  if (!AudioContextClass) return;

  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
    } catch (error) {
      console.warn("오디오 초기화 실패:", error);
      return;
    }
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function stopAllSounds() {
  for (const sound of activeSounds) {
    try {
      sound.oscillator.onended = null;
      sound.oscillator.stop();
      sound.oscillator.disconnect();
      sound.gain.disconnect();
    } catch (error) {
      // 종료된 소리는 무시
    }
  }

  activeSounds = [];
}

function playTone(
  frequency,
  duration,
  delay = 0,
  type = "sine",
  volume = 0.12,
  endFrequency = frequency
) {
  if (
    !audioContext ||
    audioContext.state !== "running"
  ) {
    return;
  }

  try {
    const start = audioContext.currentTime + delay;
    const end = start + duration;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(
      frequency,
      start
    );

    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        end
      );
    }

    gain.gain.setValueAtTime(0.0001, start);

    gain.gain.exponentialRampToValueAtTime(
      volume,
      start + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      end
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    const sound = { oscillator, gain };
    activeSounds.push(sound);

    oscillator.onended = () => {
      activeSounds = activeSounds.filter(
        item => item !== sound
      );

      oscillator.disconnect();
      gain.disconnect();
    };

    oscillator.start(start);
    oscillator.stop(end + 0.01);

  } catch (error) {
    console.warn("효과음 재생 실패:", error);
  }
}

function playJumpSound() {
  playTone(
    330,
    0.18,
    0,
    "sine",
    0.16,
    760
  );
}

function playDoubleJumpSound() {
  playTone(
    520,
    0.20,
    0,
    "triangle",
    0.13,
    980
  );
}

function playCoinSound() {
  playTone(
    880,
    0.10,
    0,
    "sine",
    0.12
  );

  playTone(
    1320,
    0.16,
    0.10,
    "sine",
    0.12
  );
}

function playWinSound() {
  playTone(523.25, 0.16, 0, "triangle", 0.14);
  playTone(659.25, 0.16, 0.17, "triangle", 0.14);
  playTone(783.99, 0.16, 0.34, "triangle", 0.14);
  playTone(1046.5, 0.45, 0.51, "triangle", 0.16);
}

function playLoseSound() {
  playTone(392, 0.22, 0, "sawtooth", 0.07);
  playTone(293.66, 0.22, 0.23, "sawtooth", 0.07);
  playTone(196, 0.45, 0.46, "sawtooth", 0.06);
}

// =====================================
// 7. 플레이어
// =====================================

const player = {
  x: 105,
  y: GROUND_Y - 45,
  width: 36,
  height: 45,
  velocityY: 0,

  // 현재 점프 사용 횟수
  jumpCount: 0,

  isJumping: false
};

// =====================================
// 8. 2단 점프
// =====================================

function jump() {
  if (gameState !== "playing") return;

  // 최대 두 번까지만 점프 가능
  if (player.jumpCount >= MAX_JUMPS) {
    return;
  }

  player.jumpCount++;

  // 공중에서 다시 점프하면 상승 속도 재설정
  player.velocityY = JUMP_POWER;
  player.isJumping = true;

  if (player.jumpCount === 1) {
    playJumpSound();
  } else {
    playDoubleJumpSound();
  }
}

// =====================================
// 9. 장애물 생성 및 충돌
// =====================================

function createObstacle() {
  const settings = getLevelSettings();

  obstacles.push({
    x: WIDTH + 20,
    y: GROUND_Y - settings.height,

    width: settings.width,
    height: settings.height,
    speed: settings.speed,

    passed: false
  });
}

function checkCollision(a, b) {
  const margin = 5;

  return (
    a.x + margin < b.x + b.width - margin &&
    a.x + a.width - margin > b.x + margin &&
    a.y + margin < b.y + b.height - margin &&
    a.y + a.height - margin > b.y + margin
  );
}

// =====================================
// 10. 코인 생성 및 수집
// =====================================

function createCoin() {
  const settings = getLevelSettings();

  // 점프로 획득할 수 있는 높이
  const coinY = randomBetween(178, 205);

  coins.push({
    x: WIDTH + 30,
    y: coinY,
    radius: COIN_RADIUS,

    // 현재 단계 속도와 유사하게 이동
    speed: settings.speed,

    collected: false,

    // 회전처럼 보이는 애니메이션용
    animation: Math.random() * Math.PI * 2
  });
}

function checkCoinCollision(coin) {
  // 원형 코인과 사각형 캐릭터의 충돌 판정
  const nearestX = Math.max(
    player.x,
    Math.min(
      coin.x,
      player.x + player.width
    )
  );

  const nearestY = Math.max(
    player.y,
    Math.min(
      coin.y,
      player.y + player.height
    )
  );

  const dx = coin.x - nearestX;
  const dy = coin.y - nearestY;

  return (
    dx * dx + dy * dy <=
    coin.radius * coin.radius
  );
}

function updateCoins(deltaTime) {
  coinSpawnTimer += deltaTime;

  if (coinSpawnTimer >= nextCoinSpawnDelay) {
    createCoin();

    coinSpawnTimer = 0;
    nextCoinSpawnDelay = randomCoinSpawnDelay();
  }

  for (const coin of coins) {
    coin.x -= coin.speed * deltaTime;
    coin.animation += deltaTime * 7;

    if (
      !coin.collected &&
      checkCoinCollision(coin)
    ) {
      coin.collected = true;
      coinCount++;

      playCoinSound();
      updateUI();
    }
  }

  coins = coins.filter(
    coin =>
      !coin.collected &&
      coin.x + coin.radius > -20
  );
}

// =====================================
// 11. 랭킹 불러오기
// =====================================

function sortRankings(rankings) {
  return rankings.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.playedAt - b.playedAt;
  });
}

function loadRanking() {
  try {
    const saved = localStorage.getItem(RANKING_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return sortRankings(
      parsed.filter(item =>
        item &&
        typeof item.nickname === "string" &&
        Number.isInteger(item.score) &&
        item.score >= 0 &&
        item.score <= TARGET_SCORE &&
        (
          item.result === "win" ||
          item.result === "lose"
        )
      )
    ).slice(0, MAX_RANKING);

  } catch (error) {
    console.warn("랭킹 불러오기 실패:", error);
    return [];
  }
}

function saveRanking(rankings) {
  try {
    localStorage.setItem(
      RANKING_KEY,
      JSON.stringify(rankings)
    );

    return true;
  } catch (error) {
    console.warn("랭킹 저장 실패:", error);
    return false;
  }
}

// =====================================
// 12. 랭킹 표시
// =====================================

function renderRanking() {
  const rankings = loadRanking();

  rankingBody.replaceChildren();

  if (rankings.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent =
      "아직 등록된 기록이 없습니다. 첫 기록을 남겨보세요!";

    row.appendChild(cell);
    rankingBody.appendChild(row);
    return;
  }

  rankings.forEach((item, index) => {
    const row = document.createElement("tr");

    const rankCell = document.createElement("td");
    const nameCell = document.createElement("td");
    const scoreCell = document.createElement("td");
    const resultCell = document.createElement("td");

    rankCell.textContent =
      ["🥇", "🥈", "🥉"][index] ||
      `${index + 1}위`;

    nameCell.textContent = item.nickname;
    scoreCell.textContent = `${item.score}점`;

    resultCell.textContent =
      item.result === "win" ? "승리" : "패배";

    row.append(
      rankCell,
      nameCell,
      scoreCell,
      resultCell
    );

    rankingBody.appendChild(row);
  });
}

// =====================================
// 13. 기록 등록
// =====================================

function registerRecord(event) {
  event.preventDefault();

  if (
    gameState !== "win" &&
    gameState !== "lose"
  ) {
    return;
  }

  if (recordSaved) return;

  const nickname = nicknameInput.value.trim();

  if (
    nickname.length < 1 ||
    nickname.length > 10
  ) {
    recordMessage.textContent =
      "닉네임을 1~10자로 입력해 주세요.";
    return;
  }

  const rankings = loadRanking();

  const newRecord = {
    nickname,
    score,
    result: finishedResult,
    playedAt: Date.now()
  };

  rankings.push(newRecord);
  sortRankings(rankings);

  const top10 = rankings.slice(0, MAX_RANKING);

  if (!saveRanking(top10)) {
    recordMessage.textContent =
      "랭킹 저장에 실패했습니다.";
    return;
  }

  recordSaved = true;

  nicknameInput.disabled = true;
  saveButton.disabled = true;
  saveButton.textContent = "등록 완료";

  recordMessage.textContent =
    top10.includes(newRecord)
      ? "기록 등록 완료! TOP 10에 진입했어요."
      : "기록을 제출했지만 TOP 10에는 들지 못했어요.";

  renderRanking();
}

function resetRanking() {
  const confirmed = window.confirm(
    "이 브라우저의 랭킹 기록을 모두 삭제할까요?"
  );

  if (!confirmed) return;

  try {
    localStorage.removeItem(RANKING_KEY);
    renderRanking();
  } catch (error) {
    console.warn("랭킹 초기화 실패:", error);
    window.alert("랭킹 초기화에 실패했습니다.");
  }
}

// =====================================
// 14. 게임 초기화
// =====================================

function resetGame() {
  gameState = "ready";

  score = 0;
  currentLevel = 1;
  coinCount = 0;

  obstacles = [];
  coins = [];

  spawnTimer = 0;
  nextSpawnDelay = randomSpawnDelay();

  coinSpawnTimer = 0;
  nextCoinSpawnDelay = randomCoinSpawnDelay();

  noticeRemaining = 0;
  levelNotice.classList.add("hidden");

  player.x = 105;
  player.y = GROUND_Y - player.height;
  player.velocityY = 0;

  player.jumpCount = 0;
  player.isJumping = false;

  recordSaved = false;
  finishedResult = null;

  recordPanel.classList.add("hidden");

  recordMessage.textContent = "";
  recordSummary.textContent = "";

  nicknameInput.value = "";
  nicknameInput.disabled = false;

  saveButton.disabled = false;
  saveButton.textContent = "기록 등록";

  updateUI();
  drawGame();
}

function startGame() {
  if (gameState === "playing") return;

  initAudio();
  stopAllSounds();

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  resetGame();

  gameState = "playing";
  overlay.classList.add("hidden");

  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

// =====================================
// 15. 게임 업데이트
// =====================================

function updateGame(deltaTime) {
  // 플레이어 중력 적용
  player.velocityY += GRAVITY * deltaTime;
  player.y += player.velocityY * deltaTime;

  const groundY = GROUND_Y - player.height;

  // 착지하면 점프 횟수 초기화
  if (player.y >= groundY) {
    player.y = groundY;
    player.velocityY = 0;

    player.jumpCount = 0;
    player.isJumping = false;
  }

  // 장애물 생성
  spawnTimer += deltaTime;

  if (spawnTimer >= nextSpawnDelay) {
    createObstacle();

    spawnTimer = 0;
    nextSpawnDelay = randomSpawnDelay();
  }

  // 장애물 이동 및 충돌 검사
  for (const obstacle of obstacles) {
    obstacle.x -= obstacle.speed * deltaTime;

    if (checkCollision(player, obstacle)) {
      endGame(false);
      return;
    }

    // 장애물을 통과하면 점수 획득
    if (
      !obstacle.passed &&
      obstacle.x + obstacle.width < player.x
    ) {
      obstacle.passed = true;
      score++;

      updateUI();

      if (score >= TARGET_SCORE) {
        endGame(true);
        return;
      }

      const nextLevel = getLevelByScore(score);

      if (nextLevel !== currentLevel) {
        changeLevel(nextLevel);
      }
    }
  }

  obstacles = obstacles.filter(
    obstacle =>
      obstacle.x + obstacle.width > -20
  );

  // 신규: 코인 업데이트
  updateCoins(deltaTime);

  updateLevelNotice(deltaTime);
  updateUI();
}

// =====================================
// 16. 점수 / 레벨 / 코인 UI
// =====================================

function updateUI() {
  scoreElement.textContent = `${score}점`;

  targetElement.textContent =
    `${TARGET_SCORE}점`;

  levelElement.textContent =
    `${currentLevel}단계`;

  coinCountElement.textContent =
    `🪙 ${coinCount}개`;

  const percentage = Math.min(
    100,
    (score / TARGET_SCORE) * 100
  );

  progressFill.style.width = `${percentage}%`;

  progressTrack.setAttribute(
    "aria-valuenow",
    String(score)
  );
}

// =====================================
// 17. 배경 그리기
// =====================================

function drawCloud(x, y) {
  ctx.fillStyle = "rgba(255,255,255,0.85)";

  ctx.beginPath();
  ctx.arc(x, y, 23, 0, Math.PI * 2);
  ctx.arc(x + 25, y - 10, 29, 0, Math.PI * 2);
  ctx.arc(x + 52, y, 23, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(x, y, 52, 20);
}

function drawBackground() {
  ctx.fillStyle = "#DCEFFF";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#FFE39B";
  ctx.beginPath();
  ctx.arc(700, 70, 32, 0, Math.PI * 2);
  ctx.fill();

  drawCloud(140, 65);
  drawCloud(380, 100);
  drawCloud(570, 55);

  ctx.fillStyle = "#9FD5AE";
  ctx.fillRect(
    0,
    GROUND_Y,
    WIDTH,
    HEIGHT - GROUND_Y
  );

  ctx.fillStyle = "#72B98B";
  ctx.fillRect(0, GROUND_Y, WIDTH, 6);
}

// =====================================
// 18. 플레이어 그리기
// =====================================

function drawPlayer() {
  const x = player.x;
  const y = player.y;

  ctx.fillStyle = "#6F8EDB";

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    player.width,
    player.height,
    8
  );
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(x + 11, y + 15, 5, 0, Math.PI * 2);
  ctx.arc(x + 26, y + 15, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#263755";
  ctx.beginPath();
  ctx.arc(x + 12, y + 15, 2, 0, Math.PI * 2);
  ctx.arc(x + 27, y + 15, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#263755";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 19, y + 26, 5, 0, Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#4F6EB9";
  ctx.fillRect(x + 4, y + 39, 10, 6);
  ctx.fillRect(x + 23, y + 39, 10, 6);
}

// =====================================
// 19. 장애물 그리기
// =====================================

function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.fillStyle = "#E78083";

    ctx.beginPath();

    ctx.moveTo(
      obstacle.x,
      obstacle.y + obstacle.height
    );

    ctx.lineTo(
      obstacle.x + obstacle.width / 2,
      obstacle.y
    );

    ctx.lineTo(
      obstacle.x + obstacle.width,
      obstacle.y + obstacle.height
    );

    ctx.closePath();
    ctx.fill();
  }
}

// =====================================
// 20. 코인 그리기
// =====================================

function drawCoins() {
  for (const coin of coins) {
    ctx.save();

    // 코인 중심으로 이동
    ctx.translate(coin.x, coin.y);

    // 좌우 폭을 변화시켜 회전 느낌 구현
    const scaleX =
      0.65 + Math.abs(Math.cos(coin.animation)) * 0.35;

    ctx.scale(scaleX, 1);

    // 바깥쪽 금색 테두리
    ctx.fillStyle = "#E7A522";
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      coin.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // 안쪽 밝은 금색
    ctx.fillStyle = "#FFD75E";
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      coin.radius - 3,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // 중앙 장식
    ctx.fillStyle = "#C78A13";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", 0, 1);

    ctx.restore();
  }
}

function drawGame() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  drawBackground();
  drawCoins();
  drawPlayer();
  drawObstacles();
}

// =====================================
// 21. 승리 / 패배
// =====================================

function endGame(isWin) {
  if (gameState !== "playing") return;

  gameState = isWin ? "win" : "lose";

  finishedResult =
    isWin ? "win" : "lose";

  levelNotice.classList.add("hidden");
  noticeRemaining = 0;

  overlay.classList.remove("hidden");

  if (isWin) {
    resultTitle.textContent = "🎉 승리!";

    resultText.textContent =
      `3단계 클리어! 15점 달성! 코인 ${coinCount}개 획득!`;

    playWinSound();

  } else {
    resultTitle.textContent = "💥 게임 오버!";

    resultText.textContent =
      `${currentLevel}단계에서 종료! ${score}점 / 코인 ${coinCount}개`;

    playLoseSound();
  }

  startButton.textContent = "다시 도전하기";

  recordPanel.classList.remove("hidden");

  recordSummary.textContent =
    `최종 점수: ${score}점 / ` +
    `도달 단계: ${currentLevel}단계 / ` +
    `수집 코인: ${coinCount}개 / ` +
    `결과: ${isWin ? "승리" : "패배"}`;
}

// =====================================
// 22. 게임 루프
// =====================================

function gameLoop(currentTime) {
  if (gameState !== "playing") {
    animationId = null;
    return;
  }

  const deltaTime = Math.min(
    (currentTime - lastTime) / 1000,
    0.033
  );

  lastTime = currentTime;

  updateGame(deltaTime);
  drawGame();

  if (gameState === "playing") {
    animationId = requestAnimationFrame(gameLoop);
  } else {
    animationId = null;
  }
}

// =====================================
// 23. 키보드 조작
// =====================================

document.addEventListener("keydown", event => {
  if (event.code !== "Space") return;

  if (
    event.target instanceof HTMLElement &&
    event.target.closest(
      "input, textarea, button, select"
    )
  ) {
    return;
  }

  event.preventDefault();

  // 키를 누르고 있을 때 자동 반복 방지
  if (event.repeat) return;

  if (gameState === "playing") {
    initAudio();
    jump();
  }
});

// =====================================
// 24. 마우스 / 터치 조작
// =====================================

// pointerdown 하나로 마우스와 터치 모두 처리
// click, dblclick 이벤트를 따로 등록하지 않아
// 점프가 중복 실행되는 것을 방지함

gameArea.addEventListener("pointerdown", event => {
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button")
  ) {
    return;
  }

  if (gameState === "playing") {
    initAudio();
    jump();
  }
});

// 더블클릭으로 텍스트 선택 방지
gameArea.addEventListener("dblclick", event => {
  event.preventDefault();
});

// =====================================
// 25. 버튼 이벤트
// =====================================

startButton.addEventListener(
  "click",
  startGame
);

restartButton.addEventListener(
  "click",
  startGame
);

recordForm.addEventListener(
  "submit",
  registerRecord
);

resetRankingButton.addEventListener(
  "click",
  resetRanking
);

// 다른 탭에서 랭킹 변경 시 화면 갱신
window.addEventListener("storage", event => {
  if (event.key === RANKING_KEY) {
    renderRanking();
  }
});

// =====================================
// 26. 최초 실행
// =====================================

resetGame();
renderRanking();
