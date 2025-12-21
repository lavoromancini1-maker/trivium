import { BOARD, START_TILE_ID } from "./board.js";
import {
  getRandomCategoryQuestion,
  getRandomKeyQuestion,
  getRandomFinalQuestion,
  getRandomRapidFireQuestions,
  getRandomClosestQuestion,
  getRandomVFFlashQuestion,
  getRandomIntruderQuestion,
  getRandomSequenceQuestion,
  getQuestionsByCategoryAndLevel,
} from "./questions.js";

import { CARD_IDS, CARD_COSTS, CARD_DROP_POOL, canUseCardNow, normalizeCards } from "./cards.js";

import { db } from "./firebase-config.js";

import {
  ref,
  set,
  get,
  update,
  push,
  onValue,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const GAMES_PATH = "games";

// ===============================
// POINTS SAFETY: mai sotto 0
// ===============================
function toSafeInt(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function clampPoints(n) {
  return Math.max(0, toSafeInt(n, 0));
}

function addPointsSafe(currentPoints, delta) {
  return clampPoints(toSafeInt(currentPoints, 0) + toSafeInt(delta, 0));
}

function getCategoryQuestionDurationSeconds(questionLevel, isKeyQuestion, advancesLevel, isFinal) {
  if (isFinal) return 40;
  if (isKeyQuestion) {
    return 30;
  }

  if (typeof questionLevel === "number") {
    // "Solo punti" (categoria già a livello 3) → trattata come livello 2
    if (!advancesLevel && questionLevel === 2) {
      return 15;
    }

    if (questionLevel === 1) return 15;
    if (questionLevel === 2) return 15;
    if (questionLevel === 3) return 20;
  }

  // Fallback di sicurezza
  return 15;
}


function generateGameCode() {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
}

function moveAlongPath(fromTileId, steps, firstDirectionIndex) {
  if (steps <= 0) return fromTileId;

  let currentId = fromTileId;
  let prevId = null;

  const firstNeighbors = BOARD[currentId].neighbors;
  if (!firstNeighbors[firstDirectionIndex]) {
    console.warn("Direzione non valida per questa casella");
    return currentId;
  }

  currentId = firstNeighbors[firstDirectionIndex];
  prevId = fromTileId;

  // passi successivi: seguiamo la "linea"
  for (let i = 1; i < steps; i++) {
    const neighbors = BOARD[currentId].neighbors;

    // scegli il neighbor che NON è la casella precedente
    let nextId = null;
    for (const nId of neighbors) {
      if (nId !== prevId) {
        nextId = nId;
        break;
      }
    }

    if (nextId === null) {
      // nessun passo possibile, restiamo fermi
      break;
    }

    prevId = currentId;
    currentId = nextId;
  }

  return currentId;
}

export async function createGame() {
  const gameCode = generateGameCode();
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  const snapshot = await get(gameRef);
  if (snapshot.exists()) {
    // Se per caso il codice esiste già, rigeneriamo (molto raro)
    return createGame();
  }
  const gameData = {
    createdAt: Date.now(),
    state: "LOBBY",
    players: {},

    // ✅ STEP 8: presenza host (heartbeat)
    host: {
      active: true,
      lastSeenAt: Date.now(),
    },

    // (opzionale) marker fine partita
    endedAt: null,
  };

  await set(gameRef, gameData);

  return { gameCode };
}

export async function gameExists(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  return snap.exists();
}

// ✅ STEP 8: host heartbeat (host aggiorna lastSeenAt ogni tot secondi)
export async function touchHostPresence(gameCode) {
  const hostRef = ref(db, `${GAMES_PATH}/${gameCode}/host`);
  await update(hostRef, {
    active: true,
    lastSeenAt: Date.now(),
  });
}

// ✅ STEP 8: partita attiva SOLO se host “vivo” di recente + state valido
export async function isGameActive(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) return false;

  const game = snap.val();
  const state = game?.state || "LOBBY";

  // se conclusa esplicitamente
  if (state === "ENDED") return false;
  if (game?.endedAt) return false;

  // state ammessi
  if (state !== "LOBBY" && state !== "IN_PROGRESS") return false;

  const now = Date.now();

  // controllo heartbeat host
  const lastSeen = game?.host?.lastSeenAt || null;

  // se manca lastSeen (vecchie partite), NON tenerle vive per ore:
  // considerale attive solo per una finestra breve dalla creazione
  if (!lastSeen) {
    const createdAt = game?.createdAt || 0;
    return (now - createdAt) < 10 * 60 * 1000; // 10 min
  }

  // host “vivo” se visto negli ultimi 90 secondi
  return (now - lastSeen) < 90 * 1000;
}


export async function joinGame(gameCode, playerName) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) {
    throw new Error("Partita non trovata");
  }

  const playersRef = ref(db, `${GAMES_PATH}/${gameCode}/players`);
  const newPlayerRef = push(playersRef);

  const playerId = newPlayerRef.key;

  const playerData = {
    name: playerName,
    joinedAt: Date.now(),
    points: 0,
    // qui in futuro aggiungeremo livelli, chiavi, carte, ecc.
  };

  await set(newPlayerRef, playerData);

  return { playerId };
}

export async function rejoinGame(gameCode, playerId) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) {
    throw new Error("Partita non trovata");
  }

  const playerRef = ref(db, `${GAMES_PATH}/${gameCode}/players/${playerId}`);
  const pSnap = await get(playerRef);

  if (!pSnap.exists()) {
    throw new Error("Giocatore non trovato (forse era di un'altra partita).");
  }

  // segna riconnesso (utile anche per UI futura)
  await update(playerRef, {
    isConnected: true,
    lastSeenAt: Date.now(),
  });

  return { playerId, rejoined: true };
}


export function listenGame(gameCode, callback) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const unsubscribe = onValue(gameRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback(snapshot.val());
  });

  return () => unsubscribe();
}

// ... (resto del file sopra resta uguale)

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleAnswers(q) {
  if (!q || !Array.isArray(q.answers) || q.answers.length !== 4) return q;

  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const answers = indices.map((i) => q.answers[i]);
  const correctIndex = indices.indexOf(q.correctIndex);

  return {
    ...q,
    answers,
    correctIndex,
  };
}

const CATEGORIES = [
  "geografia",
  "storia",
  "arte",
  "sport",
  "spettacolo",
  "scienza",
];

function countKeys(keysObj) {
  if (!keysObj) return 0;
  return Object.values(keysObj).filter(Boolean).length;
}

function hasAllSixKeys(player) {
  return countKeys(player?.keys) >= 6;
}

function pickRandomCategory() {
  return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
}

function makeScrignoPointsOnlyQuestion(game, forPlayerId, forcedCategory = null) {
  const players = game.players || {};
  const player = players[forPlayerId];
  if (!player) return null;

  const used = game.usedCategoryQuestionIds ? Object.keys(game.usedCategoryQuestionIds) : [];

  const category = forcedCategory || pickRandomCategory();

  const levels = player.levels || {};
  const currentLevel = levels[category] ?? 0;

  // ✅ Regola Scrigno:
  // - se lvl 0/1/2 -> domanda del livello successivo e AVANZA
  // - se lvl 3 -> domanda lvl 2 e NON avanza
  let questionLevel;
  let advancesLevel;

  if (currentLevel < 3) {
    questionLevel = currentLevel + 1; // 0->1, 1->2, 2->3
    advancesLevel = true;
  } else {
    questionLevel = 2;
    advancesLevel = false;
  }

  const raw = getRandomCategoryQuestion(category, questionLevel, used);
  if (!raw) return null;

  const shuffled = shuffleAnswers(raw);
  const now = Date.now();

  const durationSec = getCategoryQuestionDurationSeconds(
    questionLevel,
    false, // isKeyQuestion
    false, // isFinal
    false  // extraTime
  );

  return {
    ...shuffled,
    forPlayerId,
    tileType: "scrigno",
    category,
    level: questionLevel,
    advancesLevel,          // ✅ può avanzare (ma senza chiave)
    isKeyQuestion: false,   // ✅ MAI chiave da scrigno
    isFinal: false,
    scrignoMode: "PICK_CATEGORY_L2_PLUS",
    startedAt: now,
    durationSec,
    expiresAt: now + durationSec * 1000,
  };
}

function makeScrignoChallengeQuestion(game, forPlayerId, challengeIndex) {
  const used = game.usedCategoryQuestionIds ? Object.keys(game.usedCategoryQuestionIds) : [];
  const category = pickRandomCategory();
  const raw = getRandomCategoryQuestion(category, 2, used);
  if (!raw) return null;

  const shuffled = shuffleAnswers(raw);
  const now = Date.now();

  return {
    ...shuffled,
    forPlayerId,
    tileType: "scrigno",
    category,
    level: 2,
    advancesLevel: false,
    isKeyQuestion: false,
    isFinal: false,
    scrignoMode: "CHALLENGE",
    challengeIndex, // 1..3
    startedAt: now,
    durationSec: getCategoryQuestionDurationSeconds(2, false, false, false),
    expiresAt: now + getCategoryQuestionDurationSeconds(2, false, false, false) * 1000,
  };
}

function makeScrignoFinalQuestion(game, forPlayerId, forcedCategory = null) {
  const used = game.usedCategoryQuestionIds ? Object.keys(game.usedCategoryQuestionIds) : [];
  const category = forcedCategory || pickRandomCategory();
  const raw = getRandomFinalQuestion(category, used);
  if (!raw) return null;

  const shuffled = shuffleAnswers(raw);
  const now = Date.now();

  return {
    ...shuffled,
    forPlayerId,
    tileType: "scrigno",
    category,
    level: "final",
    advancesLevel: false,
    isKeyQuestion: false,
    isFinal: true,
    scrignoMode: "FINAL",
    startedAt: now,
    durationSec: getCategoryQuestionDurationSeconds(null, false, false, true),
    expiresAt: now + getCategoryQuestionDurationSeconds(null, false, false, true) * 1000,
  };
}

/**
 * Avvia la partita: genera ordine casuale dei giocatori, inizializza
 * livelli, chiavi, carte, punteggio. Aggiorna lo stato in "IN_PROGRESS".
 */
export async function startGame(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) {
    throw new Error("Partita non trovata");
  }

  const game = snap.val();
  const players = game.players || {};
  const playerIds = Object.keys(players);

  if (playerIds.length < 2) {
    throw new Error("Servono almeno 2 giocatori per iniziare la partita.");
  }

  // Ordine casuale
  const turnOrder = shuffleArray(playerIds);

  // Inizializziamo la struttura dei giocatori in modo coerente
  const updatedPlayers = {};
  for (const id of playerIds) {
    const p = players[id];

    const levels = {};
    const keys = {};
    CATEGORIES.forEach((cat) => {
      levels[cat] = 0; // livello 0 = nessun livello ancora
      keys[cat] = false; // nessuna chiave ancora
    });

    updatedPlayers[id] = {
      ...p,
      points: 0,
      levels,
      keys,
      cards: [], // nessuna carta bonus all'inizio
      isConnected: true, // futuro: per gestione reconnection
      position: START_TILE_ID, // tutti partono dalla stessa casella
  };
}

  const updateData = {
    state: "IN_PROGRESS",
    phase: "WAIT_ROLL", // in futuro: primo step del turno
    turnOrder,
    currentTurnIndex: 0,
    currentPlayerId: turnOrder[0],
    players: updatedPlayers,
    usedCategoryQuestionIds: {}, // per non ripetere domande
    usedRapidFireQuestionIds: {},
    usedClosestQuestionIds: {},
    usedVFFlashQuestionIds: {},
    usedIntruderQuestionIds: {},
    usedSequenceQuestionIds: {},
  };

  await update(gameRef, updateData);

  return { turnOrder };
}

