import { BOARD, START_TILE_ID } from "./board.js";
import {
  getRandomCategoryQuestion,
  getRandomKeyQuestion,
  getRandomRapidFireQuestions,
  getRandomClosestQuestion,
  getRandomVFFlashQuestion,
  getRandomIntruderQuestion,
  getRandomSequenceQuestion,
} from "./questions.js";


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

function getCategoryQuestionDurationSeconds(questionLevel, isKeyQuestion, advancesLevel) {
  // Domanda chiave
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
  };

  await set(gameRef, gameData);

  return { gameCode };
}

export async function gameExists(gameCode) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);
  const snap = await get(gameRef);
  return snap.exists();
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

const CATEGORIES = [
  "geografia",
  "storia",
  "arte",
  "sport",
  "spettacolo",
  "scienza",
];

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

export async function rollDice(gameCode, playerId) {
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

  if (game.phase !== "WAIT_ROLL") {
    throw new Error("Non puoi tirare il dado in questa fase.");
  }

  const players = game.players || {};
  const currentPlayer = players[playerId];

  if (!currentPlayer) {
    throw new Error("Giocatore non trovato.");
  }

  const fromTileId = currentPlayer.position ?? START_TILE_ID;
  const tile = BOARD[fromTileId];

  // tiro del dado 1-6
  const diceResult = Math.floor(1 + Math.random() * 6);

  // calcoliamo le direzioni disponibili dalla casella corrente
  const neighbors = tile.neighbors || [];

  // costruiamo un array descrittivo delle direzioni
  const availableDirections = neighbors.map((neighborId, idx) => {
    const t = BOARD[neighborId];
    let directionLabel;
    if (tile.zone === "ring") {
      // per semplicità:
      // idx 0 = sinistra, idx 1 = destra, idx 2 (se esiste) = stradina
      if (idx === 0) directionLabel = "Sinistra";
      else if (idx === 1) directionLabel = "Destra";
      else directionLabel = "Stradina";
    } else if (tile.zone === "branch") {
      // nella stradina hai solo avanti/indietro
      directionLabel = idx === 0 ? "Indietro" : "Avanti";
    } else {
      directionLabel = "Direzione";
    }

    return {
      index: idx,
      toTileId: neighborId,
      type: t.type,
      category: t.category || null,
      zone: t.zone,
      label: directionLabel,
    };
  });

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
  const finalTileId = moveAlongPath(fromTileId, dice, directionIndex);
  const finalTile = BOARD[finalTileId];

  // Aggiorniamo la posizione del giocatore
  const playerUpdatePath = `players/${playerId}/position`;
  const baseUpdate = {
    [playerUpdatePath]: finalTileId,
    currentDice: null,
    currentMove: null,
    availableDirections: null,
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
    // per ora resta placeholder come prima (ma almeno separato dall'evento)
    const globalUpdate = {
      ...baseUpdate,
      phase: "RESOLVE_TILE",
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
    currentIndex: 0,          // domanda corrente (0..questions.length-1)
    scores: {},               // { playerId: numero risposte corrette }
    answeredThisQuestion: {}, // { playerId: true se ha già risposto a questa domanda }
    durationSec: 10,
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
  };

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

  if (game.phase !== "QUESTION") {
    throw new Error("Non è il momento di rispondere alla domanda.");
  }

  const q = game.currentQuestion;
  if (!q) {
    throw new Error("Nessuna domanda attiva.");
  }

  if (q.forPlayerId !== playerId) {
    throw new Error("Questa domanda non è destinata a te.");
  }

  const players = game.players || {};
  const player = players[playerId];
  if (!player) {
    throw new Error("Giocatore non trovato.");
  }

  const correct = answerIndex === q.correctIndex;

  let pointsToAdd = 0;
  const levels = player.levels || {};
  const keys = player.keys || {};
  const currentLevel = levels[q.category] ?? 0;
  const hasKey = !!keys[q.category];

  if (correct) {
    if (q.isKeyQuestion) {
      // domanda chiave
      if (!hasKey) {
        keys[q.category] = true;
      }
      pointsToAdd += 40;
    } else if (typeof q.level === "number") {
      if (q.advancesLevel && currentLevel < 3) {
        // avanzamento di livello
        const newLevel = Math.max(currentLevel, q.level);
        levels[q.category] = Math.min(3, newLevel);
      }
      // punti in base al livello della domanda
      if (q.level === 1) pointsToAdd += 15;
      else if (q.level === 2) pointsToAdd += 20;
      else if (q.level === 3) pointsToAdd += 25;
    } else {
      // "normalPoints" o altro tipo futuro → per ora +20
      pointsToAdd += 20;
    }
  }

  // Prepariamo update per il giocatore
  const playerPath = `players/${playerId}`;
  const playerUpdate = {
    ...player,
    levels,
    keys,
    points: (player.points ?? 0) + pointsToAdd,
  };

  const now = Date.now();
const REVEAL_MS = 1400; // 1.4s di reveal su TV (no scroll, effetto rapido)

const updates = {
  [`${playerPath}`]: playerUpdate,

  // ✅ chiudiamo la domanda per il player
  currentQuestion: null,

  // ✅ fase reveal per l'host
  phase: "REVEAL",
  reveal: {
    // dati minimi per mostrare overlay senza currentQuestion
    question: {
      category: q.category,
      isKeyQuestion: !!q.isKeyQuestion,
      text: q.text,
      answers: q.answers,
      correctIndex: q.correctIndex,
    },
    forPlayerId: playerId,
    answerIndex: answerIndex,
    correct: correct,
    shownAt: now,
    hideAt: now + REVEAL_MS,
  },
};


// Decidiamo se il turno continua (risposta giusta) o passa al prossimo
// ⚠️ NON tocchiamo la phase: deve restare "REVEAL" per 1.4s
if (!correct) {
  // Turno passa al prossimo giocatore
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;
}
// se correct = true → restano currentPlayerId/currentTurnIndex invariati


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

  rapidFire.answeredThisQuestion = rapidFire.answeredThisQuestion || {};
  rapidFire.scores = rapidFire.scores || {};

  if (rapidFire.answeredThisQuestion[playerId]) {
    return { alreadyAnswered: true };
  }

  const correct = answerIndex === currentQuestion.correctIndex;

  const updates = {
    [`rapidFire/answeredThisQuestion/${playerId}`]: true,
  };

  if (correct) {
    const prevScore = rapidFire.scores?.[playerId] ?? 0;
    updates[`rapidFire/scores/${playerId}`] = prevScore + 1;
  }

  await update(gameRef, updates);

  // prova ad avanzare se tutti hanno risposto
  await maybeAdvanceRapidFireIfAllAnswered(gameRef);

  return { correct };
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

  const updates = {
    phase: "WAIT_ROLL",
    minigame: null,
  };

  if (winners.length === 1) {
    const w = winners[0];
    updates[`players/${w}/points`] = (players[w].points || 0) + 25;
  } else if (winners.length > 1) {
    for (const w of winners) {
      updates[`players/${w}/points`] = (players[w].points || 0) + 10;
    }
  }

  await update(gameRef, updates);
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

    // inizializza strutture
    mg.answeredThis = mg.answeredThis || {};
    mg.eliminatedThis = mg.eliminatedThis || {};
    mg.winners = mg.winners || {};
    mg.currentWinnerId = mg.currentWinnerId || null;

    // se già chiusa (qualcuno ha già vinto questa affermazione)
    if (mg.currentWinnerId) return game;

    // se il player ha già tentato questa affermazione
    if (mg.answeredThis[playerId]) return game;

    const choice = !!choiceBool;
    const correct = choice === !!stmt.correct;

    // segna il tentativo
    mg.answeredThis[playerId] = true;

    if (correct) {
      // PRIMO corretto: vince il punto
      mg.currentWinnerId = playerId;
      mg.winners[playerId] = (mg.winners[playerId] || 0) + 1;

      // punti immediati: +10 per affermazione corretta
      players[playerId].points = (players[playerId].points || 0) + 10;

      // passa subito alla prossima affermazione (o chiudi)
      if (idx < 2) {
        mg.index = idx + 1;
        mg.answeredThis = {};
        mg.eliminatedThis = {};
        mg.currentWinnerId = null;
      } else {
        // finito pack: chiudi minigioco
        game.phase = "WAIT_ROLL";
        game.minigame = null;
      }

      game.players = players;
      game.minigame = mg;
      return game;
    }

    // sbagliato: eliminato per questa affermazione
    mg.eliminatedThis[playerId] = true;

    // se tutti hanno tentato e nessuno ha vinto -> passa alla prossima (o chiudi)
    const allTried = playerIds.length > 0 && playerIds.every((pid) => mg.answeredThis[pid]);
    if (allTried) {
      if (idx < 2) {
        mg.index = idx + 1;
        mg.answeredThis = {};
        mg.eliminatedThis = {};
        mg.currentWinnerId = null;
      } else {
        game.phase = "WAIT_ROLL";
        game.minigame = null;
      }
    }

    game.minigame = mg;
    return game;
  });

  // Risposta al client (non perfetta al 100% in tutte le edge-case, ma sufficiente per UI)
  if (!tx.committed) return { ok: false };

  const after = tx.snapshot.val();
  const mgAfter = after?.minigame;

  // Se minigame ancora attivo ed il player risulta in answeredThis dell'affermazione corrente,
  // significa che ha appena tentato oppure aveva già tentato.
  // Per feedback UI (✅/❌) possiamo ricalcolare dal pack originale in snapshot PRE-advance? Non ce l'abbiamo.
  // Quindi ritorniamo "ok" e lato UI mostri "Inviato" / "Attendi".
  return { ok: true };
}

