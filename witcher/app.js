'use strict'
/* The Witcher tracker — vanilla JS. Stato in localStorage, overlay sul bg. */

const STORAGE_KEY = 'twow-tracker-v2'
const $ = (sel, root = document) => root.querySelector(sel)
const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

/* ---------- Mazzi senza reinserimento ---------- */
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
  if (pile.available.length === 0) { pile.available = shuffle(pile.used); pile.used = [] }
  const it = pile.available.shift()
  pile.used.push(it)
  return it
}
function restoreTo(pile, items, keyFn) {
  const keys = new Set(items.map(keyFn))
  pile.used = pile.used.filter((it) => !keys.has(keyFn(it)))
  pile.available = shuffle(pile.available.concat(items))
}

/* ---------- Stato ---------- */
function freshState() {
  return {
    phase: 'setup',
    players: [],
    terrainPiles: {
      forest: pileFrom(LOCATIONS.forest.map((l) => ({ ...l }))),
      water: pileFrom(LOCATIONS.water.map((l) => ({ ...l }))),
      mountain: pileFrom(LOCATIONS.mountain.map((l) => ({ ...l })))
    },
    monsterPiles: {
      1: pileFrom(MONSTERS[1].map((n) => ({ nome: n, livello: 1, img: monsterImg(n) }))),
      2: pileFrom(MONSTERS[2].map((n) => ({ nome: n, livello: 2, img: monsterImg(n) }))),
      3: pileFrom(MONSTERS[3].map((n) => ({ nome: n, livello: 3, img: monsterImg(n) })))
    },
    slots: {
      forest: { monster: null, tracks: [] },
      water: { monster: null, tracks: [] },
      mountain: { monster: null, tracks: [] }
    },
    missions: [],
    nextMissionNumber: 1,
    nextId: 1
  }
}
let state = load()
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { console.warn(e) }
  return freshState()
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { console.warn(e) }
}
const newId = () => state.nextId++

/* ---------- Azioni ---------- */
function startGame(names) {
  state.players = names.map((nome, i) => ({
    id: newId(), slot: i + 1, nome: (nome || '').trim() || `Cacciatore ${i + 1}`, avatar: `public/img/g${i + 1}.png`
  }))
  state.phase = 'table'
  save(); render()
}
function newGame() {
  if (!confirm('Nuova partita? Tutto lo stato attuale verrà azzerato.')) return
  state = freshState(); save(); render()
}
function playerById(id) { return state.players.find((p) => p.id === id) || null }

/* ---------- UI: stage ---------- */
const app = $('#app')

function render() {
  app.innerHTML = ''
  if (state.phase === 'setup') renderSetup()
  else renderTable()
}

/* ---------- Setup ---------- */
function renderSetup() {
  let count = 2
  const names = ['', '', '', '', '']
  const wrap = el('div', 'setup-stage')
  const dlg = el('div', 'dialog setup-dialog')
  dlg.innerHTML = `<img src="public/ui/finestra_di_dialogo.png" class="dialog-bg" alt="">`
  const inner = el('div', 'dialog-inner setup-inner')
  inner.innerHTML = `
    <h1>The Witcher: Old World</h1>
    <p class="subtitle">Wild Hunt — Tracker</p>
    <label>Quanti cacciatori?</label>`
  const countRow = el('div', 'count-row')
  ;[2, 3, 4, 5].forEach((n) => {
    const b = el('button', 'count-btn' + (n === count ? ' active' : ''), n)
    b.onclick = () => { count = n; redraw() }
    countRow.appendChild(b)
  })
  inner.appendChild(countRow)
  const namesBox = el('div', 'names')
  inner.appendChild(namesBox)
  dlg.appendChild(inner)
  const start = el('button', 'dialog-close start', 'Inizia partita')
  start.onclick = () => startGame(names.slice(0, count))
  dlg.appendChild(start)
  wrap.appendChild(dlg)
  app.appendChild(wrap)

  function redraw() {
    countRow.querySelectorAll('.count-btn').forEach((b, i) =>
      b.classList.toggle('active', [2, 3, 4, 5][i] === count))
    namesBox.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const row = el('div', 'name-row')
      row.innerHTML = `<img class="name-avatar" src="public/img/g${i + 1}.png" alt="">`
      const inp = el('input')
      inp.type = 'text'; inp.maxLength = 14; inp.placeholder = `Cacciatore ${i + 1}`
      inp.value = names[i]
      inp.oninput = () => { names[i] = inp.value }
      row.appendChild(inp)
      namesBox.appendChild(row)
    }
  }
  redraw()
}

