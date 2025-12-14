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
    level: 1,
    text: "Quale di questi mari bagna l'Italia?",
    answers: ["Mar Baltico", "Mar Mediterraneo", "Mar del Nord", "Mar Arabico"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "geo_003",
    category: "geografia",
    level: 2,
    text: "Quale di questi fiumi attraversa Parigi?",
    answers: ["Danubio", "Senna", "Reno", "Rodano"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "geo_004",
    category: "geografia",
    level: 2,
    text: "In quale continente si trova il deserto del Sahara?",
    answers: ["Asia", "Africa", "America", "Europa"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "geo_005",
    category: "geografia",
    level: 3,
    text: "Qual è il monte più alto del Sud America?",
    answers: ["Aconcagua", "Chimborazo", "Huascarán", "Nevado Ojos del Salado"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "geo_006",
    category: "geografia",
    level: 3,
    text: "Qual è il lago più profondo del mondo?",
    answers: ["Lago Bajkal", "Lago Vittoria", "Lago Superiore", "Lago Tanganica"],
    correctIndex: 0,
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
  {
    id: "sto_002",
    category: "storia",
    level: 1,
    text: "In che anno è caduto l'Impero Romano d'Occidente?",
    answers: ["476", "1492", "1066", "395"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sto_003",
    category: "storia",
    level: 2,
    text: "Chi guidò la spedizione dei Mille?",
    answers: ["Garibaldi", "Cavour", "Mazzini", "Vittorio Emanuele II"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sto_004",
    category: "storia",
    level: 2,
    text: "Quale rivoluzione iniziò nel 1789?",
    answers: [
      "Rivoluzione americana",
      "Rivoluzione francese",
      "Rivoluzione russa",
      "Rivoluzione industriale",
    ],
    correctIndex: 1,
    media: null,
  },
  {
    id: "sto_005",
    category: "storia",
    level: 3,
    text: "In quale anno iniziò la Prima Guerra Mondiale?",
    answers: ["1912", "1914", "1916", "1918"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "sto_006",
    category: "storia",
    level: 3,
    text: "Chi fu il primo re d'Italia?",
    answers: [
      "Vittorio Emanuele II",
      "Umberto I",
      "Napoleone",
      "Carlo Alberto",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sto_key_001",
    category: "storia",
    level: "key",
    text: "In quale anno avvenne la Rivoluzione russa di ottobre?",
    answers: ["1914", "1917", "1921", "1936"],
    correctIndex: 1,
    media: null,
  },
];

/* ─────────────────────
   ARTE E LETTERATURA
   ───────────────────── */

const ARTE_QUESTIONS = [
  {
    id: "art_001",
    category: "arte",
    level: 1,
    text: "Chi ha dipinto la Gioconda?",
    answers: [
      "Leonardo da Vinci",
      "Michelangelo",
      "Raffaello",
      "Caravaggio",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_002",
    category: "arte",
    level: 1,
    text: "Quale scrittore ha scritto 'I promessi sposi'?",
    answers: [
      "Alessandro Manzoni",
      "Gabriele D'Annunzio",
      "Italo Calvino",
      "Giovanni Verga",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_003",
    category: "arte",
    level: 2,
    text: "Il Guernica è un'opera di…",
    answers: ["Picasso", "Dalí", "Mirò", "Goya"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_004",
    category: "arte",
    level: 2,
    text: "Chi è l'autore della Divina Commedia?",
    answers: ["Dante Alighieri", "Boccaccio", "Petrarca", "Ariosto"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_005",
    category: "arte",
    level: 3,
    text: "In quale città si trova il museo del Louvre?",
    answers: ["Parigi", "Roma", "Madrid", "Vienna"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_006",
    category: "arte",
    level: 3,
    text: "Chi ha composto l'opera 'La Traviata'?",
    answers: ["Verdi", "Puccini", "Rossini", "Donizetti"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "art_key_001",
    category: "arte",
    level: "key",
    text: "Chi dipinse il ciclo di affreschi della volta della Cappella Sistina?",
    answers: [
      "Michelangelo",
      "Leonardo da Vinci",
      "Raffaello",
      "Botticelli",
    ],
    correctIndex: 0,
    media: null,
  },
];

/* ─────────────────────
   SPORT E HOBBY
   ───────────────────── */

const SPORT_QUESTIONS = [
  {
    id: "spo_001",
    category: "sport",
    level: 1,
    text: "Quanti giocatori ci sono in una squadra di calcio in campo?",
    answers: ["9", "10", "11", "12"],
    correctIndex: 2,
    media: null,
  },
  {
    id: "spo_002",
    category: "sport",
    level: 1,
    text: "In quale sport si usa la racchetta?",
    answers: ["Tennis", "Calcio", "Basket", "Nuoto"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spo_003",
    category: "sport",
    level: 2,
    text: "Quale nazione ha vinto più Mondiali di calcio?",
    answers: ["Brasile", "Italia", "Germania", "Argentina"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spo_004",
    category: "sport",
    level: 2,
    text: "In quale città si sono svolte le Olimpiadi invernali del 2006?",
    answers: ["Torino", "Atene", "Sydney", "Londra"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spo_005",
    category: "sport",
    level: 3,
    text: "Chi detiene il record mondiale dei 100 metri piani (uomini)?",
    answers: ["Usain Bolt", "Carl Lewis", "Tyson Gay", "Asafa Powell"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spo_006",
    category: "sport",
    level: 3,
    text: "Quanti anelli ci sono nel simbolo olimpico?",
    answers: ["4", "5", "6", "7"],
    correctIndex: 1,
    media: null,
  },
  {
    id: "spo_key_001",
    category: "sport",
    level: "key",
    text: "In che anno si tennero le prime Olimpiadi moderne?",
    answers: ["1896", "1900", "1888", "1912"],
    correctIndex: 0,
    media: null,
  },
];

/* ─────────────────────
   SPETTACOLO
   ───────────────────── */

const SPETTACOLO_QUESTIONS = [
  {
    id: "spe_001",
    category: "spettacolo",
    level: 1,
    text: "Chi ha interpretato Jack in 'Titanic'?",
    answers: ["Leonardo DiCaprio", "Brad Pitt", "Tom Cruise", "Matt Damon"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_002",
    category: "spettacolo",
    level: 1,
    text: "In quale città si svolge il Festival di Sanremo?",
    answers: ["Sanremo", "Roma", "Milano", "Torino"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_003",
    category: "spettacolo",
    level: 2,
    text: "In quale città si svolge il Festival di Cannes?",
    answers: ["Cannes", "Venezia", "Berlino", "Los Angeles"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_004",
    category: "spettacolo",
    level: 2,
    text: "Chi ha diretto 'La Dolce Vita'?",
    answers: ["Fellini", "Visconti", "Antonioni", "Bertolucci"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_005",
    category: "spettacolo",
    level: 3,
    text: "Quale film ha vinto l'Oscar come miglior film nel 1994?",
    answers: [
      "Forrest Gump",
      "Pulp Fiction",
      "Le ali della libertà",
      "Il re leone",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_006",
    category: "spettacolo",
    level: 3,
    text: "Chi è l'autore della colonna sonora de 'Il Padrino'?",
    answers: [
      "Nino Rota",
      "Ennio Morricone",
      "John Williams",
      "Hans Zimmer",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "spe_key_001",
    category: "spettacolo",
    level: "key",
    text: "Qual è stato il primo film sonoro della storia del cinema?",
    answers: [
      "Il cantante di jazz",
      "Via col vento",
      "Metropolis",
      "Quarto potere",
    ],
    correctIndex: 0,
    media: null,
  },
];

/* ─────────────────────
   SCIENZA / NATURA
   ───────────────────── */

const SCIENZA_QUESTIONS = [
  {
    id: "sci_001",
    category: "scienza",
    level: 1,
    text: "Qual è il pianeta più grande del Sistema Solare?",
    answers: ["Giove", "Saturno", "Nettuno", "Urano"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_002",
    category: "scienza",
    level: 1,
    text: "Qual è la formula dell'acqua?",
    answers: ["H₂O", "CO₂", "NaCl", "O₂"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_003",
    category: "scienza",
    level: 2,
    text: "Chi ha scoperto la penicillina?",
    answers: [
      "Alexander Fleming",
      "Marie Curie",
      "Isaac Newton",
      "Albert Einstein",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_004",
    category: "scienza",
    level: 2,
    text: "Come si chiama il processo con cui le piante producono ossigeno?",
    answers: ["Fotosintesi", "Respirazione", "Fermentazione", "Transpirazione"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_005",
    category: "scienza",
    level: 3,
    text: "Qual è la particella con carica negativa?",
    answers: ["Elettrone", "Protone", "Neutrone", "Quark up"],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_006",
    category: "scienza",
    level: 3,
    text: "Chi ha formulato la teoria della relatività?",
    answers: [
      "Albert Einstein",
      "Niels Bohr",
      "Erwin Schrödinger",
      "Max Planck",
    ],
    correctIndex: 0,
    media: null,
  },
  {
    id: "sci_key_001",
    category: "scienza",
    level: "key",
    text: "Che tipo di particelle sono i quark?",
    answers: [
      "Particelle subatomiche",
      "Molecole",
      "Atomi",
      "Radiazioni",
    ],
    correctIndex: 0,
    media: null,
  },
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
  {
    id: "rf_002",
    text: "Qual è la capitale del Canada?",
    answers: ["Toronto", "Ottawa", "Montreal", "Vancouver"],
    correctIndex: 1,
  },
  {
    id: "rf_003",
    text: "In che continente si trova il deserto del Sahara?",
    answers: ["Asia", "Africa", "Oceania", "America"],
    correctIndex: 1,
  },
  {
    id: "rf_004",
    text: "Quante sono le regioni italiane?",
    answers: ["18", "19", "20", "21"],
    correctIndex: 2,
  },
  {
    id: "rf_005",
    text: "Quale animale è noto come 'Re della Savana'?",
    answers: ["Tigre", "Leone", "Elefante", "Ghepardo"],
    correctIndex: 1,
  },
  {
    id: "rf_006",
    text: "Qual è il simbolo chimico dell’ossigeno?",
    answers: ["O", "Ox", "Og", "Os"],
    correctIndex: 0,
  },
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

// ───────────────────────────────
// MINIGAME: VERO/FALSO LAMPO (3 affermazioni)
// ───────────────────────────────
export const VF_FLASH_QUESTIONS = [
  {
    id: "vf_001",
    statements: [
      { text: "Venere è il pianeta più caldo del Sistema Solare.", correct: true },
      { text: "La Grande Muraglia Cinese è visibile dalla Luna a occhio nudo.", correct: false },
      { text: "Il Nilo è sempre considerato il fiume più lungo del mondo senza eccezioni.", correct: false }
    ],
  },
];

export function getRandomVFFlashQuestion(usedIds = []) {
  const pool = VF_FLASH_QUESTIONS.filter(q => !usedIds.includes(q.id));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
