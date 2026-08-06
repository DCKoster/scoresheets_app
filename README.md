# scoresheets_app

Web-first scoresheets project.

## Start here

Use the small browser app in [web_app](web_app).

### Web app quick run

1. Serve the app from the project root with `npm start`, then open <http://localhost:8000>.
2. Choose English or Dutch and create a session for Take 5!, Pick-omino/Regenwormen, or a custom game template.
3. Saved sessions and custom games are stored in browser local storage.

### Backup and install

Use **Export backup** in Session History to save your sessions and custom games as JSON. **Import backup** validates the whole file first and merges records that do not conflict with local IDs or game names.

To install the app, open it through the local server (or another HTTPS/local development server) in a browser that supports PWAs and use its Install App option. After the first load, turn off the network and reload or navigate within the app to verify the offline shell works.

When changing files listed in `web_app/service-worker.js`, increment `CACHE_VERSION` so installed copies fetch the new shell on their next visit.

Run the dependency-free automated tests with `npm test`.

See [Manage Games and Scoring Improvements](docs/manage-games-scoring-improvements.md) for the proposed categories, cooperative scoring, and card-based game-management redesign.
