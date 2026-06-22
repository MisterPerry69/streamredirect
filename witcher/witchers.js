'use strict'
// I 4 Witcher disponibili. Avatar in public/img/g{1..4}.png

const WITCHERS = [
  { id: 1, nome: 'Rivarolo', avatar: 'public/img/g1.png' },
  { id: 2, nome: 'Perry',    avatar: 'public/img/g2.png' },
  { id: 3, nome: 'Giodm',    avatar: 'public/img/g3.png' },
  { id: 4, nome: 'Rava',     avatar: 'public/img/g4.png' }
]

const witcherById = (id) => WITCHERS.find((w) => w.id === id) || null
