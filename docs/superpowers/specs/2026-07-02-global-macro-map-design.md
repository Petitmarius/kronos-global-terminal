# Global Macro Map — Design Spec

**Date:** 2026-07-02
**Projet:** APEX Terminal
**Statut:** Approuvé (design), en attente de plan d'implémentation

## Objectif

Ajouter une **3ᵉ vue principale « Global Map »** : une carte du monde interactive, sombre,
façon salle de marché, qui superpose des dimensions **financière**, **macroéconomique** et
**géopolitique**. Complémentaire au Terminal (micro/instrument) et au Macro Dashboard
(agrégats) : la Global Map apporte la **dimension géographique**. Éthos APEX conservé :
données **réelles**, honnêteté sur les sources et leurs limites, keyless-first (l'éco World
Bank est sans clé, le géopolitique réutilise le flux news existant).

## Non-objectifs (YAGNI)

- Pas de fond de carte « slippy » (Leaflet/tuiles externes) : choroplèthe SVG autonome.
- Pas de PIB/inflation temps réel (inexistant gratuitement) — World Bank annuel, daté.
- Pas d'indice de risque géopolitique « officiel » — la couche = pays cités dans l'actu (proxy).
- Pas de couche Devises/rendements sur la carte pour l'instant (la devise reste dans le
  panneau pays). On pourra l'ajouter plus tard.
- Pas de gestion des jours fériés dans l'horloge des sessions (heures régulières only).

## Sources de données

| Donnée | Source | Clé ? | Fraîcheur |
|---|---|---|---|
| Indices pays (niveau, % jour) | Yahoo (`yahoo_quote_raw`) | non | ~temps réel |
| Sparkline + FX pays | Yahoo (`yahoo_candles_raw`, FX pair) | non | ~temps réel |
| Macro pays (PIB, inflation, chômage) | **World Bank API** | non | annuel, décalé |
| News pays | Finnhub / Yahoo (flux existant, filtré par nom) | Finnhub | ~5 min |
| Hotspots géopolitiques | **flux news existant** (Finnhub/Yahoo) + matching noms de pays | Finnhub | ~5 min |
| Sessions ouvertes | calcul fuseaux (`Intl`, client) | — | live |

## Architecture

### Navigation (extension du switch de vue)
- `store.view` : `'TERMINAL' | 'MACRO' | 'GLOBAL'`. Header : 3 boutons `[TERMINAL][MACRO][GLOBAL]`.
- `App.tsx` : rend `<GlobalMap/>` plein écran quand `view==='GLOBAL'`. Bandeau compte + ticker persistent.

### Backend — nouveau module `backend/globe.py` + routes dans `main.py`
Registre central `GLOBE_MARKETS` : liste de pays
`{iso2, name, index (symbole Yahoo), wb (code World Bank), fx (paire Yahoo|None), invFx (bool)}`
pour ~30 grandes places (US ^GSPC, CA ^GSPTSE, BR ^BVSP, MX ^MXX, GB ^FTSE, DE ^GDAXI,
FR ^FCHI, ES ^IBEX, IT FTSEMIB.MI, CH ^SSMI, NL ^AEX, SE ^OMX, JP ^N225, CN 000001.SS,
HK ^HSI, IN ^BSESN, KR ^KS11, TW ^TWII, AU ^AXJO, SG ^STI, ID ^JKSE, ZA ^J203.JO,
TR XU100.IS, SA ^TASI.SR …). **Symboles à vérifier un par un à l'implémentation** (Yahoo
peut renvoyer 404 sur certains) ; ceux qui échouent sont simplement omis, sans planter.

**Endpoints :**
- `GET /api/globe/markets` — `{updated, countries:[{iso, name, index, level, pct}]}`. Yahoo,
  réchauffé toutes les ~30 s par `globe_loop`, cache ~20 s.
- `GET /api/globe/country/{iso}` — détail agrégé :
  `{iso, name, index:{symbol,level,pct,points[]}, fx:{pair,level,pct}|null,
    macro:{gdp,inflation,unemployment, year}|{available:false}, news:[{headline,url,source,datetime}]}`.
  Sparkline via `yahoo_candles_raw(index,"1M")`. Macro via World Bank. News = flux
  `fetch_news()` filtré par nom de pays (+ synonymes). Cache ~5 min par pays.
