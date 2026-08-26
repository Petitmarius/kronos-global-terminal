# KRONOS Global Terminal — Terminal de Trading & Macro Temps Réel

Terminal financier haute densité, style *prop firm*, à **trois vues** : un **terminal de trading**
avec simulateur d'ordres complet, une **carte macro mondiale** (~42 pays) et un **dashboard macro**
institutionnel. Données de marché **réelles** et **sans clé** (Yahoo Finance + World Bank), flux
temps réel optionnel (Finnhub), graphiques **TradingView** — le tout côté client, aucun ordre réel.

![aperçu](docs/preview.png)

## Stack

| Couche | Techno |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Zustand · [lightweight-charts](https://github.com/tradingview/lightweight-charts) · [react-simple-maps](https://www.react-simple-maps.io/) |
| Backend | FastAPI · Uvicorn · WebSockets · NumPy |
| Données | **Yahoo Finance** (historique + cotations, sans clé) · **World Bank** (macro pays, sans clé) · **Finnhub** (ticks temps réel + news, clé optionnelle) · **FRED** (éco/calendrier, clé optionnelle) |

## Démarrage

```bash
# 1) Backend  → http://localhost:8000
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8000

# 2) Frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```
Sous Windows : `./dev.ps1` lance les deux. Ouvre **http://localhost:5173**.

Tout fonctionne **sans aucune clé** (données réelles via Yahoo + World Bank). Deux clés gratuites
optionnelles : `cp backend/.env.example backend/.env` puis renseigne-les et relance le backend.
- `FINNHUB_API_KEY` — ticks crypto/forex/actions ultra-réactifs.
- `FRED_API_KEY` — données économiques du Macro Dashboard (CPI, PIB, chômage, taux, courbe,
  publications). Sans elle, ces panneaux affichent un état « add key » (rien n'est simulé).

## Architecture

```
        Yahoo Finance (keyless)     World Bank (keyless)     Finnhub WS (clé opt.)
        historique + cotations      macro pays               ticks crypto/forex/actions
                     │                    │                          │
                     ▼                    ▼                          ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  FastAPI backend (:8000)                                      │
        │   poll · baseline · fx · finnhub loops (aucun simulateur)     │
        │   warm loops (caches dashboards) · Hub → WebSocket            │
        └───────────────┬──────────────────────────────────────────────┘
              /api/* REST │ /ws/prices (push)
                          ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  Vite dev server (:5173) — proxy /api + /ws → :8000           │
        │  React — 3 vues : Terminal · Global Map · Macro               │
        └──────────────────────────────────────────────────────────────┘
```

## Fonctionnalités

Trois vues principales, bascule depuis le header : **Terminal** (par défaut) · **Global** · **Macro**.

### Terminal — vue de trading (par défaut)

- **Watchlist** personnalisable : recherche n'importe quel marché (actions, indices, forex, crypto,
  matières premières), ajout/suppression, **sauvegardée** (localStorage).
- **Graphique néon** TradingView · durées **1D · 1W · 1M · 3M · 6M · YTD · 1Y · 5Y · MAX**
  (l'axe colle toujours à la durée, badge de **performance de la période en %**) · bascule
  **ligne / bougies** (OHLC réel Yahoo) · studies **MA · BB · VOL · RSI · MACD**.
- **Carnet d'ordres** (L2 simulé, cohérent avec le spread affiché) + **ticket** : **MARKET**
  (exécution immédiate), **LIMIT** / **STOP** (ordres en attente, onglet PENDING). **Garde de
  marge** : un ordre dont la marge dépasse ton *free margin* est **bloqué** (message inline +
  boutons désactivés + toast).
- **Simulateur** : clôture manuelle ou auto via **Stop-Loss / Take-Profit**, **alertes de prix**,
  **historique** persistant (TRADE LOG, ORDER HISTORY), notifications toast, et compte calculé
  (Balance / Equity / P&L journalier / Marge). **Clic sur une position / un ordre en attente** → le
  graphe bascule sur ce symbole.
- **Paramètres** (⚙ dans le header) : ajuste le **capital** (dépôt / retrait plafonné au free
  margin) et **réinitialise le compte** (positions, ordres, historique, alertes).
- **Actions étrangères en devise locale** (ex. `.PA`, `.T`) : prix affiché dans sa monnaie +
  conversion `≈ $`, mais tout le calcul du compte est en **USD** avec le taux de change **figé à
  l'entrée** (le P&L intègre le mouvement du change).

### Global — Macro Map

- Carte du monde interactive, **~42 pays** — colorés par la **performance du jour** de leur indice,
  ou par un indicateur **World Bank** au choix (croissance PIB / inflation / chômage). Clic → volet
  pays (indice + mini-graphe, devise, macro détaillée : PIB, inflation, chômage, population, PIB
  nominal, dette, balance courante ; news du pays). L'**indice** et la **paire de change** du
  volet sont **cliquables → Terminal** : les cinq paires majeures ouvrent directement, les autres
  (USDCLP, USDBRL, USDZAR…) sont enregistrées à la volée et se mettent à streamer.
- **Barre de synthèse mondiale** (leaders / lanternes rouges + moyennes régionales), **horloge des
  sessions** mondiales (fériés exclus), et une couche **géopolitique** en bulles (survol → panneau
  de news du pays).
- **Mode Portfolio** : superpose ton *book* sur la carte — pays teintés par l'**exposition
  notionnelle**, **bulles** dimensionnées par le capital et colorées par le **P&L latent**.
  **Volet gauche** : allocation top-5, barre du **P&L réalisé par pays** (%), latent + réalisé par
  pays. **Volet droit « Performance & Asset Hub »** : courbe du **P&L réalisé sur 30 jours** et
  **donut** des actifs non-géographiques (FX / crypto / matières) avec drill-down au survol.
  **Clic → retour au terminal**. 100 % côté client, à partir de tes positions.
- Données réelles (Yahoo + World Bank) ; rien n'est simulé.

### Macro — Dashboard institutionnel

- **Risk Barometer** : score composite **Risk-On/Risk-Off 0–100** (VIX, crédit HY/IG, actions vs
  obligations, DXY, or) en cadran animé.
- **Courbe des taux US** servie par le **Trésor américain** lui-même (fichier officiel du jour,
  14 maturités de 1M à 30Y toutes datées de la même séance, sans clé ; FRED en repli) — le panneau
  affiche sa **source** et sa **date**, et le 2s10s en **points de base**.
- **Taux directeurs**, **VIX / régime de risque** (+ sparkline),
  **US Dollar (DXY)**, **heatmap cross-asset** (tuiles cliquables → terminal).
- **Sector RRG** : *Relative Rotation Graph* des 11 secteurs vs SPY (4 quadrants, traînées au survol).
- **Corrélations cross-asset** : heatmap Pearson des rendements journaliers sur 3 mois (numpy).
- **Live Wire Center** : fil de **news** (Finnhub + repli RSS Yahoo, pastille d'importance) et
  **calendrier économique** des prochaines publications (dates FRED).
- **Indicateurs économiques** (CPI, PIB, chômage, taux) via **FRED**. Macro de marché **réelle** via
  Yahoo (sans clé) ; l'éco vient de **FRED** (clé gratuite) — sinon ces panneaux invitent à ajouter
  la clé (**rien n'est simulé**).

## Performance

Les deux dashboards sont servis **entièrement depuis des caches chauds** : des boucles de fond les
rafraîchissent en continu, de sorte qu'une requête client n'attend jamais une reconstruction. Les
cotations partent en **lot** (un appel Yahoo pour ~18 symboles au lieu d'un par symbole), avec repli
par symbole pour les marchés que le lot ne sait pas coter.

| | Avant | Après |
|---|---|---|
| Ouvrir le **Macro Dashboard** | 2,1 s, pics à 4,3 s | **~0,1 s** |
| Ouvrir la **Global Map** | 0,5 s, pics à 4,6 s | **~0,02 s** |
| Premier clic sur un **pays** | 1,5 s | **~0,2 s** |

## Données — transparence

Prix, variations %, OHLC, historique, **52W haut/bas et volume** sont **réels** (Yahoo) ; la study
**VOL** trace le vrai volume par barre (vide pour les instruments sans volume, ex. forex). La macro
pays vient de **World Bank**, l'éco/calendrier de **FRED** (clé). En revanche le **carnet d'ordres**
et le **spread** sont **simulés** (aucune source L2 gratuite n'existe) ; le carnet dérive du même
spread que la grille pour rester cohérent. Aucun ordre n'est envoyé à un vrai broker — c'est un
démo / simulateur.

**Rien n'est inventé pour combler un trou.** Un instrument qu'aucune source ne sait coter porte
`price: null` et l'interface le dit (`NO DATA`, `NO CHART DATA`, `NO MARKET DATA`) : pas de prix de
départ, pas de marche aléatoire, pas de bougie de substitution. Une position sans prix live n'est
pas valorisée — elle affiche `—`, jamais un `0,00 $` qui se lirait « stable ». Si un fournisseur
tombe ou nous *rate-limite*, les endpoints se dégradent en « pas de données » au lieu d'échouer.

## Structure

```
backend/    main.py · feeds.py · market.py · providers.py · macro.py · globe.py · cache.py · assets.py · hub.py · config.py · tests/
frontend/   src/{store.ts, api.ts, indicators.ts, geo/*, components/*, components/macro/*, components/globe/*}
dev.ps1     lance backend + frontend
```

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de dev + HMR |
| `npm run build` | typecheck + bundle de production (`dist/`) |
| `uvicorn main:app` | API + flux WebSocket |
| `pytest` (dans `backend/`) | suite de tests (111) |
