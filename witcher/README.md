# The Witcher: Old World — Wild Hunt — Tracker

PWA companion (HTML/CSS/JS puro, niente build) per tracciare **tracce mostro** e
**segnalini missione** durante una partita fisica. Pensata per un tablet in landscape.

## File

- `index.html` — pagina unica
- `app.js` — logica e UI
- `data.js` — dati di gioco (luoghi 1–18, mostri per livello)
- `style.css` — stile
- `manifest.json` + `sw.js` — installabilità PWA e offline
- `public/` — grafica (sfondo, cornici, token, avatar, immagini mostri/luoghi)

Nessuna build, nessun npm. Si apre direttamente.

## Provarla in locale

Apri `index.html` con un piccolo server statico (il service worker non funziona col
doppio click `file://`). Es. con Python:

```bash
python -m http.server 8088
# poi apri http://localhost:8088/
```

## Caricarla su GitHub Pages (apribile dal tablet)

1. Crea un repository su GitHub e carica **tutti questi file** (mantenendo la cartella `public/`).
2. Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, cartella `/ (root)` → Save.
3. Dopo ~1 minuto avrai un link tipo `https://TUO-UTENTE.github.io/NOME-REPO/`.
4. Apri quel link dal tablet in Chrome → menu **⋮** → **Aggiungi a schermata Home**.
   Diventa un'app a tutto schermo, funziona anche offline.

> I percorsi sono relativi, quindi funziona in qualsiasi sottocartella senza configurare nulla.
> Se cambi i file e vuoi forzare l'aggiornamento sul tablet, alza il numero `CACHE` in `sw.js`.

## Come si usa

- **Setup**: scegli 2–5 giocatori. L'avatar è `public/img/gN.png` (sovrascrivibile).
- **Sinistra (mostri)**: tocca l'esagono **+** → scegli livello → estrazione (slot-machine).
  **SEGUI** → scegli giocatore → pesca un luogo casuale del terreno.
  **Long-press** sul mostro → sconfitta (i luoghi tornano nella pila).
- **Destra (missioni)**: **+ Missione** crea una riga. **+** nella riga → scegli più luoghi.
  **Tap** sul gettone = raccolto (✓). **Long-press** = rimuovi. Missione completa → in fondo sbiadita.
  Tocca l'area giocatore per associare **uno o più** giocatori.
- **⟳** in alto: nuova partita. Lo stato è salvato in `localStorage`.

## Modificare la grafica

Sostituisci i file in `public/ui/` (sfondo e cornici) e `public/img/` (avatar `gN.png`,
mostri `monsters/<slug>.png`, luoghi `terrein/TerrenoNumeroNome.png`). Le coordinate degli
overlay sono in cima a `app.js` (`COL_X`, `HEX_Y`, `SEGUI_Y`, ecc.) — modifica quelle
percentuali per riallineare se cambi lo sfondo.
