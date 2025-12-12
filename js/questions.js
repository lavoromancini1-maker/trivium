/**
 * Struttura domanda normale (scelta multipla):
 * {
 *   id: "geo_001",
 *   category: "geografia",         // una delle 6 categorie
 *   level: 1 | 2 | 3 | "key" | "final", // livello di difficoltà / tipo
 *   text: "Qual è la capitale del Canada?",
 *   answers: ["Toronto", "Montreal", "Ottawa", "Vancouver"],
 *   correctIndex: 2,               // index in answers
 *   media: null | {
 *     type: "image" | "audio",
 *     url: "..."
 *   }
 * }
 */

export const CATEGORIES = [
  "geografia",
  "storia",
  "arte",
  "sport",
  "spettacolo",
  "scienza",
];

// 🔹 DOMANDE DI CATEGORIA (livelli 1, 2, 3, key, final)

// Per ora mettiamo solo qualche esempio. Tu potrai aggiungere
// tutte le tue >1000 domande seguendo lo stesso formato.
export const CATEGORY_QUESTIONS = [
  // Esempi GEOGRAFIA
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

  // Esempi STORIA
  {
    id: "sto_001",
    category: "storia",
    level: 1,
    text: "In quale città fu assassinato Giulio Cesare?",
    answers: ["Atene", "Roma", "Cartagine", "Napoli"],
    correctIndex: 1,
    media: null,
  },

  // ... continua tu con tutte le domande reali
];

/**
 * Restituisce tutte le domande di una certa categoria e di un certo livello.
 */
export function getQuestionsByCategoryAndLevel(category, level) {
  return CATEGORY_QUESTIONS.filter(
    (q) => q.category === category && q.level === level
  );
}

/**
 * Estrae una domanda casuale dalla categoria e livello indicati,
 * escludendo quelle già usate (usedIds = Set o array di id).
 * Ritorna null se non ci sono domande disponibili.
 */
export function getRandomCategoryQuestion(category, level, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === level &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Estrae una domanda "chiave" (level = "key") per una categoria.
 */
export function getRandomKeyQuestion(category, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === "key" &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Estrae una domanda finale per lo scrigno (level = "final").
 * (Se vorrai avere un set speciale per domande finali)
 */
export function getRandomFinalQuestion(category, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = CATEGORY_QUESTIONS.filter(
    (q) =>
      q.category === category &&
      q.level === "final" &&
      !usedSet.has(q.id)
  );

  if (pool.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

// 🔹 MINI-SFIDE

/**
 * Rapid Fire:
 * 3 domande veloci di cultura generale (misc).
 */
export const RAPID_FIRE_QUESTIONS = [
  {
    id: "rf_001",
    text: "Quanti pianeti ha il sistema solare (escluso Plutone)?",
    answers: ["7", "8", "9", "10"],
    correctIndex: 1,
  },
  {
    id: "rf_002",
    text: "Chi ha dipinto la Gioconda?",
    answers: [
      "Michelangelo",
      "Raffaello",
      "Leonardo da Vinci",
      "Caravaggio",
    ],
    correctIndex: 2,
  },
  // ... aggiungi a decine
];

export function getRandomRapidFireQuestions(count = 3, usedIds = []) {
  const usedSet = new Set(usedIds);
  const pool = RAPID_FIRE_QUESTIONS.filter((q) => !usedSet.has(q.id));

  if (pool.length < count) {
    // se non abbastanza, usiamo tutto il pool
    return pool;
  }

  const clone = [...pool];
  const result = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * clone.length);
    result.push(clone[idx]);
    clone.splice(idx, 1);
  }

  return result;
}

/**
 * Ordina la sequenza:
 * 
 * {
 *   id: "seq_001",
 *   instruction: "Ordina dal più antico al più recente",
 *   items: ["Rivoluzione francese", "Rivoluzione americana", "Rivoluzione russa"],
 *   correctOrder: [1, 0, 2] // indici dell'array items
 * }
 */

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

/**
 * Più vicino vince:
 * {
 *   id: "close_001",
 *   text: "In che anno è stata inaugurata la Torre Eiffel?",
 *   correctValue: 1889
 * }
 */

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

/**
 * Indovina immagine:
 * {
 *   id: "img_001",
 *   prompt: "Riconosci il monumento",
 *   imageUrl: "assets/mini/torre_eiffel_blur.jpg",
 *   correctAnswer: "Torre Eiffel"
 * }
 */

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

/**
 * Categoria lampo Vero/Falso:
 * Ogni "pack" ha 3 affermazioni.
 *
 * {
 *   id: "vf_001",
 *   statements: [
 *     { text: "Il Nilo è il fiume più lungo del mondo.", correct: true },
 *     { text: "Il Monte Bianco è in Spagna.", correct: false },
 *     { text: "Parigi è la capitale della Francia.", correct: true }
 *   ]
 * }
 */

export const TRUE_FALSE_PACKS = [
  {
    id: "vf_001",
    statements: [
      {
        text: "Il Nilo è il fiume più lungo del mondo.",
        correct: true,
      },
      {
        text: "Il Monte Bianco è in Spagna.",
        correct: false,
      },
      {
        text: "Parigi è la capitale della Francia.",
        correct: true,
      },
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

/**
 * L'intruso:
 * {
 *   id: "odd_001",
 *   items: ["Leonardo da Vinci", "Michelangelo", "Raffaello", "Einstein"],
 *   correctIndex: 3 // Einstein è l'intruso
 * }
 */

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