export async function useCard(gameCode, playerId, cardId, payload = {}) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");

  const players = game.players || {};
  const player = players[playerId];
  if (!player) throw new Error("Giocatore non trovato.");

  const owned = normalizeCards(player.cards);
  if (!owned.includes(cardId)) throw new Error("Non possiedi questa carta.");

  if (!CARD_COSTS[cardId] && CARD_COSTS[cardId] !== 0) {
    throw new Error("Carta non valida.");
  }

  // helper: trova tileId della casella CHIAVE di una categoria
  function findKeyTileIdByCategory(category) {
    const ids = Object.keys(BOARD || {});
    for (const id of ids) {
      const t = BOARD[id];
      if (t && t.type === "key" && t.category === category) return parseInt(id, 10);
    }
    return null;
  }

  // helper: applica “atterraggio su casella” (category/key/event/minigame/scrigno)
  // Versione sync per useCard (transaction)
  function resolveLanding(current, pid, tileId) {
    const tile = BOARD[tileId];
    if (!tile) return { ok: false, reason: "BAD_TILE" };

    current.currentTile = {
      tileId,
      type: tile.type,
      category: tile.category || null,
      zone: tile.zone,
    };

    // reset roba “domanda in corso”
    current.currentQuestion = null;
    current.reveal = null;
    current.playerAnswerIndex = null;

    // CATEGORY / KEY => crea domanda categoria
    if (tile.type === "category" || tile.type === "key") {
      const { questionData } = prepareCategoryQuestionForTile(current, pid, tile, tileId);
      if (!questionData) return { ok: false, reason: "NO_QUESTION" };

      current.phase = "QUESTION";
      current.currentQuestion = questionData;

      if (questionData.id) {
        current.usedCategoryQuestionIds = {
          ...(current.usedCategoryQuestionIds || {}),
          [questionData.id]: true,
        };
      }
      return { ok: true, kind: "QUESTION" };
    }

// EVENTO
if (tile.type === "event") {
  // fallback sync: facciamo partire un RISK “completo” (con punti), così non può mai generare NaN
  current.phase = "EVENT_RISK_DECISION";
  current.currentEvent = {
    type: "RISK",
    ownerPlayerId: pid,
    pointsCorrect: 30,
    pointsWrong: -15,
    decision: null,
    startedAt: Date.now(),
  };
  return { ok: true, kind: "EVENT" };
}

    // MINIGAME
    if (tile.type === "minigame") {
      // nel tuo gioco minigame usa phase MINIGAME con current.minigame
      current.phase = "MINIGAME";
      current.minigame = {
        type: "CLOSEST",
        startedAt: Date.now(),
      };
      // (qui è “fallback” safe: non crasha, poi lo rifiniamo)
      return { ok: true, kind: "MINIGAME" };
    }

// SCRIGNO
if (tile.type === "scrigno") {
  // ✅ Se NON hai tutte e 6 le chiavi: scegli categoria, poi domanda lvl 2
  if (!hasAllSixKeys(me)) {
    current.phase = "SCRIGNO_PICK_CATEGORY";
    current.scrigno = {
      mode: "PICK_CATEGORY",
      forPlayerId: pid,
      startedAt: Date.now(),
    };
    return { ok: true, kind: "SCRIGNO_PICK_CATEGORY" };
  }

  // ✅ Se hai 6 chiavi: per ora lasciamo il comportamento attuale (lo definiremo dopo)
  current.phase = "SCRIGNO";
  current.scrigno = {
    mode: "ENTRY",
    forPlayerId: pid,
    startedAt: Date.now(),
  };
  return { ok: true, kind: "SCRIGNO" };
}

    return { ok: false, reason: "UNSUPPORTED_TILE_TYPE" };
  }

  await runTransaction(gameRef, (current) => {
    if (!current) return current;
    if (current.state !== "IN_PROGRESS") return current;

    const curPlayers = current.players || {};
    const me = curPlayers[playerId];
    if (!me) return current;

    const myCards = normalizeCards(me.cards);
    if (!myCards.includes(cardId)) return current;

    const cost = CARD_COSTS[cardId] ?? 0;
    if ((me.points ?? 0) < cost) {
      current.lastCardError = { playerId, cardId, reason: "NOT_ENOUGH_POINTS", at: Date.now() };
      return current;
    }

   // gate centrale (cards.js) — IMPORTANT: assicurati che player.id esista
const gate = canUseCardNow(current, { ...me, id: playerId }, cardId);
    if (!gate.ok) {
      current.lastCardError = { playerId, cardId, reason: gate.reason, at: Date.now() };
      return current;
    }

    function consume() {
      me.points = addPointsSafe(me.points, -cost);
      me.cards = myCards.filter((c) => c !== cardId).slice(0, 3);
      curPlayers[playerId] = me;
      current.players = curPlayers;
      current.lastCardUsed = { playerId, cardId, at: Date.now() };
    }

    // ─────────────────────────────────────────────
    // 0) vincolo “1 carta per domanda” (server-side)
    // ─────────────────────────────────────────────
    const curQ = current.currentQuestion || null;
    if (current.phase === "QUESTION" && curQ && curQ.forPlayerId === playerId) {
      const usedMap = curQ.cardUsedBy || {};
      if (usedMap[playerId]) {
        current.lastCardError = { playerId, cardId, reason: "ONE_CARD_PER_QUESTION", at: Date.now() };
        return current;
      }
    }

    // ─────────────────────────────────────────────
    // 1) EXTRA_TIME
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.EXTRA_TIME) {
      if (current.phase !== "QUESTION" || !curQ) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }
      if (typeof curQ.expiresAt !== "number") {
        current.lastCardError = { playerId, cardId, reason: "NO_TIMER", at: Date.now() };
        return current;
      }

      current.currentQuestion = {
        ...curQ,
        expiresAt: curQ.expiresAt + 10000,
        cardUsedBy: { ...(curQ.cardUsedBy || {}), [playerId]: { cardId, at: Date.now() } },
      };

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 2) FIFTY_FIFTY
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.FIFTY_FIFTY) {
      if (current.phase !== "QUESTION" || !curQ) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }

      const correctIndex = curQ.correctIndex;
      if (typeof correctIndex !== "number") {
        current.lastCardError = { playerId, cardId, reason: "BAD_QUESTION", at: Date.now() };
        return current;
      }

      const removed = [];
      for (let i = 0; i < 4; i++) {
        if (i !== correctIndex) removed.push(i);
      }
      // rimuovo 2 sbagliate a caso
      removed.sort(() => Math.random() - 0.5);
      const removedTwo = removed.slice(0, 2).sort((a, b) => a - b);

      current.currentQuestion = {
        ...curQ,
        fiftyFiftyRemoved: removedTwo,
        cardUsedBy: { ...(curQ.cardUsedBy || {}), [playerId]: { cardId, at: Date.now() } },
      };

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 3) ALT_QUESTION (no-op se non trova alternativa)
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.ALT_QUESTION) {
      if (current.phase !== "QUESTION" || !curQ) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }

      const pool = getQuestionsByCategoryAndLevel(curQ.category, curQ.level) || [];
      const candidates = pool.filter((qq) => qq && qq.id && qq.id !== curQ.id && !(current.usedCategoryQuestionIds || {})[qq.id]);

      if (!candidates.length) {
        // IMPORTANTISSIMO: non consumare
        current.lastCardError = { playerId, cardId, reason: "NO_ALTERNATIVE_AVAILABLE", at: Date.now() };
        return current;
      }

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const now = Date.now();
      const seconds = getCategoryQuestionDurationSeconds(curQ.level, false, !!curQ.advancesLevel, false);

      current.currentQuestion = {
        ...curQ,
        id: pick.id,
        text: pick.text,
        answers: pick.answers,
        correctIndex: pick.correctIndex,
        startedAt: now,
        expiresAt: now + seconds * 1000,
        fiftyFiftyRemoved: null,
        cardUsedBy: { ...(curQ.cardUsedBy || {}), [playerId]: { cardId, at: now } },
      };

      // segna usata la domanda nuova
      current.usedCategoryQuestionIds = {
        ...(current.usedCategoryQuestionIds || {}),
        [pick.id]: true,
      };

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 4) CHANGE_CATEGORY (payload.newCategory obbligatorio)
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.CHANGE_CATEGORY) {
      if (current.phase !== "QUESTION" || !curQ) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }

      const newCategory = (payload?.newCategory || "").trim().toLowerCase();
      if (!newCategory) {
        current.lastCardError = { playerId, cardId, reason: "MISSING_NEW_CATEGORY", at: Date.now() };
        return current;
      }

      const pool = getQuestionsByCategoryAndLevel(newCategory, curQ.level) || [];
      const candidates = pool.filter((qq) => qq && qq.id && !(current.usedCategoryQuestionIds || {})[qq.id]);

      if (!candidates.length) {
        current.lastCardError = { playerId, cardId, reason: "NO_QUESTION_IN_NEW_CATEGORY", at: Date.now() };
        return current;
      }

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const now = Date.now();
      const seconds = getCategoryQuestionDurationSeconds(curQ.level, false, true, false);

      current.currentQuestion = {
        ...curQ,
        category: newCategory,
        id: pick.id,
        text: pick.text,
        answers: pick.answers,
        correctIndex: pick.correctIndex,
        startedAt: now,
        expiresAt: now + seconds * 1000,
        fiftyFiftyRemoved: null,
        cardUsedBy: { ...(curQ.cardUsedBy || {}), [playerId]: { cardId, at: now } },
      };

      current.usedCategoryQuestionIds = {
        ...(current.usedCategoryQuestionIds || {}),
        [pick.id]: true,
      };

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 5) SALVEZZA (REVEAL dopo errore: ripristina turno al player)
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.SALVEZZA) {
      const r = current.reveal;
      if (current.phase !== "REVEAL" || !r) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }
      if (r.forPlayerId !== playerId) {
        current.lastCardError = { playerId, cardId, reason: "NOT_YOUR_REVEAL", at: Date.now() };
        return current;
      }
      if (r.correct !== false) {
        current.lastCardError = { playerId, cardId, reason: "ONLY_AFTER_WRONG", at: Date.now() };
        return current;
      }
      if (r.source && r.source !== "CATEGORY") {
        current.lastCardError = { playerId, cardId, reason: "NOT_CATEGORY_REVEAL", at: Date.now() };
        return current;
      }

      // Ripristina turno al playerId (anche se era già passato al prossimo)
      const order = Array.isArray(current.turnOrder) ? current.turnOrder : [];
      const idx = order.indexOf(playerId);
      if (idx >= 0) {
        current.currentTurnIndex = idx;
        current.currentPlayerId = playerId;
      } else {
        current.currentPlayerId = playerId;
      }

      current.phase = "WAIT_ROLL";
      current.reveal = null;
      current.currentQuestion = null;
      current.playerAnswerIndex = null;

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 7) TELEPORT_CATEGORY (WAIT_ROLL nel tuo turno + check lvl3)
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.TELEPORT_CATEGORY) {
      if (current.phase !== "WAIT_ROLL" || current.currentPlayerId !== playerId) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE_OR_TURN", at: Date.now() };
        return current;
      }

      const category = (payload?.category || "").trim().toLowerCase();
      if (!category) {
        current.lastCardError = { playerId, cardId, reason: "MISSING_CATEGORY", at: Date.now() };
        return current;
      }

      const lvl = me.levels?.[category] ?? 0;
      if (lvl < 3) {
        current.lastCardError = { playerId, cardId, reason: "NEED_LEVEL_3", at: Date.now() };
        return current;
      }

      const keyTileId = findKeyTileIdByCategory(category);
      if (keyTileId == null) {
        current.lastCardError = { playerId, cardId, reason: "KEY_TILE_NOT_FOUND", at: Date.now() };
        return current;
      }

      const fromTileId = me.position ?? START_TILE_ID;
      me.position = keyTileId;
      curPlayers[playerId] = me;
      current.players = curPlayers;

      // aggiorna contesto movimento “virtuale”
      current.turnContext = {
        ...(current.turnContext || {}),
        lastMove: {
          fromTileId,
          toTileId: keyTileId,
          path: [fromTileId, keyTileId],
          directionIndex: null,
          kind: "TELEPORT",
        },
      };

      // atterraggio su key => domanda
      const landing = resolveLanding(current, playerId, keyTileId);
      if (!landing.ok) {
        current.lastCardError = { playerId, cardId, reason: landing.reason || "LANDING_FAILED", at: Date.now() };
        return current;
      }

      consume();
      return current;
    }

    // ─────────────────────────────────────────────
    // 8) SKIP_PLUS_ONE (post-move: +1 nella stessa direzione; può finire anche su EVENT/MINIGAME/SCRIGNO)
    // ─────────────────────────────────────────────
    if (cardId === CARD_IDS.SKIP_PLUS_ONE) {
      if (current.phase !== "QUESTION" || !curQ || curQ.forPlayerId !== playerId) {
        current.lastCardError = { playerId, cardId, reason: "WRONG_PHASE", at: Date.now() };
        return current;
      }

      const lastMove = current.turnContext?.lastMove || null;
      const curTileId = current.currentTile?.tileId;
      if (!lastMove || !curTileId || lastMove.toTileId !== curTileId) {
        current.lastCardError = { playerId, cardId, reason: "NEEDS_POST_MOVE_WINDOW", at: Date.now() };
        return current;
      }

      const path = Array.isArray(lastMove.path) ? lastMove.path : [];
      if (path.length < 2) {
        current.lastCardError = { playerId, cardId, reason: "BAD_PATH", at: Date.now() };
        return current;
      }

      const prev = path[path.length - 2];
      const cur = path[path.length - 1];

      const neighbors = (BOARD[cur]?.neighbors || []).filter((nid) => nid !== prev);
      if (!neighbors.length) {
        current.lastCardError = { playerId, cardId, reason: "NO_NEXT_TILE", at: Date.now() };
        return current;
      }

      const nextTileId = neighbors[0];
      const nextTile = BOARD[nextTileId];
      if (!nextTile) {
        current.lastCardError = { playerId, cardId, reason: "BAD_NEXT_TILE", at: Date.now() };
        return current;
      }

      // sposta player
      me.position = nextTileId;
      curPlayers[playerId] = me;
      current.players = curPlayers;

      // aggiorna lastMove
      current.turnContext = {
        ...(current.turnContext || {}),
        lastMove: {
          ...lastMove,
          toTileId: nextTileId,
          path: [...path, nextTileId],
        },
      };

      // IMPORTANTISSIMO: stai “saltando” la domanda appena generata -> la annulliamo
      current.currentQuestion = null;
      current.reveal = null;
      current.playerAnswerIndex = null;

      // risolvi la casella su cui atterri (category/key/event/minigame/scrigno)
      const landing = resolveLanding(current, playerId, nextTileId);
      if (!landing.ok) {
        current.lastCardError = { playerId, cardId, reason: landing.reason || "LANDING_FAILED", at: Date.now() };
        return current;
      }

      consume();
      return current;
    }

    // fallback
    current.lastCardError = { playerId, cardId, reason: "UNHANDLED_CARD", at: Date.now() };
    return current;
  });

  return { ok: true };
}

// =======================================
// CARDS - DROP (ottenimento carte)
// =======================================

// Pesca random dalla pool (uniforme; poi possiamo pesare le rare)
function pickRandomCardId() {
  const pool = Array.isArray(CARD_DROP_POOL) ? CARD_DROP_POOL : [];
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// Prova ad aggiungere la carta: se inventario < 3 la assegna subito,
// altrimenti crea pendingCardOffer (il player dovrà scegliere scarto/rifiuto)
function grantCardOrOffer(current, playerId, cardId, source = "UNKNOWN") {
  const p = current.players?.[playerId];
  if (!p) return;

  const cards = normalizeCards(p.cards);
  if (cards.length < 3) {
    p.cards = [...cards, cardId];
    current.lastCardGranted = { playerId, cardId, source, at: Date.now() };
    return;
  }

  // se c'è già un'offerta in corso, non crearne un'altra (evita bug)
  if (current.pendingCardOffer) return;

  current.pendingCardOffer = {
    playerId,
    cardId,
    source,
    createdAt: Date.now(),
  };
}

// Export: chiamala quando un evento/minigioco assegna una carta
export async function grantRandomCard(gameCode, playerId, source = "EVENT_OR_MINIGAME") {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  const res = await runTransaction(gameRef, (current) => {
    if (!current) return current;
    if (current.state !== "IN_PROGRESS") return current;

    // blocca se offerta già presente
    if (current.pendingCardOffer) return current;

    // pesca la carta
    const cardId = pickRandomCardId();
    if (!cardId) return current;

    grantCardOrOffer(current, playerId, cardId, source);
    return current;
  });

  if (!res.committed) throw new Error("Impossibile assegnare la carta (riprovare).");
  return { ok: true };
}

// === CARD DROP (by ref) ===
// come grantRandomCard, ma usa direttamente gameRef (utile dentro finalize minigame/event)
async function grantRandomCardByRef(gameRef, playerId, source = "EVENT_OR_MINIGAME") {
  const res = await runTransaction(gameRef, (current) => {
    if (!current) return current;
    if (current.state !== "IN_PROGRESS") return current;

    // se c’è già un’offerta pendente, non ne creiamo un’altra
    if (current.pendingCardOffer) return current;

    const p = current.players?.[playerId];
    if (!p) return current;

    const cardId = pickRandomCardId();
    if (!cardId) return current;

    grantCardOrOffer(current, playerId, cardId, source);
    return current;
  });

  return !!res.committed;
}

async function maybeDropCardByRef(gameRef, playerId, chance, source) {
  if (!playerId) return false;
  if (Math.random() > chance) return false;
  return await grantRandomCardByRef(gameRef, playerId, source);
}

// Player decide: rifiuta, oppure accetta e (se necessario) scarta una carta
export async function resolveCardOffer(gameCode, playerId, action, discardCardId = null) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  const res = await runTransaction(gameRef, (current) => {
    if (!current) return current;
    const offer = current.pendingCardOffer;
    if (!offer) return current;
    if (offer.playerId !== playerId) return current;

    const p = current.players?.[playerId];
    if (!p) return current;

    const cards = normalizeCards(p.cards);

    if (action === "DECLINE") {
      current.pendingCardOffer = null;
      current.lastCardOfferResolved = { playerId, action, at: Date.now() };
      return current;
    }

    if (action === "ACCEPT") {
      // se ho già spazio, aggiungo e chiudo
      if (cards.length < 3) {
        p.cards = [...cards, offer.cardId];
        current.pendingCardOffer = null;
        current.lastCardGranted = { playerId, cardId: offer.cardId, source: offer.source, at: Date.now() };
        return current;
      }

      // se sono pieno, devo scartare 1 carta valida
      if (!discardCardId) return current;
      if (!cards.includes(discardCardId)) return current;

      const idx = cards.indexOf(discardCardId);
      cards.splice(idx, 1); // scarto 1
      cards.push(offer.cardId); // aggiungo nuova

      p.cards = cards;

      current.pendingCardOffer = null;
      current.lastCardGranted = { playerId, cardId: offer.cardId, source: offer.source, at: Date.now() };
      current.lastCardDiscarded = { playerId, cardId: discardCardId, at: Date.now() };
      return current;
    }

    return current;
  });

  if (!res.committed) throw new Error("Impossibile risolvere l’offerta carta.");
  return { ok: true };
}

