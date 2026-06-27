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

/* Estrae un luogo dal terreno specificato. Se è Beheltnar (numero 0),
   lo rimuove anche dalle altre 2 pile terreno (è condiviso). */
function drawLocation(terrain) {
  const pile = state.terrainPiles[terrain]
  const result = drawFrom(pile)
  if (result.numero === 0) {
    for (const t of TERRAINS) {
      if (t === terrain) continue
      const other = state.terrainPiles[t]
      other.available = other.available.filter((l) => l.numero !== 0)
      other.used      = other.used.filter((l) => l.numero !== 0)
    }
  }
  return result
}

/* Ripristina luoghi nella pile del loro terreno. Se include Beheltnar (0),
   lo rimette in tutte e 3 le pile. */
function restoreLocations(terrain, locs) {
  const non0 = locs.filter((l) => l.numero !== 0)
  const has0 = locs.some((l) => l.numero === 0)
  if (non0.length) restoreTo(state.terrainPiles[terrain], non0, (l) => l.numero)
  if (has0) {
    for (const t of TERRAINS) {
      const other = state.terrainPiles[t]
      const present = other.available.some((l) => l.numero === 0) ||
                      other.used.some((l) => l.numero === 0)
      if (!present) other.available.push({ ...WILD_LOCATION, terrain: t })
    }
  }
}

/* ============================================================
 *  Stato + persistenza
 * ============================================================ */
const STORAGE_KEY = 'twow-tracker-v4'

function freshState() {
  return {
    phase: 'setup',
    witcherIds: [],
    startedAt: null,
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
    nextId: 1,
    /* history per stats fine partita */
    history: {
      defeatedMonsters: [],         // [{ nome, livello, terrain, at }]
      tracksTakenByWitcher: {}      // { witcherId: count tracce raccolte }
    }
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

function startGame(ids) {
  state.witcherIds = ids
  state.phase = 'table'
  state.startedAt = Date.now()
  save(); render()
}
function elapsedMs() { return state.startedAt ? Date.now() - state.startedAt : 0 }
function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
function newGame() {
  confirmDialog({
    title: 'NUOVA PARTITA',
    message: 'Resettare tutto e iniziare una nuova partita?',
    yesLabel: 'CONFERMA',
    noLabel:  'ANNULLA',
    danger: true,
    onYes: () => { state = freshState(); save(); render() }
  })
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

/* Esagono mostro con foto pixelata + badge livello in alto a destra */
function hexMonster(monster, opts = {}) {
  const h = el('div', 'hex')
  h.innerHTML = `
    <div class="hex-shape">
      <div class="hex-shape-inner">
        <img class="hex-img" alt="">
      </div>
    </div>
    ${opts.noLevel ? '' : `<span class="hex-level">${'I'.repeat(monster.livello)}</span>`}`
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

/* Conferma custom (rimpiazza confirm() di sistema). */
function confirmDialog({ title, message, yesLabel, noLabel, danger, onYes, onNo }) {
  makeDialog({
    title: title || 'CONFERMA',
    body: (inner) => {
      inner.appendChild(el('div', 'confirm-msg', message || ''))
    },
    buttons: [
      { label: yesLabel || 'SÌ', primary: !danger, danger: !!danger,
        onClick: () => onYes && onYes() },
      { label: noLabel  || 'NO', onClick: () => onNo && onNo() }
    ]
  })
}

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

  // Bottoni floating sopra la stage (alto-destra)
  const toolbar = el('div', 'top-toolbar')
  const timerEl = el('div', 'game-timer t-pixel', '00:00:00')
  toolbar.appendChild(timerEl)
  startTimerTick(timerEl)

  const pickBtn = el('button', 'top-btn', '🎲 ESTRAI')
  pickBtn.onclick = pickRandomWitcher
  toolbar.appendChild(pickBtn)

  const endBtn = el('button', 'top-btn', '🏁 FINE')
  endBtn.onclick = endGame
  toolbar.appendChild(endBtn)

  const ng = el('button', 'top-btn', '⟳ NUOVA')
  ng.onclick = newGame
  toolbar.appendChild(ng)

  t.appendChild(toolbar)

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

    // tracce — tap sul token-luogo toggla ✓ "raccolto" (come marker missioni)
    const tracks = el('div', 'tracks')
    slot.tracks.forEach((tr, idx) => {
      const row = el('div', 'track')
      const lt = tokenEl({ src: tr.loc.img, num: tr.loc.numero, sm: true, done: tr.raccolto })
      lt.style.cursor = 'pointer'
      lt.onclick = () => { tr.raccolto = !tr.raccolto; save(); render() }
      row.appendChild(lt)
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
    confirmDialog({
      title: 'ELIMINA MISSIONE',
      message: `Eliminare la missione #${m.numero}?`,
      yesLabel: 'ELIMINA', noLabel: 'ANNULLA', danger: true,
      onYes: () => {
        state.missions = state.missions.filter((x) => x.id !== m.id)
        save(); render()
      }
    })
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
        b.onclick = () => { closeDialog(); spawnFlow(terrain, lvl) }
        row.appendChild(b)
      })
      inner.appendChild(row)
    },
    buttons: [{ label: 'Annulla' }]
  })
}

