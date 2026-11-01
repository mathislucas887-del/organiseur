# Organiseur
App web (journal, rêves, planning, plats, recettes, tâches, livres, films/séries, podcasts). Node 22+, SQLite (`DB_PATH`).

`node server.js` puis http://localhost:8080/app/

## Persistance
Définir `DATABASE_URL` (Postgres, ex. Neon gratuit) : toutes les données sont stockées dans cette base externe et survivent aux redémarrages/mises en veille de Render. Sans `DATABASE_URL`, SQLite local (`DB_PATH`).