export async function answerIntruderMinigame(gameCode, playerId, chosenIndex) {
  const gameRef = ref(db, `${GAMES_PATH}/${gameCode}`);

  await runTransaction(gameRef, (game) => {
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
      // primo corretto vince e prende +20 (POINTS_CONFIG)
      mg.currentWinnerId = playerId;
      players[playerId].points = (players[playerId].points || 0) + 20;

      // chiudi minigame subito
      game.phase = "WAIT_ROLL";
      game.minigame = null;
      game.players = players;
      return game;
    }

    // se tutti hanno tentato e nessuno ha vinto -> chiudi minigame
    const allTried = playerIds.length > 0 && playerIds.every((pid) => mg.answeredThis[pid]);
    if (allTried) {
      game.phase = "WAIT_ROLL";
      game.minigame = null;
    } else {
      game.minigame = mg;
    }

    return game;
  });

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

  // Solo CLOSEST per ora
  if (mg.type !== "CLOSEST") {
    await update(gameRef, { phase: "WAIT_ROLL", minigame: null });
    return { handled: true };
  }
  if (mg.type === "SEQUENCE") {
  // scaduto: finalizza e chiudi
  await finalizeSequenceMinigame(gameRef, game);
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

  // Punti: +25 al vincitore (come da config che stai usando)
  if (winnerId && players[winnerId]) {
    updates[`players/${winnerId}/points`] = (players[winnerId].points || 0) + 25;
  }

  await update(gameRef, updates);
  return { handled: true, winnerId };
}


