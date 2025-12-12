export const CATEGORIES = [
  "geografia",
  "storia",
  "arte",
  "sport",
  "spettacolo",
  "scienza",
];

// Per comodità: 6 settori = 6 categorie in ordine fisso
export const SECTOR_ORDER = [...CATEGORIES];

// Numero di settori e dimensioni strutturali
const SECTORS = 6;
const TILES_PER_SECTOR_RING = 7; // 1 key + 6 intermedie
const RING_TILES = SECTORS * TILES_PER_SECTOR_RING; // 42
const BRANCH_LENGTH = 5; // 5 caselle di stradina per ogni chiave
const BRANCH_TILES = SECTORS * BRANCH_LENGTH; // 30
const SCRIGNO_ID = RING_TILES + BRANCH_TILES; // 42 + 30 = 72

/**
 * Struttura di una casella:
 * {
 *   id: number,
 *   type: "category" | "key" | "event" | "minigame" | "scrigno",
 *   category: string | null,
 *   zone: "ring" | "branch" | "center",
 *   neighbors: number[]
 * }
 */

export const BOARD = buildBoard();

export const START_TILE_ID = 0; // per ora tutti partono dalla casella key del primo settore


function buildBoard() {
  const tiles = [];

  // 1) Costruzione anello esterno (42 caselle)
  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const baseId = sectorIndex * TILES_PER_SECTOR_RING;

    // Categoria della chiave in questo settore
    const keyCategory = SECTOR_ORDER[sectorIndex];

    // Altre 5 categorie diverse dalla chiave
    const otherCategories = CATEGORIES.filter((c) => c !== keyCategory);

    // Per le 4 caselle categoria sull’anello,
    // prendiamo le prime 4 "otherCategories" (tutte diverse fra loro).
    const ringCategories = otherCategories.slice(0, 4);

    // Pattern delle 7 caselle del settore sull’anello (solo per la parte "type" e "local role"):
    // [ Key, Cat1, Event, Cat2, Cat3, Minigame, Cat4 ]
    // NB: la categoria della key è keyCategory; le altre category si assegnano più sotto.

    // 1) Chiave
    tiles.push({
      id: baseId,
      type: "key",
      category: keyCategory,
      zone: "ring",
      neighbors: [], // riempite dopo
    });

    // 2) Casella categoria 1
    tiles.push({
      id: baseId + 1,
      type: "category",
      category: ringCategories[0],
      zone: "ring",
      neighbors: [],
    });

    // 3) Casella evento
    tiles.push({
      id: baseId + 2,
      type: "event",
      category: null,
      zone: "ring",
      neighbors: [],
    });

    // 4) Casella categoria 2
    tiles.push({
      id: baseId + 3,
      type: "category",
      category: ringCategories[1],
      zone: "ring",
      neighbors: [],
    });

    // 5) Casella categoria 3
    tiles.push({
      id: baseId + 4,
      type: "category",
      category: ringCategories[2],
      zone: "ring",
      neighbors: [],
    });

    // 6) Casella minigioco
    tiles.push({
      id: baseId + 5,
      type: "minigame",
      category: null,
      zone: "ring",
      neighbors: [],
    });

    // 7) Casella categoria 4
    tiles.push({
      id: baseId + 6,
      type: "category",
      category: ringCategories[3],
      zone: "ring",
      neighbors: [],
    });
  }

  // 2) Collegare anello esterno come cerchio
  for (let id = 0; id < RING_TILES; id++) {
    const prevId = (id - 1 + RING_TILES) % RING_TILES;
    const nextId = (id + 1) % RING_TILES;
    tiles[id].neighbors.push(prevId, nextId);
  }

  // 3) Costruzione stradine (30 caselle)
  //    Ogni settore ha una stradina che parte dalla sua casella chiave.
  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const keyTileId = sectorIndex * TILES_PER_SECTOR_RING; // la key è sempre la prima nel settore
    const branchBaseId = RING_TILES + sectorIndex * BRANCH_LENGTH;

    const keyCategory = SECTOR_ORDER[sectorIndex];
    // 5 categorie TUTTE diverse dalla key e anche tra loro
    const branchCategories = CATEGORIES.filter((c) => c !== keyCategory);

    for (let i = 0; i < BRANCH_LENGTH; i++) {
      const tileId = branchBaseId + i;
      const tileCategory = branchCategories[i]; // 5 caselle, 5 categorie diverse

      tiles.push({
        id: tileId,
        type: "category",
        category: tileCategory,
        zone: "branch",
        neighbors: [],
      });
    }

    // Collego la key alla prima casella della stradina
    const firstBranchId = branchBaseId;
    tiles[keyTileId].neighbors.push(firstBranchId);
    tiles[firstBranchId].neighbors.push(keyTileId);

    // Collego le caselle interne della stradina
    for (let i = 0; i < BRANCH_LENGTH; i++) {
      const tileId = branchBaseId + i;

      // collega alla precedente se non è la prima
      if (i > 0) {
        const prevId = tileId - 1;
        tiles[tileId].neighbors.push(prevId);
      }

      // collega alla successiva se non è l’ultima
      if (i < BRANCH_LENGTH - 1) {
        const nextId = tileId + 1;
        tiles[tileId].neighbors.push(nextId);
      }
    }
  }

  // 4) Casella Scrigno centrale
  tiles.push({
    id: SCRIGNO_ID,
    type: "scrigno",
    category: null,
    zone: "center",
    neighbors: [],
  });

  // Collego la fine di ogni stradina allo Scrigno
  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const branchBaseId = RING_TILES + sectorIndex * BRANCH_LENGTH;
    const lastBranchId = branchBaseId + BRANCH_LENGTH - 1; // ultimo della stradina

    // collega ultimo della stradina allo scrigno
    tiles[lastBranchId].neighbors.push(SCRIGNO_ID);
    tiles[SCRIGNO_ID].neighbors.push(lastBranchId);
  }

  return tiles;
}
