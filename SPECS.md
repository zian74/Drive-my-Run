# Drive-my-Run — Spécifications (v1)

## Objectif

Entraîneur à bips pour séance de course à allure régulière : l'app émet un bip à
intervalle de distance régulier pour aider le coureur à garder une allure
constante (ex. : un bip tous les 200 m). Utilisable sur Android et iOS comme
PWA (installable, fonctionne hors-ligne).

## Saisies utilisateur

1. **Allure** (min/km) **ou** vitesse (km/h) — saisie au choix, conversion automatique
2. **Durée** de la course (mm:ss ou minutes)
3. **Intervalle** en mètres (distance entre chaque bip)
4. **Paramètres de séance :**
   - Bip : **son** et/ou **vibration** (au choix)
   - **Compte à rebours de départ** : durée paramétrable (ex. 3, 5, 10 s)
   - **Répétitions** : nombre de fois que la séance est répétée (≥ 1)
   - **Récupération** : durée de récupération entre les séances (mm:ss)

## Calculs

1. **Distance totale** (par séance) = vitesse × durée
2. **Temps de course** (par séance) = durée saisie
3. **Intervalle de bip** (secondes) = (temps (2) / distance (1)) × intervalle en mètres

Exemple : 12 km/h, 10 min, bip tous les 200 m
→ Distance = 2 km ; bip = (600 s / 2000 m) × 200 m = **60 s**

## Déroulé de la séance

1. Clic **Démarrer**
2. **Compte à rebours de départ** (bip/vibration à chaque seconde, bip distinctif sur « 0 »)
3. **Course** : chrono, bips (son et/ou vibration) à chaque intervalle,
   affichage du temps écoulé, du temps restant et du nombre d'intervalles franchis
4. **Fin de séance** : son distinctif
5. Si répétitions > 1 : **récupération** — pause libre, chrono affiché,
   bips/vibrations de compte à rebours sur la fin (mêmes réglages que le départ),
   puis compte à rebours et séance suivante
6. **Écran récapitulatif** : séances effectuées, distance totale, temps total

## Contrôles

- Démarrer / Pause / Reprendre / Arrêter (annule tout)
- Tout fonctionne hors-ligne : sons générés en Web Audio API, vibration via l'API Vibration

## Technique

- PWA légère, une seule page, installable Android/iOS, plein écran, hors-ligne
- Stockage : préférences sauvegardées localement (localStorage)
- Aucune donnée envoyée sur un serveur

## Hors périmètre v1

- Comptes utilisateurs / synchronisation cloud
- Suivi GPS
- Partage social
- Appareils connectés (montre, cardio)
