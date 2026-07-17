# Track Star - MVP

Prototype minimal pour la boucle hebdomadaire, simulation, et UI de démo.

Exécution locale

1. Installer les dépendances Python (recommandé dans un venv):

   pip install flask

2. Lancer le backend (ce serveur sert également l'UI statique) :

   python backend/app.py

   Le serveur écoute sur http://localhost:5000 et sert la page d'interface principale.

3. Ouvrir http://localhost:5000/ dans un navigateur.

Fonctionnalités incluses
- core/athlete.py: modèle Athlete
- core/sim.py: simulate_week + utilitaires
- backend/app.py: endpoints /create, /week, /state et sert l'UI statique
- backend/storage.py: sauvegarde simple en backend_data/save.json
- web/: interface minimale pour tester
- web/static/: emplacement pour les assets (images, audio)
- data/: meets.json et events.json

Prochaines étapes possibles
- Ajouter calendrier complet, ladder de qualification et logique de passage
- Rival system et persistance multi-carrières
- Graphiques et animations (Canvas/GSAP) ou intégrer les animations/properties du jeu original si tu disposes des droits
- Tests unitaires et ajustements d'équilibrage

Note légale
N'utilise pas d'actifs ou de code protégés provenant du jeu original sans permission. Ce projet implémente des mécaniques inspirées mais des assets doivent être originaux ou libres.