export async function rollDice(gameCode, playerId) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();

  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");
  if (game.currentPlayerId !== playerId) throw new Error("Non è il tuo turno.");
  if (game.phase !== "WAIT_ROLL") throw new Error("Non puoi tirare il dado in questa fase.");

  const players = game.players || {};
  const currentPlayer = players[playerId];
  if (!currentPlayer) throw new Error("Giocatore non trovato.");

  const fromTileId = currentPlayer.position ?? START_TILE_ID;
  if (!BOARD[fromTileId]) throw new Error(`Casella di partenza non valida: ${fromTileId}`);

  // tiro del dado 1-6
  const diceResult = Math.floor(1 + Math.random() * 6);

  // ✅ NUOVO: calcoliamo tutte le destinazioni possibili in EXACT diceResult passi,
  // scegliendo ai bivi lungo il percorso (ring/chiavi/stradine/scrigno).
  const availableDirections = computeMoveOptionsAllPaths(fromTileId, diceResult);

  // safety: se per qualche motivo non esistono mosse (non dovrebbe mai succedere se il board è connesso)
  if (!availableDirections.length) {
    throw new Error("Nessuna mossa disponibile: controlla i neighbors nel board.");
  }

  const updateData = {
    phase: "CHOOSE_DIRECTION",
    currentDice: diceResult,
    currentMove: {
      fromTileId,
      dice: diceResult,
    },
    availableDirections,
  };

  await update(gameRef, updateData);

  return { diceResult, availableDirections };
}

function computeMoveOptionsAllPaths(fromTileId, steps) {
  // evita esplosione di loop sul ring: non permettiamo di ripassare
  // sulla stessa casella nello stesso movimento (simple path).
  const resultsByTile = new Map();

  function dfs(currentId, remaining, visited, path) {
    if (remaining === 0) {
      // destinazione finale
      if (!resultsByTile.has(currentId)) {
        resultsByTile.set(currentId, { finalTileId: currentId, path: [...path] });
      }
      return;
    }

    const tile = BOARD[currentId];
    const neighbors = tile?.neighbors || [];
    for (const nextId of neighbors) {
      if (visited.has(nextId)) continue; // blocca loop
      visited.add(nextId);
      path.push(nextId);
      dfs(nextId, remaining - 1, visited, path);
      path.pop();
      visited.delete(nextId);
    }
  }

  const visited = new Set([fromTileId]);
  dfs(fromTileId, steps, visited, [fromTileId]);

  // trasformiamo in array “availableDirections” (anche se ora sono destinazioni)
  const arr = Array.from(resultsByTile.values());

  return arr.map((opt, i) => {
    const t = BOARD[opt.finalTileId] || {};
    return {
      index: i,
      label: `Opzione ${i + 1}`,
      // preview per UI player + pulsazione host
      previewTileId: opt.finalTileId,
      previewType: t.type || null,
      previewCategory: t.category || null,

      // dato “vero” che useremo in chooseDirection
      finalTileId: opt.finalTileId,

      // opzionale (utile se in futuro vuoi mostrare il percorso)
      path: opt.path,
    };
  });
}

export async function chooseDirection(gameCode, playerId, directionIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) {
    throw new Error("Partita non trovata");
  }

  const game = snap.val();

  if (game.state !== "IN_PROGRESS") {
    throw new Error("La partita non è in corso.");
  }

  if (game.currentPlayerId !== playerId) {
    throw new Error("Non è il tuo turno.");
  }

  if (game.phase !== "CHOOSE_DIRECTION") {
    throw new Error("Non puoi scegliere la direzione in questa fase.");
  }

  const players = game.players || {};
  const currentPlayer = players[playerId];
  if (!currentPlayer) {
    throw new Error("Giocatore non trovato.");
  }

  const currentMove = game.currentMove;
  if (!currentMove) {
    throw new Error("Nessun movimento in corso.");
  }

  const fromTileId = currentMove.fromTileId;
  const dice = currentMove.dice;

  // calcoliamo la casella finale
  const dirs = game.availableDirections || [];
const chosen = dirs.find(d => d.index === directionIndex) || dirs[directionIndex];

if (!chosen || chosen.finalTileId === undefined || chosen.finalTileId === null) {
  throw new Error("Direzione/destinazione non valida.");
}

const finalTileId = chosen.finalTileId;
  const finalTile = BOARD[finalTileId];

  // Aggiorniamo la posizione del giocatore
  const playerUpdatePath = `players/${playerId}/position`;
const baseUpdate = {
  [playerUpdatePath]: finalTileId,
  currentDice: null,
  currentMove: null,
  availableDirections: null,
  currentTile: {
    tileId: finalTileId,
    type: finalTile.type,
    category: finalTile.category || null,
    zone: finalTile.zone,
  },
  turnContext: {
    ...(game.turnContext || {}),
    lastMove: {
      fromTileId,
      toTileId: finalTileId,
      directionIndex,
      path: Array.isArray(chosen?.path) ? chosen.path : [fromTileId, finalTileId],
      at: Date.now(),
    },
  },
};

  // Se casella di categoria o chiave → prepariamo domanda
  if (finalTile.type === "category" || finalTile.type === "key") {
    const { questionData, extraUpdates } = prepareCategoryQuestionForTile(
      game,
      playerId,
      finalTile,
      finalTileId
    );

    const globalUpdate = {
      ...baseUpdate,
      phase: "QUESTION",
      currentTile: {
        tileId: finalTileId,
        type: finalTile.type,
        category: finalTile.category || null,
        zone: finalTile.zone,
      },
      currentQuestion: questionData,
      ...extraUpdates, // include usedCategoryQuestionIds
      playerAnswerIndex: null,
      playerAnswerCorrect: null,
    };

    await update(gameRef, globalUpdate);

    return { finalTileId, finalTile, question: questionData };
  }

  // Caselle speciali: minigame / event / scrigno
if (finalTile.type === "minigame") {
  await startRandomMinigame(gameRef, game, playerId, finalTileId, finalTile, baseUpdate);
  return { finalTileId, finalTile };
}


  if (finalTile.type === "event") {
     await startEventTile(
      gameRef,
      game,
      playerId,
      finalTileId,
      finalTile,
      baseUpdate
    );
    return { finalTileId, finalTile };
  }

if (finalTile.type === "scrigno") {
  const players = game.players || {};
  const p = players[playerId];
  if (!p) return;

  // ✅ usa SEMPRE baseUpdate già creato sopra (quello con position + turnContext.lastMove)
  const scrignoBase = {
    ...baseUpdate,
    currentTile: {
      tileId: finalTileId,
      type: "scrigno",
      category: null,
      zone: finalTile.zone,
    },
    reveal: null,
    currentQuestion: null,
    playerAnswerIndex: null,
    playerAnswerCorrect: null,
  };
    // ✅ SCRIGNO SENZA 6 CHIAVI: scelta categoria sul player (poi domanda dinamica)
  if (!hasAllSixKeys(p)) {
    await update(gameRef, {
      ...scrignoBase,
      phase: "SCRIGNO_PICK_CATEGORY",
      scrigno: {
        mode: "PICK_CATEGORY",
        forPlayerId: playerId,
        startedAt: Date.now(),
      },
    });
    return;
  }

  // Se NON ha 6 chiavi: domanda solo punti, poi uscita
  if (!hasAllSixKeys(p)) {
    const q = makeScrignoPointsOnlyQuestion(game, playerId);
    if (!q) {
      await update(gameRef, { ...scrignoBase, phase: "WAIT_ROLL" });
      return;
    }

    await update(gameRef, {
      ...scrignoBase,
      phase: "QUESTION",
      currentQuestion: q,
      [`usedCategoryQuestionIds/${q.id}`]: true,
    });
    return;
  }

  // Ha 6 chiavi: tentativi/fail e mini-sfida
  const scrigno = game.scrigno || { attempts: {} };
  const attempts = scrigno.attempts || {};
  const a = attempts[playerId] || { failedFinalCount: 0 };

  // Se ha già fallito almeno una finale → mini-sfida 3 domande L2 no-error
  if (a.failedFinalCount >= 1) {
    const q = makeScrignoChallengeQuestion(game, playerId, 1);
    if (!q) {
      await update(gameRef, { ...scrignoBase, phase: "WAIT_ROLL", scrigno: { attempts } });
      return;
    }

    attempts[playerId] = a;

    await update(gameRef, {
      ...scrignoBase,
      phase: "QUESTION",
      currentQuestion: q,
      scrigno: { attempts },
      [`usedCategoryQuestionIds/${q.id}`]: true,
    });
    return;
  }

  // Primo accesso → domanda finale
  const qFinal = makeScrignoFinalQuestion(game, playerId, scrigno?.finalCategory || null);
  if (!qFinal) {
    await update(gameRef, { ...scrignoBase, phase: "WAIT_ROLL" });
    return;
  }

  attempts[playerId] = a;

  await update(gameRef, {
    ...scrignoBase,
    phase: "QUESTION",
    currentQuestion: qFinal,
    scrigno: { ...scrigno, attempts },
    [`usedCategoryQuestionIds/${qFinal.id}`]: true,
  });
  return;
}


  // Fallback di sicurezza
  const globalUpdate = {
    ...baseUpdate,
    phase: "WAIT_ROLL",
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
  };

  await update(gameRef, globalUpdate);
  return { finalTileId, finalTile };
}

async function startRapidFireMinigame(
  gameRef,
  game,
  ownerPlayerId,
  finalTileId,
  finalTile,
  baseUpdate
) {
  // Prendiamo fino a 3 domande Rapid Fire
 const usedRF = game.usedRapidFireQuestionIds || {};
const usedIds = Object.keys(usedRF);
const rawQuestions = getRandomRapidFireQuestions(3, usedIds);
  if (!rawQuestions || rawQuestions.length === 0) {
    console.warn("Nessuna domanda Rapid Fire disponibile.");
    // Se non abbiamo domande, semplicemente torniamo in WAIT_ROLL
    const fallbackUpdate = {
      ...baseUpdate,
      phase: "WAIT_ROLL",
      currentTile: {
        tileId: finalTileId,
        type: finalTile.type,
        category: finalTile.category || null,
        zone: finalTile.zone,
      },
    };
    await update(gameRef, fallbackUpdate);
    return;
  }

 const shuffledQuestions = shuffleArray([...rawQuestions]).map((q) => {
    const indices = [0, 1, 2, 3];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const answers = indices.map((i) => q.answers[i]);
    const correctIndex = indices.indexOf(q.correctIndex);

    return {
      ...q,
      answers,
      correctIndex,
    };
  });
  
  const now = Date.now();

  const rapidFire = {
    ownerPlayerId,
    questions: shuffledQuestions,
    currentIndex: 0,

    scores: {},

    // per domanda corrente
    answeredThisQuestion: {},
    answersThisQuestion: {},
    answerTimesThisQuestion: {},

    // tie-break totale (ms)
    timesMs: {},

    durationSec: 10,
    questionStartedAt: now,
    startedAt: now,
    expiresAt: now + 10 * 1000,
  };

const rfUsedUpdates = {};
for (const q of rawQuestions) {
  if (q?.id) rfUsedUpdates[`usedRapidFireQuestionIds/${q.id}`] = true;
}

const updates = {
  ...baseUpdate,
  phase: "RAPID_FIRE",
  currentTile: {
    tileId: finalTileId,
    type: finalTile.type,
    category: finalTile.category || null,
    zone: finalTile.zone,
  },
  rapidFire,
  ...rfUsedUpdates,
};

const intro = getMinigameIntroCopy("RAPID_FIRE");
updates.toast = buildToastAll(
  game,
  { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
  { kind: "neutral", title: intro.title, subtitle: "Vai sul telefono e gioca!" },
  1700
);  

await update(gameRef, updates);
}

async function startRandomMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate) {
  // Tipi disponibili (solo quelli che esistono già)
  const pool = ["VF_FLASH", "CLOSEST", "RAPID_FIRE", "INTRUDER", "SEQUENCE"];

  // (Opzionale) evita ripetizione immediata dello stesso minigame
  const last = game.lastMinigameType || null;
  const filtered = last ? pool.filter(t => t !== last) : pool;
  const pickFrom = filtered.length ? filtered : pool;

  const type = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  // salva per evitare ripetizioni immediate
  await update(gameRef, { lastMinigameType: type });

  if (type === "VF_FLASH") {
    await startVFFlashMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate);
    return;
  }

  if (type === "CLOSEST") {
    await startClosestMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate);
    return;
  }
  if (type === "INTRUDER") {
  await startIntruderMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate);
  return;
}
if (type === "SEQUENCE") {
  await startSequenceMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate);
  return;
}

  // RAPID_FIRE (usa la tua fase RAPID_FIRE separata)
  await startRapidFireMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate);
}