/* ---------- Tavolo ---------- */
const COL_X = { forest: 14.0, water: 25.9, mountain: 37.8 }
const HEX_Y = 33.4, HEX_W = 8.5, NAME_Y = 46, SEGUI_Y = 50.2, TRACKS_Y = 60
const TRACK_SIZE = 46

function renderTable() {
  const stage = el('div', 'stage')
  stage.innerHTML = `<img src="public/ui/bg.png" class="stage-bg" alt="">`
  const layer = el('div', 'layer')

  const newBtn = el('button', 'new-game', '⟳')
  newBtn.title = 'Nuova partita'; newBtn.onclick = newGame
  layer.appendChild(newBtn)

  TERRAINS.forEach((terrain) => renderColumn(layer, terrain))
  renderMissions(layer)

  stage.appendChild(layer)
  app.appendChild(stage)
}

function pct(v) { return v + '%' }

function renderColumn(layer, terrain) {
  const slot = state.slots[terrain]

  // Slot mostro
  const slotPos = el('div', 'slot-pos')
  slotPos.style.left = pct(COL_X[terrain])
  slotPos.style.top = pct(HEX_Y)
  slotPos.style.width = pct(HEX_W)
  if (!slot.monster) {
    const hot = el('button', 'slot-hotspot')
    hot.onclick = () => chooseLevel(terrain)
    slotPos.appendChild(hot)
  } else {
    const filled = el('div', 'slot-filled')
    filled.innerHTML = `
      <span class="hextoken">
        <img src="public/ui/esagono_base.png" class="hex-frame" alt="">
        <img src="${slot.monster.img}" class="hex-photo" alt="" onerror="this.style.visibility='hidden'">
      </span>`
    bindLongPress(filled, () => defeatMonster(terrain))
    slotPos.appendChild(filled)
  }
  layer.appendChild(slotPos)

  // Nome mostro
  if (slot.monster) {
    const nm = el('div', 'mname', `<span class="mname-txt">${slot.monster.nome}</span>`)
    nm.style.left = pct(COL_X[terrain]); nm.style.top = pct(NAME_Y)
    layer.appendChild(nm)

    // SEGUI hotspot
    const segui = el('button', 'segui-hotspot')
    segui.style.left = pct(COL_X[terrain]); segui.style.top = pct(SEGUI_Y)
    segui.onclick = () => chooseFollower(terrain)
    layer.appendChild(segui)
  }

  // Tracce
  const tracks = el('div', 'tracks')
  tracks.style.left = pct(COL_X[terrain]); tracks.style.top = pct(TRACKS_Y)
  slot.tracks.forEach((t) => {
    const tr = el('div', 'track')
    tr.appendChild(tokenEl(t.loc.img, TRACK_SIZE, false))
    const p = playerById(t.playerId)
    if (p) tr.appendChild(tokenEl(p.avatar, TRACK_SIZE, true))
    tracks.appendChild(tr)
  })
  layer.appendChild(tracks)
}

// Token: frame=true -> avatar quadrato + bordo cerchio; frame=false -> immagine gia' tonda
function tokenEl(img, size, frame) {
  const t = el('span', 'token')
  t.style.width = t.style.height = size + 'px'
  if (frame) {
    t.innerHTML = `
      <span class="token-inner"><img src="${img}" class="token-photo" alt="" onerror="this.style.visibility='hidden'"></span>
      <img src="public/ui/cerchio_base.png" class="token-frame" alt="">`
  } else {
    t.innerHTML = `<img src="${img}" class="token-bare" alt="" onerror="this.style.visibility='hidden'">`
  }
  return t
}

/* ---------- Long-press ---------- */
function bindLongPress(node, fn, ms = 650) {
  let timer = null
  const start = () => { timer = setTimeout(fn, ms) }
  const cancel = () => clearTimeout(timer)
  node.addEventListener('pointerdown', start)
  node.addEventListener('pointerup', cancel)
  node.addEventListener('pointerleave', cancel)
}

