# SysWatch : démo web

Application web (React + Vite + TypeScript) qui rejoue dans le navigateur le comportement de SysWatch :
l'agent TCP (`src/main.rs`) et la console maître (`src/master.rs`).

- Parc de quatre machines fictives (PC-01 à PC-04, une hors ligne) ; métriques simulées par marche
  aléatoire bornée, rafraîchies toutes les 5 s comme `snapshot_refresher`.
- Console de l'agent : démarrage, journal horodaté `log_event`, messages `msg`, rafraîchissements.
- Client `nc <ip> 7878` : jeton, `OK` / `UNAUTHORIZED`, réponses de `format_response` terminées par `END`.
- Console maître : `scan`, `select <nom>`, `all <cmd>`, commandes relayées aux agents.
- `shutdown`, `reboot`, `abort`, `install` : effets seulement mis en scène, rien n'est exécuté.
- Aucune requête réseau hors Google Fonts. Jeton de démonstration : `DEMO2026`.

```
cd demo-web
npm install
npm run build
```
