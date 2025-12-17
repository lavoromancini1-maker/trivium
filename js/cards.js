// js/cards.js
// Fonte di verità: definizione carte + regole di utilizzo (validazione "canUse").
// La logica di applicazione effetti (useCard/applyCardEffect) verrà implementata in firebase-game.js.

export const CARD_CATEGORIES = {
  MOVIMENTO: "MOVIMENTO",
  DOMANDA: "DOMANDA",
  PROTEZIONE: "PROTEZIONE",
};

// ID stabili (NON cambiare dopo, verranno salvati nel DB)
export const CARD_IDS = {
  // Movimento
  TELEPORT_CATEGORY: "TELEPORT_CATEGORY",
  SKIP_PLUS_ONE: "SKIP_PLUS_ONE",

  // Domanda
  FIFTY_FIFTY: "FIFTY_FIFTY",
  CHANGE_CATEGORY: "CHANGE_CATEGORY",
  ALT_QUESTION: "ALT_QUESTION",
  EXTRA_TIME: "EXTRA_TIME",
  SALVEZZA: "SALVEZZA",

  // Protezione
  SHIELD: "SHIELD",
};

// Costi base (poi li agganciamo/centralizziamo con POINTS_CONFIG se vuoi)
export const CARD_COSTS = {
  [CARD_IDS.TELEPORT_CATEGORY]: 200,
  [CARD_IDS.SKIP_PLUS_ONE]: 40,

  [CARD_IDS.FIFTY_FIFTY]: 50,
  [CARD_IDS.CHANGE_CATEGORY]: 150,
  [CARD_IDS.ALT_QUESTION]: 40,
  [CARD_IDS.EXTRA_TIME]: 10,
  [CARD_IDS.SALVEZZA]: 60,

  [CARD_IDS.SHIELD]: 70,
};

// Definizione “UI-friendly” (icona/label/testo breve)
export const CARD_DEFS = {
  [CARD_IDS.TELEPORT_CATEGORY]: {
    id: CARD_IDS.TELEPORT_CATEGORY,
    category: CARD_CATEGORIES.MOVIMENTO,
    cost: CARD_COSTS[CARD_IDS.TELEPORT_CATEGORY],
    icon: "🌀",
    title: "Teletrasporto categoria",
    short: "Vai direttamente alla casella CHIAVE di una categoria (solo se sei già a livello 3).",
  },

  [CARD_IDS.SKIP_PLUS_ONE]: {
    id: CARD_IDS.SKIP_PLUS_ONE,
    category: CARD_CATEGORIES.MOVIMENTO,
    cost: CARD_COSTS[CARD_IDS.SKIP_PLUS_ONE],
    icon: "⏭️",
    title: "Salta una casella",
    short: "Dopo il movimento normale, avanzi di +1 nella stessa direzione.",
  },

  [CARD_IDS.FIFTY_FIFTY]: {
    id: CARD_IDS.FIFTY_FIFTY,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.FIFTY_FIFTY],
    icon: "✂️",
    title: "50/50",
    short: "Elimina 2 risposte sbagliate (solo domande categoria/livello).",
  },

  [CARD_IDS.CHANGE_CATEGORY]: {
    id: CARD_IDS.CHANGE_CATEGORY,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.CHANGE_CATEGORY],
    icon: "🔁",
    title: "Cambio categoria",
    short: "Cambia la categoria della domanda in corso (solo categoria/livello).",
  },

  [CARD_IDS.ALT_QUESTION]: {
    id: CARD_IDS.ALT_QUESTION,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.ALT_QUESTION],
    icon: "📝",
    title: "Domanda alternativa",
    short: "Cambia domanda (stessa categoria/livello) e il timer riparte.",
  },

  [CARD_IDS.EXTRA_TIME]: {
    id: CARD_IDS.EXTRA_TIME,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.EXTRA_TIME],
    icon: "⏱️",
    title: "Tempo extra",
    short: "Aggiunge +10 secondi al timer della domanda attuale.",
  },

  [CARD_IDS.SALVEZZA]: {
    id: CARD_IDS.SALVEZZA,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.SALVEZZA],
    icon: "🛟",
    title: "Salvezza",
    short: "Dopo una risposta sbagliata (solo categoria/livello) continui il turno come se fosse corretta.",
  },

  [CARD_IDS.SHIELD]: {
    id: CARD_IDS.SHIELD,
    category: CARD_CATEGORIES.PROTEZIONE,
    cost: CARD_COSTS[CARD_IDS.SHIELD],
    icon: "🛡️",
    title: "Scudo",
    short: "Annulla un attacco (duello/scambio posizione/perdi turno). Si usa solo per rifiutare il duello.",
  },
};

// ---- Helpers regole (solo validazione, NO scrittura DB) ----

export function getCardDef(cardId) {
  return CARD_DEFS[cardId] || null;
}

export function isValidCardId(cardId) {
  return !!CARD_DEFS[cardId];
}

