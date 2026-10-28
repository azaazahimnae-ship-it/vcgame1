
"use strict";

// =====================================
// 1. HTML 요소 가져오기
// =====================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const targetElement = document.getElementById("target");

const overlay = document.getElementById("overlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const gameArea = document.getElementById("gameArea");

// =====================================
// 2. 게임 기본 설정
// =====================================

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const GROUND_Y = 290;
const TARGET_SCORE = 15;

const GRAVITY = 1700;
const JUMP_POWER = -650;
const OBSTACLE_SPEED = 270;

let gameState = "ready";
let score = 0;

let obstacles = [];
let spawnTimer = 0;
let nextSpawnDelay = 1.5;

let lastTime = 0;
let animationId = null;

// =====================================
// 3. 오디오 설정
// =====================================

const AudioContextClass =
  window.AudioContext || window.webkitAudioContext;

let audioContext = null;

// 게임 재시작 시 이전 엔딩 사운드를 정지하기 위한 목록
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
    audioContext.resume().catch(error => {
      console.warn("오디오 활성화 실패:", error);
    });
  }
}

// =====================================
// 4. 공통 효과음 생성 함수
// =====================================

// frequency: 음높이
// duration: 소리 길이
// startDelay: 재생 시작 지연
// type: 파형 종류
// volume: 볼륨

function playTone(
  frequency,
  duration,
  startDelay = 0,
  type = "sine",
  volume = 0.12
) {
  if (!audioContext) return;
  if (audioContext.state !== "running") return;

  try {
    const now = audioContext.currentTime;
    const startTime = now + startDelay;
    const endTime = startTime + duration;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      frequency,
      startTime
    );

    // 부드러운 시작과 종료
    gainNode.gain.setValueAtTime(0.0001, startTime);

    gainNode.gain.exponentialRampToValueAtTime(
      volume,
      startTime + 0.01
    );

    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      endTime
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const sound = {
      oscillator,
      gainNode
    };

    activeSounds.push(sound);

    oscillator.onended = function() {
      activeSounds = activeSounds.filter(
        item => item !== sound
      );

      oscillator.disconnect();
      gainNode.disconnect();
    };

    oscillator.start(startTime);
    oscillator.stop(endTime + 0.01);

  } catch (error) {
    console.warn("효과음 재생 실패:", error);
  }
}

// =====================================
// 5. 재생 중인 효과음 정지
// =====================================

function stopAllSounds() {
  for (const sound of activeSounds) {
    try {
      sound.oscillator.onended = null;
      sound.oscillator.stop();
      sound.oscillator.disconnect();
      sound.gainNode.disconnect();
    } catch (error) {
      // 이미 종료된 사운드는 무시
    }
  }

  activeSounds = [];
}

// =====================================
// 6. 점프 효과음
// =====================================

function playJumpSound() {
  if (!audioContext) return;
  if (audioContext.state !== "running") return;

  try {
    const now = audioContext.currentTime;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";

    // 낮은 음에서 높은 음으로 변화
    oscillator.frequency.setValueAtTime(330, now);

    oscillator.frequency.exponentialRampToValueAtTime(
      760,
      now + 0.14
    );

    gainNode.gain.setValueAtTime(0.0001, now);

    gainNode.gain.exponentialRampToValueAtTime(
      0.16,
      now + 0.015
    );

    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.18
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const sound = {
      oscillator,
      gainNode
    };

    activeSounds.push(sound);

    oscillator.onended = function() {
      activeSounds = activeSounds.filter(
        item => item !== sound
      );

      oscillator.disconnect();
      gainNode.disconnect();
    };

    oscillator.start(now);
    oscillator.stop(now + 0.19);

  } catch (error) {
    console.warn("점프 효과음 재생 실패:", error);
  }
}

// =====================================
// 7. 승리 효과음
// =====================================

function playWinSound() {
  // 밝고 경쾌한 4음 팡파르
  playTone(523.25, 0.16, 0.00, "triangle", 0.14);
  playTone(659.25, 0.16, 0.17, "triangle", 0.14);
  playTone(783.99, 0.16, 0.34, "triangle", 0.14);
  playTone(1046.50, 0.45, 0.51, "triangle", 0.16);
}

// =====================================
// 8. 패배 효과음
// =====================================

function playLoseSound() {
  // 낮아지는 3음 게임 오버 사운드
  playTone(392.00, 0.22, 0.00, "sawtooth", 0.07);
  playTone(293.66, 0.22, 0.23, "sawtooth", 0.07);
  playTone(196.00, 0.45, 0.46, "sawtooth", 0.06);
}

// =====================================
// 9. 플레이어 설정
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
// 10. 게임 초기화
// =====================================