async function startClosestMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate) {
  const used = game.usedClosestQuestionIds ? Object.keys(game.usedClosestQuestionIds) : [];
  const q = getRandomClosestQuestion(used);

  if (!q) {
    // fallback: se finite, torna al turno normale
    await update(gameRef, { ...baseUpdate, phase: "WAIT_ROLL", minigame: null });
    return;
  }

  const now = Date.now();
  const durationSec = 12; // per test; poi allineiamo a GAME_SPEC se serve

  const minigame = {
    type: "CLOSEST",
    ownerPlayerId,
    challenge: { id: q.id, text: q.text, correctValue: q.correctValue },
    answers: {},   // { [playerId]: number }
    locked: {},    // { [playerId]: true }
    durationSec,
    startedAt: now,
    expiresAt: now + durationSec * 1000,
  };

  const usedUpdates = { [`usedClosestQuestionIds/${q.id}`]: true };

  const intro = getMinigameIntroCopy("CLOSEST");
  const toast = buildToastAll(
    game,
    { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
    { kind: "neutral", title: intro.title, subtitle: "Pronto: THE CLOSEST." },
    1700
  );

  await update(gameRef, {
    ...baseUpdate,
    phase: "MINIGAME",
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
    currentQuestion: null,
    reveal: null,
    minigame,
    toast,
    ...usedUpdates,
  });
}

async function startVFFlashMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate) {
  const used = game.usedVFFlashQuestionIds ? Object.keys(game.usedVFFlashQuestionIds) : [];
  const pack = getRandomVFFlashQuestion(used);

  if (!pack) {
    await update(gameRef, { ...baseUpdate, phase: "WAIT_ROLL", minigame: null });
    return;
  }

  const now = Date.now();

  const minigame = {
    type: "VF_FLASH",
    ownerPlayerId,
    packId: pack.id,
    index: 0, // quale affermazione (0..2)
    statements: pack.statements.map(s => ({ text: s.text, correct: s.correct })), // corretto resta nel DB per verifica
    answeredThis: {},   // { [playerId]: true } per la singola affermazione corrente
    eliminatedThis: {}, // { [playerId]: true } se ha sbagliato questa affermazione
    winners: {},        // { [playerId]: countVittorie } (per riepilogo)
    currentWinnerId: null, // vincitore affermazione corrente (se già c'è)
    responseTimes: {},     // { [playerId]: ms totali (solo risposte corrette) }
    statementStartedAt: now, // timestamp inizio affermazione corrente
  };

    const intro = getMinigameIntroCopy("VF_FLASH");
  const toast = buildToastAll(
    game,
    { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
    { kind: "neutral", title: intro.title, subtitle: "Pronto: VERO o FALSO." },
    1700
  );

  await update(gameRef, {
    ...baseUpdate,
    phase: "MINIGAME",
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
    currentQuestion: null,
    reveal: null,
    minigame,
    toast,
    [`usedVFFlashQuestionIds/${pack.id}`]: true,
  });
}

async function startSequenceMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate) {
  const used = game.usedSequenceQuestionIds ? Object.keys(game.usedSequenceQuestionIds) : [];
  const q = getRandomSequenceQuestion(used);

  if (!q) {
    await update(gameRef, { ...baseUpdate, phase: "WAIT_ROLL", minigame: null });
    return;
  }

  const now = Date.now();
  const durationSec = 30;

  const minigame = {
    type: "SEQUENCE",
    ownerPlayerId,
    questionId: q.id,
    prompt: q.prompt,
    items: q.items,               // array testo
    correctOrder: q.correctOrder, // array indici (segreto, ma ok nel DB come VF)
    submissions: {},              // { [playerId]: [indici scelti] }
    locked: {},                   // { [playerId]: true } ha confermato
    durationSec,
    startedAt: now,
    expiresAt: now + durationSec * 1000,
  };

   const intro = getMinigameIntroCopy("SEQUENCE");
  const toast = buildToastAll(
    game,
    { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
    { kind: "neutral", title: intro.title, subtitle: "Pronto: SEQUENCE." },
    1700
  );

  await update(gameRef, {
    ...baseUpdate,
    phase: "MINIGAME",
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
    currentQuestion: null,
    reveal: null,
    minigame,
    toast,
    [`usedSequenceQuestionIds/${q.id}`]: true,
  });
}

async function startIntruderMinigame(gameRef, game, ownerPlayerId, finalTileId, finalTile, baseUpdate) {
  const used = game.usedIntruderQuestionIds ? Object.keys(game.usedIntruderQuestionIds) : [];
  const q = getRandomIntruderQuestion(used);

  if (!q) {
    await update(gameRef, { ...baseUpdate, phase: "WAIT_ROLL", minigame: null });
    return;
  }

  const minigame = {
    type: "INTRUDER",
    ownerPlayerId,
    questionId: q.id,
    prompt: q.prompt,
    items: q.items,               // 4 opzioni (testo)
    intruderIndex: q.intruderIndex, // resta nel DB per verifica (come VF)
    answeredThis: {},             // { [playerId]: true } = ha già tentato
    currentWinnerId: null,        // primo corretto
  };

   const intro = getMinigameIntroCopy("INTRUDER");
  const toast = buildToastAll(
    game,
    { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
    { kind: "neutral", title: intro.title, subtitle: "Pronto: L'INTRUSO." },
    1700
  );

  await update(gameRef, {
    ...baseUpdate,
    phase: "MINIGAME",
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
    currentQuestion: null,
    reveal: null,
    minigame,
    toast,
    [`usedIntruderQuestionIds/${q.id}`]: true,
  });
}

function prepareCategoryQuestionForTile(game, playerId, tile, tileId) {
  const players = game.players || {};
  const player = players[playerId];
  if (!player) {
    throw new Error("Giocatore non trovato in prepareCategoryQuestionForTile.");
  }

  const category = tile.category;
  if (!category) {
    throw new Error("La casella non ha categoria definita.");
  }

  const levels = player.levels || {};
  const keys = player.keys || {};
  const currentLevel = levels[category] ?? 0;
  const hasKey = !!keys[category];

  const usedCategoryQuestionIds = game.usedCategoryQuestionIds || {};

  // Decidiamo il "tipo" di domanda da fare
  let questionLevel; // 1,2,3 oppure "key"
  let advancesLevel = false;
  let isKeyQuestion = false;

  if (tile.type === "category") {
    if (currentLevel < 3) {
      // Livello successivo
      questionLevel = currentLevel + 1; // 0→1, 1→2, 2→3
      advancesLevel = true;
    } else {
      // Categoria già a livello 3 → solo punti, usiamo domanda di "livello 2"
      questionLevel = 2;
      advancesLevel = false;
    }
  } else if (tile.type === "key") {
    if (currentLevel < 3) {
      // Non hai ancora tutti e 3 i livelli → è come una casella categoria
      questionLevel = currentLevel + 1;
      advancesLevel = true;
    } else if (!hasKey) {
      // Hai i 3 livelli ma non la chiave → domanda chiave
      questionLevel = "key";
      isKeyQuestion = true;
      advancesLevel = false;
    } else {
      // Hai già la chiave → solo punti (domanda di livello 2)
      questionLevel = 2;
      advancesLevel = false;
    }
  } else {
    // In teoria non dovrebbe succedere
    questionLevel = 1;
  }

  // Estraiamo la domanda corretta
  const usedIds = Object.keys(usedCategoryQuestionIds);

  let rawQuestion;
  if (questionLevel === "key") {
    rawQuestion = getRandomKeyQuestion(category, usedIds);
  } else {
    rawQuestion = getRandomCategoryQuestion(category, questionLevel, usedIds);
  }

  if (!rawQuestion) {
    throw new Error(
      "Non ci sono più domande disponibili per questa categoria/livello."
    );
  }

  // Mischiamo le risposte per non avere sempre lo stesso ordine
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const shuffledAnswers = indices.map((i) => rawQuestion.answers[i]);
  const newCorrectIndex = indices.indexOf(rawQuestion.correctIndex);

  // Calcoliamo la durata in secondi in base al tipo di domanda
  const durationSec = getCategoryQuestionDurationSeconds(
    questionLevel,
    isKeyQuestion,
    advancesLevel
  );

  const startedAt = Date.now();
  const expiresAt = startedAt + durationSec * 1000;

  const questionData = {
    id: rawQuestion.id,
    category,
    level: questionLevel, // 1,2,3 oppure "key"
    text: rawQuestion.text,
    answers: shuffledAnswers,
    correctIndex: newCorrectIndex,
    forPlayerId: playerId,
    tileId,
    tileType: tile.type,
    advancesLevel,
    isKeyQuestion,
    // TIMER
    durationSec,
    startedAt,
    expiresAt,
  };

  const extraUpdates = {
    [`usedCategoryQuestionIds/${rawQuestion.id}`]: true,
  };

  return { questionData, extraUpdates };
}


/**
 * Il giocatore di turno risponde alla domanda di categoria.
 * answerIndex = 0..3 (A,B,C,D)
 */
export async function answerCategoryQuestion(gameCode, playerId, answerIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();

  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");
  if (game.currentPlayerId !== playerId) throw new Error("Non è il tuo turno.");
  if (game.phase !== "QUESTION") throw new Error("Non è il momento di rispondere alla domanda.");

  const q = game.currentQuestion;
  if (!q) throw new Error("Nessuna domanda attiva.");
  if (q.forPlayerId !== playerId) throw new Error("Questa domanda non è destinata a te.");

  const players = game.players || {};
  const player = players[playerId];
  if (!player) throw new Error("Giocatore non trovato.");

  const correct = answerIndex === q.correctIndex;

  // Prepariamo strutture giocatore (servono sia per scrigno sia per normali)
  const levels = player.levels || {};
  const keys = player.keys || {};

  const playerPath = `players/${playerId}`;
  const playerUpdate = {
    ...player,
    levels,
    keys,
    points: player.points ?? 0,
  };

  const updates = {
    [`${playerPath}`]: playerUpdate,
    currentQuestion: null,
    phase: "REVEAL",
    reveal: null,
    playerAnswerIndex: null,
  };

  // ───────────────────────────────
  // SCRIGNO FLOW
  // ───────────────────────────────
  if (q.tileType === "scrigno" || q.scrignoMode) {
    const scrigno = game.scrigno || { attempts: {} };
    const attempts = scrigno.attempts || {};
    const a = attempts[playerId] || { failedFinalCount: 0 };

    // REVEAL sempre (qui NON diamo punti per CHALLENGE e FINAL)
    // EXIT_POINTS (scrigno senza 6 chiavi) invece dà +20 se corretta
    if (q.scrignoMode === "EXIT_POINTS" && correct) {
      playerUpdate.points = addPointsSafe(playerUpdate.points, 20);
    }

    const reveal = {
      forPlayerId: playerId,
      correct,
      answerIndex,
      correctIndex: q.correctIndex,
      question: q,
      createdAt: Date.now(),
      hideAt: Date.now() + 2200,
    };

    // 1) Scrigno senza 6 chiavi: dopo reveal → choose_direction (sempre)
    if (q.scrignoMode === "EXIT_POINTS") {
      reveal.turnContinues = true;
      reveal.after = { type: "SCRIGNO_EXIT" };

      updates.reveal = reveal;
      updates.phase = "REVEAL";
      updates.currentQuestion = null;

      await update(gameRef, updates);
      return { correct };
    }

    // 2) Mini-sfida: se sbaglia → stop immediato + passa turno
    if (q.scrignoMode === "CHALLENGE") {
      if (!correct) {
        const { nextIndex, nextPlayerId } = getNextTurn(game);
        updates.currentTurnIndex = nextIndex;
        updates.currentPlayerId = nextPlayerId;

        reveal.turnContinues = false;
        reveal.after = { type: "PASS_TURN" };

        updates.reveal = reveal;
        updates.scrigno = { ...scrigno, attempts: { ...attempts, [playerId]: a } };

        await update(gameRef, updates);
        return { correct };
      }

      // corretto: se non è la 3° → prossima challenge; se è 3° → finale
      reveal.turnContinues = true;
      if ((q.challengeIndex || 1) < 3) {
        reveal.after = { type: "SCRIGNO_NEXT_CHALLENGE", next: (q.challengeIndex || 1) + 1 };
      } else {
        reveal.after = { type: "SCRIGNO_START_FINAL" };
      }

      updates.reveal = reveal;
      updates.scrigno = { ...scrigno, attempts: { ...attempts, [playerId]: a } };

      await update(gameRef, updates);
      return { correct };
    }

    // 3) Finale scrigno: se giusta → vince. Se sbaglia → failedFinalCount++ e passa turno
    if (q.scrignoMode === "FINAL") {
      if (correct) {
        await update(gameRef, {
          state: "ENDED",
          phase: "ENDED",
          winnerPlayerId: playerId,
          currentQuestion: null,
          reveal: {
            ...reveal,
            turnContinues: false,
            after: { type: "GAME_END" },
          },
        });
        return { correct };
      }

      // sbagliata: aumenta fail count e passa turno
      a.failedFinalCount = (a.failedFinalCount || 0) + 1;
      attempts[playerId] = a;

      const { nextIndex, nextPlayerId } = getNextTurn(game);
      updates.currentTurnIndex = nextIndex;
      updates.currentPlayerId = nextPlayerId;

      reveal.turnContinues = false;
      reveal.after = { type: "PASS_TURN" };

      updates.reveal = reveal;
      updates.scrigno = { ...scrigno, attempts };

      await update(gameRef, updates);
      return { correct };
    }
  }

  // ───────────────────────────────
  // DOMANDA NORMALE (category/key)
  // ───────────────────────────────
  let pointsToAdd = 0;
  const currentLevel = levels[q.category] ?? 0;
  const hasKey = !!keys[q.category];

  if (correct) {
    if (q.isKeyQuestion) {
      if (!hasKey) keys[q.category] = true;
      pointsToAdd += 40;
    } else if (typeof q.level === "number") {
      if (q.advancesLevel && currentLevel < 3) {
        const newLevel = Math.max(currentLevel, q.level);
        levels[q.category] = Math.min(3, newLevel);
      }
      if (q.level === 1) pointsToAdd += 15;
      else if (q.level === 2) pointsToAdd += 20;
      else if (q.level === 3) pointsToAdd += 25;
    } else {
      pointsToAdd += 20;
    }
  }

  playerUpdate.points = addPointsSafe(playerUpdate.points, pointsToAdd);

  const now = Date.now();
  const REVEAL_MS = 1400;

  updates.reveal = {
    question: {
      category: q.category,
      isKeyQuestion: !!q.isKeyQuestion,
      text: q.text,
      answers: q.answers,
      correctIndex: q.correctIndex,
    },
    forPlayerId: playerId,
    answerIndex,
    correct,
    shownAt: now,
    hideAt: now + REVEAL_MS,
  };

  if (!correct) {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    updates.currentTurnIndex = nextIndex;
    updates.currentPlayerId = nextPlayerId;
  }

  await update(gameRef, updates);
  return { correct, pointsToAdd };
}

export async function answerRapidFireQuestion(gameCode, playerId, answerIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) throw new Error("Partita non trovata");
  const game = snap.val();

  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");
  if (game.phase !== "RAPID_FIRE") throw new Error("Non è una fase Rapid Fire.");

  const rapidFire = game.rapidFire;
  if (!rapidFire) throw new Error("Rapid Fire non attivo.");

  const players = game.players || {};
  if (!players[playerId]) throw new Error("Giocatore non trovato nella partita.");

  const currentIndex = rapidFire.currentIndex ?? 0;
  const currentQuestion = rapidFire.questions?.[currentIndex];
  if (!currentQuestion) throw new Error("Nessuna domanda Rapid Fire corrente.");

  // strutture per domanda corrente
  const answeredThis = rapidFire.answeredThisQuestion || {};
  if (answeredThis[playerId]) return { alreadyAnswered: true };

  const now = Date.now();

  // tempo impiegato su QUESTA domanda (ms)
  const startedAt = rapidFire.questionStartedAt || rapidFire.startedAt || now;
  const answerTimeMs = Math.max(0, now - startedAt);

  const correct = Number(answerIndex) === Number(currentQuestion.correctIndex);

  const prevScore = rapidFire.scores?.[playerId] ?? 0;
  const prevTotalTime = rapidFire.timesMs?.[playerId] ?? 0;

  const updates = {
    [`rapidFire/answeredThisQuestion/${playerId}`]: true,

    // salviamo cosa ha risposto e in quanto tempo (per reveal banner)
    [`rapidFire/answersThisQuestion/${playerId}`]: Number(answerIndex),
    [`rapidFire/answerTimesThisQuestion/${playerId}`]: answerTimeMs,

    // tempo totale (tie-break)
    [`rapidFire/timesMs/${playerId}`]: prevTotalTime + answerTimeMs,
  };

  if (correct) {
    updates[`rapidFire/scores/${playerId}`] = prevScore + 1;
  }

  await update(gameRef, updates);

  // prova ad avanzare se tutti hanno risposto (ma ora passa dal REVEAL per ritmo show)
  await maybeAdvanceRapidFireIfAllAnswered(gameRef);

  return { correct, answerTimeMs };
}

export async function answerClosestMinigame(gameCode, playerId, value) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) throw new Error("Partita non trovata");
  const game = snap.val();

  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");
  if (game.phase !== "MINIGAME") throw new Error("Non è una fase minigioco.");

  const mg = game.minigame;
  if (!mg || mg.type !== "CLOSEST") throw new Error("Minigioco CLOSEST non attivo.");

  const players = game.players || {};
  if (!players[playerId]) throw new Error("Giocatore non trovato.");

  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error("Valore non valido.");

  const locked = mg.locked || {};
  if (locked[playerId]) return { alreadyAnswered: true };

  const answers = mg.answers || {};
  answers[playerId] = Math.round(num);
  locked[playerId] = true;

  await update(gameRef, {
    minigame: { ...mg, answers, locked },
  });

  return { ok: true };
}

