"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const timerElement = document.getElementById("timer");
const scoreElement = document.getElementById("score");
const overlay = document.getElementById("overlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const gameArea = document.getElementById("gameArea");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 290;
const GAME_TIME = 30;
const GRAVITY = 1700;
const JUMP_POWER = -650;
const OBSTACLE_SPEED = 270;

let gameState = "ready";
let remainingTime = GAME_TIME;
let score = 0;
let obstacles = [];
let spawnTimer = 0;
let nextSpawnDelay = 1.5;
let lastTime = 0;
let animationId = null;

const player = {
  x: 105,
  y: GROUND_Y - 45,
  width: 36,
  height: 45,
  velocityY: 0,
  isJumping: false
};

function resetGame() {
  gameState = "ready";
  remainingTime = GAME_TIME;
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

function startGame() {
  if (gameState === "playing") return;
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

function jump() {
  if (gameState !== "playing" || player.isJumping) return;
  player.velocityY = JUMP_POWER;
  player.isJumping = true;
}

function createObstacle() {
  obstacles.push({
    x: WIDTH + 20,
    y: GROUND_Y - 42,
    width: 32,
    height: 42,
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

function updateGame(deltaTime) {
  remainingTime -= deltaTime;
  if (remainingTime <= 0) {
    remainingTime = 0;
    updateUI();
    endGame(true);
    return;
  }

  player.velocityY += GRAVITY * deltaTime;
  player.y += player.velocityY * deltaTime;
  const groundPlayerY = GROUND_Y - player.height;
  if (player.y >= groundPlayerY) {
    player.y = groundPlayerY;
    player.velocityY = 0;
    player.isJumping = false;
  }

  spawnTimer += deltaTime;
  if (spawnTimer >= nextSpawnDelay) {
    createObstacle();
    spawnTimer = 0;
    nextSpawnDelay = 1.45 + Math.random() * 0.45;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= OBSTACLE_SPEED * deltaTime;
    if (checkCollision(player, obstacle)) {
      endGame(false);
      return;
    }
    if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
      obstacle.passed = true;
      score++;
    }
  }

  obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > -20);
  updateUI();
}

function updateUI() {
  timerElement.textContent = remainingTime.toFixed(1) + "초";
  scoreElement.textContent = score + "개";
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

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  ctx.fillStyle = "#6F8EDB";
  ctx.beginPath();
  ctx.roundRect(x, y, player.width, player.height, 8);
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

function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.fillStyle = "#E78083";
    ctx.beginPath();
    ctx.moveTo(obstacle.x, obstacle.y + obstacle.height);
    ctx.lineTo(obstacle.x + obstacle.width / 2, obstacle.y);
    ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height);
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

function endGame(isWin) {
  if (gameState !== "playing") return;
  gameState = isWin ? "win" : "lose";
  overlay.classList.remove("hidden");
  if (isWin) {
    resultTitle.textContent = "🎉 승리!";
    resultText.textContent = `30초 생존 성공! 장애물 ${score}개를 피했어요.`;
  } else {
    resultTitle.textContent = "💥 게임 오버!";
    resultText.textContent = `장애물 ${score}개를 피했어요. 다시 도전해 보세요!`;
  }
  startButton.textContent = "다시 도전하기";
}

function gameLoop(currentTime) {
  if (gameState !== "playing") {
    animationId = null;
    return;
  }
  const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.033);
  lastTime = currentTime;
  updateGame(deltaTime);
  drawGame();
  if (gameState === "playing") {
    animationId = requestAnimationFrame(gameLoop);
  } else {
    animationId = null;
  }
}

document.addEventListener("keydown", function(event) {
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    if (gameState === "playing") jump();
  }
});

gameArea.addEventListener("pointerdown", function(event) {
  if (event.target.closest("button")) return;
  if (gameState === "playing") jump();
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
resetGame();
