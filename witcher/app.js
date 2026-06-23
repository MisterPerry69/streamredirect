'use strict'
/*
 * The Witcher: Old World — Wild Hunt — Tracker (pixel art edition)
 *
 * Architettura:
 *   - dati gioco          -> data.js     (mostri, luoghi)
 *   - 4 Witcher hardcoded -> witchers.js
 *   - filtro mosaico      -> pixelate.js
 *   - questo file         -> stato + persistenza + render + interazioni
 *
 * Niente overlay assoluti, niente PNG cornice. Layout flex/grid.
 */

/* ============================================================
 *  Helpers DOM
 * ============================================================ */
const $ = (s, r = document) => r.querySelector(s)
const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const cap = (s) => s[0].toUpperCase() + s.slice(1)

/* blockSize più piccolo = meno mosaico = immagine più nitida (1 = nessun effetto) */
const PIXEL_BLOCK = { hex: 1, token: 1, tokenSm: 1, reel: 1 }

/* ============================================================
 *  Mazzi senza reinserimento
 * ============================================================ */
function shuffle(a) {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function pileFrom(items) { return { available: shuffle(items), used: [] } }
function drawFrom(pile) {
  if (!pile.available.length) { pile.available = shuffle(pile.used); pile.used = [] }
  const it = pile.available.shift()
  pile.used.push(it)
  return it
}
function restoreTo(pile, items, keyFn) {
  const keys = new Set(items.map(keyFn))
  pile.used = pile.used.filter((it) => !keys.has(keyFn(it)))
  pile.available = shuffle(pile.available.concat(items))
}

/* ============================================================
 *  Stato + persistenza
 * ============================================================ */
const STORAGE_KEY = 'twow-tracker-v4'

function freshState() {
  return {
    phase: 'setup',
    witcherIds: [],
    terrainPiles: {
      forest:   pileFrom(LOCATIONS.forest.map((l)   => ({ ...l }))),
      water:    pileFrom(LOCATIONS.water.map((l)    => ({ ...l }))),
      mountain: pileFrom(LOCATIONS.mountain.map((l) => ({ ...l })))
    },
    monsterPiles: {
      1: pileFrom(MONSTERS[1].map((n) => ({ nome: n, livello: 1, img: monsterImg(n) }))),
      2: pileFrom(MONSTERS[2].map((n) => ({ nome: n, livello: 2, img: monsterImg(n) }))),
      3: pileFrom(MONSTERS[3].map((n) => ({ nome: n, livello: 3, img: monsterImg(n) })))
    },
    slots: {
      forest:   { monster: null, tracks: [] },
      water:    { monster: null, tracks: [] },
      mountain: { monster: null, tracks: [] }
    },
    missions: [],
    nextMissionNumber: 1,
    nextId: 1
  }
}
let state = load()
function load() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw) }
  catch (e) {}
  return freshState()
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) {}
}
const newId = () => state.nextId++
const activeWitchers = () => state.witcherIds.map(witcherById).filter(Boolean)

function startGame(ids) { state.witcherIds = ids; state.phase = 'table'; save(); render() }
function newGame() {
  if (!confirm('Nuova partita? Tutto lo stato attuale verrà azzerato.')) return
  state = freshState(); save(); render()
}

/* ============================================================
 *  Long-press (defeat, rimuovi marker, rimuovi missione)
 * ============================================================ */
function bindLongPress(node, fn, ms = 600) {
  let t = null
  const start = () => { t = setTimeout(fn, ms) }
  const cancel = () => clearTimeout(t)
  node.addEventListener('pointerdown', start)
  node.addEventListener('pointerup',     cancel)
  node.addEventListener('pointerleave',  cancel)
  node.addEventListener('pointercancel', cancel)
}

/* ============================================================
 *  Componenti: token (cerchio), hex (mostro), badge
 * ============================================================ */