// 👇 QUESTA FUNZIONE DEVE STARE FUORI (scope file)
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
  const allAnswered = playerIds.length > 0 && playerIds.every(pid => answered[pid]);
  if (!allAnswered) return;

  const currentIndex = rapidFire.currentIndex ?? 0;
  const totalQuestions = rapidFire.questions?.length ?? 0;

  if (currentIndex < totalQuestions - 1) {
    const now = Date.now();
    await update(gameRef, {
      "rapidFire/currentIndex": currentIndex + 1,
      "rapidFire/answeredThisQuestion": {},
      "rapidFire/startedAt": now,
      "rapidFire/expiresAt": now + (rapidFire.durationSec ?? 10) * 1000,
    });
    return;
  }

  // ultima domanda: forza scadenza così host loop assegna punti
  await update(gameRef, { "rapidFire/expiresAt": Date.now() });
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

  if (currentIndex < totalQuestions - 1) {
    // Passiamo alla domanda successiva
    const now2 = Date.now();
    rapidFire.currentIndex = currentIndex + 1;
    rapidFire.answeredThisQuestion = {};
    rapidFire.startedAt = now2;
    rapidFire.expiresAt = now2 + rapidFire.durationSec * 1000;

    await update(gameRef, { rapidFire });
    return { handled: true, reason: "NEXT_QUESTION" };
  }

  const scores = rapidFire.scores || {};
  const updates = {};

  // Costruiamo classifica per "corrette"
  const rows = playerIds.map((pid) => ({
    pid,
    score: scores[pid] ?? 0,
  }));

  // Ordina decrescente
  rows.sort((a, b) => b.score - a.score);

  const maxScore = rows[0]?.score ?? 0;
  const minScore = rows[rows.length - 1]?.score ?? 0;

  const firstGroup = rows.filter(r => r.score === maxScore).map(r => r.pid);
  const lastGroup  = rows.filter(r => r.score === minScore).map(r => r.pid);

  // Secondo: solo se esiste un primo unico
  let secondGroup = [];
  if (firstGroup.length === 1) {
    const secondScore = rows.find(r => r.score < maxScore)?.score;
    if (typeof secondScore === "number") {
      secondGroup = rows.filter(r => r.score === secondScore).map(r => r.pid);
    }
  }

  // Applica punti: 1° +30, 2° +15, ultimo -10, altri 0
  for (const pid of playerIds) {
    const player = players[pid];
    let delta = 0;

    if (firstGroup.includes(pid)) delta = 30;
    else if (secondGroup.includes(pid)) delta = 15;
    else if (lastGroup.includes(pid)) delta = -10;

    updates[`players/${pid}/points`] = (player.points ?? 0) + delta;
  }

  updates.rapidFire = null;
  updates.phase = "WAIT_ROLL";


  await update(gameRef, updates);

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

  if (!snap.exists()) {
    return { handled: false, reason: "NO_GAME" };
  }

  const game = snap.val();

  if (game.state !== "IN_PROGRESS") {
    return { handled: false, reason: "NOT_IN_PROGRESS" };
  }

  if (game.phase !== "QUESTION") {
    return { handled: false, reason: "NOT_IN_QUESTION_PHASE" };
  }

  const q = game.currentQuestion;
  if (!q) {
    return { handled: false, reason: "NO_QUESTION" };
  }

  const now = Date.now();
  let expiresAt = q.expiresAt;

  if (!expiresAt && q.startedAt && q.durationSec) {
    expiresAt = q.startedAt + q.durationSec * 1000;
  }

  if (!expiresAt) {
    // Nessun timer definito
    return { handled: false, reason: "NO_EXPIRES_AT" };
  }

  if (now < expiresAt) {
    // Non ancora scaduto
    return { handled: false, reason: "NOT_EXPIRED" };
  }

  // A questo punto il timer è scaduto → trattiamo come risposta sbagliata
  const players = game.players || {};
  const playerId = q.forPlayerId;
  const player = players[playerId];

  if (!player) {
    return { handled: false, reason: "PLAYER_NOT_FOUND" };
  }

  const levels = player.levels || {};
  const keys = player.keys || {};

  const playerPath = `players/${playerId}`;
  const playerUpdate = {
    ...player,
    levels,
    keys,
    points: player.points ?? 0, // niente punti aggiuntivi
  };

  const updates = {
    [playerPath]: playerUpdate,
    currentQuestion: null,
  };

  // Passiamo al prossimo giocatore
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;
  updates.phase = "WAIT_ROLL";

  await update(gameRef, updates);

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