/* Flusso accoppiato spawn mostro + luogo:
   - Reel mostro parte → si ferma
   - Reel luogo parte automaticamente → si ferma
   - Bottoni REROLL sotto ciascun reel + OK convalida + ANNULLA
   - OK assegna mostro con spawnLoc al terreno */
function spawnFlow(terrain, lvl) {
  let mResult = null, lResult = null

  function rollMonster(onDone) {
    if (mResult) {
      // restore corrente prima di rerollare
      const p = state.monsterPiles[lvl]
      p.used = p.used.filter((x) => x.nome !== mResult.nome)
      p.available.push(mResult)
    }
    const pile = state.monsterPiles[lvl]
    const pool = (pile.available.length ? pile.available : pile.used).map((m) => ({ ...m }))
    mResult = { ...drawFrom(pile) }
    save()
    return { pool: pool.map((m) => ({ label: m.nome, img: m.img })),
             result: { label: mResult.nome, img: mResult.img }, onDone }
  }
  function rollLocation(onDone) {
    if (lResult) restoreLocations(terrain, [lResult])
    const pile = state.terrainPiles[terrain]
    const pool = (pile.available.length ? pile.available : pile.used).map((l) => ({ ...l }))
    lResult = drawLocation(terrain)
    save()
    return { pool: pool.map((l) => ({ label: `#${l.numero} ${l.nome}`, img: l.img })),
             result: { label: `#${lResult.numero} ${lResult.nome}`, img: lResult.img }, onDone }
  }

  closeDialog()
  const ov = el('div', 'modal')
  const dlg = el('div', 'dialog')
  dlg.innerHTML = `
    <div class="panel-header"><span>SPAWN MOSTRO — LIV ${'I'.repeat(lvl)}</span></div>
    <div class="panel-body spawn-body">
      <div class="spawn-flow">
        <div class="spawn-col">
          <div class="spawn-label">MOSTRO</div>
          <div class="spawn-box" data-reel="monster">
            <button class="reroll-btn reroll-m" disabled title="Reroll">↩</button>
            <div class="reel">
              <div class="reel-frame blur"><img alt=""></div>
              <div class="reel-label"></div>
            </div>
          </div>
        </div>
        <div class="spawn-col">
          <div class="spawn-label">LUOGO</div>
          <div class="spawn-box" data-reel="location">
            <button class="reroll-btn reroll-l" disabled title="Reroll">↩</button>
            <div class="reel">
              <div class="reel-frame blur"><img alt=""></div>
              <div class="reel-label"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="dialog-actions">
      <button class="btn ann">ANNULLA</button>
      <button class="btn btn-primary ok" disabled>OK</button>
    </div>`
  ov.appendChild(dlg)
  document.body.appendChild(ov)
  openModal = ov

  const reelM = dlg.querySelector('[data-reel="monster"] .reel')
  const reelL = dlg.querySelector('[data-reel="location"] .reel')
  const rerollM = dlg.querySelector('.reroll-m')
  const rerollL = dlg.querySelector('.reroll-l')
  const okBtn = dlg.querySelector('.ok')
  const annBtn = dlg.querySelector('.ann')

  function spinReel(reelEl, items, result, onDone) {
    const frame = reelEl.querySelector('.reel-frame')
    const img   = reelEl.querySelector('img')
    const label = reelEl.querySelector('.reel-label')
    frame.classList.add('blur')
    reelEl.classList.remove('landed')
    img.onerror = () => { img.style.visibility = 'hidden' }
    const seq = items.length ? items : [result]
    let i = 0
    const start = performance.now(), duration = 1500
    const set = (it) => { applyPixelate(img, it.img, PIXEL_BLOCK.reel); label.textContent = it.label }
    set(seq[0])
    function tick() {
      const elapsed = performance.now() - start
      if (elapsed >= duration) {
        frame.classList.remove('blur')
        reelEl.classList.add('landed')
        set(result)
        if (onDone) onDone()
        return
      }
      i = (i + 1) % seq.length
      set(seq[i])
      setTimeout(tick, 50 + Math.pow(elapsed / duration, 3) * 240)
    }
    setTimeout(tick, 50)
  }

  function startMonsterSpin() {
    okBtn.disabled = true
    rerollM.disabled = true
    rerollL.disabled = true
    const r = rollMonster()
    spinReel(reelM, r.pool, r.result, startLocationSpin)
  }
  function startLocationSpin() {
    const r = rollLocation()
    spinReel(reelL, r.pool, r.result, () => {
      rerollM.disabled = false
      rerollL.disabled = false
      okBtn.disabled = false
    })
  }

  rerollM.onclick = () => { okBtn.disabled = true; rerollM.disabled = true
    const r = rollMonster()
    spinReel(reelM, r.pool, r.result, () => { rerollM.disabled = false; okBtn.disabled = false })
  }
  rerollL.onclick = () => { okBtn.disabled = true; rerollL.disabled = true
    const r = rollLocation()
    spinReel(reelL, r.pool, r.result, () => { rerollL.disabled = false; okBtn.disabled = false })
  }
  okBtn.onclick = () => {
    if (!mResult || !lResult) return
    state.slots[terrain].monster = { ...mResult, spawnLoc: { ...lResult } }
    save(); render()
    closeDialog()
  }
  annBtn.onclick = () => {
    // restore tutto se annullato
    if (mResult) {
      const p = state.monsterPiles[lvl]
      p.used = p.used.filter((x) => x.nome !== mResult.nome)
      p.available.push(mResult)
    }
    if (lResult) restoreLocations(terrain, [lResult])
    save(); closeDialog()
  }

  startMonsterSpin()
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
  const result = drawLocation(terrain)
  save()
  slotMachine('TRACCIA — ' + TERRAIN_LABELS[terrain].toUpperCase(),
    pool.map((l) => ({ label: `#${l.numero} ${l.nome}`, img: l.img })),
    { label: `#${result.numero} ${result.nome}`, img: result.img },
    () => {
      state.slots[terrain].tracks.push({ witcherId, loc: { ...result }, raccolto: false })
      save(); render()
    })
}