/* Token tondo con foto pixelata + numero opzionale + check opzionale */
function tokenEl({ src, num, done, sm, blockSize }) {
  const t = el('span', 'token' + (sm ? ' token-sm' : '') + (done ? ' done' : ''))
  const img = document.createElement('img')
  img.className = 'token-img'
  img.alt = ''
  img.onerror = () => { img.style.visibility = 'hidden' }
  applyPixelate(img, src, blockSize || (sm ? PIXEL_BLOCK.tokenSm : PIXEL_BLOCK.token))
  t.appendChild(img)
  if (num != null) {
    const n = el('span', 'token-num', String(num))
    t.appendChild(n)
  }
  if (done) {
    const c = el('span', 'token-check', '✓')
    t.appendChild(c)
  }
  return t
}

/* Esagono mostro con foto pixelata */
function hexMonster(monster) {
  const h = el('div', 'hex')
  h.innerHTML = `
    <div class="hex-shape">
      <div class="hex-shape-inner">
        <img class="hex-img" alt="">
      </div>
    </div>`
  const img = h.querySelector('.hex-img')
  img.onerror = () => { img.style.visibility = 'hidden' }
  applyPixelate(img, monster.img, PIXEL_BLOCK.hex)
  return h
}
function hexEmpty() {
  const h = el('div', 'hex')
  h.innerHTML = `
    <div class="hex-shape">
      <div class="hex-shape-inner"></div>
    </div>
    <span class="hex-plus">+</span>`
  return h
}

/* ============================================================
 *  Dialog generico
 * ============================================================ */
let openModal = null
function closeDialog() { if (openModal) { openModal.remove(); openModal = null } }

function makeDialog({ title, body, buttons }) {
  closeDialog()
  const ov = el('div', 'modal')
  ov.addEventListener('click', (e) => { if (e.target === ov) closeDialog() })

  const dlg = el('div', 'dialog panel')
  dlg.innerHTML = `
    <div class="panel-header">
      <span>${title || ''}</span>
    </div>
    <div class="panel-body"></div>`
  const inner = dlg.querySelector('.panel-body')
  if (body) body(inner)
  if (buttons && buttons.length) {
    const bar = el('div', 'dialog-actions')
    buttons.forEach((b) => {
      const btn = el('button', 'btn' + (b.primary ? ' btn-primary' : '') + (b.danger ? ' btn-danger' : ''), b.label)
      btn.onclick = () => {
        const keep = b.onClick && b.onClick() === 'keep'
        if (!keep) closeDialog()
      }
      bar.appendChild(btn)
    })
    dlg.appendChild(bar)
  }
  ov.appendChild(dlg)
  document.body.appendChild(ov)
  openModal = ov
}

/* ============================================================
 *  Render principale
 * ============================================================ */
const app = $('#app')
function render() {
  app.innerHTML = ''
  if (state.phase === 'setup') renderSetup()
  else                         renderTable()
}

/* ============================================================
 *  Setup
 * ============================================================ */
function renderSetup() {
  const wrap = el('div', 'setup-wrap')
  // Stesso template dei dialog: cornice dialog-box.png come background
  const panel = el('div', 'dialog setup-dialog')
  panel.innerHTML = `
    <div class="panel-header"><span>NUOVA PARTITA</span></div>
    <div class="panel-body setup-body"></div>`
  const body = panel.querySelector('.setup-body')

  body.appendChild(el('div', 'setup-title', 'THE WITCHER:<br>OLD WORLD'))
  body.appendChild(el('div', 'setup-sub', 'Wild Hunt — Tracker'))
  body.appendChild(el('div', 'setup-sub', 'Scegli i Witcher (min 2)'))

  let selected = WITCHERS.slice(0, 2).map((w) => w.id)
  const grid = el('div', 'witcher-grid')
  WITCHERS.forEach((w) => {
    const pick = el('button', 'witcher-pick' + (selected.includes(w.id) ? ' sel' : ''))
    pick.appendChild(tokenEl({ src: w.avatar, blockSize: PIXEL_BLOCK.token }))
    pick.appendChild(el('span', 'w-name', w.nome.toUpperCase()))
    pick.onclick = () => {
      const i = selected.indexOf(w.id)
      if (i >= 0) selected.splice(i, 1)
      else        selected.push(w.id)
      pick.classList.toggle('sel')
      start.disabled = selected.length < 2
    }
    grid.appendChild(pick)
  })
  body.appendChild(grid)

  const start = el('button', 'btn btn-primary', 'INIZIA PARTITA')
  start.disabled = selected.length < 2
  start.onclick = () => {
    if (selected.length < 2) return
    const ordered = WITCHERS.filter((w) => selected.includes(w.id)).map((w) => w.id)
    startGame(ordered)
  }
  body.appendChild(start)

  wrap.appendChild(panel)
  app.appendChild(wrap)
}

