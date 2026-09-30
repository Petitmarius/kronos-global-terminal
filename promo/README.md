# KRONOS — vidéo promo (motion design)

Vidéo de présentation de **19 s** (1920×1080, 60 fps, son stéréo) construite avec
[Remotion](https://www.remotion.dev/) (React + TypeScript), à partir des enregistrements
d'écran de l'app. Texte à l'écran en anglais.

**Rendu final :** [`out/kronos-promo.mp4`](out/kronos-promo.mp4) · vignette : [`out/poster.jpg`](out/poster.jpg)

## Storyboard

| Temps | Scène | À l'écran |
|---|---|---|
| 0,0 – 2,0 s | Accroche | Un mot « machine à sous » défile sur le temps : **STOCKS → FOREX → CRYPTO → MACRO**, avec de vraies cotations (NVDA, EURUSD, BTCUSD, Risk-On 62) et une courbe verte qui se trace |
| 2,0 – 3,2 s | Logo | Le mot atterrit sur **KRONOS** (le « O » vert), sous-titre *GLOBAL TERMINAL* |
| 3,2 – 3,55 s | Portail | La caméra traverse le « O » et entre dans le terminal |
| 4,0 – 6,5 s | 01 Terminal | *Pro charts. Real data.* — bascule LIGNE → BOUGIES sur le SPX500 |
| 6,5 – 9,0 s | 02 Paper trading | *Trade it all. Risk nothing.* — le ticket d'ordre se détache de l'écran, puis le panneau positions |
| 9,0 – 11,5 s | 03 Carte mondiale | *42 economies. One live map.* — clic sur les États-Unis, le panneau pays glisse |
| 11,5 – 14,0 s | 04 Macro | *The macro, decoded.* — Risk Barometer, puis corrélations |
| 14,0 – 16,0 s | Mosaïque | Mur de toutes les vues + **REAL MARKET DATA · LIVE STREAMING · PAPER TRADING** |
| 16,0 – 19,0 s | Fin + CTA | Logo, *Real-time markets. Global macro. One terminal.*, bouton **Star on GitHub** cliqué, URL du dépôt |

La barre **TERMINAL · GLOBAL · MACRO** (reprise du header de l'app) suit la vidéo d'une vue à l'autre.

## Son

Bande-son **originale**, entièrement synthétisée par [`audio/synth.py`](audio/synth.py) (aucun
sample → libre de droits) : 120 BPM, la mineur qui se résout en do majeur, batterie, basse,
nappes « supersaw », arpèges, plus le sound design (tic-tac d'horloge — clin d'œil à
Chronos —, bobines de la machine à sous, whooshes, impacts, clics d'interface, carillon du
bouton étoile). Chaque effet est calé à l'image près sur les repères de
[`timeline.json`](timeline.json), la même source de vérité que la vidéo. Mastering à −14 LUFS.

## Refaire le rendu

```bash
cd promo
npm install

# 1) Extraire les plans (les enregistrements bruts ne sont pas versionnés)
scripts/extract-footage.sh <partie1.mp4> <partie2.mp4> <partie3.mp4>

# 2) (optionnel) Régénérer la musique — pip install numpy scipy numba soundfile pyloudnorm
python audio/synth.py

# 3) Prévisualiser / rendre
npm run studio        # éditeur Remotion dans le navigateur
npm run render        # → out/kronos-promo.mp4
```

Les textes se modifient dans `src/scenes/*.tsx`, les timings dans `timeline.json`
(relancer `audio/synth.py` ensuite pour garder le son synchronisé).

## Structure

```
timeline.json          repères partagés vidéo ↔ son (secondes)
src/KronosPromo.tsx    composition principale (empilement des scènes)
src/scenes/            Opening (accroche + logo + portail), Features, Montage, EndCard
src/components/        ScreenCard (écran 3D + caméra), Caption, NavPill, LineChart, …
src/lib/               easings, keyframes, glyphes JetBrains Mono vectorisés, bobines
audio/synth.py         synthèse + mixage + mastering de la bande-son
scripts/               extraction des plans, rendu d'images fixes
```

Polices : JetBrains Mono (celle de l'app) et Inter Tight, toutes deux sous licence OFL.
Remotion est gratuit pour les particuliers et les petites équipes (voir sa licence).