export async function answerSequenceMinigame(gameCode, playerId, orderIndices) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) throw new Error("Partita non trovata");
  const game = snap.val();

  if (game.state !== "IN_PROGRESS") throw new Error("La partita non è in corso.");
  if (game.phase !== "MINIGAME") throw new Error("Non è una fase minigioco.");

  const mg = game.minigame;
  if (!mg || mg.type !== "SEQUENCE") throw new Error("Minigioco SEQUENCE non attivo.");

  const players = game.players || {};
  if (!players[playerId]) throw new Error("Giocatore non trovato.");

  const locked = mg.locked || {};
  if (locked[playerId]) return { alreadyAnswered: true };

  if (!Array.isArray(orderIndices)) throw new Error("Ordine non valido.");
  const n = mg.items?.length ?? 0;

  // valida: deve essere permutazione di 0..n-1
  const arr = orderIndices.map(Number);
  if (arr.length !== n) throw new Error("Ordine incompleto.");
  const setVals = new Set(arr);
  if (setVals.size !== n) throw new Error("Ordine contiene duplicati.");
  for (const v of arr) {
    if (!Number.isInteger(v) || v < 0 || v >= n) throw new Error("Ordine fuori range.");
  }

  const updates = {
    [`minigame/submissions/${playerId}`]: arr,
    [`minigame/locked/${playerId}`]: true,
  };

  await update(gameRef, updates);

  // se tutti hanno risposto prima del timer, chiudiamo subito
  await maybeCloseSequenceIfAllSubmitted(gameRef);

  return { ok: true };
}

async function maybeCloseSequenceIfAllSubmitted(gameRef) {
  const snap = await get(gameRef);
  if (!snap.exists()) return;

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") return;
  if (game.phase !== "MINIGAME") return;

  const mg = game.minigame;
  if (!mg || mg.type !== "SEQUENCE") return;

  const players = game.players || {};
  const playerIds = Object.keys(players);

  const locked = mg.locked || {};
  const allLocked = playerIds.length > 0 && playerIds.every(pid => locked[pid]);

  if (!allLocked) return;

  await finalizeSequenceMinigame(gameRef, game);
}

function sequenceDistanceKendall(submitted, correct) {
  // distanza basata su coppie invertite (più bassa = migliore)
  const pos = {};
  for (let i = 0; i < correct.length; i++) pos[correct[i]] = i;

  let inv = 0;
  for (let i = 0; i < submitted.length; i++) {
    for (let j = i + 1; j < submitted.length; j++) {
      const a = submitted[i], b = submitted[j];
      if (pos[a] > pos[b]) inv++;
    }
  }
  return inv;
}

async function finalizeSequenceMinigame(gameRef, game) {
  const mg = game.minigame;
  const players = game.players || {};
  const playerIds = Object.keys(players);

  const submissions = mg.submissions || {};
  const correct = mg.correctOrder || [];

  // calcola distanza per ciascun player: min = migliore
  const distances = {};
  let best = Infinity;

  for (const pid of playerIds) {
    const sub = submissions[pid];
    if (Array.isArray(sub) && sub.length === correct.length) {
      const d = sequenceDistanceKendall(sub, correct);
      distances[pid] = d;
      if (d < best) best = d;
    } else {
      // se non ha risposto, consideriamolo “peggiore”
      distances[pid] = Infinity;
    }
  }

  const winners = playerIds.filter(pid => distances[pid] === best && best !== Infinity);

const ownerId = mg.ownerPlayerId;
const ownerWon = ownerId && winners.includes(ownerId);

const updates = {
  phase: "WAIT_ROLL",
  minigame: null,
};

// ✅ Regola turni: owner continua solo se è tra i vincitori
if (!ownerWon) {
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;
} else {
  updates.currentTurnIndex = game.currentTurnIndex;
  updates.currentPlayerId = ownerId;
}

  if (winners.length === 1) {
    const w = winners[0];
    updates[`players/${w}/points`] = addPointsSafe(players[w].points, 25);
  } else if (winners.length > 1) {
    for (const w of winners) {
      updates[`players/${w}/points`] = addPointsSafe(players[w].points, 10);
    }
  }

  await update(gameRef, updates);
    // === DROP CARTA (MINIGAME) ===
  // 30% ai vincitori (se più di uno, tentiamo per ciascuno)
  for (const w of winners) {
    await maybeDropCardByRef(gameRef, w, 1.0, "MINIGAME_SEQUENCE_WIN");
  }
}

export async function answerVFFlashMinigame(gameCode, playerId, choiceBool) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  const tx = await runTransaction(gameRef, (game) => {
    if (!game) return game;
    if (game.state !== "IN_PROGRESS") return game;
    if (game.phase !== "MINIGAME") return game;

    const mg = game.minigame;
    if (!mg || mg.type !== "VF_FLASH") return game;

    const players = game.players || {};
    const playerIds = Object.keys(players);
    if (!players[playerId]) return game;

    const idx = mg.index ?? 0;
    const stmt = mg.statements?.[idx];
    if (!stmt) return game;

    // init strutture
    mg.answeredThis = mg.answeredThis || {};
    mg.eliminatedThis = mg.eliminatedThis || {};
    mg.winners = mg.winners || {};
    mg.responseTimes = mg.responseTimes || {};
    mg.currentWinnerId = mg.currentWinnerId || null;

    // start time affermazione (se manca)
    if (!mg.statementStartedAt) mg.statementStartedAt = Date.now();

    // se già chiusa (qualcuno ha già vinto questa affermazione)
    if (mg.currentWinnerId) return game;

    // se il player ha già tentato questa affermazione
    if (mg.answeredThis[playerId]) return game;

    const choice = !!choiceBool;
    const correct = choice === !!stmt.correct;

    // segna il tentativo
    mg.answeredThis[playerId] = true;

    // helper: calcola vincitori finali con tie-break tempo
    function computeBestIds() {
      const entries = Object.entries(mg.winners || {});
      if (!entries.length) return [];

      entries.sort((a, b) => {
        const sA = Number(a[1] || 0);
        const sB = Number(b[1] || 0);
        if (sB !== sA) return sB - sA;

        const tA = Number.isFinite(mg.responseTimes?.[a[0]]) ? mg.responseTimes[a[0]] : Infinity;
        const tB = Number.isFinite(mg.responseTimes?.[b[0]]) ? mg.responseTimes[b[0]] : Infinity;
        return tA - tB;
      });

      const bestId = entries[0][0];
      const bestScore = Number(entries[0][1] || 0);
      const bestTime = Number.isFinite(mg.responseTimes?.[bestId]) ? mg.responseTimes[bestId] : Infinity;

      return entries
        .filter(([pid, sc]) => {
          const s = Number(sc || 0);
          const t = Number.isFinite(mg.responseTimes?.[pid]) ? mg.responseTimes[pid] : Infinity;
          return s === bestScore && t === bestTime;
        })
        .map(([pid]) => pid);
    }

      if (correct) {
      // PRIMO corretto: vince il punto
      mg.currentWinnerId = playerId;
      mg.winners[playerId] = (mg.winners[playerId] || 0) + 1;

      // punti immediati: +10 per affermazione corretta
      players[playerId].points = addPointsSafe(players[playerId].points, 10);

      // REVEAL show tra una affermazione e l’altra
      const now = Date.now();
      const REVEAL_MS = 1600;

      game.phase = "REVEAL";
      game.reveal = {
        kind: "VF_FLASH",
        statement: { text: stmt.text, correct: !!stmt.correct },
        winnerId: playerId,
        shownAt: now,
        hideAt: now + REVEAL_MS,
        after:
          idx < 2
            ? { type: "VF_FLASH_NEXT", nextIndex: idx + 1 }
            : { type: "VF_FLASH_END" },
      };

      // toast host “first correct”
      game.toast = {
        host: {
          kind: "success",
          title: "Vero/Falso – FIRST CORRECT!",
          subtitle: `${players?.[playerId]?.name || "—"} prende il punto`,
        },
        hideAt: now + REVEAL_MS,
      };

      game.players = players;
      game.minigame = mg;
      return game;
    }
    // sbagliato: eliminato per questa affermazione
    mg.eliminatedThis[playerId] = true;

    // se tutti hanno tentato e nessuno ha vinto -> passa alla prossima (o chiudi)
       const allTried = playerIds.length > 0 && playerIds.every((pid) => mg.answeredThis[pid]);
    if (allTried) {
      const now = Date.now();
      const REVEAL_MS = 1600;

      game.phase = "REVEAL";
      game.reveal = {
        kind: "VF_FLASH",
        statement: { text: stmt.text, correct: !!stmt.correct },
        winnerId: null,
        shownAt: now,
        hideAt: now + REVEAL_MS,
        after: idx < 2 ? { type: "VF_FLASH_NEXT", nextIndex: idx + 1 } : { type: "VF_FLASH_END" },
      };

      game.toast = {
        host: {
          kind: "danger",
          title: "Vero/Falso – Nessun punto",
          subtitle: `Risposta corretta: ${stmt.correct ? "VERO" : "FALSO"}`,
        },
        hideAt: now + REVEAL_MS,
      };

      game.minigame = mg;
      return game;
    }

    // se non tutti hanno tentato (o qualcuno ha sbagliato), continuiamo il minigioco
    game.minigame = mg;
    return game;
  });

  // Drop carta ai vincitori (bestIds) — post transaction
  if (tx.committed) {
    const after = tx.snapshot.val();
    if (after?.lastMinigameType === "VF_FLASH") {
      const bestIds = Array.isArray(after?.lastVFFlashBestIds) ? after.lastVFFlashBestIds : [];
      for (const w of bestIds) {
        await maybeDropCardByRef(gameRef, w, 1.0, "MINIGAME_VF_FLASH_WIN");
      }
    }
  }

  if (!tx.committed) return { ok: false };
  return { ok: true };
}

export async function answerIntruderMinigame(gameCode, playerId, chosenIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  const tx = await runTransaction(gameRef, (game) => {
    if (!game) return game;
    if (game.state !== "IN_PROGRESS") return game;
    if (game.phase !== "MINIGAME") return game;

    const mg = game.minigame;
    if (!mg || mg.type !== "INTRUDER") return game;

    const players = game.players || {};
    const playerIds = Object.keys(players);
    if (!players[playerId]) return game;

    mg.answeredThis = mg.answeredThis || {};
    mg.currentWinnerId = mg.currentWinnerId || null;

    // se già c'è un vincitore, stop
    if (mg.currentWinnerId) return game;

    // se questo player ha già tentato, stop
    if (mg.answeredThis[playerId]) return game;

    const idx = Number(chosenIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return game;

    mg.answeredThis[playerId] = true;

    const correct = idx === mg.intruderIndex;

    if (correct) {
      // primo corretto vince e prende +20
      mg.currentWinnerId = playerId;
      players[playerId].points = addPointsSafe(players[playerId].points, 20);

      // salva info per drop post-transaction
      game.lastMinigameWinnerId = playerId;
      game.lastMinigameType = "INTRUDER";

      // chiudi minigame subito
      game.phase = "WAIT_ROLL";
      game.minigame = null;
      game.players = players;

      const ownerId = mg.ownerPlayerId;
const ownerWon = ownerId && (playerId === ownerId);

if (!ownerWon) {
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  game.currentTurnIndex = nextIndex;
  game.currentPlayerId = nextPlayerId;
} else {
  game.currentTurnIndex = game.currentTurnIndex; // invariato
  game.currentPlayerId = ownerId;
}
      return game;
    }

    // se tutti hanno tentato e nessuno ha vinto -> chiudi minigame
    const allTried = playerIds.length > 0 && playerIds.every((pid) => mg.answeredThis[pid]);
if (allTried) {
  game.lastMinigameType = "INTRUDER";
  game.phase = "WAIT_ROLL";
  game.minigame = null;

  // ✅ Regola turni: nessun vincitore = esito negativo per owner → passa turno
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  game.currentTurnIndex = nextIndex;
  game.currentPlayerId = nextPlayerId;
} else {
  game.minigame = mg;
}

    return game;
  });

  if (tx.committed) {
    const after = tx.snapshot.val();
    if (after?.lastMinigameType === "INTRUDER" && after?.lastMinigameWinnerId) {
      await maybeDropCardByRef(gameRef, after.lastMinigameWinnerId, 1.0, "MINIGAME_INTRUDER_WIN");
    }
  }

  return { ok: true };
}


export async function checkAndHandleMinigameTimeout(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) return { handled: false };

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") return { handled: false };
  if (game.phase !== "MINIGAME") return { handled: false };

  const mg = game.minigame;
  if (!mg || !mg.expiresAt) return { handled: false };

  const now = Date.now();
  if (now < mg.expiresAt) return { handled: false };


if (mg.type === "SEQUENCE") {
  await finalizeSequenceMinigame(gameRef, game);
  return { handled: true };
}

if (mg.type !== "CLOSEST") {
  // ✅ Regola turni: timeout = esito negativo per owner → passa turno
  const ownerId = mg.ownerPlayerId;
  const { nextIndex, nextPlayerId } = getNextTurn(game);

  await update(gameRef, {
    phase: "WAIT_ROLL",
    minigame: null,
    currentTurnIndex: nextIndex,
    currentPlayerId: nextPlayerId,
  });

  return { handled: true };
}

  const players = game.players || {};
  const answers = mg.answers || {};
  const correctValue = mg.challenge?.correctValue;

  let winnerId = null;
  let bestDiff = Infinity;

  for (const [pid, raw] of Object.entries(answers)) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const diff = Math.abs(v - correctValue);
    if (diff < bestDiff) {
      bestDiff = diff;
      winnerId = pid;
    }
  }

  const updates = {
    phase: "WAIT_ROLL",
    minigame: null,
  };
  // ✅ Regola turni: owner continua solo se vince lui (winnerId === ownerId)
