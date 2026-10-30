
"use strict";

// =====================================
// 1. HTML 요소
// =====================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const targetElement = document.getElementById("target");
const levelElement = document.getElementById("level");
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
// 2. 게임 설정
// =====================================

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 290;

const TARGET_SCORE = 15;
const GRAVITY = 1700;
const JUMP_POWER = -650;

const RANKING_KEY = "jumpTimingRankingV1";
const MAX_RANKING = 10;

// =====================================
// 3. 단계별 난이도
// =====================================

// speed: 장애물 이동 속도 (px/초)
// width: 장애물 너비
// height: 장애물 높이
// minSpawn, maxSpawn: 등장 간격 (초)

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

let gameState = "ready";
let score = 0;
let currentLevel = 1;

let obstacles = [];
let spawnTimer = 0;
let nextSpawnDelay = 1.7;

let lastTime = 0;
let animationId = null;

let recordSaved = false;
let finishedResult = null;

let noticeRemaining = 0;

// =====================================
// 4. 난이도 계산
// =====================================

function getLevelByScore(value) {
  if (value >= 10) return 3;
  if (value >= 5) return 2;
  return 1;
}

function getLevelSettings() {
  return LEVELS[currentLevel - 1];
}

function randomSpawnDelay() {
  const settings = getLevelSettings();

  return settings.minSpawn +
    Math.random() *
    (settings.maxSpawn - settings.minSpawn);
}

function changeLevel(newLevel) {
  if (newLevel === currentLevel) return;

  currentLevel = newLevel;

  // 새로운 단계의 장애물 등장 간격 적용
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
// 5. 효과음
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
      // 이미 종료된 소리는 무시
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
    console.warn("효과음 오류:", error);
  }
}

function playJumpSound() {
  playTone(330, 0.18, 0, "sine", 0.16, 760);
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
// 6. 플레이어
// =====================================

const player = {
  x: 105,
  y: GROUND_Y - 45,
  width: 36,
  height: 45,
  velocityY: 0,
  isJumping: false
};

// =====================================
// 7. 랭킹 저장 / 조회
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
      "저장 실패! 브라우저 저장소 설정을 확인해 주세요.";
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
    console.warn("랭킹 초기화 오류:", error);
    window.alert("랭킹 초기화에 실패했습니다.");
  }
}

// =====================================
// 8. 게임 초기화
// =====================================

function resetGame() {
  gameState = "ready";
  score = 0;
  currentLevel = 1;

  obstacles = [];
  spawnTimer = 0;
  nextSpawnDelay = randomSpawnDelay();

  noticeRemaining = 0;
  levelNotice.classList.add("hidden");

  player.x = 105;
  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
  player.isJumping = false;

  recordSaved = false;
  finishedResult = null;

  recordPanel.classList.add("hidden");
  recordMessage.textContent = "";
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
// 9. 점프 / 장애물
// =====================================

function jump() {
  if (
    gameState !== "playing" ||
    player.isJumping
  ) {
    return;
  }

  player.velocityY = JUMP_POWER;
  player.isJumping = true;

  playJumpSound();
}

function createObstacle() {
  const settings = getLevelSettings();

  obstacles.push({
    x: WIDTH + 20,

    // 장애물 높이에 맞춰 바닥 위치 자동 조정
    y: GROUND_Y - settings.height,

    // 현재 단계의 크기 적용
    width: settings.width,
    height: settings.height,

    // 현재 단계의 속도 적용
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
// 10. 게임 진행
// =====================================

function updateGame(deltaTime) {
  // 점프 물리
  player.velocityY += GRAVITY * deltaTime;
  player.y += player.velocityY * deltaTime;

  const groundY = GROUND_Y - player.height;

  if (player.y >= groundY) {
    player.y = groundY;
    player.velocityY = 0;
    player.isJumping = false;
  }

  // 장애물 생성
  spawnTimer += deltaTime;

  if (spawnTimer >= nextSpawnDelay) {
    createObstacle();
    spawnTimer = 0;
    nextSpawnDelay = randomSpawnDelay();
  }

  // 장애물 이동과 충돌
  for (const obstacle of obstacles) {
    obstacle.x -= obstacle.speed * deltaTime;

    if (checkCollision(player, obstacle)) {
      endGame(false);
      return;
    }

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
    obstacle => obstacle.x + obstacle.width > -20
  );

  updateLevelNotice(deltaTime);
  updateUI();
}

function updateUI() {
  scoreElement.textContent = `${score}점`;
  targetElement.textContent = `${TARGET_SCORE}점`;
  levelElement.textContent = `${currentLevel}단계`;

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
// 11. 배경 그리기
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
// 12. 플레이어 그리기
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
// 13. 장애물 그리기
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

function drawGame() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawPlayer();
  drawObstacles();
}

// =====================================
// 14. 승리 / 패배
// =====================================

function endGame(isWin) {
  if (gameState !== "playing") return;

  gameState = isWin ? "win" : "lose";
  finishedResult = isWin ? "win" : "lose";

  levelNotice.classList.add("hidden");
  noticeRemaining = 0;

  overlay.classList.remove("hidden");

  if (isWin) {
    resultTitle.textContent = "🎉 승리!";
    resultText.textContent =
      "3단계 클리어! 목표 15점 달성!";
    playWinSound();
  } else {
    resultTitle.textContent = "💥 게임 오버!";
    resultText.textContent =
      `${currentLevel}단계에서 종료! 최종 점수 ${score}점`;
    playLoseSound();
  }

  startButton.textContent = "다시 도전하기";

  recordPanel.classList.remove("hidden");

  recordSummary.textContent =
    `최종 점수: ${score}점 / 도달 단계: ${currentLevel}단계 / 결과: ${isWin ? "승리" : "패배"}`;
}

// =====================================
// 15. 게임 루프
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
// 16. 조작 및 이벤트
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

  if (event.repeat) return;

  if (gameState === "playing") {
    initAudio();
    jump();
  }
});

gameArea.addEventListener("pointerdown", event => {
  if (event.target.closest("button")) return;

  if (gameState === "playing") {
    initAudio();
    jump();
  }
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

recordForm.addEventListener("submit", registerRecord);
resetRankingButton.addEventListener("click", resetRanking);

window.addEventListener("storage", event => {
  if (event.key === RANKING_KEY) {
    renderRanking();
  }
});

// =====================================
// 17. 최초 실행
// =====================================

resetGame();
renderRanking();
