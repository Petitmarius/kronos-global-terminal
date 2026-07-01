# Macro Dashboard — Design Spec

**Date:** 2026-07-01
**Projet:** APEX Terminal
**Statut:** Approuvé (design), en attente de plan d'implémentation

## Objectif

Ajouter une **vue principale « Macro Dashboard »** au terminal APEX : une vision
macro/institutionnelle complémentaire au terminal de trading (taux, régime de
risque, rotation sectorielle, cross-asset, indicateurs économiques). Doit être
visuellement au niveau du terminal existant (dark cyber, néon, JetBrains Mono)
et rester dans l'éthos du projet : **données réelles, honnêteté sur les sources,
fonctionne sans clé pour la macro de marché** ; l'éco réelle vient de FRED (clé
gratuite), jamais simulée.

## Non-objectifs (YAGNI)

- Pas de calendrier économique *prospectif* avec consensus (aucune source
  gratuite fiable). On montre les **dernières publications** (rétrospectif, réel).
- Pas de données éco simulées. Sans clé FRED, les panneaux éco affichent un état
  vide + invite à ajouter la clé.
- Pas de react-router : la bascule de vue se fait par état local.
- Pas de streaming WebSocket pour la macro : elle bouge lentement → polling REST.

## Sources de données

| Donnée | Source | Clé ? |
|---|---|---|
| Courbe des taux (majors live) | Yahoo `^IRX ^FVX ^TNX ^TYX` | non |
| Courbe des taux (complète) | FRED `DGS1MO…DGS30` | FRED |
| Spread 2s10s | FRED `T10Y2Y` (+ fallback calc) | FRED |
| VIX | Yahoo `^VIX` | non |
| DXY | Yahoo `DX-Y.NYB` | non |
| Secteurs (11 SPDR) | Yahoo `XLK XLF XLE …` | non |
| Cross-asset (5 classes) | Yahoo (basket) | non |
| Indicateurs éco | FRED (CPI, Core, UNRATE, PIB, Fed funds) | FRED |
| Dernières publications | FRED (last obs + release date) | FRED |

**Clé FRED** : `FRED_API_KEY` dans `backend/.env` (gitignoré, comme
`FINNHUB_API_KEY`). Absente → endpoints FRED renvoient `{"available": false}` et
le frontend affiche l'état vide.

## Architecture

### Navigation (approche retenue : switch de vue dans le Header)

- Nouvel état store `view: 'TERMINAL' | 'MACRO'` + `setView`, persisté
  (`apex.view` en localStorage).
- `Header.tsx` : nav segmenté `[ TERMINAL ] [ MACRO ]` à côté du logo. Le bandeau
  compte (Balance/Equity/P&L…) et le ticker **restent visibles dans les deux vues**
  (continuité).
- `App.tsx` : le corps rend `<div class="body">…terminal…</div>` si
  `view==='TERMINAL'`, sinon `<MacroDashboard/>` (plein largeur).

### Backend — couche macro

Nouveau module `backend/macro.py` (état + fetch + cache) + routes dans `main.py`.
Nouveau `providers.yahoo_quote_raw(ysym)` : quote (price, prevClose, %) pour un
**symbole Yahoo arbitraire** (pas besoin de `YAHOO_MAP`), avec cache TTL comme
`yahoo_quote`. `macro.py` réutilise `providers._chart/_get` pour FRED.

**Endpoints :**

- `GET /api/macro/board` — agrégat « rapide » Yahoo (rates majors, cross-asset,
  sectors, vol/VIX, dxy). Un seul appel pour minimiser les round-trips. Cache ~15 s.
- `GET /api/macro/econ` — FRED : CPI YoY, Core CPI YoY, UNRATE, PIB (QoQ SAAR),
  Fed funds ; dernière valeur + prior + sparkline 24 mois. Cache ~6 h.
- `GET /api/macro/curve` — courbe complète FRED `DGS*` + spread `T10Y2Y`. Cache ~6 h.
- `GET /api/macro/releases` — dernières publications (série → dernière obs, date,
  valeur, prior). Cache ~6 h.