// ── Se arriva da EVENTI, gestiamo post-reveal (duello round successivo / fine evento)
const ev = game.currentEvent;
const after = ev?._afterReveal;

if (after?.kind === "DUEL_NEXT") {
  // Round successivo o fine duello
  const roundIndex = ev.roundIndex ?? 0;
  const totalRounds = ev.totalRounds ?? 3;

  // se ci sono altri round
  if (roundIndex < totalRounds - 1) {
    const q = makeRandomEventQuestion(game, 2);
    if (!q) {
      // niente domande: chiudiamo duello senza assegnare altro e passiamo turno
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

  // fine duello: assegna punti (+50 winner / +10 tie / 0 loser)
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
    if (sOwner > sOpp) {
      updates[`players/${owner}/points`] = (pOwner.points || 0) + 50;
    } else if (sOpp > sOwner) {
      updates[`players/${opp}/points`] = (pOpp.points || 0) + 50;
    } else {
      updates[`players/${owner}/points`] = (pOwner.points || 0) + 10;
      updates[`players/${opp}/points`] = (pOpp.points || 0) + 10;
    }
  }

  // dopo un evento “a 2”, per semplicità e fluidità: passa turno
  const { nextIndex, nextPlayerId } = getNextTurn(game);
  updates.currentTurnIndex = nextIndex;
  updates.currentPlayerId = nextPlayerId;

  await update(gameRef, updates);
  return { handled: true, reason: "DUEL_FINISHED" };
}

if (after?.kind === "END_SINGLE") {
  // BOOM/RISK: evento finito (turno già preparato in answerEventQuestion se sbagliata)
  await update(gameRef, {
    phase: "WAIT_ROLL",
    reveal: null,
    currentQuestion: null,
    currentEvent: null,
  });
  return { handled: true, reason: "EVENT_FINISHED" };
}

// default (domande normali)
await update(gameRef, {
  phase: "WAIT_ROLL",
  reveal: null,
});

return { handled: true, reason: "REVEAL_FINISHED" };


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
    const delta = correct ? ev.pointsCorrect : ev.pointsWrong;

    const players = game.players || {};
    const p = players[playerId];
    const newPoints = (p?.points || 0) + delta;

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