const ownerId = mg.ownerPlayerId;
const ownerWon = ownerId && (winnerId === ownerId);

if (!ownerWon) {
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;
} else {
  updates.currentTurnIndex = game.currentTurnIndex;
  updates.currentPlayerId = ownerId;
}

  // Punti: +25 al vincitore (come da config che stai usando)
  if (winnerId && players[winnerId]) {
    updates[`players/${winnerId}/points`] = addPointsSafe(players[winnerId].points, 25);
  }

  await update(gameRef, updates);
  if (winnerId) {
  await maybeDropCardByRef(gameRef, winnerId, 1.0, "MINIGAME_CLOSEST_WIN");
}
  return { handled: true, winnerId };
}


async function maybeAdvanceRapidFireIfAllAnswered(gameRef) {
  const snap = await get(gameRef);
  if (!snap.exists()) return;

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") return;
  if (game.phase !== "RAPID_FIRE") return;

  const rapidFire = game.rapidFire;
  if (!rapidFire) return;

  const players = game.players || {};
  const playerIds = Object.keys(players);

  const answered = rapidFire.answeredThisQuestion || {};
  const allAnswered = playerIds.length > 0 && playerIds.every((pid) => answered[pid]);
  if (!allAnswered) return;

  const currentIndex = rapidFire.currentIndex ?? 0;
  const totalQuestions = rapidFire.questions?.length ?? 0;
  const question = rapidFire.questions?.[currentIndex];

  const now = Date.now();
  const REVEAL_MS = 1600;

  // chi ha risposto correttamente (per banner)
  const answersMap = rapidFire.answersThisQuestion || {};
  const correctPlayers = [];
  const correctIndex = question?.correctIndex;

  for (const pid of playerIds) {
    if (Number(answersMap?.[pid]) === Number(correctIndex)) correctPlayers.push(pid);
  }

  // mettiamo REVEAL tra una domanda e l’altra (ritmo show)
  const isLast = currentIndex >= totalQuestions - 1;

  await update(gameRef, {
    phase: "REVEAL",
    reveal: {
      kind: "RAPID_FIRE",
      question: {
        text: question?.text || "",
        answers: question?.answers || [],
        correctIndex: Number(correctIndex),
      },
      correctPlayers,
      shownAt: now,
      hideAt: now + REVEAL_MS,
      after: isLast
        ? { type: "RAPID_FIRE_END" }
        : { type: "RAPID_FIRE_NEXT", nextIndex: currentIndex + 1 },
    },

    // toast host “banner”
    toast: {
      host: {
        kind: correctPlayers.length ? "success" : "danger",
        title: `Rapid Fire – Risposta corretta: ${String.fromCharCode(65 + Number(correctIndex))}`,
        subtitle: correctPlayers.length
          ? `Corretti: ${correctPlayers
              .map((pid) => players?.[pid]?.name || pid)
              .join(", ")}`
          : "Nessuno ha risposto correttamente",
      },
      // (facoltativo) potresti aggiungere toast.players se vuoi anche sui telefoni
      hideAt: now + REVEAL_MS,
    },
  });
}


export async function checkAndHandleRapidFireTimeout(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snapshot = await get(gameRef);
  const game = snapshot.val();
  if (!game) return { handled: false, reason: "NO_GAME" };

  if (game.state !== "IN_PROGRESS") {
    return { handled: false, reason: "NOT_IN_PROGRESS" };
  }

  if (game.phase !== "RAPID_FIRE") {
    return { handled: false, reason: "NOT_IN_RAPID_FIRE" };
  }

  const rapidFire = game.rapidFire;
  if (!rapidFire || !rapidFire.questions || rapidFire.questions.length === 0) {
    return { handled: false, reason: "NO_RAPID_FIRE_DATA" };
  }

  const now = Date.now();
  const expiresAt = rapidFire.expiresAt;
  if (!expiresAt) {
    return { handled: false, reason: "NO_EXPIRES_AT" };
  }

  // Se il tempo non è ancora scaduto → non facciamo nulla
  if (now < expiresAt) {
    return { handled: false, reason: "NOT_EXPIRED" };
  }

  const players = game.players || {};
  const playerIds = Object.keys(players);

   // Vediamo se ci sono altre domande
  const currentIndex = rapidFire.currentIndex ?? 0;
  const totalQuestions = rapidFire.questions.length;

  const question = rapidFire.questions?.[currentIndex];
  const correctIndex = question?.correctIndex;

  const now2 = Date.now();
  const REVEAL_MS = 1600;

  const answersMap = rapidFire.answersThisQuestion || {};
  const correctPlayers = [];
  for (const pid of playerIds) {
    if (Number(answersMap?.[pid]) === Number(correctIndex)) correctPlayers.push(pid);
  }

  const isLast = currentIndex >= totalQuestions - 1;

  await update(gameRef, {
    phase: "REVEAL",
    reveal: {
      kind: "RAPID_FIRE",
      question: {
        text: question?.text || "",
        answers: question?.answers || [],
        correctIndex: Number(correctIndex),
      },
      correctPlayers,
      shownAt: now2,
      hideAt: now2 + REVEAL_MS,
      after: isLast
        ? { type: "RAPID_FIRE_END" }
        : { type: "RAPID_FIRE_NEXT", nextIndex: currentIndex + 1 },
    },
    toast: {
      host: {
        kind: correctPlayers.length ? "success" : "danger",
        title: `Rapid Fire – Risposta corretta: ${String.fromCharCode(65 + Number(correctIndex))}`,
        subtitle: correctPlayers.length
          ? `Corretti: ${correctPlayers
              .map((pid) => players?.[pid]?.name || pid)
              .join(", ")}`
          : "Nessuno ha risposto correttamente",
      },
      hideAt: now2 + REVEAL_MS,
    },
  });

  return { handled: true, reason: isLast ? "REVEAL_END" : "REVEAL_NEXT" };

  const scores = rapidFire.scores || {};
  const times = rapidFire.times || {};
  const updates = {};

  // Classifica: più risposte corrette (desc), a parità tempo totale minore (asc)
  const rows = playerIds.map((pid) => ({
    pid,
    score: scores[pid] ?? 0,
    time: Number.isFinite(times[pid]) ? times[pid] : Infinity,
  }));

  rows.sort((a, b) => (b.score - a.score) || (a.time - b.time));

  const bestScore = rows[0]?.score ?? 0;
  const bestTime = rows[0]?.time ?? Infinity;

  const firstGroup = rows
    .filter((r) => r.score === bestScore && r.time === bestTime)
    .map((r) => r.pid);

  // Secondo: solo se esiste un primo unico
  let secondGroup = [];
  if (firstGroup.length === 1) {
    const second = rows.find((r) => !(r.score === bestScore && r.time === bestTime));
    if (second) {
      secondGroup = rows
        .filter((r) => r.score === second.score && r.time === second.time)
        .map((r) => r.pid);
    }
  }

  const worst = rows[rows.length - 1];
  const lastGroup = worst
    ? rows
        .filter((r) => r.score === worst.score && r.time === worst.time)
        .map((r) => r.pid)
    : [];

  // Applica punti: 1° +30, 2° +15, ultimo -10, altri 0
  for (const pid of playerIds) {
    const player = players[pid];
    let delta = 0;

    if (firstGroup.includes(pid)) delta = 30;
    else if (secondGroup.includes(pid)) delta = 15;
    else if (lastGroup.includes(pid)) delta = -10;

    updates[`players/${pid}/points`] = addPointsSafe(player.points, delta);
  }

  // ✅ Regola turni: owner continua SOLO se è vincitore (firstGroup)
  const ownerId = rapidFire.ownerPlayerId;
  const ownerWon = ownerId && firstGroup.includes(ownerId);

  if (!ownerWon) {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    updates.currentTurnIndex = nextIndex;
    updates.currentPlayerId = nextPlayerId;
  } else {
    updates.currentTurnIndex = game.currentTurnIndex;
    updates.currentPlayerId = ownerId;
  }

  updates.rapidFire = null;
  updates.phase = "WAIT_ROLL";
  await update(gameRef, updates);
  // === DROP CARTA (MINIGAME: RAPID_FIRE) ===
// 40% al primo, 15% al secondo (se esiste)
for (const pid of firstGroup) {
  await maybeDropCardByRef(gameRef, pid, 1.0, "MINIGAME_RAPID_FIRE_FIRST");
}
for (const pid of secondGroup) {
  await maybeDropCardByRef(gameRef, pid, 1.0, "MINIGAME_RAPID_FIRE_SECOND");
}
  return { handled: true, reason: "FINISHED" };
}



/**
 * Restituisce indice e id del prossimo giocatore nel turno.
 */
function getNextTurn(game) {
  const order = game.turnOrder || [];
  if (!order.length) return { nextIndex: 0, nextPlayerId: null };

  const currentIndex = game.currentTurnIndex ?? 0;
  const nextIndex = (currentIndex + 1) % order.length;
  return { nextIndex, nextPlayerId: order[nextIndex] };
}

/**
 * Controlla se la domanda corrente è scaduta e, in tal caso,
 * la considera come risposta sbagliata e passa il turno.
 * Da chiamare periodicamente lato host.
 */
export async function checkAndHandleQuestionTimeout(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);

  if (!snap.exists()) return { handled: false, reason: "NO_GAME" };

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") return { handled: false, reason: "NOT_IN_PROGRESS" };
  if (game.phase !== "QUESTION") return { handled: false, reason: "NOT_IN_QUESTION_PHASE" };

  const q = game.currentQuestion;
  if (!q) return { handled: false, reason: "NO_QUESTION" };

  const now = Date.now();
  let expiresAt = q.expiresAt;
  if (!expiresAt && q.startedAt && q.durationSec) expiresAt = q.startedAt + q.durationSec * 1000;
  if (!expiresAt) return { handled: false, reason: "NO_EXPIRES_AT" };
  if (now < expiresAt) return { handled: false, reason: "NOT_EXPIRED" };

  // timeout = risposta sbagliata senza answerIndex
  const playerId = q.forPlayerId;
  const players = game.players || {};
  const player = players[playerId];
  if (!player) return { handled: false, reason: "PLAYER_NOT_FOUND" };

  const correct = false;
  const answerIndex = null;

  const reveal = {
    forPlayerId: playerId,
    correct,
    answerIndex, // null = nessuna risposta
    correctIndex: q.correctIndex,
    question: q,
    createdAt: Date.now(),
    hideAt: Date.now() + 2200,
  };

  // ───────────────────────────────
  // SCRIGNO TIMEOUT (stesso schema di answerCategoryQuestion)
  // ───────────────────────────────
  if (q.tileType === "scrigno" || q.scrignoMode) {
    const scrigno = game.scrigno || { attempts: {} };
    const attempts = scrigno.attempts || {};
    const a = attempts[playerId] || { failedFinalCount: 0 };

    // 1) EXIT_POINTS: turno continua e poi CHOOSE_DIRECTION
    if (q.scrignoMode === "EXIT_POINTS") {
      reveal.turnContinues = true;
      reveal.after = { type: "SCRIGNO_EXIT" };

      await update(gameRef, {
        currentQuestion: null,
        phase: "REVEAL",
        reveal,
        playerAnswerIndex: null,
      });
      return { handled: true, reason: "SCRIGNO_TIMEOUT_EXIT_POINTS" };
    }

    // 2) CHALLENGE: appena sbaglia (timeout) -> stop e passa turno
    if (q.scrignoMode === "CHALLENGE") {
      const { nextIndex, nextPlayerId } = getNextTurn(game);

      reveal.turnContinues = false;
      reveal.after = { type: "PASS_TURN" };

      await update(gameRef, {
        currentQuestion: null,
        phase: "REVEAL",
        reveal,
        scrigno: { ...scrigno, attempts: { ...attempts, [playerId]: a } },
        currentTurnIndex: nextIndex,
        currentPlayerId: nextPlayerId,
        playerAnswerIndex: null,
      });
      return { handled: true, reason: "SCRIGNO_TIMEOUT_CHALLENGE" };
    }

    // 3) FINAL: timeout = errore finale -> failedFinalCount++ e passa turno
    if (q.scrignoMode === "FINAL") {
      a.failedFinalCount = (a.failedFinalCount || 0) + 1;
      attempts[playerId] = a;

      const { nextIndex, nextPlayerId } = getNextTurn(game);

      reveal.turnContinues = false;
      reveal.after = { type: "PASS_TURN" };

      await update(gameRef, {
        currentQuestion: null,
        phase: "REVEAL",
        reveal,
        scrigno: { ...scrigno, attempts },
        currentTurnIndex: nextIndex,
        currentPlayerId: nextPlayerId,
        playerAnswerIndex: null,
      });
      return { handled: true, reason: "SCRIGNO_TIMEOUT_FINAL" };
    }
  }

  // ───────────────────────────────
  // DOMANDA NORMALE TIMEOUT: REVEAL + passa turno
  // ───────────────────────────────
  const { nextIndex, nextPlayerId } = getNextTurn(game);

  reveal.turnContinues = false;
  reveal.after = { type: "PASS_TURN" };

  await update(gameRef, {
    currentQuestion: null,
    phase: "REVEAL",
    reveal,
    currentTurnIndex: nextIndex,
    currentPlayerId: nextPlayerId,
    playerAnswerIndex: null,
  });

  return { handled: true, reason: "EXPIRED_TIMEOUT" };
}