/* ---------- Mostri ---------- */
function chooseLevel(terrain) {
  openDialog('Quale livello?', (inner) => {
    const row = el('div', 'levels')
    MONSTER_LEVELS.forEach((lvl) => {
      const b = el('button', 'level-btn', `<img src="public/img/mostri_level_${lvl}.png" alt="Livello ${lvl}">`)
      b.onclick = () => { closeDialog(); drawMonster(terrain, lvl) }
      row.appendChild(b)
    })
    inner.appendChild(row)
  })
}
function drawMonster(terrain, lvl) {
  const pile = state.monsterPiles[lvl]
  const pool = (pile.available.length ? pile.available : pile.used).map((m) => ({ ...m }))
  const result = { ...drawFrom(pile) }
  save()
  slotMachine('Livello ' + 'I'.repeat(lvl),
    pool.map((m) => ({ label: m.nome, img: m.img })),
    { label: result.nome, img: result.img },
    () => { state.slots[terrain].monster = result; save(); render() })
}
function chooseFollower(terrain) {
  openDialog('Chi segue la traccia?', (inner) => {
    const row = el('div', 'opts')
    state.players.forEach((p) => {
      const b = el('button', 'opt')
      b.appendChild(tokenEl(p.avatar, 64, true))
      b.appendChild(el('span', 'opt-label', p.nome))
      b.onclick = () => { closeDialog(); followMonster(terrain, p.id) }
      row.appendChild(b)
    })
    inner.appendChild(row)
  })
}
function followMonster(terrain, playerId) {
  const pile = state.terrainPiles[terrain]
  const pool = (pile.available.length ? pile.available : pile.used).map((l) => ({ ...l }))
  const result = { ...drawFrom(pile) }
  save()
  slotMachine('Traccia — ' + TERRAIN_LABELS[terrain],
    pool.map((l) => ({ label: `${l.numero} ${l.nome}`, img: l.img })),
    { label: `${result.numero} ${result.nome}`, img: result.img },
    () => { state.slots[terrain].tracks.push({ playerId, loc: result }); save(); render() })
}
function defeatMonster(terrain) {
  const slot = state.slots[terrain]
  if (!slot.monster) return
  if (!confirm(`Sconfiggere ${slot.monster.nome}?`)) return
  const freed = slot.tracks.map((t) => t.loc)
  if (freed.length) restoreTo(state.terrainPiles[terrain], freed, (l) => l.numero)
  slot.monster = null; slot.tracks = []
  save(); render()
}

/* ---------- Missioni ---------- */
function isComplete(m) { return m.markers.length > 0 && m.markers.every((mk) => mk.raccolto) }
function orderedMissions() {
  return state.missions.slice().sort((a, b) => {
    const c = (isComplete(a) ? 1 : 0) - (isComplete(b) ? 1 : 0)
    return c !== 0 ? c : a.numero - b.numero
  })
}
function renderMissions(layer) {
  const wrap = el('div', 'mission-layer')
  const scroll = el('div', 'mission-scroll')

  orderedMissions().forEach((m) => {
    const row = el('div', 'mission-row' + (isComplete(m) ? ' done' : ''))
    row.innerHTML = `<img src="public/ui/box-missione.png" class="row-frame" alt="">`
    const content = el('div', 'row-content')

    const head = el('div', 'row-head')
    head.appendChild(el('span', 'mnum', m.numero))
    const mp = el('button', 'mplayer')
    const players = m.playerIds.map(playerById).filter(Boolean)
    if (players.length) players.forEach((p) => mp.appendChild(tokenEl(p.avatar, 36, true)))
    else mp.appendChild(el('span', 'mplayer-empty', '+'))
    mp.onclick = (e) => { e.stopPropagation(); chooseMissionPlayers(m.id) }
    head.appendChild(mp)
    bindLongPress(head, () => { if (confirm('Eliminare questa missione?')) { state.missions = state.missions.filter((x) => x.id !== m.id); save(); render() } })
    content.appendChild(head)

    const markers = el('div', 'markers')
    m.markers.forEach((mk, idx) => {
      const b = el('button', 'marker-btn')
      b.appendChild(tokenEl(mk.loc.img, 48, false))
      if (mk.raccolto) b.appendChild(el('span', 'marker-check', '✓'))
      // tap = toggle, long-press = rimuovi
      let lp = false, timer = null
      b.addEventListener('pointerdown', () => { lp = false; timer = setTimeout(() => { lp = true; mk2remove(m.id, idx) }, 600) })
      b.addEventListener('pointerup', () => { clearTimeout(timer); if (!lp) { mk.raccolto = !mk.raccolto; save(); render() } })
      b.addEventListener('pointerleave', () => clearTimeout(timer))
      markers.appendChild(b)
    })
    const add = el('button', 'add-marker', '+')
    add.onclick = () => chooseLocs(m.id)
    markers.appendChild(add)
    content.appendChild(markers)

    row.appendChild(content)
    scroll.appendChild(row)
  })

  const addM = el('button', 'add-mission', '+ Missione')
  addM.onclick = () => {
    state.missions.push({ id: newId(), numero: state.nextMissionNumber++, playerIds: [], markers: [] })
    save(); render()
  }
  scroll.appendChild(addM)
  wrap.appendChild(scroll)
  layer.appendChild(wrap)
}
function mk2remove(missionId, idx) {
  const m = state.missions.find((x) => x.id === missionId)
  if (m) { m.markers.splice(idx, 1); save(); render() }
}
function chooseLocs(missionId) {
  const selected = []
  openDialog('Quali luoghi? (selezione multipla)', (inner) => {
    const grid = el('div', 'loc-grid')
    ALL_LOCATIONS.forEach((l) => {
      const b = el('button', 'loc-opt')
      b.appendChild(tokenEl(l.img, 64, false))
      const chk = el('span', 'loc-check', '✓'); chk.style.display = 'none'
      b.appendChild(chk)
      b.onclick = () => {
        const i = selected.indexOf(l.numero)
        if (i >= 0) { selected.splice(i, 1); b.classList.remove('sel'); chk.style.display = 'none' }
        else { selected.push(l.numero); b.classList.add('sel'); chk.style.display = '' }
      }
      grid.appendChild(b)
    })
    inner.appendChild(grid)
  }, () => {
    if (!selected.length) return
    const m = state.missions.find((x) => x.id === missionId)
    selected.forEach((n) => {
      const loc = ALL_LOCATIONS.find((l) => l.numero === n)
      m.markers.push({ loc: { ...loc }, raccolto: false })
    })
    save(); render()
  }, 'OK')
}
function chooseMissionPlayers(missionId) {
  const m = state.missions.find((x) => x.id === missionId)
  openDialog('Associa giocatori (uno o più)', (inner) => {
    const row = el('div', 'opts')
    state.players.forEach((p) => {
      const b = el('button', 'opt' + (m.playerIds.includes(p.id) ? ' sel' : ''))
      b.appendChild(tokenEl(p.avatar, 64, true))
      b.appendChild(el('span', 'opt-label', p.nome))
      b.onclick = () => {
        const i = m.playerIds.indexOf(p.id)
        if (i >= 0) { m.playerIds.splice(i, 1); b.classList.remove('sel') }
        else { m.playerIds.push(p.id); b.classList.add('sel') }
        save()
      }
      row.appendChild(b)
    })
    inner.appendChild(row)
  }, () => render(), 'Fatto')
}

