import { BOARD, START_TILE_ID } from "./board.js";
import {
  getRandomCategoryQuestion,
  getRandomKeyQuestion,
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

  // Aggiornamento del giocatore e dello stato
  const playerUpdate = {
    [`players/${playerId}/position`]: finalTileId,
  };

  const globalUpdate = {
    ...playerUpdate,
    phase: "RESOLVE_TILE",
    currentDice: null,
    currentMove: null,
    availableDirections: null,
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
