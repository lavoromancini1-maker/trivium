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

// ✅ Stradine a lunghezza variabile per settore:
// settore 0 -> keyId 0  -> 3 caselle
// settore 3 -> keyId 21 -> 3 caselle
// altri -> 5 caselle
const BRANCH_LENGTHS_BY_SECTOR = {
  0: 3,
  1: 5,
  2: 5,
  3: 3,
  4: 5,
  5: 5,
};

const BRANCH_TILES = Object.values(BRANCH_LENGTHS_BY_SECTOR).reduce((sum, v) => sum + v, 0);
const SCRIGNO_ID = RING_TILES + BRANCH_TILES;

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
export const START_TILE_ID = SCRIGNO_ID; // tutti partono dal centro (scrigno)

function buildBoard() {
  const tiles = [];

  // 1) Costruzione anello esterno (42 caselle)
  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const baseId = sectorIndex * TILES_PER_SECTOR_RING;

    // Categoria della chiave in questo settore
    const keyCategory = SECTOR_ORDER[sectorIndex];

    // Altre 5 categorie diverse dalla chiave
    const otherCategories = CATEGORIES.filter((c) => c !== keyCategory);

    // Per le 4 caselle categoria sull’anello
    const ringCategories = otherCategories.slice(0, 4);

    // 1) Chiave
    tiles.push({
      id: baseId,
      type: "key",
      category: keyCategory,
      zone: "ring",
      neighbors: [],
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

  // 3) Costruzione stradine (lunghezza variabile)
  //    IDs sequenziali a partire da 42
  let nextBranchId = RING_TILES; // 42

  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const keyTileId = sectorIndex * TILES_PER_SECTOR_RING; // la key è sempre la prima nel settore
    const len = BRANCH_LENGTHS_BY_SECTOR[sectorIndex];

    const keyCategory = SECTOR_ORDER[sectorIndex];
    const branchCategories = CATEGORIES.filter((c) => c !== keyCategory); // 5 categorie disponibili

    let prevId = keyTileId;
    let firstBranchId = null;
    let lastBranchId = null;

    for (let i = 0; i < len; i++) {
      const tileId = nextBranchId++;
      const tileCategory = branchCategories[i]; // prende le prime len categorie (tutte diverse dalla key)

      tiles.push({
        id: tileId,
        type: "category",
        category: tileCategory,
        zone: "branch",
        neighbors: [],
      });

      // collega catena: prev <-> tileId
      tiles[prevId].neighbors.push(tileId);
      tiles[tileId].neighbors.push(prevId);

      if (i === 0) firstBranchId = tileId;
      lastBranchId = tileId;

      prevId = tileId;
    }

    // (Nota: firstBranchId/lastBranchId esistono sempre perché len >= 1)
    // collegamento finale allo scrigno fatto dopo aver creato lo scrigno (step 4)
  }

  // 4) Casella Scrigno centrale
  tiles.push({
    id: SCRIGNO_ID,
    type: "scrigno",
    category: null,
    zone: "center",
    neighbors: [],
  });

  // 5) Collego la fine di ogni stradina allo Scrigno
  //    Devo ricostruire dove finiscono le stradine: lo faccio ripercorrendo i neighbors dalla key
  for (let sectorIndex = 0; sectorIndex < SECTORS; sectorIndex++) {
    const keyTileId = sectorIndex * TILES_PER_SECTOR_RING;
    const len = BRANCH_LENGTHS_BY_SECTOR[sectorIndex];

    // primo branch = terzo neighbor della key (oltre ai due dell’anello) -> lo troviamo cercando neighbor con zone branch
    const keyNeighbors = tiles[keyTileId].neighbors;
    const firstBranchId = keyNeighbors.find((nid) => tiles[nid]?.zone === "branch");

    if (firstBranchId == null) continue;

    // percorri la catena len-1 volte per arrivare all’ultimo
    let current = firstBranchId;
    let prev = keyTileId;

    for (let step = 1; step < len; step++) {
      const next = tiles[current].neighbors.find((nid) => nid !== prev && tiles[nid]?.zone === "branch");
      prev = current;
      current = next;
    }

    const lastBranchId = current;

    // collega ultimo <-> scrigno
    tiles[lastBranchId].neighbors.push(SCRIGNO_ID);
    tiles[SCRIGNO_ID].neighbors.push(lastBranchId);
  }

  return tiles;
}