export async function checkAndHandleRevealAdvance(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) return { handled: false, reason: "NO_GAME" };

  const game = snap.val();
  if (game.state !== "IN_PROGRESS") return { handled: false, reason: "NOT_IN_PROGRESS" };
  if (game.phase !== "REVEAL") return { handled: false, reason: "NOT_IN_REVEAL" };

  const reveal = game.reveal;
  if (!reveal || !reveal.hideAt) return { handled: false, reason: "NO_REVEAL_DATA" };

  const now = Date.now();
  if (now < reveal.hideAt) return { handled: false, reason: "NOT_EXPIRED" };

  const r = game.reveal;
  const after = r?.after || null;

  // pulizia base
  const base = { reveal: null, playerAnswerIndex: null };

  // ───────────────────────────────
  // SCRIGNO ADVANCE
  // ───────────────────────────────
  if (after?.type === "SCRIGNO_EXIT") {
    const scrignoTileId = game.currentTile?.tileId;
    const tile = BOARD[scrignoTileId];
    const neighbors = tile?.neighbors || [];

    const availableDirections = neighbors.map((neighborId, idx) => {
      const t = BOARD[neighborId];
      return {
        index: idx,
        toTileId: neighborId,
        type: t.type,
        category: t.category || null,
        zone: t.zone,
        label: `Uscita ${idx + 1}`,
      };
    });

    await update(gameRef, {
      ...base,
      phase: "CHOOSE_DIRECTION",
      currentDice: 1,
      currentMove: { fromTileId: scrignoTileId, dice: 1 },
      availableDirections,
    });

    return { handled: true, reason: "SCRIGNO_EXIT" };
  }

  if (after?.type === "SCRIGNO_NEXT_CHALLENGE") {
    const q2 = makeScrignoChallengeQuestion(game, r.forPlayerId, after.next);
    if (!q2) {
      await update(gameRef, { ...base, phase: "WAIT_ROLL" });
      return { handled: true, reason: "SCRIGNO_CHALLENGE_FALLBACK" };
    }

    await update(gameRef, {
      ...base,
      phase: "QUESTION",
      currentQuestion: q2,
      [`usedCategoryQuestionIds/${q2.id}`]: true,
    });

    return { handled: true, reason: "SCRIGNO_NEXT_CHALLENGE" };
  }

  if (after?.type === "SCRIGNO_START_FINAL") {
    const qF = makeScrignoFinalQuestion(game, r.forPlayerId, game.scrigno?.finalCategory || null);
    if (!qF) {
      await update(gameRef, { ...base, phase: "WAIT_ROLL" });
      return { handled: true, reason: "SCRIGNO_FINAL_FALLBACK" };
    }

    await update(gameRef, {
      ...base,
      phase: "QUESTION",
      currentQuestion: qF,
      [`usedCategoryQuestionIds/${qF.id}`]: true,
    });

    return { handled: true, reason: "SCRIGNO_FINAL" };
  }

    // ───────────────────────────────
  // RAPID FIRE: advance post-reveal (ritmo show)
  // ───────────────────────────────
  if (after?.type === "RAPID_FIRE_NEXT") {
    const rf = game.rapidFire;
    if (!rf) {
      await update(gameRef, { ...base, phase: "WAIT_ROLL" });
      return { handled: true, reason: "RAPID_FIRE_NO_DATA" };
    }

    const nextIndex = Number(after.nextIndex);
    const now2 = Date.now();
    const dur = Number(rf.durationSec ?? 10);

    await update(gameRef, {
      ...base,
      phase: "RAPID_FIRE",
      [`rapidFire/currentIndex`]: nextIndex,
      [`rapidFire/answeredThisQuestion`]: {},
      [`rapidFire/answersThisQuestion`]: {},
      [`rapidFire/answerTimesThisQuestion`]: {},
      [`rapidFire/questionStartedAt`]: now2,
      [`rapidFire/startedAt`]: now2,
      [`rapidFire/expiresAt`]: now2 + dur * 1000,
    });

    return { handled: true, reason: "RAPID_FIRE_NEXT" };
  }

  if (after?.type === "RAPID_FIRE_END") {
    const rf = game.rapidFire;
    const players = game.players || {};
    const playerIds = Object.keys(players);

    if (!rf) {
      await update(gameRef, { ...base, phase: "WAIT_ROLL" });
      return { handled: true, reason: "RAPID_FIRE_END_NO_DATA" };
    }

    const scores = rf.scores || {};
    const timesMs = rf.timesMs || {};

    // ranking: score desc, time asc
    const rows = playerIds.map((pid) => ({
      pid,
      score: Number(scores[pid] ?? 0),
      time: Number(timesMs[pid] ?? 0),
    }));

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.time - b.time;
    });

    const winnerPid = rows[0]?.pid || null;
    const ownerPid = rf.ownerPlayerId || null;

    // Punti (puoi rifinire dopo): winner +30, secondo +15, ultimo -10
    const updates = {
      ...base,
      rapidFire: null,
      lastMinigameType: "RAPID_FIRE",
    };

    const firstScore = rows[0]?.score ?? 0;
    const firstTime = rows[0]?.time ?? 0;

    const secondRow = rows.find((r) => r.pid !== winnerPid);
    const lastRow = rows[rows.length - 1];

    for (const r of rows) {
      const p = players[r.pid];
      if (!p) continue;

      let delta = 0;
      if (r.pid === winnerPid) delta = 30;
      else if (secondRow && r.pid === secondRow.pid) delta = 15;
      else if (lastRow && r.pid === lastRow.pid) delta = -10;

      players[r.pid].points = addPointsSafe(players[r.pid].points, delta);
    }

    // regola tua: se owner non vince → passa turno
    if (winnerPid && ownerPid && winnerPid !== ownerPid) {
      const { nextIndex, nextPlayerId } = getNextTurn(game);
      updates.currentTurnIndex = nextIndex;
      updates.currentPlayerId = nextPlayerId;
    }

    // toast finale “show”
    const now2 = Date.now();
    updates.players = players;
    updates.toast = {
      host: {
        kind: "success",
        title: `Rapid Fire – Vince ${players?.[winnerPid]?.name || "—"}`,
        subtitle: `Corrette: ${firstScore} • Tempo: ${(firstTime / 1000).toFixed(2)}s`,
      },
      hideAt: now2 + 2200,
    };

    await update(gameRef, {
      ...updates,
      phase: "WAIT_ROLL",
    });

    // carta bonus al vincitore (coerente con tuo sistema)
    if (winnerPid) {
      await maybeDropCardByRef(gameRef, winnerPid, 1.0, "MINIGAME_RAPID_FIRE_WIN");
    }

    return { handled: true, reason: "RAPID_FIRE_END" };
  }

  // ───────────────────────────────
  // VF FLASH: advance post-reveal (ritmo show)
  // ───────────────────────────────
  if (after?.type === "VF_FLASH_NEXT") {
    const mg = game.minigame;
    if (!mg || mg.type !== "VF_FLASH") {
      await update(gameRef, { ...base, phase: "WAIT_ROLL", minigame: null });
      return { handled: true, reason: "VF_FLASH_NEXT_NO_MG" };
    }

    const nextIndex = Number(after.nextIndex);

    await update(gameRef, {
      ...base,
      phase: "MINIGAME",
      minigame: {
        ...mg,
        index: nextIndex,
        answeredThis: {},
        eliminatedThis: {},
        currentWinnerId: null,
      },
    });

    return { handled: true, reason: "VF_FLASH_NEXT" };
  }

if (after?.type === "VF_FLASH_END") {
  const mg = game.minigame;
  const players = game.players || {};

  const winMap = mg?.winners || {};
  const timeMap = mg?.responseTimes || {};
  const entries = Object.entries(winMap);

  // tie-break: punti desc, tempo asc
  let bestIds = [];
  if (entries.length) {
    entries.sort((a, b) => {
      const sa = Number(a[1] || 0);
      const sb = Number(b[1] || 0);
      if (sb !== sa) return sb - sa;

      const ta = Number.isFinite(timeMap?.[a[0]]) ? Number(timeMap[a[0]]) : Infinity;
      const tb = Number.isFinite(timeMap?.[b[0]]) ? Number(timeMap[b[0]]) : Infinity;
      return ta - tb;
    });

    const bestScore = Number(entries[0][1] || 0);
    const bestTime = Number.isFinite(timeMap?.[entries[0][0]]) ? Number(timeMap[entries[0][0]]) : Infinity;

    bestIds = entries
      .filter(([pid, sc]) => {
        const s = Number(sc || 0);
        const t = Number.isFinite(timeMap?.[pid]) ? Number(timeMap[pid]) : Infinity;
        return s === bestScore && t === bestTime;
      })
      .map(([pid]) => pid);
  }

  // regola tua: se owner non è tra i vincitori finali -> passa turno
  const ownerId = mg?.ownerPlayerId || null;
  const ownerWon = ownerId && bestIds.includes(ownerId);

  const updates = {
    ...base,
    phase: "WAIT_ROLL",
    minigame: null,
    reveal: null,
    lastMinigameType: "VF_FLASH",
    lastVFFlashWinners: winMap,
    lastVFFlashTimes: timeMap,
    lastVFFlashBestIds: bestIds,
  };

  if (!ownerWon) {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    updates.currentTurnIndex = nextIndex;
    updates.currentPlayerId = nextPlayerId;
  } else {
    // resta l’owner (coerente con “se esito positivo va avanti”)
    updates.currentTurnIndex = game.currentTurnIndex;
    updates.currentPlayerId = ownerId;
  }

  // toast finale “show”
  const topName = bestIds[0] ? (players?.[bestIds[0]]?.name || "—") : "—";
  updates.toast = {
    host: {
      kind: bestIds.length ? "success" : "danger",
      title: bestIds.length ? `Vero/Falso – Vince ${topName}` : "Vero/Falso – Nessun vincitore",
      subtitle: bestIds.length
        ? `Punti: ${Number(winMap?.[bestIds[0]] || 0)} • Tempo: ${(Number(timeMap?.[bestIds[0]] || 0) / 1000).toFixed(2)}s`
        : "Nessuno ha segnato punti",
    },
    hideAt: Date.now() + 2200,
  };

  await update(gameRef, updates);

  // drop carte ai best (coerente col tuo sistema “premio minigame”)
  for (const pid of bestIds) {
    await maybeDropCardByRef(gameRef, pid, 1.0, "MINIGAME_VF_FLASH_WIN");
  }

  return { handled: true, reason: "VF_FLASH_END" };
}
  // ───────────────────────────────
  // EVENTI: post-reveal (tua logica invariata)
  // ───────────────────────────────
  const ev = game.currentEvent;
  const afterEv = ev?._afterReveal;

  if (afterEv?.kind === "DUEL_NEXT") {
    const roundIndex = ev.roundIndex ?? 0;
    const totalRounds = ev.totalRounds ?? 3;

    if (roundIndex < totalRounds - 1) {
      const q = makeRandomEventQuestion(game, 2);
      if (!q) {
        const { nextIndex, nextPlayerId } = getNextTurn(game);
        await update(gameRef, {
          phase: "WAIT_ROLL",
          reveal: null,
          currentEvent: null,
          currentQuestion: null,
          currentTurnIndex: nextIndex,
          currentPlayerId: nextPlayerId,
        });
        return { handled: true, reason: "DUEL_ABORT_NO_Q" };
      }

      await update(gameRef, {
        phase: "EVENT_DUEL_QUESTION",
        reveal: null,
        currentQuestion: q,
        [`usedCategoryQuestionIds/${q.id}`]: true,
        currentEvent: {
          ...ev,
          roundIndex: roundIndex + 1,
          answeredBy: {},
          _afterReveal: null,
        },
      });

      return { handled: true, reason: "DUEL_NEXT_ROUND" };
    }

    const owner = ev.ownerPlayerId;
    const opp = ev.opponentPlayerId;
    const score = ev.score || {};
    const sOwner = score[owner] || 0;
    const sOpp = score[opp] || 0;

    const updates = {
      reveal: null,
      currentQuestion: null,
      currentEvent: null,
      phase: "WAIT_ROLL",
    };

    const players = game.players || {};
    const pOwner = players[owner];
    const pOpp = players[opp];

    if (owner && opp && pOwner && pOpp) {
  const now = Date.now();

  const nOwner = pOwner?.name || "Player 1";
  const nOpp = pOpp?.name || "Player 2";

  const baseOwner = Number.isFinite(pOwner?.points) ? pOwner.points : 0;
  const baseOpp   = Number.isFinite(pOpp?.points) ? pOpp.points : 0;

  let hostTitle = "⚔️ Duello concluso!";
  let hostSubtitle = "";
  let ownerDelta = 0;
  let oppDelta = 0;

  if (sOwner > sOpp) {
    ownerDelta = 50;
    hostSubtitle = `Vince ${nOwner} (+50) — ${sOwner} a ${sOpp}`;
  } else if (sOpp > sOwner) {
    oppDelta = 50;
    hostSubtitle = `Vince ${nOpp} (+50) — ${sOpp} a ${sOwner}`;
  } else {
    ownerDelta = 10;
    oppDelta = 10;
    hostSubtitle = `Pareggio (+10 ciascuno) — ${sOwner} a ${sOpp}`;
  }

  updates[`players/${owner}/points`] = addPointsSafe(baseOwner, ownerDelta);
  updates[`players/${opp}/points`]   = addPointsSafe(baseOpp, oppDelta);

  // ✅ toast (host + player)
  updates.toast = {
    shownAt: now,
    hideAt: now + 2600,
    host: {
      kind: (sOwner === sOpp) ? "neutral" : "success",
      title: hostTitle,
      subtitle: hostSubtitle,
    },
    players: {
      [owner]: {
        kind: ownerDelta >= 0 ? "success" : "danger",
        title: "⚔️ Esito duello",
        subtitle: ownerDelta
          ? `Hai ${ownerDelta > 0 ? "guadagnato" : "perso"} ${Math.abs(ownerDelta)} punti.`
          : "Nessun cambiamento punti.",
      },
      [opp]: {
        kind: oppDelta >= 0 ? "success" : "danger",
        title: "⚔️ Esito duello",
        subtitle: oppDelta
          ? `Hai ${oppDelta > 0 ? "guadagnato" : "perso"} ${Math.abs(oppDelta)} punti.`
          : "Nessun cambiamento punti.",
      },
    },
  };
}

   // ✅ Regola turni: se OWNER vince o pareggia → continua, se perde → passa turno
const ownerWonOrTied = (sOwner >= sOpp);

if (!ownerWonOrTied) {
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;
} else {
  // resta il turno dell'owner (di solito è già così, ma lo lasciamo esplicito)
  updates.currentTurnIndex = game.currentTurnIndex;
  updates.currentPlayerId = owner;
}

await update(gameRef, updates);
  }

