(() => {
  "use strict";

  const GEN_RANGES = {
    1: [1, 151],
    2: [152, 251],
    3: [252, 386],
    all: [1, 1025],
  };

  const DIFF_LABELS = { easy: "쉬움", normal: "보통", hard: "어려움" };
  const DIFF_MULTIPLIERS = { easy: 1, normal: 1.5, hard: 2 };
  const GEN_LABELS = { 1: "1세대", 2: "2세대", 3: "3세대", all: "전체" };
  const LEVEL_MODES = ["easy", "normal", "hard"];
  const LEVEL_GENS = ["1", "2", "3", "all"];
  const QUESTIONS_PER_LEVEL = 10;
  const SHARE_URL = "https://myoriginallife.github.io/pokemonrandom/";

  const LIVES_MAX = 3;
  const BASE_SCORE = 10;
  const STREAK_BONUS = 5;
  const LEVEL_BONUS_RATE = 0.15;
  const ANSWER_DELAY = 1200;
  const LEVELUP_DELAY = 2200;
  const STORAGE_KEY_SCORE = "pokemon-guess-best";
  const STORAGE_KEY_LEVEL = "pokemon-guess-best-level";
  const LEGACY_STORAGE_KEY = "pokemon-guess-best";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    start: $("#start-screen"),
    loading: $("#loading-screen"),
    game: $("#game-screen"),
    gameover: $("#gameover-screen"),
  };

  const els = {
    startBtn: $("#start-btn"),
    retryBtn: $("#retry-btn"),
    menuBtn: $("#menu-btn"),
    loadingText: $("#loading-text"),
    score: $("#score"),
    level: $("#level"),
    streak: $("#streak"),
    lives: $("#lives"),
    levelFill: $("#level-fill"),
    levelCount: $("#level-count"),
    pokemonImage: $("#pokemon-image"),
    pokemonImageWrap: $("#pokemon-image-wrap"),
    pokemonNumber: $("#pokemon-number"),
    imageLoader: $("#image-loader"),
    imageFallback: $("#image-fallback"),
    retryImageBtn: $("#retry-image-btn"),
    choices: $("#choices"),
    feedback: $("#feedback"),
    feedbackText: $("#feedback-text"),
    finalScore: $("#final-score"),
    finalLevel: $("#final-level"),
    finalCorrect: $("#final-correct"),
    finalStreak: $("#final-streak"),
    newRecord: $("#new-record"),
    bestScore: $("#best-score"),
    bestLevel: $("#best-level"),
    levelupOverlay: $("#levelup-overlay"),
    levelupNum: $("#levelup-num"),
    shareBtn: $("#share-btn"),
    shareModal: $("#share-modal"),
    sharePreview: $("#share-preview"),
    shareConfirmBtn: $("#share-confirm-btn"),
    shareDownloadBtn: $("#share-download-btn"),
    shareCloseBtn: $("#share-close-btn"),
    shareCanvas: $("#share-canvas"),
  };

  let level = 1;
  let levelCorrect = 0;
  let maxLevel = 1;
  let difficulty = "easy";
  let generation = "1";
  let pokemonPool = [];
  let nameCache = {};
  let namesData = null;
  let imageLoadToken = 0;
  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let correctCount = 0;
  let lives = LIVES_MAX;
  let currentPokemon = null;
  let answering = false;
  let lastResult = null;
  let shareBlob = null;
  let currentImageId = null;

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    document.body.classList.toggle("in-game", name === "game");
  }

  function getLevelConfig(lv) {
    const idx = lv - 1;
    const cycle = Math.floor(idx / 12);
    return {
      level: lv,
      generation: LEVEL_GENS[Math.floor(idx / 3) % LEVEL_GENS.length],
      difficulty: LEVEL_MODES[idx % LEVEL_MODES.length],
      questionsRequired: QUESTIONS_PER_LEVEL + cycle * 5,
      levelMultiplier: 1 + (lv - 1) * LEVEL_BONUS_RATE,
    };
  }

  function applyLevelConfig() {
    const cfg = getLevelConfig(level);
    difficulty = cfg.difficulty;
    generation = cfg.generation;
    pokemonPool = buildPool(generation);
    els.level.textContent = level;
    updateLevelProgress();
    applyDifficultyVisuals();
  }

  function updateLevelProgress() {
    const cfg = getLevelConfig(level);
    const pct = Math.min(100, (levelCorrect / cfg.questionsRequired) * 100);
    els.levelFill.style.width = `${pct}%`;
    els.levelCount.textContent = `${levelCorrect} / ${cfg.questionsRequired}`;
  }

  function getBestScore() {
    return parseInt(localStorage.getItem(STORAGE_KEY_SCORE) || "0", 10);
  }

  function getBestLevel() {
    return parseInt(localStorage.getItem(STORAGE_KEY_LEVEL) || "1", 10);
  }

  function saveBestScore(val) {
    localStorage.setItem(STORAGE_KEY_SCORE, String(val));
  }

  function saveBestLevel(val) {
    localStorage.setItem(STORAGE_KEY_LEVEL, String(val));
  }

  function migrateLegacyBest() {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && !localStorage.getItem(STORAGE_KEY_SCORE)) {
      localStorage.setItem(STORAGE_KEY_SCORE, legacy);
    }
  }

  function updateBestDisplay() {
    els.bestScore.textContent = getBestScore();
    els.bestLevel.textContent = getBestLevel();
  }

  function calcPoints(streakCount) {
    const cfg = getLevelConfig(level);
    const base = BASE_SCORE + (streakCount - 1) * STREAK_BONUS;
    return Math.round(base * DIFF_MULTIPLIERS[cfg.difficulty] * cfg.levelMultiplier);
  }

  function buildPool(gen) {
    const [start, end] = GEN_RANGES[gen];
    const pool = [];
    for (let i = start; i <= end; i++) pool.push(i);
    return pool;
  }

  async function loadNamesData() {
    if (namesData) return namesData;
    try {
      const res = await fetch(`names-ko.json?v=6`);
      namesData = await res.json();
    } catch {
      namesData = {};
    }
    return namesData;
  }

  function getKoreanName(id) {
    if (nameCache[id]) return nameCache[id];
    const name = namesData?.[String(id)] || `포켓몬 #${id}`;
    nameCache[id] = name;
    return name;
  }

  const IMAGE_ATTEMPT_MS = 1500;

  function getImageUrls(id) {
    return [
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
      `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${id}.png`,
    ];
  }

  function showImageFallback(show) {
    els.imageFallback.classList.toggle("hidden", !show);
    els.pokemonImage.classList.toggle("hidden-img", show);
  }

  function hideImageLoader() {
    els.imageLoader.classList.add("hidden");
  }

  function loadImage(id) {
    currentImageId = id;
    const token = ++imageLoadToken;
    const img = els.pokemonImage;

    showImageFallback(false);
    els.imageLoader.classList.remove("hidden");
    img.style.opacity = "0";

    const urls = getImageUrls(id);
    let index = 0;
    let attemptTimer = null;

    const finish = (ok) => {
      if (token !== imageLoadToken) return;
      clearTimeout(attemptTimer);
      hideImageLoader();
      if (ok) {
        showImageFallback(false);
        img.style.opacity = "1";
      } else {
        img.removeAttribute("src");
        img.style.opacity = "0";
        showImageFallback(true);
      }
    };

    const tryNext = () => {
      if (token !== imageLoadToken) return;
      if (index >= urls.length) {
        finish(false);
        return;
      }

      const url = urls[index++];
      clearTimeout(attemptTimer);
      attemptTimer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        tryNext();
      }, IMAGE_ATTEMPT_MS);

      img.onload = () => finish(true);
      img.onerror = () => tryNext();
      img.referrerPolicy = "no-referrer";
      img.src = url;
    };

    tryNext();
  }

  function pickRandom(arr, count, exclude) {
    const available = arr.filter((x) => x !== exclude);
    const result = [];
    const copy = [...available];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderLives() {
    els.lives.innerHTML = "";
    for (let i = 0; i < LIVES_MAX; i++) {
      const heart = document.createElement("span");
      heart.className = "heart" + (i >= lives ? " lost" : "");
      heart.textContent = "❤️";
      els.lives.appendChild(heart);
    }
  }

  function applyDifficultyVisuals() {
    els.pokemonImageWrap.classList.remove("silhouette", "blur");

    if (difficulty === "hard") {
      els.pokemonImageWrap.classList.add("silhouette");
      els.pokemonNumber.classList.add("hidden-num");
    } else if (difficulty === "normal") {
      els.pokemonNumber.classList.add("hidden-num");
    } else {
      els.pokemonNumber.classList.remove("hidden-num");
    }
  }

  function clearFeedback() {
    els.feedback.className = "feedback hidden";
    els.feedbackText.textContent = "";
  }

  function showFeedback(type, text) {
    els.feedback.className = `feedback ${type}`;
    els.feedbackText.textContent = text;
  }

  function startRound() {
    clearFeedback();
    answering = false;
    els.choices.innerHTML = "";

    const id = pokemonPool[Math.floor(Math.random() * pokemonPool.length)];
    const wrongIds = pickRandom(pokemonPool, 3, id);
    const roundIds = [id, ...wrongIds];

    roundIds.forEach((pid) => getKoreanName(pid));
    currentPokemon = { id, name: nameCache[id] };

    const options = shuffle([
      { id, name: currentPokemon.name },
      ...wrongIds.map((wid) => ({ id: wid, name: nameCache[wid] })),
    ]);

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = opt.name;
      btn.dataset.id = opt.id;
      btn.addEventListener("click", () => handleAnswer(btn, opt.id));
      els.choices.appendChild(btn);
    });

    els.pokemonNumber.textContent = `#${String(id).padStart(3, "0")}`;
    applyDifficultyVisuals();
    loadImage(id);
  }

  function handleAnswer(btn, chosenId) {
    if (answering) return;
    answering = true;

    const isCorrect = chosenId === currentPokemon.id;
    const buttons = els.choices.querySelectorAll(".choice-btn");
    buttons.forEach((b) => (b.disabled = true));

    if (isCorrect) {
      btn.classList.add("correct");
      streak++;
      if (streak > maxStreak) maxStreak = streak;
      const points = calcPoints(streak);
      score += points;
      correctCount++;
      levelCorrect++;

      els.score.textContent = score;
      els.streak.textContent = streak;
      updateLevelProgress();

      const cfg = getLevelConfig(level);
      const bonus =
        streak > 1
          ? ` (${streak}연속 · Lv.${level} ×${cfg.levelMultiplier.toFixed(1)})`
          : ` (Lv.${level})`;
      showFeedback("correct-fb", `정답! +${points}점${bonus}`);

      const leveledUp = levelCorrect >= cfg.questionsRequired;
      setTimeout(() => {
        if (leveledUp) levelUp();
        else startRound();
      }, ANSWER_DELAY);
    } else {
      btn.classList.add("wrong");
      buttons.forEach((b) => {
        if (parseInt(b.dataset.id, 10) === currentPokemon.id) b.classList.add("correct");
      });

      streak = 0;
      lives--;
      els.streak.textContent = streak;
      renderLives();

      showFeedback("wrong-fb", `틀렸어요! 정답은 ${currentPokemon.name}`);

      if (lives <= 0) {
        setTimeout(() => {
          clearFeedback();
          endGame();
        }, ANSWER_DELAY);
      } else {
        setTimeout(() => startRound(), ANSWER_DELAY);
      }
    }
  }

  function levelUp() {
    clearFeedback();
    level++;
    if (level > maxLevel) maxLevel = level;
    levelCorrect = 0;
    applyLevelConfig();

    els.levelupNum.textContent = `Level ${level}`;
    els.levelupOverlay.classList.remove("hidden");

    setTimeout(() => {
      els.levelupOverlay.classList.add("hidden");
      startRound();
    }, LEVELUP_DELAY);
  }

  function endGame() {
    const best = getBestScore();
    const bestLv = getBestLevel();
    const isNewRecord = score > best;
    const isNewLevel = maxLevel > bestLv;

    if (isNewRecord) saveBestScore(score);
    if (isNewLevel) saveBestLevel(maxLevel);
    if (isNewRecord || isNewLevel) updateBestDisplay();

    lastResult = {
      score,
      correctCount,
      maxStreak,
      maxLevel,
      isNewRecord: isNewRecord || isNewLevel,
    };

    els.finalScore.textContent = score;
    els.finalLevel.textContent = maxLevel;
    els.finalCorrect.textContent = correctCount;
    els.finalStreak.textContent = maxStreak;
    els.newRecord.textContent = isNewRecord
      ? "🏆 최고 점수 갱신!"
      : isNewLevel
        ? "🏆 최고 레벨 갱신!"
        : "";
    els.newRecord.classList.toggle("hidden", !isNewRecord && !isNewLevel);

    showScreen("gameover");
  }

  function drawPokeball(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    grad.addColorStop(0, "#e94560");
    grad.addColorStop(0.46, "#e94560");
    grad.addColorStop(0.46, "#333");
    grad.addColorStop(0.54, "#333");
    grad.addColorStop(0.54, "#fff");
    grad.addColorStop(1, "#fff");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = r * 0.1;
    ctx.strokeStyle = "#333";
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function generateShareImage(result) {
    const W = 600;
    const H = 860;
    const canvas = els.shareCanvas;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1a1a2e");
    bg.addColorStop(0.5, "#16213e");
    bg.addColorStop(1, "#0f3460");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawPokeball(ctx, W / 2, 100, 50);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 36px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
    ctx.fillText("포켓몬 이름 맞히기", W / 2, 200);

    ctx.fillStyle = "#e94560";
    ctx.font = "bold 28px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
    ctx.fillText("게임 종료!", W / 2, 250);

    if (result.isNewRecord) {
      ctx.fillStyle = "#ffd93d";
      ctx.font = "bold 22px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
      ctx.fillText("🏆 신기록 달성!", W / 2, 290);
    }

    const stats = [
      { label: "최종 점수", value: String(result.score) },
      { label: "도달 레벨", value: String(result.maxLevel) },
      { label: "맞힌 문제", value: String(result.correctCount) },
      { label: "최대 연속", value: String(result.maxStreak) },
    ];

    const cardX = 60;
    const cardW = W - 120;
    let cardY = result.isNewRecord ? 300 : 280;

    stats.forEach((stat) => {
      roundRect(ctx, cardX, cardY, cardW, 70, 14);
      ctx.fillStyle = "rgba(22, 33, 62, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(76, 201, 240, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#a0a0b8";
      ctx.font = "20px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
      ctx.fillText(stat.label, cardX + 24, cardY + 44);

      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd93d";
      ctx.font = "bold 32px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
      ctx.fillText(stat.value, cardX + cardW - 24, cardY + 46);

      cardY += 86;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#a0a0b8";
    ctx.font = "18px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
    ctx.fillText(`최고 레벨 ${result.maxLevel}`, W / 2, cardY + 30);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  function openShareModal() {
    if (!lastResult) return;

    const canvas = generateShareImage(lastResult);
    els.sharePreview.src = canvas.toDataURL("image/png");

    canvasToBlob(canvas).then((blob) => {
      shareBlob = blob;
    });

    els.shareModal.classList.remove("hidden");
  }

  function closeShareModal() {
    els.shareModal.classList.add("hidden");
    shareBlob = null;
  }

  async function shareImage() {
    if (!shareBlob) return;

    const file = new File([shareBlob], "pokemon-result.png", { type: "image/png" });
    const shareData = {
      title: "포켓몬 이름 맞히기",
      text: `점수 ${lastResult.score}점! 나도 도전해보세요 👉 ${SHARE_URL}`,
      files: [file],
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        closeShareModal();
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    downloadImage();
  }

  function downloadImage() {
    if (!shareBlob) return;

    const url = URL.createObjectURL(shareBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pokemon-result-${lastResult.score}점.png`;
    a.click();
    URL.revokeObjectURL(url);
    closeShareModal();
  }

  function resetGameState() {
    score = 0;
    streak = 0;
    maxStreak = 0;
    correctCount = 0;
    lives = LIVES_MAX;
    level = 1;
    levelCorrect = 0;
    maxLevel = 1;
    answering = false;

    els.score.textContent = "0";
    els.streak.textContent = "0";
    renderLives();
    applyLevelConfig();
  }

  function startGame() {
    resetGameState();
    showScreen("game");
    startRound();
  }

  els.startBtn.addEventListener("click", startGame);
  els.retryBtn.addEventListener("click", startGame);
  els.menuBtn.addEventListener("click", () => showScreen("start"));
  els.shareBtn.addEventListener("click", openShareModal);
  els.shareConfirmBtn.addEventListener("click", shareImage);
  els.shareDownloadBtn.addEventListener("click", downloadImage);
  els.shareCloseBtn.addEventListener("click", closeShareModal);
  els.shareModal.querySelector(".share-modal-backdrop").addEventListener("click", closeShareModal);
  els.retryImageBtn.addEventListener("click", () => {
    if (currentImageId) loadImage(currentImageId);
  });
  els.pokemonImageWrap.addEventListener("click", (e) => {
    if (!els.imageFallback.classList.contains("hidden") && e.target !== els.retryImageBtn) {
      if (currentImageId) loadImage(currentImageId);
    }
  });

  migrateLegacyBest();
  updateBestDisplay();
  loadNamesData();
})();
