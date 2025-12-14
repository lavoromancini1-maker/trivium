import { BOARD, START_TILE_ID } from "./board.js";
import {
  getRandomCategoryQuestion,
  getRandomKeyQuestion,
  getRandomRapidFireQuestions,
} from "./questions.js";


import {
  db,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  serverTimestamp,
} from "./firebase-config.js";

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

  // Gestione caselle speciali
  // Caselle speciali: minigame / event / scrigno
  if (finalTile.type === "minigame") {
    // Avvia minigioco Rapid Fire
    await startRapidFireMinigame(
      gameRef,
      game,
      playerId,
      finalTileId,
      finalTile,
      baseUpdate
    );
    return { finalTileId, finalTile };
  }

  if (finalTile.type === "event" || finalTile.type === "scrigno") {
    // TODO: logica caselle evento / scrigno
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
 const rawQuestions = getRandomRapidFireQuestions(3, []); // per ora ignoriamo usedIds
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

  const updates = {
    ...baseUpdate,
    phase: "RAPID_FIRE", // ⬅ FASE UNICA per tutto il minigioco
    currentTile: {
      tileId: finalTileId,
      type: finalTile.type,
      category: finalTile.category || null,
      zone: finalTile.zone,
    },
    rapidFire,
  };

  await update(gameRef, updates);
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

  if (!snap.exists()) {
    throw new Error("Partita non trovata");
  }

  const game = snap.val();

  if (game.state !== "IN_PROGRESS") {
    throw new Error("La partita non è in corso.");
  }

  // In Rapid Fire tutti i giocatori possono rispondere,
  // quindi NON controlliamo currentPlayerId
  if (game.phase !== "RAPID_FIRE") {
    throw new Error("Non è una fase Rapid Fire.");
  }

  const rapidFire = game.rapidFire;
  if (!rapidFire) {
    throw new Error("Rapid Fire non attivo.");
  }

  const players = game.players || {};
  if (!players[playerId]) {
    throw new Error("Giocatore non trovato nella partita.");
  }

  const currentIndex = rapidFire.currentIndex ?? 0;
  const currentQuestion = rapidFire.questions?.[currentIndex];
  if (!currentQuestion) {
    throw new Error("Nessuna domanda Rapid Fire corrente.");
  }

  rapidFire.answeredThisQuestion = rapidFire.answeredThisQuestion || {};
  rapidFire.scores = rapidFire.scores || {};

  // Se ha già risposto a questa domanda, ignora
  if (rapidFire.answeredThisQuestion[playerId]) {
    return { alreadyAnswered: true };
  }

  // Controlliamo se è corretta
  const correct = answerIndex === currentQuestion.correctIndex;
  if (correct) {
    const prevScore = rapidFire.scores[playerId] ?? 0;
    rapidFire.scores[playerId] = prevScore + 1;
  }

  rapidFire.answeredThisQuestion[playerId] = true;

  await update(gameRef, { rapidFire });

  return { correct };
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

  // Altrimenti, era l'ultima domanda → assegniamo i punti e chiudiamo il minigioco
  const scores = rapidFire.scores || {};
  const updates = {};

  for (const pid of playerIds) {
    const player = players[pid];
    const correctCount = scores[pid] ?? 0;
    const bonusPoints = correctCount * 10; // 10 punti per risposta corretta
    updates[`players/${pid}/points`] = (player.points ?? 0) + bonusPoints;
  }

  updates.rapidFire = null;
  updates.phase = "WAIT_ROLL";
  // currentPlayerId e currentTurnIndex restano invariati: turno prosegue

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

  await update(gameRef, {
    phase: "WAIT_ROLL",
    reveal: null,
  });

  return { handled: true, reason: "REVEAL_FINISHED" };
}