/* Estrae un singolo luogo dal mazzo del terreno (consuma la pila) e lo
   mostra all'utente con randomizer. NON aggiunge tracce, niente effetti:
   serve quando una missione/evento chiede un luogo specifico. */
function peekRandomLocation(terrain) {
  const pile = state.terrainPiles[terrain]
  const pool = (pile.available.length ? pile.available : pile.used).map((l) => ({ ...l }))
  const result = drawLocation(terrain)
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
    // Stats: salva mostro nella history + conta trofei per witcher
    state.history.defeatedMonsters.push({
      nome: monster.nome, livello: monster.livello, terrain, at: Date.now()
    })
    slot.tracks.forEach((tr) => {
      if (tr.raccolto && tr.witcherId != null) {
        state.history.tracksTakenByWitcher[tr.witcherId] =
          (state.history.tracksTakenByWitcher[tr.witcherId] || 0) + 1
      }
    })
    // Rimetti tutti i luoghi nelle pile (tracce + spawnLoc del mostro)
    const freed = slot.tracks.map((t) => t.loc)
    if (monster.spawnLoc) freed.push(monster.spawnLoc)
    if (freed.length) restoreLocations(terrain, freed)
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

/* ============================================================
 *  Timer durata partita (tick a 1s)
 * ============================================================ */
let _timerHandle = null
function startTimerTick(node) {
  if (_timerHandle) clearInterval(_timerHandle)
  const update = () => { node.textContent = fmtDuration(elapsedMs()) }
  update()
  _timerHandle = setInterval(() => {
    if (!node.isConnected) { clearInterval(_timerHandle); _timerHandle = null; return }
    update()
  }, 1000)
}

/* ============================================================
 *  Estrai giocatore random (dialog dedicato)
 * ============================================================ */
/* Avatar "?" per l'opzione "a scelta" — SVG inline così è una vera immagine */
const FREE_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
  '<rect width="96" height="96" fill="#2a1810"/>' +
  '<text x="48" y="72" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="78" fill="#d4a042">?</text>' +
  '</svg>'
)

function pickRandomWitcher() {
  const FREE = '__free__'
  let selected = activeWitchers().map((w) => w.id)
  selected.push(FREE)

  const candidates = () => {
    const arr = activeWitchers().map((w) => ({ id: w.id, label: w.nome, img: w.avatar }))
    arr.push({ id: FREE, label: '?', img: FREE_AVATAR })
    return arr
  }

  makeDialog({
    title: 'ESTRAI GIOCATORE',
    body: (inner) => {
      const opts = el('div', 'opts')
      const refresh = (btn, on) => btn.classList.toggle('sel', on)
      candidates().forEach((c) => {
        const o = el('button', 'opt sel')
        o.appendChild(tokenEl({ src: c.img }))
        o.appendChild(el('span', 'opt-label', c.label))
        o.onclick = () => {
          const i = selected.indexOf(c.id)
          if (i >= 0) { selected.splice(i, 1); refresh(o, false) }
          else        { selected.push(c.id); refresh(o, true) }
        }
        opts.appendChild(o)
      })
      inner.appendChild(opts)
    },
    buttons: [
      { label: 'ESTRAI', primary: true, onClick: () => {
        if (!selected.length) return
        const all = candidates()
        const pickedId = selected[Math.floor(Math.random() * selected.length)]
        const result = all.find((c) => c.id === pickedId)
        const pool = selected.map((id) => all.find((c) => c.id === id))
        slotMachineLook('GIOCATORE ESTRATTO', pool, result)
      }},
      { label: 'CHIUDI' }
    ]
  })
}