/* ============================================================
 *  Tavolo
 * ============================================================ */
function renderTable() {
  const t = el('div', 'table')

  const monsters = el('div', 'monsters')
  TERRAINS.forEach((terr) => monsters.appendChild(monsterCard(terr)))
  t.appendChild(monsters)

  const missions = el('div', 'panel missions')
  missions.innerHTML = `
    <div class="panel-header"><span>MISSIONI</span></div>
    <div class="panel-body"></div>`
  const mbody = missions.querySelector('.panel-body')
  orderedMissions().forEach((m) => mbody.appendChild(missionCard(m)))
  const add = el('button', 'add-mission', '+ MISSIONE')
  add.onclick = () => {
    state.missions.push({ id: newId(), numero: state.nextMissionNumber++, witcherIds: [], markers: [] })
    save(); render()
  }
  mbody.appendChild(add)
  t.appendChild(missions)

  // Bottone "Nuova partita" floating sopra la stage
  const ng = el('button', 'new-game-btn', '⟳ NUOVA')
  ng.onclick = newGame
  t.appendChild(ng)

  // Hotspot sopra le icone foresta/acqua/montagna del bg_table.png:
  // click = random luogo singolo (per missioni/eventi dove serve un luogo specifico)
  TERRAINS.forEach((terr) => {
    const spot = el('button', 'terrain-spot terrain-spot-' + terr)
    spot.title = 'Estrai un luogo di ' + TERRAIN_LABELS[terr]
    spot.onclick = () => peekRandomLocation(terr)
    t.appendChild(spot)
  })

  app.appendChild(t)
}

/* ----------- monster card per terreno ----------- */
function monsterCard(terrain) {
  const slot = state.slots[terrain]
  const card = el('div', 'panel monster-card')
  card.innerHTML = `
    <div class="panel-header">
      <span>${TERRAIN_LABELS[terrain].toUpperCase()}</span>
    </div>
    <div class="panel-body"></div>`
  const body = card.querySelector('.panel-body')

  // hex (vuoto o pieno)
  const hexWrap = el('div', 'monster-hex-wrap')
  if (!slot.monster) {
    const h = hexEmpty()
    h.onclick = () => chooseLevel(terrain)
    hexWrap.appendChild(h)
    body.appendChild(hexWrap)

    body.appendChild(el('div', 'slot-empty', '— nessun mostro —'))
  } else {
    const h = hexMonster(slot.monster)
    bindLongPress(h, () => defeatMonster(terrain))
    hexWrap.appendChild(h)
    hexWrap.appendChild(el('div', 'monster-name', slot.monster.nome))
    body.appendChild(hexWrap)

    const seguiBtn = el('button', 'btn btn-sm', 'SEGUI')
    seguiBtn.onclick = () => chooseFollower(terrain)
    body.appendChild(seguiBtn)

    // tracce
    const tracks = el('div', 'tracks')
    slot.tracks.forEach((tr) => {
      const row = el('div', 'track')
      row.appendChild(tokenEl({ src: tr.loc.img, num: tr.loc.numero, sm: true }))
      const w = witcherById(tr.witcherId)
      if (w) row.appendChild(tokenEl({ src: w.avatar, sm: true }))
      tracks.appendChild(row)
    })
    body.appendChild(tracks)
  }
  return card
}