/* ---------- Dialog generico ---------- */
let dialogNode = null
function openDialog(title, fill, onConfirm, confirmLabel) {
  closeDialog()
  const overlay = el('div', 'modal-overlay')
  overlay.onclick = (e) => { if (e.target === overlay) closeDialog() }
  const dlg = el('div', 'dialog')
  dlg.innerHTML = `<img src="public/ui/finestra_di_dialogo.png" class="dialog-bg" alt="">`
  const inner = el('div', 'dialog-inner')
  inner.appendChild(el('div', 'dialog-title', title))
  fill(inner)
  dlg.appendChild(inner)
  if (onConfirm) {
    const ok = el('button', 'dialog-confirm', confirmLabel || 'OK')
    ok.onclick = () => { onConfirm(); closeDialog() }
    dlg.appendChild(ok)
  }
  const close = el('button', 'dialog-close', onConfirm ? 'Annulla' : 'Chiudi')
  close.onclick = closeDialog
  dlg.appendChild(close)
  overlay.appendChild(dlg)
  document.body.appendChild(overlay)
  dialogNode = overlay
}
function closeDialog() { if (dialogNode) { dialogNode.remove(); dialogNode = null } }

/* ---------- Slot machine ---------- */
function slotMachine(title, pool, result, done) {
  const overlay = el('div', 'modal-overlay')
  const dlg = el('div', 'dialog')
  dlg.innerHTML = `<img src="public/ui/finestra_di_dialogo.png" class="dialog-bg" alt="">`
  const inner = el('div', 'dialog-inner')
  inner.appendChild(el('div', 'dialog-title', title))
  const reel = el('div', 'reel')
  const img = el('img', 'reel-img'); img.onerror = () => (img.style.visibility = 'hidden')
  const label = el('div', 'reel-label')
  reel.appendChild(img); reel.appendChild(label)
  inner.appendChild(reel)
  dlg.appendChild(inner)
  overlay.appendChild(dlg)
  document.body.appendChild(overlay)

  const items = pool.length ? pool : [result]
  let i = 0
  const startT = performance.now(), duration = 1500
  function set(it) { img.src = it.img || ''; label.textContent = it.label }
  set(items[0])
  img.classList.add('blur')
  function tick() {
    const elapsed = performance.now() - startT
    if (elapsed >= duration) {
      set(result); img.classList.remove('blur'); reel.classList.add('landed')
      setTimeout(() => { overlay.remove(); done() }, 700)
      return
    }
    i = (i + 1) % items.length; set(items[i])
    setTimeout(tick, 50 + Math.pow(elapsed / duration, 3) * 240)
  }
  setTimeout(tick, 50)
}

/* ---------- Avvio ---------- */
window.addEventListener('error', (e) => {
  app.innerHTML = '<pre style="color:#e8d4a8;padding:20px;white-space:pre-wrap;font-family:monospace">Errore: ' + e.message + '</pre>'
})
render()
