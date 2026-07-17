# Track Star - MVP

Prototype minimal pour la boucle hebdomadaire, simulation, et UI de démo.

Exécution locale

1. Installer les dépendances Python (recommandé dans un venv):

   pip install flask

2. Lancer le backend:

   python backend/app.py

   Le serveur écoute sur http://localhost:5000

3. Ouvrir web/index.html dans un navigateur (ou servir le dossier web avec un serveur statique)

Fonctionnalités incluses
- core/athlete.py: modèle Athlete
- core/sim.py: simulate_week + utilitaires
- backend/app.py: endpoints /create, /week, /state
- backend/storage.py: sauvegarde simple en backend_data/save.json
- web/: interface minimale pour tester
- data/: meets.json et events.json

Prochaines étapes possibles
- Ajouter calendrier complet, ladder de qualification et logique de passage
- Rival system et persistance multi-carrières
- Graphiques et animations (Canvas/GSAP)
- Tests unitaires et ajustements d'équilibrage

Note légale
N'utilise pas d'actifs ou de code protégés provenant du jeu original sans permission. Ce projet implémente des mécaniques inspirées mais des assets doivent être originaux ou libres.