function resetGame() {
  gameState = "ready";

  score = 0;
  obstacles = [];

  spawnTimer = 0;
  nextSpawnDelay = 1.5;

  player.x = 105;
  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
  player.isJumping = false;

  updateUI();
  drawGame();
}

// =====================================
// 11. 게임 시작
// =====================================

function startGame() {
  if (gameState === "playing") return;

  initAudio();

  // 이전 엔딩 효과음이 남아 있으면 정지
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
// 12. 점프 기능
// =====================================

function jump() {
  if (gameState !== "playing") return;

  if (player.isJumping) return;

  player.velocityY = JUMP_POWER;
  player.isJumping = true;

  playJumpSound();
}

// =====================================
// 13. 장애물 생성
// =====================================

function createObstacle() {
  obstacles.push({
    x: WIDTH + 20,
    y: GROUND_Y - 42,
    width: 32,
    height: 42,
    passed: false
  });
}

// =====================================
// 14. 충돌 판정
// =====================================

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
// 15. 게임 상태 업데이트
// =====================================

function updateGame(deltaTime) {

  // 점프 물리 처리
  player.velocityY += GRAVITY * deltaTime;
  player.y += player.velocityY * deltaTime;

  const groundPlayerY = GROUND_Y - player.height;

  if (player.y >= groundPlayerY) {
    player.y = groundPlayerY;
    player.velocityY = 0;
    player.isJumping = false;
  }

  // 장애물 생성
  spawnTimer += deltaTime;

  if (spawnTimer >= nextSpawnDelay) {
    createObstacle();

    spawnTimer = 0;
    nextSpawnDelay = 1.45 + Math.random() * 0.45;
  }

  // 장애물 이동
  for (const obstacle of obstacles) {
    obstacle.x -= OBSTACLE_SPEED * deltaTime;

    // 충돌 시 패배
    if (checkCollision(player, obstacle)) {
      endGame(false);
      return;
    }

    // 장애물 통과 시 점수 증가
    if (
      !obstacle.passed &&
      obstacle.x + obstacle.width < player.x
    ) {
      obstacle.passed = true;
      score++;

      updateUI();

      // 목표 점수 달성 시 승리
      if (score >= TARGET_SCORE) {
        endGame(true);
        return;
      }
    }
  }

  obstacles = obstacles.filter(
    obstacle => obstacle.x + obstacle.width > -20
  );

  updateUI();
}

// =====================================
// 16. UI 업데이트
// =====================================

function updateUI() {
  scoreElement.textContent = score + "점";
  targetElement.textContent = TARGET_SCORE + "점";
}

// =====================================
// 17. 배경 그리기
// =====================================

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
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

  ctx.fillStyle = "#72B98B";
  ctx.fillRect(0, GROUND_Y, WIDTH, 6);
}

function drawCloud(x, y) {
  ctx.fillStyle = "rgba(255,255,255,0.85)";

  ctx.beginPath();
  ctx.arc(x, y, 23, 0, Math.PI * 2);
  ctx.arc(x + 25, y - 10, 29, 0, Math.PI * 2);
  ctx.arc(x + 52, y, 23, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(x, y, 52, 20);
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
// 20. 전체 화면 그리기
// =====================================

function drawGame() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  drawBackground();
  drawPlayer();
  drawObstacles();
}

// =====================================
// 21. 승리 / 패배 처리
// =====================================

function endGame(isWin) {
  if (gameState !== "playing") return;

  gameState = isWin ? "win" : "lose";

  overlay.classList.remove("hidden");

  if (isWin) {
    resultTitle.textContent = "🎉 승리!";
    resultText.textContent =
      `목표 ${TARGET_SCORE}점 달성! 장애물 ${score}개를 피했어요.`;

    // 승리 효과음
    playWinSound();

  } else {
    resultTitle.textContent = "💥 게임 오버!";
    resultText.textContent =
      `장애물 ${score}개를 피했어요. 다시 도전해 보세요!`;

    // 패배 효과음
    playLoseSound();
  }

  startButton.textContent = "다시 도전하기";
}

// =====================================
// 22. 게임 반복 실행
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

document.addEventListener("keydown", function(event) {
  if (event.code === "Space") {
    event.preventDefault();

    if (event.repeat) return;

    if (gameState === "playing") {
      initAudio();
      jump();
    }
  }
});

// =====================================
// 24. 마우스 / 모바일 조작
// =====================================

gameArea.addEventListener("pointerdown", function(event) {
  if (event.target.closest("button")) return;

  if (gameState === "playing") {
    initAudio();
    jump();
  }
});

// =====================================
// 25. 버튼 이벤트
// =====================================

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

// =====================================
// 26. 최초 실행
// =====================================

resetGame();
