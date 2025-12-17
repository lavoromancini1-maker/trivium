// js/cards.js
// Fonte di verità: definizione carte + regole d'uso (validazione "canUse").
// I costi sono ALLINEATI a POINTS_CONFIG (ufficiale).

export const CARD_CATEGORIES = {
  MOVIMENTO: "MOVIMENTO",
  DOMANDA: "DOMANDA",
  PROTEZIONE: "PROTEZIONE",
};

// ID stabili (NON cambiare dopo: verranno salvati nel DB)
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

// ✅ Costi ufficiali da POINTS_CONFIG
export const CARD_COSTS = {
  [CARD_IDS.TELEPORT_CATEGORY]: 200,
  [CARD_IDS.SKIP_PLUS_ONE]: 40,

  [CARD_IDS.FIFTY_FIFTY]: 30,
  [CARD_IDS.CHANGE_CATEGORY]: 150,
  [CARD_IDS.ALT_QUESTION]: 40,
  [CARD_IDS.EXTRA_TIME]: 10,
  [CARD_IDS.SALVEZZA]: 60,

  [CARD_IDS.SHIELD]: 50,
};

export const CARD_DROP_POOL = [
  CARD_IDS.EXTRA_TIME,
  CARD_IDS.FIFTY_FIFTY,
  CARD_IDS.ALT_QUESTION,
  CARD_IDS.JUMP_PLUS_ONE,
  CARD_IDS.SAVE,
  CARD_IDS.SHIELD,
  CARD_IDS.CHANGE_CATEGORY,
  // TELEPORT è forte e rara: per ora la lasciamo fuori dalla pool drop
  // (si può ottenere magari solo da eventi speciali più avanti)
];

// Definizione “UI-friendly” (icona/label/testo breve)
export const CARD_DEFS = {
  [CARD_IDS.TELEPORT_CATEGORY]: {
    id: CARD_IDS.TELEPORT_CATEGORY,
    category: CARD_CATEGORIES.MOVIMENTO,
    cost: CARD_COSTS[CARD_IDS.TELEPORT_CATEGORY],
    icon: "🌀",
    title: "Teletrasporto categoria",
    short:
      "Vai direttamente alla casella CHIAVE di una categoria (solo se sei già a livello 3).",
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
    short:
      "Cambia la categoria della domanda in corso (solo categoria/livello). Se corretta, avanzi in quella nuova categoria.",
  },

  [CARD_IDS.ALT_QUESTION]: {
    id: CARD_IDS.ALT_QUESTION,
    category: CARD_CATEGORIES.DOMANDA,
    cost: CARD_COSTS[CARD_IDS.ALT_QUESTION],
    icon: "📝",
    title: "Domanda alternativa",
    short:
      "Cambia domanda (stessa categoria/livello) e il timer riparte da zero.",
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
    short:
      "Subito dopo una risposta sbagliata (solo categoria/livello) continui il turno come se fosse corretta.",
  },

  [CARD_IDS.SHIELD]: {
    id: CARD_IDS.SHIELD,
    category: CARD_CATEGORIES.PROTEZIONE,
    cost: CARD_COSTS[CARD_IDS.SHIELD],
    icon: "🛡️",
    title: "Scudo",
    short:
      "Annulla un attacco (duello/scambio posizione/perdi turno). Si scarta dopo l’uso. In duello: rifiuta il duello e basta.",
  },
};

// ----------------------------------------------------
// Helpers (NO scrittura DB) — validazione e utility
// ----------------------------------------------------

export function getCardDef(cardId) {
  return CARD_DEFS[cardId] || null;
}

export function isValidCardId(cardId) {
  return !!CARD_DEFS[cardId];
}

export function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(isValidCardId).slice(0, 3);
}

/**
 * Blocco globale: carte NON utilizzabili:
 * - domande CHIAVE
 * - domande SCRIGNO (EXIT/CHALLENGE/FINAL)
 * - mini-sfide
 * - duelli (eccetto SHIELD per rifiutare duello)
 */
export function isCardGloballyBlocked(game, cardId) {
  if (!game) return true;

  const phase = game.phase;

  // Minigiochi: nel tuo codice ci sono "MINIGAME" e "RAPID_FIRE"
  if (phase === "MINIGAME" || phase === "RAPID_FIRE") return true;

  // Duelli: nel tuo codice le fasi iniziano con EVENT_DUEL...
  const isDuelPhase = typeof phase === "string" && phase.startsWith("EVENT_DUEL");
  if (isDuelPhase) {
    return cardId !== CARD_IDS.SHIELD;
  }

  // Domande scrigno
  const q = game.currentQuestion;
  const isScrignoQuestion = !!(q && (q.tileType === "scrigno" || q.scrignoMode));
  if (isScrignoQuestion) return true;

  // Domanda chiave
  const isKeyQuestion = !!(q && q.isKeyQuestion);
  if (isKeyQuestion) return true;

  return false;
}

/**
 * "Domanda normale" = domanda categoria/livello (1..3),
 * non chiave e non scrigno.
 */
export function isNormalCategoryQuestion(game) {
  const q = game?.currentQuestion;
  if (!q) return false;
  if (q.isKeyQuestion) return false;
  if (q.tileType === "scrigno" || q.scrignoMode) return false;
  return typeof q.level === "number";
}

/**
 * Validazione minimale (non fa controlli punti e "una carta per turno",
 * quelli si fanno in firebase-game.js perché devono essere atomici).
 */
export function canUseCardNow(game, player, cardId) {
  if (!isValidCardId(cardId)) return { ok: false, reason: "CARD_NOT_FOUND" };
  if (!game || !player) return { ok: false, reason: "NO_GAME_OR_PLAYER" };

  if (isCardGloballyBlocked(game, cardId)) {
    return { ok: false, reason: "BLOCKED_BY_RULES" };
  }

  const phase = game.phase;

  // Teletrasporto: prima del dado
  if (cardId === CARD_IDS.TELEPORT_CATEGORY) {
    if (phase !== "WAIT_ROLL") return { ok: false, reason: "WRONG_PHASE" };
    return { ok: true };
  }

  // Salta +1: serve finestra post-move che creeremo in firebase-game.js
  if (cardId === CARD_IDS.SKIP_PLUS_ONE) {
    return { ok: false, reason: "NEEDS_POST_MOVE_WINDOW" };
  }

  // Carte “durante domanda”
  const inQuestion = [
    CARD_IDS.FIFTY_FIFTY,
    CARD_IDS.CHANGE_CATEGORY,
    CARD_IDS.ALT_QUESTION,
    CARD_IDS.EXTRA_TIME,
  ];
  if (inQuestion.includes(cardId)) {
    if (phase !== "QUESTION") return { ok: false, reason: "WRONG_PHASE" };
    if (!isNormalCategoryQuestion(game))
      return { ok: false, reason: "NOT_ALLOWED_ON_THIS_QUESTION" };
    return { ok: true };
  }

  // Salvezza: finestra dedicata dopo errore
  if (cardId === CARD_IDS.SALVEZZA) {
    return { ok: false, reason: "NEEDS_SALVEZZA_WINDOW" };
  }

  // Scudo: finestra dedicata “attacco”
  if (cardId === CARD_IDS.SHIELD) {
    return { ok: false, reason: "NEEDS_ATTACK_WINDOW" };
  }

  return { ok: false, reason: "NOT_IMPLEMENTED" };
}
