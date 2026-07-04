# KRONOS Global Terminal — Documentation complète du projet

> Terminal de trading / simulateur d'investissement haute densité, style *prop firm*.
> Données de marché **réelles** (Yahoo Finance, sans clé), flux temps réel optionnel (Finnhub),
> graphiques TradingView, et un moteur de simulation d'ordres complet — le tout côté client.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique & outils](#2-stack-technique--outils)
3. [Sources de données](#3-sources-de-données)
4. [Architecture](#4-architecture)
5. [Backend — modules, boucles, API](#5-backend--modules-boucles-api)
6. [Frontend — structure & état](#6-frontend--structure--état)
7. [Les trois vues du terminal](#7-les-trois-vues-du-terminal)
8. [Le moteur de simulation](#8-le-moteur-de-simulation)
9. [Modèle de compte, marge & capital](#9-modèle-de-compte-marge--capital)
10. [Conversion de change (actions étrangères)](#10-conversion-de-change-actions-étrangères)
11. [Exposition du portefeuille sur la carte](#11-exposition-du-portefeuille-sur-la-carte)
12. [Transparence des données (réel vs simulé)](#12-transparence-des-données-réel-vs-simulé)
13. [Installation & démarrage](#13-installation--démarrage)
14. [Tests, build & vérification](#14-tests-build--vérification)
15. [Conventions & workflow de développement](#15-conventions--workflow-de-développement)
16. [Arborescence du projet](#16-arborescence-du-projet)
17. [Limitations & idées futures](#17-limitations--idées-futures)

---

## 1. Vue d'ensemble

KRONOS Global Terminal est un **terminal financier temps réel** doublé d'un **simulateur d'investissement**. Il vise
la densité et l'esthétique d'un poste de trading professionnel, avec trois grandes vues bascule­ables
depuis le header :

- **Terminal** — watchlist, graphique, carnet d'ordres, ticket d'ordre, positions & compte.
- **Macro Dashboard** — vision institutionnelle du marché (risque, taux, volatilité, corrélations, RRG, news, éco).
- **Global Macro Map** — carte du monde interactive (indices, macro World Bank, géopolitique, **exposition du portefeuille**).

Le projet est **keyless-first** : tout fonctionne avec des données de marché réelles sans aucune clé
d'API ; deux clés gratuites optionnelles (Finnhub, FRED) débloquent des flux plus rapides et les données
économiques. Rien n'est jamais « inventé » silencieusement — voir §12.

**Nature** : c'est un **démo / paper-trading**. Aucun ordre n'est envoyé à un vrai courtier ; le compte,
les positions et l'historique vivent dans le navigateur (localStorage).

---

## 2. Stack technique & outils

### Frontend

| Outil | Version | Rôle |
|---|---|---|
| **React** | 18.3 | UI par composants |
| **TypeScript** | 5.6 | typage strict |
| **Vite** | 5.4 | dev server (HMR) + build ; proxy `/api` et `/ws` → `:8000` |
| **Zustand** | 4.5 | store global (état + persistance + moteur de trading) |
| **lightweight-charts** (TradingView) | 4.2 | graphiques prix (area/line), crosshair |
| **react-simple-maps** | 3.0 | carte du monde (SVG, projection Equal Earth, zoom/pan) |
| **world-atlas** | 2.0 | topojson des frontières (jointure par ISO numérique) |
| **CSS Modules** | — | styles scoping par composant, thème *cyber-trading* sombre |

Runtime : **Node 24**. Build de production : `tsc --noEmit && vite build`.

### Backend

| Outil | Version | Rôle |
|---|---|---|
| **FastAPI** | ≥ 0.115 | API REST + WebSocket |
| **Uvicorn** | ≥ 0.30 | serveur ASGI |
| **websockets** | ≥ 12 | client WS vers Finnhub |
| **NumPy** | ≥ 1.26 | corrélations, RRG, séries synthétiques de repli |
| **python-dotenv** | ≥ 1.0 | chargement de `backend/.env` |
| **pytest** | ≥ 8.0 | tests unitaires (35 tests) |

Runtime : **Python 3.14**. HTTP sortant via `urllib` de la stdlib (aucune dépendance `requests`).

### Outils de développement / méthodologie

- **Git** — une branche de fonctionnalité par feature, merge sur `main`.
- **Superpowers** (plugin d'agent) — cycle *brainstorming → spec → plan → exécution* ; les specs et
  plans sont archivés sous `docs/superpowers/{specs,plans}/`.
- **dev.ps1** — lance backend + frontend ensemble sous Windows.

---

## 3. Sources de données

Les données sont **superposées en couches**, du keyless au premium optionnel :

| Source | Clé ? | Ce qu'elle fournit |
|---|---|---|
| **Yahoo Finance** (`providers.py`) | non | épine dorsale : historique de bougies (tous timeframes), cotations (prix + clôture précédente), source live des **indices & matières** (via `poll_loop`), taux de change, indices mondiaux, market cap indirecte |
| **Finnhub WebSocket** (`feeds.py`) | optionnelle (`FINNHUB_API_KEY`) | ticks temps réel rapides pour crypto / forex / actions US ; **news** générales ; **market cap** (`stock/profile2`) |
| **FRED** (`macro.py`) | optionnelle (`FRED_API_KEY`) | indicateurs économiques, courbe des taux, publications, calendrier |
| **World Bank** (`globe.py`) | non | macro annuelle par pays (PIB, inflation, chômage, population, PIB nominal, dette, balance courante) |
| **Simulateur** (`market.py`) | — | ne comble que le vide *avant* le premier vrai datapoint, et sert de repli pour les bougies |

Sans clé, les panneaux qui dépendent de FRED/Finnhub affichent un état « add key » plutôt que d'inventer
des chiffres.

---

## 4. Architecture

```
        Yahoo Finance (keyless)          Finnhub WS (clé opt.)        FRED / World Bank
        historique + cotations           ticks + news + mktcap        éco / macro annuelle
                 │                                │                          │
                 ▼                                ▼                          ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  Backend FastAPI (:8000)                                                   │
     │   Boucles asyncio : poll_loop · baseline_loop · finnhub_loop · fx_loop     │
     │                     simulator_loop · macro_loop · globe_loop               │
     │   MarketState (état) · Hub (fan-out) · providers/macro/globe (data layer)  │
     └───────────────┬────────────────────────────────────────────────────────────┘
          REST /api/* │ WebSocket /ws/prices  (snapshot initial puis push de quotes)
                      ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  Vite (:5173) — proxy /api + /ws → :8000                                   │
     │  Store Zustand (assets, positions, compte, moteur SL/TP/pending/alertes)   │
     │  React : Header · Terminal (3 colonnes) · Macro Dashboard · Global Map     │
     └──────────────────────────────────────────────────────────────────────────┘
```

**Flux temps réel** : à la connexion WS, le backend envoie un `snapshot` (tous les assets), puis pousse
des messages `quotes` (deltas de prix) et `asset` (nouvel actif custom). Le store applique chaque quote,
recalcule le compte, et déclenche le moteur (SL/TP, fills en attente, alertes).

---

## 5. Backend — modules, boucles, API

### Modules

| Fichier | Responsabilité |
|---|---|
| `main.py` | app FastAPI : routes REST, `/ws/prices`, cycle de vie (lance les boucles) |
| `feeds.py` | boucles de fond : `poll_loop` (Yahoo indices/commodités/custom), `baseline_loop` (clôture précédente réelle des symboles WS), `finnhub_loop` (ticks WS), `fx_loop` (taux USD des actions étrangères), `simulator_loop` |
| `market.py` | `MarketState` : état des actifs, cotations, bougies synthétiques de repli, carnet d'ordres simulé, enregistrement des symboles custom, `set_usd_rate` |
| `providers.py` | Yahoo : `yahoo_candles`, `yahoo_quote`, `yahoo_search`, `yahoo_quote_raw`, `yahoo_candles_raw`, `usd_rate`, mapping `YAHOO_MAP`, timeframes `_YF_TF` |
| `macro.py` | Macro Dashboard : board Yahoo + Risk Barometer, corrélations & RRG (numpy), FRED (éco/courbe/publications/calendrier), news Finnhub/Yahoo, **market cap** |
| `globe.py` | Global Map : board des marchés mondiaux (~42 pays), détail pays (Yahoo + World Bank + news), couche macro, hotspots géopolitiques |
| `assets.py` | univers tradable de base + `FINNHUB_MAP` (mapping vers le flux temps réel) |
| `hub.py` | `Hub` : fan-out des messages vers tous les clients WS connectés |
| `config.py` | config runtime depuis l'environnement / `.env` |

### Boucles asynchrones (lancées au démarrage)

`simulator_loop`, `finnhub_loop`, `poll_loop`, `baseline_loop`, `fx_loop`, `macro_loop`, `globe_loop`.
Chacune est résiliente aux erreurs (Yahoo peut renvoyer un 429 → repli sur le dernier prix / synthétique
sans planter).

### Endpoints REST

| Méthode & route | Rôle |
|---|---|
| `GET /api/health` | statut, live, clients connectés |
| `GET /api/meta` | catégories & timeframes |
| `GET /api/assets` | snapshot de tous les actifs |
| `GET /api/search?q=` | recherche de symboles Yahoo à ajouter |
| `POST /api/assets/add` | enregistre un symbole custom (récupère devise + taux USD) |
| `DELETE /api/assets/{symbol}` | retire un symbole custom |
| `GET /api/assets/{symbol}` | un actif |
| `GET /api/assets/{symbol}/candles?tf=` | bougies (Yahoo, repli simulateur) |
| `GET /api/orderbook/{symbol}` | carnet d'ordres L2 **simulé** |
| `GET /api/macro/board` | rates, VIX, DXY, secteurs, cross-asset, Risk Barometer |
| `GET /api/macro/econ\|curve\|releases\|calendar` | données FRED |
| `GET /api/macro/candles?symbol=&tf=` | bougies d'un symbole Yahoo arbitraire (DXY, VIX…) |
| `GET /api/macro/news` | news (Finnhub + repli RSS Yahoo, pastille d'importance) |
| `GET /api/macro/correlations` | matrice de corrélation Pearson (numpy) |
| `GET /api/macro/rrg` | Relative Rotation Graph des secteurs vs SPY |
| `GET /api/marketcap/{symbol}` | capitalisation (Finnhub, actions uniquement) |
| `GET /api/globe/markets` | indices de ~42 pays (perf du jour) |
| `GET /api/globe/geo` | hotspots géopolitiques (news taggées par pays) |
| `GET /api/globe/macro-layer` | PIB/inflation/chômage de tous les pays (World Bank) |
| `GET /api/globe/country/{iso}` | détail d'un pays (indice + FX + macro + news) |
| `WS /ws/prices` | snapshot initial puis push `quotes` / `asset` |

---

## 6. Frontend — structure & état

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `store.ts` | store Zustand : état + persistance localStorage + **moteur de trading** (`applyQuotes` : SL/TP, fills en attente, alertes) + `computeAccount` / `positionPnl` |
| `api.ts` | client REST + WebSocket reconnectant |
| `types.ts` | tous les types (Asset, Position, PendingOrder, ClosedTrade, Alert, Notice, Account, + types macro & globe & exposition) |
| `constants.ts` | `BALANCE` (défaut du capital), `LEVERAGE`, timeframes, studies, couleurs |
| `format.ts` | formatage ($, compact, %, dates), `uid`, `isToday` |
| `indicators.ts` | calcul des studies (MA, RSI, MACD, VOL, BB) |
| `components/*` | Header, Watchlist, CenterPanel, PriceChart, OrderPanel, SettingsModal, Toasts |
| `components/macro/*` | MacroDashboard + Panel + LiveWireCenter + `panels/*` |
| `components/globe/*` | GlobalMap, WorldMap, CountryPanel, PortfolioPanel, MapLegend, WorldSummary, SessionClock, GeoPanel |
| `geo/*` | `countries.ts` (ISO num→alpha2 + centroïdes), `scales.ts` (échelles de couleur), `exposure.ts` (symbole→pays + agrégation du book) |

### Modèle d'état (store Zustand)

Regroupe : `assets`, `watchlist`/`customs`, `selected`/`timeframe`/`indicators`, `view`
(`TERMINAL|MACRO|GLOBAL`), et l'état de simulation : `positions`, `pending`, `history`, `orders`,
`alerts`, `notices`, `capital`.

**Persistance localStorage** :

| Clé | Contenu |
|---|---|
| `apex.watchlist` | symboles suivis |
| `apex.customs` | symboles custom (mapping display ↔ Yahoo) |
| `apex.sim` | positions, historique, ordres, alertes, pending |
| `apex.view` | vue active |
| `apex.capital` | capital du compte |
| `apex.globe.portfolio` | mode Portfolio de la carte |

### Flux de données

`connectPrices` (WS) → `onSnapshot`/`onQuotes`/`onAsset` → actions du store → composants réabonnés.
Les composants lisent le store via des sélecteurs Zustand ; `computeAccount` est recalculé à chaque tick.

---

## 7. Les trois vues du terminal

### 7.1 Terminal (vue par défaut, 3 colonnes)

- **Watchlist** (gauche) — recherche de n'importe quel marché (actions, indices, forex, crypto,
  matières) via Yahoo ; ajout/suppression ; persistée. Les symboles custom reçoivent un ticker
  d'affichage propre (`^FCHI`→`FCHI`, `MC.PA`→`MC`) tandis que le symbole Yahoo reste interne.
- **CenterPanel** (centre) —
  - **Bandeau d'identité** : symbole, catégorie, badge LIVE/SIM, **tag devise** + `≈ $X` pour les
    actions étrangères, **capitalisation boursière** (actions).
  - **Grille** des 8 stats (open/high/low/prev close/volume/spread/52W hi/lo).
  - **Graphique** TradingView : timeframes `1D · 1W · 1M · 3M · 6M · YTD · 1Y · 5Y · MAX` (l'axe colle
    à la durée), badge de **performance de la période en %**, studies **MA · RSI · MACD · VOL · BB**,
    crosshair magnétique (prix accroché au point de donnée).
  - **Panneau d'activité** à onglets : **POSITIONS** (clic → charge le graphe), **PENDING** (clic →
    graphe), **ORDER HISTORY**, **TRADE LOG**, **ALERTS**.
- **OrderPanel** (droite) —
  - **Carnet d'ordres L2 (simulé)**, cohérent avec le spread affiché.
  - **Ticket** : MARKET / LIMIT / STOP, lots, SL/TP, VALUE / MARGIN / RISK (en USD), indice de
    conversion de change, **garde de marge** (message + boutons désactivés si marge > free margin).
- **Header** — logo, bascule de vues, **barre de compte** (Balance / Equity / P&L Today / Margin /
  Free Margin), ticker déroulant, statut de connexion, **⚙ Paramètres**.

### 7.2 Macro Dashboard

Vision institutionnelle, panneaux (`components/macro/panels/*`) :

- **Risk Barometer** — score composite Risk-On/Risk-Off 0–100 (VIX, crédit HY/IG, actions vs
  obligations, DXY, or) en cadran animé.
- **Yield Curve** — courbe des taux interactive (spread 2s10s, signal d'inversion).
- **Rates** — taux directeurs / majors.
- **Volatility** — VIX + régime de risque + sparkline 30 jours survolable.
- **Dollar** — indice DXY.
- **Cross-Asset** — heatmap ; chaque tuile porte un symbole tradable → clic vers le terminal.
- **RRG** — Relative Rotation Graph des secteurs vs SPY (4 quadrants, traînées lissées).
- **Correlation Matrix** — Pearson des rendements log journaliers sur 3 mois (numpy).
- **Econ Indicators** — CPI, PIB, chômage, taux (FRED).
- **Live Wire Center** — fil de news (importance) + calendrier économique (dates FRED).

### 7.3 Global Macro Map

- **Choroplèthe** du monde (~42 pays) : coloré par la perf du jour de l'indice, ou par un indicateur
  **World Bank** (croissance PIB / inflation / chômage) — sélecteur dans la légende.
- **Volet pays** (clic) : indice + mini-graphe (crosshair + tooltip), FX, macro détaillée (PIB,
  inflation, chômage, population, PIB nominal, dette, balance courante) et news du pays.
- **Barre de synthèse mondiale** : leaders / lanternes rouges + moyennes régionales.
- **Horloge des sessions** mondiales (heures régulières, jours fériés exclus).
- **Couche géopolitique** : bulles de hotspots (news taggées par pays), survol → panneau de news.
- **Mode Portfolio** (voir §11).

---

## 8. Le moteur de simulation

Tout le moteur vit dans le store, principalement dans `applyQuotes` (exécuté à chaque tick) :

- **Ordres** — MARKET remplit immédiatement (au bid/ask du carnet). LIMIT/STOP créent des **ordres en
  attente** (`pending`) qui se remplissent quand le prix franchit le déclencheur → deviennent des positions.
- **SL / TP** — chaque position ouverte est testée à chaque tick ; un franchissement clôture automatiquement
  et journalise le trade.
- **Alertes de prix** — se déclenchent au franchissement (au-dessus / en-dessous).
- **Notifications toast** — SL / TP / ALERT / TRADE / **ERROR** (garde de marge).
- **Historique persistant** — TRADE LOG (trades clôturés avec raison : manuel/SL/TP) et ORDER HISTORY
  (ouvertures/clôtures).

---

## 9. Modèle de compte, marge & capital

- **Levier** : `LEVERAGE = 10`. Marge d'une position = valeur notionnelle / levier.
- **Formules** (`computeAccount`) :
  - `Balance = capital + P&L réalisé (total)`
  - `Equity = Balance + P&L latent`
  - `P&L Today = réalisé-du-jour + latent`
  - `Margin = Σ marges des positions`
  - `Free margin = Equity − Margin`
- **Capital** — remplace l'ancienne constante figée `BALANCE = 50 000 $` par un `capital` **persisté**
  (`apex.capital`) et ajustable.
- **⚙ Paramètres** (modale ouverte par l'engrenage du header) :
  - **Dépôt / Retrait** de capital (le retrait est plafonné au free margin — impossible de retirer du
    capital engagé).
  - **Reset du compte** (confirmation en 2 clics) : efface positions, ordres en attente, trade log,
    order history **et alertes** ; conserve le capital.
- **Garde de marge** — un ordre dont la marge dépasse le free margin est **bloqué** :
  - dans le store (`openPosition` / `placePending`) → refus + toast `ERROR` (garde autoritaire) ;
  - dans l'`OrderPanel` → message rouge inline + boutons BUY/SELL désactivés.
  - S'applique aux ordres **marché et en attente**.

---

## 10. Conversion de change (actions étrangères)

Une action étrangère (ex. `MC.PA` cotée en €, `7203.T` en ¥) est **affichée dans sa devise locale**,
mais le compte étant en dollars, tout le calcul monétaire se fait en **USD** :

- L'actif porte `currency` + un `usdRate` **vivant** (backend `providers.usd_rate` + `fx_loop`, cachés
  ~60 s ; repli sur le dernier taux connu en cas d'échec).
- La position **fige le taux à l'ouverture** (`entryRate`) → le P&L intègre **le mouvement du prix ET du
  change**, exactement comme un compte USD détenant une action étrangère. Formule :
  `P&L_USD = sign × (prix×usdRate − entry×entryRate) × lots × contract`.
- Les **SL/TP restent en prix local** (cohérents avec le graphe). Le bandeau affiche le prix local + une
  ligne `≈ $X`.
- **Périmètre** : actions uniquement. FX, crypto, matières et indices gardent `usdRate = 1`. Les
  positions ouvertes **avant** cette feature conservent leur comportement d'origine (garde `hasRate`).

---

## 11. Exposition du portefeuille sur la carte

Le **mode Portfolio** (toggle dans la légende de la Global Map) superpose ton *book* sur le monde,
**100 % côté client** (à partir du store) :

- **Résolution symbole → pays** (`geo/exposure.ts`) : table de base + suffixe de place Yahoo
  (`.PA`→FR, `.T`→JP…) + board des marchés déjà chargé. FX/crypto/matières → poche « non-géographique ».
- **Teinte** des pays par l'**exposition notionnelle** (rampe bleue).
- **Bulles** aux centroïdes : **taille ∝ notionnel**, **couleur = P&L latent** (vert/rouge).
- **Volet gauche** `PortfolioPanel` : barre d'**allocation top-5**, exposition + **latent + réalisé par
  pays**, poche non-géographique (FX/crypto/matières).
- **Pont vers le Terminal** : cliquer une bulle / une ligne sélectionne le symbole et bascule sur le Terminal.

Toutes les valeurs sont en USD (bénéficie de la conversion de change du §10).

---

## 12. Transparence des données (réel vs simulé)

Le projet est **honnête** sur ce qui est réel :

| Réel | Simulé |
|---|---|
| Prix, variation %, OHLC, historique de bougies (Yahoo) | **Carnet d'ordres L2** (aucun flux L2 gratuit) |
| Cotations live (Yahoo poll / Finnhub WS) | **Spread**, **volume**, 52W hi/lo des actifs de base |
| Taux de change (Yahoo) | Bougies de **repli** quand Yahoo est indisponible |
| Macro World Bank (annuelle, année étiquetée) | Prix **avant** le premier vrai datapoint (amorçage) |
| Éco FRED, news Finnhub/Yahoo, market cap Finnhub | — |

Le carnet dérive du **même spread** que la grille pour rester cohérent. Aucun ordre n'atteint un vrai
courtier. Les panneaux dépendant d'une clé absente affichent « add key » au lieu d'inventer des chiffres.

---

## 13. Installation & démarrage

```bash
# 1) Backend → http://localhost:8000
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8000

# 2) Frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

Sous Windows : `./dev.ps1` lance les deux. Tout fonctionne **sans clé**. Deux clés gratuites optionnelles
dans `backend/.env` (`cp backend/.env.example backend/.env`) :

| Variable | Effet |
|---|---|
| `FINNHUB_API_KEY` | ticks crypto/forex/actions temps réel + news + market cap |
| `FRED_API_KEY` | indicateurs éco du Macro Dashboard (sinon état « add key ») |
| `SIM_INTERVAL` | cadence du simulateur (défaut 1.0 s) |
| `CORS_ORIGINS` | origines autorisées (défaut localhost:5173) |

> ⚠️ `backend/.env` est **gitignoré** — ne jamais le commiter.
> Sous Windows, `uvicorn --reload` peut laisser un process enfant tenir le port 8000 ; le libérer avec
> `Get-Process python | Stop-Process -Force`. Préférer un lancement **sans** `--reload`.

---

## 14. Tests, build & vérification

| Commande | Effet |
|---|---|
| `cd backend && python -m pytest -q` | 35 tests unitaires (macro, globe, providers) |
| `cd frontend && npm run build` | `tsc --noEmit` + bundle de prod (`dist/`) |
| `cd frontend && npm run dev` | dev server + HMR |

- Le backend teste les helpers purs (`test_macro.py`, `test_globe.py`, `test_providers.py`).
- Le frontend n'a pas de *test runner* : la vérification passe par le typecheck du build + contrôle live.

---

## 15. Conventions & workflow de développement

- **Une branche par fonctionnalité**, mergée sur `main` (`--no-ff`), puis poussée sur `origin/main`.
- **Cycle superpowers** pour les features non triviales : *brainstorming → spec → plan → exécution*.
  - Specs : `docs/superpowers/specs/AAAA-MM-JJ-<sujet>-design.md`
  - Plans : `docs/superpowers/plans/AAAA-MM-JJ-<feature>.md`
- **Commits fréquents** (un par tâche du plan), build/tests verts à chaque étape.
- `CLAUDE.md` — guide destiné aux agents IA (maintenu à jour). Ce `doc.md` — documentation humaine.

---

## 16. Arborescence du projet

```
FinancialTerminalv2/
├─ backend/
│  ├─ main.py           # REST + /ws/prices + cycle de vie
│  ├─ feeds.py          # boucles poll/baseline/finnhub/fx/simulator/macro/globe
│  ├─ market.py         # MarketState : état, bougies, carnet, register, set_usd_rate
│  ├─ providers.py      # Yahoo : candles/quote/search + usd_rate
│  ├─ macro.py          # board + risk + corrélations/RRG + FRED + news + market cap
│  ├─ globe.py          # marchés mondiaux + détail pays (World Bank) + géopolitique
│  ├─ assets.py         # univers de base + FINNHUB_MAP
│  ├─ hub.py            # fan-out WebSocket
│  ├─ config.py         # config/env
│  ├─ requirements.txt
│  └─ tests/            # test_macro · test_globe · test_providers
├─ frontend/
│  └─ src/
│     ├─ store.ts, api.ts, types.ts, constants.ts, format.ts, indicators.ts, main.tsx
│     ├─ components/    # Header, Watchlist, CenterPanel, PriceChart, OrderPanel, SettingsModal, Toasts
│     ├─ components/macro/   # MacroDashboard, Panel, LiveWireCenter, panels/*
│     ├─ components/globe/   # GlobalMap, WorldMap, CountryPanel, PortfolioPanel, MapLegend, WorldSummary, SessionClock, GeoPanel
│     └─ geo/           # countries.ts, scales.ts, exposure.ts
├─ docs/superpowers/    # specs + plans archivés
├─ CLAUDE.md            # guide agents IA
├─ README.md            # présentation (FR)
├─ doc.md               # ce document
└─ dev.ps1              # lance backend + frontend (Windows)
```

---

## 17. Limitations & idées futures

**Limitations connues (assumées)**

- Carnet d'ordres, spread, volume : simulés (pas de flux L2 gratuit).
- Réalisme *pip-value* des paires FX USD-base (USDJPY/USDCAD) : simplifié, hors périmètre.
- Indices étrangers (DAX, FTSE) traités en « points » ($/point), pas convertis en devise.
- Pas de *test runner* frontend (vérification via typecheck + live).

**Idées futures**

- Courbe de valeur du portefeuille dans le temps (nécessite de persister des snapshots).
- Levier / marge configurables, journal des dépôts/retraits.
- Rollups régionaux dans le volet Portfolio ; conversion des indices étrangers.
- Tests frontend (vitest) sur les helpers purs (`exposure.ts`, `indicators.ts`).

---

*Document généré pour résumer l'état du projet KRONOS Global Terminal. Pour les détails d'implémentation destinés
aux agents IA, voir `CLAUDE.md` ; pour la présentation courte, voir `README.md`.*