if (afterEv?.kind === "END_SINGLE") {
  const now = Date.now();
  const ownerId = ev?.ownerPlayerId;

  // delta > 0 = esito positivo (continua). delta <= 0 = negativo o neutro (passa turno)
  const delta = Number.isFinite(r?.delta) ? r.delta : 0;
  const isPositive = delta > 0;

  const pName = game.players?.[ownerId]?.name || "Giocatore";

  const updates = {
    phase: "WAIT_ROLL",
    reveal: null,
    currentQuestion: null,
    currentEvent: null,
    toast: {
      shownAt: now,
      hideAt: now + 2400,
      host: {
        kind: delta >= 0 ? "success" : "danger",
        title: "🎲 Evento concluso",
        subtitle: `${pName}: ${delta >= 0 ? "+" : ""}${delta} punti`,
      },
      players: ownerId ? {
        [ownerId]: {
          kind: delta >= 0 ? "success" : "danger",
          title: "🎲 Evento concluso",
          subtitle: `Hai ${delta >= 0 ? "guadagnato" : "perso"} ${Math.abs(delta)} punti.`,
        }
      } : {}
    },
  };

  if (!isPositive) {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    updates.currentTurnIndex = nextIndex;
    updates.currentPlayerId = nextPlayerId;
  } else {
    updates.currentTurnIndex = game.currentTurnIndex;
    updates.currentPlayerId = ownerId;
  }

  await update(gameRef, updates);

  // DROP carta rimane uguale
  await maybeDropCardByRef(gameRef, ownerId, 1.0, "EVENT_GENERIC");
  return { handled: true, reason: "EVENT_FINISHED" };
}

  // default (domande normali)
  await update(gameRef, {
    phase: "WAIT_ROLL",
    reveal: null,
  });

  return { handled: true, reason: "REVEAL_FINISHED" };
}

/* ─────────────────────────────────────────────
   EVENTI (STEP 3 - logica base)
   DUELLO / BOOM / RISK
   ───────────────────────────────────────────── */

const EVENT_TYPES = ["DUELLO", "BOOM", "RISK"];
const EVENT_REVEAL_MS = 1400;

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildToastAll(game, hostToast, playersToast, ttlMs = 1600) {
  const players = game.players || {};
  const outPlayers = {};
  for (const pid of Object.keys(players)) {
    outPlayers[pid] = { ...(playersToast || {}) };
  }
  return {
    hideAt: Date.now() + ttlMs,
    host: { kind: "neutral", title: "", subtitle: "", ...hostToast },
    players: outPlayers,
  };
}

function getMinigameIntroCopy(type) {
  switch (type) {
    case "RAPID_FIRE":
      return {
        title: "🎬 MINIGIOCO: RAPID FIRE",
        subtitle: "3 domande, ritmo altissimo. Rispondi il più veloce possibile!",
      };
    case "VF_FLASH":
      return {
        title: "⚡ MINIGIOCO: VERO / FALSO LAMPO",
        subtitle: "3 affermazioni: un solo tentativo per ognuna. Velocità = vantaggio.",
      };
    case "CLOSEST":
      return {
        title: "🎯 MINIGIOCO: PIÙ VICINO VINCE",
        subtitle: "Inserisci un numero: vince chi si avvicina di più al valore corretto.",
      };
    case "SEQUENCE":
      return {
        title: "🧩 MINIGIOCO: ORDINA LA SEQUENZA",
        subtitle: "Metti gli elementi nell’ordine giusto e conferma prima degli altri.",
      };
    case "INTRUDER":
      return {
        title: "🕵️ MINIGIOCO: L’INTRUSO",
        subtitle: "4 opzioni: 1 non c’entra. Seleziona l’intruso!",
      };
    default:
      return { title: "🎮 MINIGIOCO", subtitle: "Preparati!" };
  }
}

function getEventIntroCopy(type) {
  switch (type) {
    case "DUELLO":
      return {
        title: "🥊 EVENTO: DUELLO",
        subtitle: "Scegli un avversario: 3 domande, chi vince prende il bottino!",
      };
    case "BOOM":
      return {
        title: "💣 EVENTO: BOOM",
        subtitle: "Domanda difficile: premio alto… ma se sbagli perdi punti!",
      };
    case "RISK":
      return {
        title: "🎲 EVENTO: RISCHIA O VINCI",
        subtitle: "Accetti la sfida? Se dici SÌ puoi vincere tanto… o perdere.",
      };
    default:
      return { title: "🎭 EVENTO", subtitle: "Qualcosa sta per succedere…" };
  }
}

// crea domanda di categoria random, livello dato, con risposte mischiate
function makeRandomEventQuestion(game, level) {
  const usedCategoryQuestionIds = game.usedCategoryQuestionIds || {};
  const usedIds = Object.keys(usedCategoryQuestionIds);

  const category = randomFrom(CATEGORIES);
  const raw = getRandomCategoryQuestion(category, level, usedIds);
  if (!raw) return null;

  // shuffle risposte (come prepareCategoryQuestionForTile)
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const answers = indices.map((i) => raw.answers[i]);
  const correctIndex = indices.indexOf(raw.correctIndex);

  return {
    id: raw.id,
    category,
    level,
    text: raw.text,
    answers,
    correctIndex,
    // per coerenza col tuo overlay REVEAL:
    durationSec: null,
    startedAt: null,
    expiresAt: null,
  };
}

async function startEventTile(gameRef, game, ownerPlayerId, tileId, tile, baseUpdate) {
  const type = randomFrom(EVENT_TYPES);

  const common = {
    ...baseUpdate,
    currentTile: {
      tileId,
      type: tile.type,
      category: tile.category || null,
      zone: tile.zone,
    },
    currentQuestion: null,
    reveal: null,
  };

 const intro = getEventIntroCopy(type);
const introToast = buildToastAll(
  game,
  { kind: "neutral", title: intro.title, subtitle: intro.subtitle },
  { kind: "neutral", title: intro.title, subtitle: "Segui le istruzioni sul telefono." },
  1700
); 

  // BOOM: L3, +40 / -20 (POINTS_CONFIG)
  if (type === "BOOM") {
    const q = makeRandomEventQuestion(game, 3);
    if (!q) {
      await update(gameRef, { ...common, phase: "WAIT_ROLL" });
      return;
    }

    await update(gameRef, {
      ...common,
      phase: "EVENT_QUESTION",
      toast: introToast,
      currentEvent: {
        type: "BOOM",
        ownerPlayerId,
        pointsCorrect: 40,
        pointsWrong: -20,
      },
      currentQuestion: q,
      [`usedCategoryQuestionIds/${q.id}`]: true,
    });
    return;
  }

  // RISK: scelta YES/NO, se YES domanda L2 +30 / -15
  if (type === "RISK") {
    await update(gameRef, {
      ...common,
      phase: "EVENT_RISK_DECISION",
      toast: introToast,
      currentEvent: {
        type: "RISK",
        ownerPlayerId,
        pointsCorrect: 30,
        pointsWrong: -15,
        decision: null,
      },
    });
    return;
  }

  // DUELLO: scegli sfidante, 3 domande L2, punteggi
  if (type === "DUELLO") {
    await update(gameRef, {
      ...common,
      phase: "EVENT_DUEL_CHOOSE",
      toast: introToast,
      currentEvent: {
        type: "DUELLO",
        ownerPlayerId,
        opponentPlayerId: null,
        roundIndex: 0,      // 0..2
        totalRounds: 3,
        score: {},          // { pid: nCorrette }
        answeredBy: {},     // { pid: {answerIndex, correct} } della domanda corrente
      },
    });
  }
}

// RISK: decisione
export async function chooseRiskDecision(gameCode, playerId, decision) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();
  const ev = game.currentEvent;

  if (game.phase !== "EVENT_RISK_DECISION") throw new Error("Fase non valida");
  if (!ev || ev.type !== "RISK") throw new Error("Nessun evento RISK attivo");
  if (ev.ownerPlayerId !== playerId) throw new Error("Non sei il player di turno");

  // NO: nessun effetto, passa turno
  if (decision === "NO") {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    await update(gameRef, {
      currentEvent: null,
      phase: "WAIT_ROLL",
      currentPlayerId: nextPlayerId,
      currentTurnIndex: nextIndex,
    });
    return;
  }

  const q = makeRandomEventQuestion(game, 2);
  if (!q) {
    const { nextIndex, nextPlayerId } = getNextTurn(game);
    await update(gameRef, {
      currentEvent: null,
      phase: "WAIT_ROLL",
      currentPlayerId: nextPlayerId,
      currentTurnIndex: nextIndex,
    });
    return;
  }

  await update(gameRef, {
    phase: "EVENT_QUESTION",
    currentEvent: { ...ev, decision: "YES" },
    currentQuestion: q,
    [`usedCategoryQuestionIds/${q.id}`]: true,
    reveal: null,
  });
}

// DUELLO: scelta avversario
export async function chooseDuelOpponent(gameCode, ownerPlayerId, opponentPlayerId) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();
  const ev = game.currentEvent;

  if (game.phase !== "EVENT_DUEL_CHOOSE") throw new Error("Fase non valida");
  if (!ev || ev.type !== "DUELLO") throw new Error("Nessun DUELLO attivo");
  if (ev.ownerPlayerId !== ownerPlayerId) throw new Error("Non sei l'owner del duello");

  const q = makeRandomEventQuestion(game, 2);
  if (!q) throw new Error("Nessuna domanda disponibile");

  const score = { ...(ev.score || {}) };
  score[ownerPlayerId] = score[ownerPlayerId] || 0;
  score[opponentPlayerId] = score[opponentPlayerId] || 0;

  await update(gameRef, {
    phase: "EVENT_DUEL_QUESTION",
    currentEvent: {
      ...ev,
      opponentPlayerId,
      roundIndex: 0,
      totalRounds: 3,
      score,
      answeredBy: {},
    },
    currentQuestion: q,
    [`usedCategoryQuestionIds/${q.id}`]: true,
    reveal: null,
  });
}

// Risposta evento (BOOM / RISK / DUELLO)
export async function answerEventQuestion(gameCode, playerId, answerIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  if (!snap.exists()) throw new Error("Partita non trovata");

  const game = snap.val();
  const ev = game.currentEvent;
  const q = game.currentQuestion;

  if (!ev || !q) throw new Error("Evento o domanda mancante");

  // BOOM / RISK: risponde solo owner
  if (ev.type === "BOOM" || ev.type === "RISK") {
    if (game.phase !== "EVENT_QUESTION") throw new Error("Fase non valida");
    if (ev.ownerPlayerId !== playerId) throw new Error("Non è il tuo evento");

    const correct = answerIndex === q.correctIndex;
const rawDelta = correct ? ev.pointsCorrect : ev.pointsWrong;
const delta = Number.isFinite(rawDelta) ? rawDelta : 0;

const players = game.players || {};
const p = players[playerId];
const basePoints = Number.isFinite(p?.points) ? p.points : 0;

const newPoints = addPointsSafe(basePoints, delta);

    const now = Date.now();
    const updates = {
      [`players/${playerId}/points`]: newPoints,
      currentQuestion: null,
      phase: "REVEAL",
      reveal: {
        source: "EVENT",
        eventType: ev.type,
        question: {
          category: q.category,
          text: q.text,
          answers: q.answers,
          correctIndex: q.correctIndex,
        },
        forPlayerId: playerId,
        answerIndex,
        correct,
        delta,
        shownAt: now,
        hideAt: now + EVENT_REVEAL_MS,
      },
      // memorizzo cosa fare dopo reveal
      currentEvent: {
        ...ev,
        _afterReveal: {
          kind: "END_SINGLE",
          keepTurn: correct, // come domande normali: giusta = rimane, sbagliata = passa
        },
      },
    };

    // se sbaglia: preparo già il prossimo player (come answerCategoryQuestion)
    if (!correct) {
      const { nextIndex, nextPlayerId } = getNextTurn(game);
      updates.currentTurnIndex = nextIndex;
      updates.currentPlayerId = nextPlayerId;
    }

    await update(gameRef, updates);
    return;
  }

  // DUELLO: rispondono owner + opponent
  if (ev.type === "DUELLO") {
    if (game.phase !== "EVENT_DUEL_QUESTION") throw new Error("Fase non valida duello");
    const opp = ev.opponentPlayerId;
    if (playerId !== ev.ownerPlayerId && playerId !== opp) {
      throw new Error("Non partecipi al duello");
    }

    const answeredBy = { ...(ev.answeredBy || {}) };
    if (answeredBy[playerId]) return; // già risposto

    const correct = answerIndex === q.correctIndex;
    answeredBy[playerId] = { answerIndex, correct };

    const score = { ...(ev.score || {}) };
    if (correct) score[playerId] = (score[playerId] || 0) + 1;

    // se manca l'altro, salvo e basta
    const otherId = playerId === ev.ownerPlayerId ? opp : ev.ownerPlayerId;
    if (!answeredBy[otherId]) {
      await update(gameRef, {
        currentEvent: { ...ev, answeredBy, score },
      });
      return;
    }

    // entrambi hanno risposto → REVEAL (poi advance gestisce round successivo / fine duello)
    const now = Date.now();
    await update(gameRef, {
      currentQuestion: null,
      phase: "REVEAL",
      reveal: {
        source: "DUELLO",
        question: {
          category: q.category,
          text: q.text,
          answers: q.answers,
          correctIndex: q.correctIndex,
        },
        answeredBy,
        shownAt: now,
        hideAt: now + EVENT_REVEAL_MS,
      },
      currentEvent: {
        ...ev,
        answeredBy,
        score,
        _afterReveal: { kind: "DUEL_NEXT" },
      },
    });
  }
}

export async function chooseScrignoCategory(gameCode, playerId, category) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  await runTransaction(gameRef, (current) => {
    if (!current) return current;
    if (current.state !== "IN_PROGRESS") return current;

    if (current.currentPlayerId !== playerId) return current;
    if (current.phase !== "SCRIGNO_PICK_CATEGORY") return current;

    const me = current.players?.[playerId];
    if (!me) return current;

    // sicurezza: solo 6 categorie valide
    const allowed = ["geografia", "storia", "arte", "sport", "spettacolo", "scienza"];
    if (!allowed.includes(category)) return current;

    // crea domanda lvl 2 della categoria scelta (NO avanzamento, NO chiave)
    const q = makeScrignoPointsOnlyQuestion(current, playerId, category);
    if (!q) return current;

    current.phase = "QUESTION";
    current.currentQuestion = q;

    // anti-ripetizione
    if (q.id) {
      current.usedCategoryQuestionIds = {
        ...(current.usedCategoryQuestionIds || {}),
        [q.id]: true,
      };
    }

    // pulizia reveal/risposte precedenti
    current.reveal = null;
    current.playerAnswerIndex = null;

    // chiudi lo stato scrigno “pick”
    current.scrigno = null;

    return current;
  });

  return { ok: true };
}
