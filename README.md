# Drive-my-Run 🏃

Entraîneur à bips pour séance de course à allure régulière. PWA légère, installable
sur Android et iOS, 100 % hors-ligne.

## Fonctionnement

1. Saisis ton **allure** (min/km) ou ta **vitesse** (km/h), la **durée** de course
   et un **intervalle** en mètres.
2. L'app calcule la distance, le temps de course et l'intervalle de bip :

   ```
   bip (s) = (temps de course / distance) × intervalle (m)
   ```

3. Après le compte à rebours, un **bip (son et/ou vibration)** marque chaque
   intervalle de distance pour t'aider à garder ton allure constante.
4. Enchaîne plusieurs **répétitions** avec un temps de **récupération**
   (pause libre, chrono + bips de fin de récupération).
5. Son distinctif de **fin de séance**, puis récapitulatif.

## Installation (PWA)

- Sers le dossier via n'importe quel hébergement statique (GitHub Pages, Netlify, Vercel…).
- **Android** (Chrome) : menu → *Ajouter à l'écran d'accueil*.
- **iOS** (Safari) : bouton Partager → *Sur l'écran d'accueil*.

## Développement

Aucune dépendance, aucun build. Ouvre simplement `index.html` ou sers le dossier :

```bash
python3 -m http.server 8000
```

> Note : le service worker (hors-ligne) et l'installation nécessitent HTTPS
> (ou localhost).

## Fichiers

- `index.html` / `style.css` — interface
- `app.js` — moteur de séance, bips (Web Audio API), vibrations
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA (hors-ligne, installation)
- `SPECS.md` — spécifications v1