/* ============================================================
 *  Fine partita + schermata stats
 * ============================================================ */
function endGame() {
  makeDialog({
    title: 'FINE PARTITA',
    body: (inner) => {
      inner.appendChild(el('div', 'confirm-msg', 'Esito della partita?'))
    },
    buttons: [
      { label: '🏆 VITTORIA', primary: true,
        onClick: () => showStats(collectStats(elapsedMs(), 'win')) },
      { label: '🏳 RITIRATA',
        onClick: () => showStats(collectStats(elapsedMs(), 'lose')) },
      { label: 'ANNULLA',
        onClick: () => {} }
    ]
  })
}

function collectStats(durationMs, outcome) {
  const byLvl = { 1: 0, 2: 0, 3: 0 }
  state.history.defeatedMonsters.forEach((m) => { byLvl[m.livello] = (byLvl[m.livello] || 0) + 1 })
  const missionsDone = state.missions.filter(isComplete).length
  const missionsTot  = state.missions.length
  const tracks = {}
  state.witcherIds.forEach((id) => { tracks[id] = state.history.tracksTakenByWitcher[id] || 0 })
  // Conta anche le tracce raccolte attualmente (mostri non ancora sconfitti)
  TERRAINS.forEach((t) => {
    state.slots[t].tracks.forEach((tr) => {
      if (tr.raccolto && tr.witcherId != null) {
        tracks[tr.witcherId] = (tracks[tr.witcherId] || 0) + 1
      }
    })
  })
  return { outcome, durationMs, byLvl, missionsDone, missionsTot, tracks }
}

function showStats(s) {
  closeDialog()
  const ov = el('div', 'modal')
  const dlg = el('div', 'dialog')
  const title = s.outcome === 'win' ? '🏆 VITTORIA' : '🏳 RITIRATA'
  dlg.innerHTML = `
    <div class="panel-header"><span>${title}</span></div>
    <div class="panel-body">
      <div class="stats-grid">
        <div class="stat-row"><span class="stat-k">DURATA</span><span class="stat-v">${fmtDuration(s.durationMs)}</span></div>
        <div class="stat-row"><span class="stat-k">MOSTRI LIV I</span><span class="stat-v">${s.byLvl[1]}</span></div>
        <div class="stat-row"><span class="stat-k">MOSTRI LIV II</span><span class="stat-v">${s.byLvl[2]}</span></div>
        <div class="stat-row"><span class="stat-k">MOSTRI LIV III</span><span class="stat-v">${s.byLvl[3]}</span></div>
        <div class="stat-row"><span class="stat-k">MISSIONI</span><span class="stat-v">${s.missionsDone}/${s.missionsTot}</span></div>
      </div>
      <div class="stats-trophies"></div>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-primary new-after">NUOVA PARTITA</button>
      <button class="btn close-stats">CHIUDI</button>
    </div>`
  const trophyBox = dlg.querySelector('.stats-trophies')
  trophyBox.appendChild(el('div', 'trophy-title t-pixel', 'TRACCE RACCOLTE'))
  const row = el('div', 'trophy-row')
  state.witcherIds.forEach((id) => {
    const w = witcherById(id)
    if (!w) return
    const item = el('div', 'trophy-item')
    item.appendChild(tokenEl({ src: w.avatar, sm: true }))
    item.appendChild(el('span', 't-pixel', `×${s.tracks[id]}`))
    row.appendChild(item)
  })
  trophyBox.appendChild(row)

  ov.appendChild(dlg)
  document.body.appendChild(ov)
  openModal = ov
  dlg.querySelector('.new-after').onclick = () => { state = freshState(); save(); closeDialog(); render() }
  dlg.querySelector('.close-stats').onclick = closeDialog
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

/* Blocca menu contestuale e drag su immagini (tablet long-press apre callout
   sui mostri, interferendo con il long-press per "sconfitto"). */
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG' || e.target.closest('.hex, .token, .table')) e.preventDefault()
})
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault()
})

render()