- `GET /api/globe/geo` — `{available, points:[{iso,name,lat,lon,count,headline}]}` **dérivé du
  flux `fetch_news()` existant** : on compte les news dont le titre mentionne un pays (table de
  noms/alias → centroïde lat/lon), on garde le titre le plus récent comme échantillon. Cache
  aligné sur les news (~5 min). (GDELT GEO 2.0 abandonné : endpoint 404/discontinué ; GDELT DOC
  trop rate-limité et ne donne que le pays *source*.)

**World Bank** : `https://api.worldbank.org/v2/country/{iso2}/indicator/{ind}?format=json&per_page=8`
pour `NY.GDP.MKTP.KD.ZG` (croissance PIB %), `FP.CPI.TOTL.ZG` (inflation %),
`SL.UEM.TOTL.ZS` (chômage %). On prend la dernière valeur non nulle + son année.

**Hotspots news** : table `NEWS_COUNTRIES` (nom + alias → iso, lat, lon centroïde) pour ~40
pays ; pour chaque item de `fetch_news()`, on incrémente le pays dont un alias apparaît dans
le titre (mot entier, insensible à la casse). Points triés par `count` desc.

### Frontend — `frontend/src/components/globe/`
```
GlobalMap.tsx        # orchestration : polling markets + geo, état pays sélectionné + toggle couche
GlobalMap.module.css
WorldMap.tsx         # react-simple-maps : choroplèthe (couleur = pct) + marqueurs hotspots news (si toggle)
CountryPanel.tsx     # volet latéral détail pays (fetch /country/{iso} au clic)
SessionClock.tsx     # bandeau des places ouvertes (calcul Intl, tick 1/min)
MapLegend.tsx        # échelle de couleur + toggle Markets/Geopolitical
```
- `react-simple-maps` (+ `d3-geo`, `topojson-client`) ajoutés ; topojson monde
  (`countries-110m`) **embarqué** en asset (pas de CDN runtime).
- `api.ts` : `fetchGlobeMarkets()`, `fetchGlobeCountry(iso)`, `fetchGlobeGeo()`.
- Polling : markets ~20 s, geo ~10 min, country à la demande (au clic).
- Coloration : échelle divergente rouge (−) → gris (0) → vert (+), bornée à ±3 %.
- Marqueurs hotspots (news) : cercles semi-transparents ambre, rayon ∝ √count, au survol → nom+count.
- Le clic sur un pays coloré ouvre `CountryPanel` (volet droit) ; Échap / clic ailleurs ferme.

### SessionClock
Bourses : Tokyo (Asia/Tokyo 09:00–15:00), Hong Kong (Asia/Hong_Kong 09:30–16:00), Londres
(Europe/London 08:00–16:30), Francfort (Europe/Berlin 09:00–17:30), New York
(America/New_York 09:30–16:00), Sydney (Australia/Sydney 10:00–16:00). Ouvert = jour de
semaine + heure locale dans la fenêtre (via `Intl.DateTimeFormat` par fuseau). Pastille
verte/grise + heure locale. Rafraîchi chaque minute.

## Honnêteté des données
- Indices, %, sparklines, FX : **réels** (Yahoo).
- Macro : **World Bank annuel**, chaque valeur affichée avec son année « (2024) ». Jamais simulé.
- News : réelles (Finnhub/Yahoo), filtrées par pays (best-effort par nom).
- Géopolitique : **pays cités dans l'actu marché courante** (Finnhub/Yahoo), libellé ainsi ;
  matching best-effort par nom de pays, ce n'est pas un indice de risque officiel.
- Sessions : calculées, **jours fériés non pris en compte** (mention dans la légende).
- Pied de carte rappelant les sources.

## Vérification
- Backend : pytest sur les helpers purs (`_wb_latest` extraction dernière valeur/année,
  `_news_hotspots` comptage des pays cités dans les titres, filtrage news par pays). Endpoints répondent 200 ;
  `/geo` et `/country` dégradent proprement sans clé/hors-ligne.
- Vérif live : `/api/globe/markets` renvoie des % cohérents ; contrôle du mapping symboles.
- Frontend : `npm run build` (tsc+vite) passe ; contrôle visuel (carte colorée, clic pays →
  volet peuplé, toggle géopolitique, horloge sessions).

## Hors périmètre / futur
- Couches Devises / rendements souverains sur la carte.
- Arcs de flux de capitaux (pas de données réelles → écarté).
- Historique/animation temporelle de la carte.

## Annexe — dépendances ajoutées
`react-simple-maps`, `d3-geo`, `topojson-client` (frontend) + un topojson monde embarqué.
Aucune nouvelle dépendance backend (World Bank via `urllib` ; géo dérivé du flux news existant).