export function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  // filtra id non validi e limita a 3 (regola max)
  return cards.filter(isValidCardId).slice(0, 3);
}

/**
 * Regola globale: le carte NON sono utilizzabili:
 * - durante domanda CHIAVE
 * - durante domanda SCRIGNO finale / scrigno in generale
 * - durante MINIGAME
 * - durante DUELLO (eccetto SHIELD per rifiutare duello)
 *
 * Qui facciamo solo un check “di base” usando i campi che esistono già nel tuo game state.
 */
export function isCardGloballyBlocked(game, cardId) {
  if (!game) return true;

  const phase = game.phase;

  // Minigiochi (fase MINIGAME o RAPID_FIRE nel tuo codice)
  if (phase === "MINIGAME" || phase === "RAPID_FIRE") return true;

  // Eventi/duelli: nel tuo flow i duelli stanno in phase EVENT_DUEL_*
  const isDuelPhase = typeof phase === "string" && phase.startsWith("EVENT_DUEL");
  if (isDuelPhase) {
    // unica eccezione: SHIELD
    return cardId !== CARD_IDS.SHIELD;
  }

  // Domande scrigno / scrigno finale / scrigno challenge: nel tuo currentQuestion ci sono scrignoMode/tileType
  const q = game.currentQuestion;
  const isScrignoQuestion = !!(q && (q.tileType === "scrigno" || q.scrignoMode));
  if (isScrignoQuestion) return true;

  // Domanda chiave: q.isKeyQuestion true
  const isKeyQuestion = !!(q && q.isKeyQuestion);
  if (isKeyQuestion) return true;

  return false;
}

/**
 * Check se la domanda attuale è “categoria/livello” (ammessa per 50/50, cambio categoria, domanda alternativa, tempo extra, salvezza).
 */
export function isNormalCategoryQuestion(game) {
  const q = game?.currentQuestion;
  if (!q) return false;

  // deve essere una domanda normale, NON chiave, NON scrigno
  if (q.isKeyQuestion) return false;
  if (q.tileType === "scrigno" || q.scrignoMode) return false;

  // nel tuo codice: q.level è number (1..3) o "key" o "final"
  return typeof q.level === "number";
}

/**
 * Validazione “canUse” minimale.
 * NOTA: i controlli di costo punti e "una carta per turno" li faremo in firebase-game.js,
 * perché devono essere atomici e server-side.
 */
export function canUseCardNow(game, player, cardId) {
  if (!isValidCardId(cardId)) return { ok: false, reason: "CARD_NOT_FOUND" };
  if (!game || !player) return { ok: false, reason: "NO_GAME_OR_PLAYER" };

  if (isCardGloballyBlocked(game, cardId)) {
    return { ok: false, reason: "BLOCKED_BY_RULES" };
  }

  const phase = game.phase;

  // MOVIMENTO: teletrasporto prima del dado
  if (cardId === CARD_IDS.TELEPORT_CATEGORY) {
    if (phase !== "WAIT_ROLL") return { ok: false, reason: "WRONG_PHASE" };
    // la categoria verrà scelta dal player (payload). Qui non possiamo validare il livello.
    return { ok: true };
  }

  // MOVIMENTO: salta +1 (lo gestiremo con una fase "offer" dopo il movimento)
  if (cardId === CARD_IDS.SKIP_PLUS_ONE) {
    // per ora: non consentiamo direttamente qui, perché serve contesto del movimento appena fatto.
    return { ok: false, reason: "NEEDS_POST_MOVE_WINDOW" };
  }

  // DOMANDA: durante la domanda
  const needsQuestionPhase = [
    CARD_IDS.FIFTY_FIFTY,
    CARD_IDS.CHANGE_CATEGORY,
    CARD_IDS.ALT_QUESTION,
    CARD_IDS.EXTRA_TIME,
  ];
  if (needsQuestionPhase.includes(cardId)) {
    if (phase !== "QUESTION") return { ok: false, reason: "WRONG_PHASE" };
    if (!isNormalCategoryQuestion(game)) return { ok: false, reason: "NOT_ALLOWED_ON_THIS_QUESTION" };
    return { ok: true };
  }

  // SALVEZZA: non in QUESTION, ma nella finestra “dopo errore” (la creeremo noi)
  if (cardId === CARD_IDS.SALVEZZA) {
    // per ora blocchiamo: verrà permessa solo in una fase dedicata tipo "OFFER_SALVEZZA"
    return { ok: false, reason: "NEEDS_SALVEZZA_WINDOW" };
  }

  // SHIELD: solo quando sei attaccato (duello/eventi). Qui non possiamo prevedere, sarà gestito nel punto evento/duello.
  if (cardId === CARD_IDS.SHIELD) {
    // in futuro: lo abilitiamo in una fase/offer dedicata all'attacco
    return { ok: false, reason: "NEEDS_ATTACK_WINDOW" };
  }

  return { ok: false, reason: "NOT_IMPLEMENTED" };
}