/* ----------- mission card ----------- */
function isComplete(m) { return m.markers.length > 0 && m.markers.every((mk) => mk.raccolto) }
function orderedMissions() {
  return state.missions.slice().sort((a, b) => {
    const c = (isComplete(a) ? 1 : 0) - (isComplete(b) ? 1 : 0)
    return c !== 0 ? c : a.numero - b.numero
  })
}
function missionCard(m) {
  const card = el('div', 'mission' + (isComplete(m) ? ' done' : ''))

  // numero (long press per eliminare)
  const numBtn = el('button', 'mission-num', '#' + m.numero)
  bindLongPress(numBtn, () => {
    if (confirm('Eliminare questa missione?')) {
      state.missions = state.missions.filter((x) => x.id !== m.id)
      save(); render()
    }
  })
  card.appendChild(numBtn)

  // witchers associati — l'intera fila è un bottone per aprire la scelta
  const ws = el('button', 'mission-witchers')
  ws.onclick = () => chooseMissionWitchers(m.id)
  const players = m.witcherIds.map(witcherById).filter(Boolean)
  players.forEach((p) => ws.appendChild(tokenEl({ src: p.avatar, sm: true })))
  // "+" sempre presente per indicare che si può aggiungere/modificare
  ws.appendChild(el('span', 'mission-witchers-add', '+'))
  card.appendChild(ws)

  // markers
  const markers = el('div', 'mission-markers')
  m.markers.forEach((mk, idx) => {
    const tok = tokenEl({ src: mk.loc.img, num: mk.loc.numero, done: mk.raccolto })
    tok.style.cursor = 'pointer'
    let longPressed = false, timer = null
    tok.addEventListener('pointerdown', () => {
      longPressed = false
      timer = setTimeout(() => { longPressed = true; m.markers.splice(idx, 1); save(); render() }, 600)
    })
    tok.addEventListener('pointerup', () => {
      clearTimeout(timer)
      if (!longPressed) { mk.raccolto = !mk.raccolto; save(); render() }
    })
    tok.addEventListener('pointerleave', () => clearTimeout(timer))
    markers.appendChild(tok)
  })
  const addBtn = el('button', 'add-loc', '+ LUOGO')
  addBtn.onclick = () => chooseLocations(m.id)
  markers.appendChild(addBtn)
  card.appendChild(markers)

  return card
}

/* ============================================================
 *  Mostri (azioni + dialog)
 * ============================================================ */
function chooseLevel(terrain) {
  makeDialog({
    title: 'QUALE LIVELLO?',
    body: (inner) => {
      const row = el('div', 'levels')
      MONSTER_LEVELS.forEach((lvl) => {
        const b = el('button', 'level-btn',
          `<img src="public/img/mostri_level_${lvl}.png" alt="Livello ${lvl}">`)
        b.onclick = () => { closeDialog(); drawMonster(terrain, lvl) }
        row.appendChild(b)
      })
      inner.appendChild(row)
    },
    buttons: [{ label: 'Annulla' }]
  })
}
function drawMonster(terrain, lvl) {
  const pile = state.monsterPiles[lvl]
  const pool = (pile.available.length ? pile.available : pile.used).map((m) => ({ ...m }))
  const result = { ...drawFrom(pile) }
  save()
  slotMachine('LIVELLO ' + 'I'.repeat(lvl),
    pool.map((m) => ({ label: m.nome, img: m.img })),
    { label: result.nome, img: result.img },
    () => { state.slots[terrain].monster = result; save(); render() })
}

function chooseFollower(terrain) {
  makeDialog({
    title: 'CHI SEGUE LA TRACCIA?',
    body: (inner) => {
      const row = el('div', 'opts')
      activeWitchers().forEach((w) => {
        const o = el('button', 'opt')
        o.appendChild(tokenEl({ src: w.avatar }))
        o.appendChild(el('span', 'opt-label', w.nome))
        o.onclick = () => { closeDialog(); followMonster(terrain, w.id) }
        row.appendChild(o)
      })
      inner.appendChild(row)
    },
    buttons: [{ label: 'Annulla' }]
  })
}
function followMonster(terrain, witcherId) {
  const pile = state.terrainPiles[terrain]
  const pool = (pile.available.length ? pile.available : pile.used).map((l) => ({ ...l }))
  const result = { ...drawFrom(pile) }
  save()
  slotMachine('TRACCIA — ' + TERRAIN_LABELS[terrain].toUpperCase(),
    pool.map((l) => ({ label: `#${l.numero} ${l.nome}`, img: l.img })),
    { label: `#${result.numero} ${result.nome}`, img: result.img },
    () => { state.slots[terrain].tracks.push({ witcherId, loc: result }); save(); render() })
}

