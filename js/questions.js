// Categorie principali del gioco
export const CATEGORIES = [
  "geografia",
  "storia",
  "arte",
  "sport",
  "spettacolo",
  "scienza",
];

/**
 * Struttura domanda categoria (scelta multipla):
 * {
 *   id: "geo_001",
 *   category: "geografia",
 *   level: 1 | 2 | 3 | "key" | "final",
 *   text: "Qual è la capitale del Canada?",
 *   answers: ["Toronto", "Montreal", "Ottawa", "Vancouver"],
 *   correctIndex: 2,
 *   media: null | { type: "image" | "audio", url: "..." }
 * }
 */

/* ─────────────────────
   GEOGRAFIA
   ───────────────────── */

const GEO_QUESTIONS = [
  {
    id: "geo_001",
    category: "geografia",
    level: 1,
    text: "Qual è la capitale del Canada?",
    answers: ["Toronto", "Montreal", "Ottawa", "Vancouver"],
    correctIndex: 2,
    media: null,
  },
  {
    id: "geo_002",
    category: "geografia",
    level: 2,
    text: "Quale di questi fiumi attraversa Parigi?",
    answers: ["Danubio", "Senna", "Reno", "Rodano"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "geo_key_001",
    category: "geografia",
    level: "key",
    text: "In quale anno è stato completato il Canale di Suez?",
    answers: ["1769", "1869", "1919", "1969"],
    correctIndex: 1,
    media: null,
  },
  // ... TUTTE le altre domande di geografia
];

/* ─────────────────────
   STORIA
   ───────────────────── */

const STORIA_QUESTIONS = [
  {
    id: "sto_001",
    category: "storia",
    level: 1,
    text: "In quale città fu assassinato Giulio Cesare?",
    answers: ["Atene", "Roma", "Cartagine", "Napoli"],
    correctIndex: 1,
    media: null,
  },
  // ... altre domande di storia
];

/* ─────────────────────
   ARTE E LETTERATURA
   ───────────────────── */

const ARTE_QUESTIONS = [
  // ... domande arte/letteratura
];

/* ─────────────────────
   SPORT E HOBBY
   ───────────────────── */

const SPORT_QUESTIONS = [
  // ... domande sport
];

/* ─────────────────────
   SPETTACOLO
   ───────────────────── */

const SPETTACOLO_QUESTIONS = [
  // ... domande spettacolo
];

/* ─────────────────────
   SCIENZA / NATURA
   ───────────────────── */

const SCIENZA_QUESTIONS = [
  // ... domande scienza/natura
];

// Collezione unica di tutte le domande categoria
export const CATEGORY_QUESTIONS = [
  ...GEO_QUESTIONS,
  ...STORIA_QUESTIONS,
  ...ARTE_QUESTIONS,
  ...SPORT_QUESTIONS,
  ...SPETTACOLO_QUESTIONS,
  ...SCIENZA_QUESTIONS,
];

// ─────────────────────────────────────────────
// Helper per domande di categoria
// ─────────────────────────────────────────────

export function getQuestionsByCategoryAndLevel(category, level) {
  return CATEGORY_QUESTIONS.filter(
    (q) => q.category === category && q.level === level
  );
}

export function getRandomCategoryQuestion(category, level, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === level &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) return null;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getRandomKeyQuestion(category, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === "key" &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) return null;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getRandomFinalQuestion(category, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === "final" &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) return null;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/* ─────────────────────
   MINI-SFIDE (scheletri)
   ───────────────────── */

// Rapid Fire
export const RAPID_FIRE_QUESTIONS = [
  {
    id: "rf_001",
    text: "Quanti pianeti ha il sistema solare (escluso Plutone)?",
    answers: ["7", "8", "9", "10"],
    correctIndex: 1,
  },
  // ...
];

export function getRandomRapidFireQuestions(count = 3, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = RAPID_FIRE_QUESTIONS.filter((q) => !usedSet.has(q.id));
  if (pool.length <= count) return pool;

  const clone = [...pool];
  const result = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * clone.length);
    result.push(clone[idx]);
    clone.splice(idx, 1);
  }
  return result;
}

// Ordina la sequenza
export const SEQUENCE_CHALLENGES = [
  {
    id: "seq_001",
    instruction: "Ordina dal più antico al più recente",
    items: [
      "Rivoluzione francese",
      "Rivoluzione americana",
      "Rivoluzione russa",
    ],
    correctOrder: [1, 0, 2],
  },
  // ...
];

export function getRandomSequenceChallenge(usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = SEQUENCE_CHALLENGES.filter((q) => !usedSet.has(q.id));
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// Più vicino vince
export const CLOSEST_QUESTIONS = [
  {
    id: "close_001",
    text: "In che anno è stata inaugurata la Torre Eiffel?",
    correctValue: 1889,
  },
  // ...
];

export function getRandomClosestQuestion(usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CLOSEST_QUESTIONS.filter((q) => !usedSet.has(q.id));
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// Indovina immagine
export const IMAGE_CHALLENGES = [
  {
    id: "img_001",
    prompt: "Riconosci il monumento",
    imageUrl: "assets/mini/torre_eiffel_blur.jpg",
    correctAnswer: "Torre Eiffel",
  },
  // ...
];

export function getRandomImageChallenge(usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = IMAGE_CHALLENGES.filter((q) => !usedSet.has(q.id));
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// Vero/Falso (pack da 3)
export const TRUE_FALSE_PACKS = [
  {
    id: "vf_001",
    statements: [
      { text: "Il Nilo è il fiume più lungo del mondo.", correct: true },
      { text: "Il Monte Bianco è in Spagna.", correct: false },
      { text: "Parigi è la capitale della Francia.", correct: true },
    ],
  },
  // ...
];

export function getRandomTrueFalsePack(usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = TRUE_FALSE_PACKS.filter((q) => !usedSet.has(q.id));
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// L'intruso
export const ODD_ONE_OUT_CHALLENGES = [
  {
    id: "odd_001",
    items: ["Leonardo da Vinci", "Michelangelo", "Raffaello", "Einstein"],
    correctIndex: 3,
  },
  // ...
];

export function getRandomOddOneOut(usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = ODD_ONE_OUT_CHALLENGES.filter((q) => !usedSet.has(q.id));
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}
