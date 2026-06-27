// Dati di gioco — The Witcher: Old World — Wild Hunt
// Luoghi 1-18 (3 pile da 6 per terreno) + mostri per livello.

const TERRAINS = ['forest', 'water', 'mountain']
const TERRAIN_LABELS = { forest: 'Foresta', water: 'Acqua', mountain: 'Montagna' }
const TERRAIN_PREFIX = { forest: 'Forest', water: 'Water', mountain: 'Mountain' }

function locImg(terrain, numero, nome) {
  return `public/img/terrein/${TERRAIN_PREFIX[terrain]}${numero}${nome.replace(/[^A-Za-z0-9]/g, '')}.png`
}

/* Luogo 0 (Beheltnar) è speciale: appartiene a TUTTI e 3 i terreni.
   Quando estratto da una pile, va rimosso dalle altre 2 (vedi drawLocation in app.js).
   Quando restituito (defeat mostro), torna in tutte e 3 (vedi restoreLocations). */
const WILD_LOCATION = { numero: 0, nome: 'Beheltnar', img: 'public/img/terrein/All0BeheltNar.png' }

const RAW_LOCATIONS = {
  forest: [
    { numero: 6, nome: 'Novigrad' }, { numero: 7, nome: 'Vizima' },
    { numero: 8, nome: 'Vengerberg' }, { numero: 10, nome: 'Haern Caduch' },
    { numero: 16, nome: 'Dhuwod' }, { numero: 17, nome: 'Stygga' },
    WILD_LOCATION
  ],
  water: [
    { numero: 1, nome: 'Kaer Seren' }, { numero: 4, nome: 'Ban Ard' },
    { numero: 5, nome: 'Cidaris' }, { numero: 12, nome: 'Glenmore' },
    { numero: 14, nome: 'Loc Ichaer' }, { numero: 15, nome: 'Gorthur Gvaed' },
    WILD_LOCATION
  ],
  mountain: [
    { numero: 2, nome: 'Hengfors' }, { numero: 3, nome: 'Kaer Morhen' },
    { numero: 9, nome: 'Cintra' }, { numero: 11, nome: 'Beauclair' },
    { numero: 13, nome: 'Doldeth' }, { numero: 18, nome: 'Ard Modron' },
    WILD_LOCATION
  ]
}

const LOCATIONS = {}
for (const t of TERRAINS) {
  LOCATIONS[t] = RAW_LOCATIONS[t].map((l) => ({
    ...l, terrain: t, img: l.img || locImg(t, l.numero, l.nome)
  }))
}
/* ALL_LOCATIONS deduplicato (Beheltnar appare in tutti e 3 ma per missioni va una volta sola) */
const _seenNum = new Set()
const ALL_LOCATIONS = TERRAINS
  .flatMap((t) => LOCATIONS[t])
  .filter((l) => { if (_seenNum.has(l.numero)) return false; _seenNum.add(l.numero); return true })
  .sort((a, b) => a.numero - b.numero)

const MONSTERS = {
  1: ["Nekker's Nest", 'Arachas', 'Archespore', 'Barghest', 'Foglet', 'Harpy',
      "Ghoul's Nest", "Drowner's Nest", 'Rotfiend', 'Ekimmara'],
  2: ['Griffin', 'Wyvern', 'Werewolf', 'Fiend', 'Noonwraith', 'Nightwraith',
      'Water Hag', 'Manticore', 'Whispess', 'Weavess', 'Penitent', 'Grave Hag'],
  3: ['Leshen', 'Striga', 'Bruxa', 'Glustyworp', 'Brewess', 'Yghern', 'Troll']
}
const MONSTER_LEVELS = [1, 2, 3]

function monsterSlug(nome) {
  return nome.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
function monsterImg(nome) {
  return `public/img/monsters/${monsterSlug(nome)}.png`
}