/* Estrae un singolo luogo dal mazzo del terreno (consuma la pila) e lo
   mostra all'utente con randomizer. NON aggiunge tracce, niente effetti:
   serve quando una missione/evento chiede un luogo specifico. */
function peekRandomLocation(terrain) {
  const pile = state.terrainPiles[terrain]
  const pool = (pile.available.length ? pile.available : pile.used).map((l) => ({ ...l }))
  const result = { ...drawFrom(pile) }
  save()
  slotMachineLook('LUOGO — ' + TERRAIN_LABELS[terrain].toUpperCase(),
    pool.map((l) => ({ label: `#${l.numero} ${l.nome}`, img: l.img })),
    { label: `#${result.numero} ${result.nome}`, img: result.img })
}

function defeatMonster(terrain) {
  const slot = state.slots[terrain]
  if (!slot.monster) return
  const monster = slot.monster
  showDefeat(monster, () => {
    const freed = slot.tracks.map((t) => t.loc)
    if (freed.length) restoreTo(state.terrainPiles[terrain], freed, (l) => l.numero)
    slot.monster = null; slot.tracks = []
    save(); render()
  })
}
function showDefeat(monster, done) {
  const ov = el('div', 'defeat')
  const stage = el('div', 'defeat-hex-stage')
  const top = el('div', 'defeat-half top')
  const bot = el('div', 'defeat-half bot')
  top.appendChild(hexMonster(monster))
  bot.appendChild(hexMonster(monster))
  stage.appendChild(top); stage.appendChild(bot)
  stage.appendChild(el('div', 'defeat-slash'))
  ov.appendChild(stage)
  ov.appendChild(el('div', 'defeat-text', 'SCONFITTO'))
  document.body.appendChild(ov)
  setTimeout(() => {
    ov.classList.add('out')
    setTimeout(() => { ov.remove(); done() }, 260)
  }, 1500)
}

/* ============================================================
 *  Missioni (azioni + dialog)
 * ============================================================ */
function chooseLocations(missionId) {
  const selected = []
  makeDialog({
    title: 'QUALI LUOGHI?',
    body: (inner) => {
      const grid = el('div', 'loc-grid')
      ALL_LOCATIONS.forEach((l) => {
        const o = el('button', 'opt')
        o.appendChild(tokenEl({ src: l.img, num: l.numero }))
        o.onclick = () => {
          const i = selected.indexOf(l.numero)
          if (i >= 0) { selected.splice(i, 1); o.classList.remove('sel') }
          else        { selected.push(l.numero); o.classList.add('sel') }
        }
        grid.appendChild(o)
      })
      inner.appendChild(grid)
    },
    buttons: [
      { label: 'OK', primary: true, onClick: () => {
        if (!selected.length) return
        const m = state.missions.find((x) => x.id === missionId)
        selected.forEach((n) => {
          const loc = ALL_LOCATIONS.find((l) => l.numero === n)
          m.markers.push({ loc: { ...loc }, raccolto: false })
        })
        save(); render()
      }},
      { label: 'Annulla' }
    ]
  })
}
function chooseMissionWitchers(missionId) {
  const m = state.missions.find((x) => x.id === missionId)
  makeDialog({
    title: 'ASSOCIA WITCHER',
    body: (inner) => {
      const row = el('div', 'opts')
      activeWitchers().forEach((w) => {
        const o = el('button', 'opt' + (m.witcherIds.includes(w.id) ? ' sel' : ''))
        o.appendChild(tokenEl({ src: w.avatar }))
        o.appendChild(el('span', 'opt-label', w.nome))
        o.onclick = () => {
          const i = m.witcherIds.indexOf(w.id)
          if (i >= 0) { m.witcherIds.splice(i, 1); o.classList.remove('sel') }
          else        { m.witcherIds.push(w.id);   o.classList.add('sel') }
          save()
        }
        row.appendChild(o)
      })
      inner.appendChild(row)
    },
    buttons: [{ label: 'Fatto', primary: true, onClick: () => render() }]
  })
}