Chaque endpoint FRED renvoie `{"available": false}` si pas de clé. Un
`macro_loop` (async) rafraîchit `board` périodiquement ; FRED est chargé à la
demande + cache long. Yahoo peut rate-limiter (429) → fallback silencieux sur le
dernier cache (comme l'existant).

### Frontend — composants

```
components/macro/
  MacroDashboard.tsx     # grille responsive, orchestre le polling
  MacroDashboard.module.css
  panels/
    YieldCurvePanel.tsx      # courbe des taux (lightweight-charts) + 2s10s + INVERTED
    RatesPanel.tsx           # tuiles Fed funds / 2Y / 10Y / 30Y + variation
    CrossAssetPanel.tsx      # heatmap % du jour, 5 classes
    SectorRotationPanel.tsx  # barres horizontales classées, 11 secteurs
    VolatilityPanel.tsx      # jauge VIX + libellé de régime
    DollarPanel.tsx          # mini-graphe DXY + niveau/variation
    EconIndicatorsPanel.tsx  # tuiles FRED + sparkline 24 mois
    ReleasesPanel.tsx        # dernières publications (liste datée)
  Panel.tsx                  # coquille commune (titre + badge live/source + slot)
```

- `api.ts` : `fetchMacroBoard()`, `fetchMacroEcon()`, `fetchMacroCurve()`,
  `fetchMacroReleases()`.
- `MacroDashboard` poll `board` toutes ~20 s (interval, nettoyé au démontage) ;
  FRED (`econ/curve/releases`) chargé une fois au montage puis rafraîchi ~30 min.
- Chaque panneau est **autonome** : reçoit ses données en props, gère son état
  vide/chargement/erreur. Le composant `Panel` uniformise l'entête (label + source).

## Les 8 panneaux

1. **Yield Curve** — courbe des taux US tracée (`DGS1MO…DGS30`), axe des maturités.
   Badge spread **2s10s** ; si négatif → pastille rouge **« INVERTED »**.
2. **Rates & Central Bank** — tuiles gros chiffres : Fed funds (target), 2Y, 10Y,
   30Y, avec variation jour (bp). Source live Yahoo pour 10Y/30Y, FRED pour 2Y/Fed.
3. **Cross-Asset Heatmap** — % du jour, 5 blocs : **Actions** (^GSPC ^NDX ^DJI
   ^GDAXI ^FTSE), **Taux** (TLT IEF HYG LQD), **Matières** (GC=F CL=F SI=F HG=F
   NG=F), **FX** (DX-Y.NYB EURUSD=X USDJPY=X GBPUSD=X), **Crypto** (BTC-USD
   ETH-USD SOL-USD). Cellule colorée vert/rouge selon l'intensité.
4. **Sector Rotation** — 11 ETF SPDR (XLK XLF XLE XLV XLI XLY XLP XLU XLB XLRE
   XLC), barres horizontales classées par % du jour → leadership visible.
5. **Volatility / Risk Regime** — VIX niveau + variation ; jauge + libellé de
   régime dérivé (`<15` Calm, `15–20` Normal, `20–30` Elevated, `>30` Risk-off).
6. **US Dollar (DXY)** — mini area-chart (réutilise le pattern PriceChart léger)
   + niveau et variation du jour.
7. **Economic Indicators** — tuiles FRED : CPI YoY, Core CPI YoY, Unemployment,
   GDP growth (QoQ SAAR), Fed funds ; dernière valeur, variation vs prior,
   sparkline 24 mois. État vide si pas de clé.
8. **Latest Releases** — liste datée des dernières publications (CPI, Core CPI,
   NFP `PAYEMS`, UNRATE, GDP, Retail Sales `RSAFS`…) : date de publication,
   période, valeur, prior. Rétrospectif, **réel** (FRED). Trié par date desc.

## Langage visuel

- Grille CSS responsive (`auto-fit`, min ~340 px), panneaux à hauteur confortable,
  scroll interne si besoin. Réutilise les tokens `--border`, `--dim`, `COLORS`
  (green/red/amber/blue), fond translucide façon `rangeBadge`.
- Entête de panneau : label uppercase letter-spacing + petit badge de source
  (`LIVE` / `FRED` / `SIM` — ici jamais SIM). Cohérent avec l'esthétique terminal.
- Graphes via `lightweight-charts` (déjà présent) avec le même `baseLayout`.

## Honnêteté des données

- **Réel Yahoo** : taux majors, VIX, DXY, secteurs, cross-asset.
- **Réel FRED** : indicateurs éco, courbe complète, dernières publications — ou
  **état vide explicite** sans clé. Aucune valeur inventée.
- Un court disclaimer en pied de dashboard rappelle les sources (Yahoo + FRED).
- README + CLAUDE.md mis à jour (nouvelle vue, `FRED_API_KEY`, `.env.example`).

## Vérification

- `cd frontend && npm run build` (tsc + vite) passe.
- Backend importe/compile ; endpoints répondent (200) avec et sans clé FRED
  (sans clé → `available: false`, le front affiche l'état vide sans planter).
- Contrôle visuel : bascule TERMINAL ⇄ MACRO, les 8 panneaux se peuplent, le
  ticker + compte restent en haut, valeurs cohérentes avec une source externe.

## Hors périmètre / futur

- Calendrier prospectif avec consensus (source payante).
- Indices de vol obligataire (MOVE) — pas de flux gratuit fiable.
- Persistance/paramétrage des panneaux par l'utilisateur.

## Annexe — identifiants

**FRED series :** `CPIAUCSL` (CPI, YoY calculé), `CPILFESL` (Core CPI, YoY),
`UNRATE`, `A191RL1Q225SBEA` (Real GDP QoQ SAAR), `FEDFUNDS` (effectif) /
`DFEDTARU` (haut de fourchette), `PAYEMS` (NFP), `RSAFS` (retail sales),
`T10Y2Y` (spread), `DGS1MO DGS3MO DGS6MO DGS1 DGS2 DGS3 DGS5 DGS7 DGS10 DGS20
DGS30` (courbe).

**Yahoo :** `^IRX ^FVX ^TNX ^TYX` (taux), `^VIX`, `DX-Y.NYB` (DXY),
`XLK XLF XLE XLV XLI XLY XLP XLU XLB XLRE XLC` (secteurs), baskets cross-asset
ci-dessus.