/* ============================================================
 *  Slot machine (randomizer)
 * ============================================================ */
function slotMachine(title, pool, result, done) {
  closeDialog()
  const ov = el('div', 'modal')
  const dlg = el('div', 'dialog panel')
  dlg.innerHTML = `
    <div class="panel-header"><span>${title}</span></div>
    <div class="panel-body">
      <div class="reel">
        <div class="reel-frame blur"><img alt=""></div>
        <div class="reel-label"></div>
      </div>
    </div>`
  ov.appendChild(dlg)
  document.body.appendChild(ov)

  const frame = dlg.querySelector('.reel-frame')
  const img   = dlg.querySelector('.reel-frame img')
  const label = dlg.querySelector('.reel-label')
  const reel  = dlg.querySelector('.reel')

  img.onerror = () => { img.style.visibility = 'hidden' }
  const items = pool.length ? pool : [result]
  let i = 0
  const start = performance.now(), duration = 1500
  function set(it) {
    applyPixelate(img, it.img, PIXEL_BLOCK.reel)
    label.textContent = it.label
  }
  set(items[0])
  function tick() {
    const elapsed = performance.now() - start
    if (elapsed >= duration) {
      frame.classList.remove('blur')
      reel.classList.add('landed')
      set(result)
      setTimeout(() => { ov.remove(); done() }, 750)
      return
    }
    i = (i + 1) % items.length
    set(items[i])
    setTimeout(tick, 50 + Math.pow(elapsed / duration, 3) * 240)
  }
  setTimeout(tick, 50)
}

/* Variante del randomizer per il peek terreno: NON si chiude da sola,
   resta in pausa sul risultato finché l'utente non preme OK. */
function slotMachineLook(title, pool, result) {
  closeDialog()
  const ov = el('div', 'modal')
  const dlg = el('div', 'dialog')
  dlg.innerHTML = `
    <div class="panel-header"><span>${title}</span></div>
    <div class="panel-body">
      <div class="reel">
        <div class="reel-frame blur"><img alt=""></div>
        <div class="reel-label"></div>
      </div>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-primary" disabled>OK</button>
    </div>`
  ov.appendChild(dlg)
  document.body.appendChild(ov)
  openModal = ov

  const okBtn = dlg.querySelector('.btn')
  const frame = dlg.querySelector('.reel-frame')
  const img   = dlg.querySelector('.reel-frame img')
  const label = dlg.querySelector('.reel-label')
  const reel  = dlg.querySelector('.reel')
  okBtn.onclick = () => closeDialog()
  img.onerror = () => { img.style.visibility = 'hidden' }

  const items = pool.length ? pool : [result]
  let i = 0
  const start = performance.now(), duration = 1500
  function set(it) {
    applyPixelate(img, it.img, PIXEL_BLOCK.reel)
    label.textContent = it.label
  }
  set(items[0])
  function tick() {
    const elapsed = performance.now() - start
    if (elapsed >= duration) {
      frame.classList.remove('blur')
      reel.classList.add('landed')
      set(result)
      okBtn.disabled = false
      return
    }
    i = (i + 1) % items.length
    set(items[i])
    setTimeout(tick, 50 + Math.pow(elapsed / duration, 3) * 240)
  }
  setTimeout(tick, 50)
}

/* ============================================================
 *  Avvio + safety net
 * ============================================================ */
window.addEventListener('error', (e) => {
  app.innerHTML = '<pre style="color:#e8d4a8;padding:20px;white-space:pre-wrap;font-family:monospace">Errore: ' + e.message + '</pre>'
})
render()
