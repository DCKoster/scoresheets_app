# scoresheets_app

Scoresheets is an offline-first browser app for tracking game scores. After the app has loaded once, you can record games and browse your history offline in **Local scoresheets** without an account. Those scorecards and custom templates live in your browser.

Private groups share data through a Cloudflare D1 database under the deployment owner's Cloudflare account. The Scoresheets owner manages accounts, memberships, and group templates. If you've already loaded a group, you can save matches while offline. Pending changes sync when the same account reconnects.

See the [database and account design](docs/database-choices.md).

## Start here

Use the small browser app in [web_app](web_app).

### Web app quick run

1. Serve the app from the project root with `npm start`, then open <http://localhost:8000>.
2. Choose English or Dutch and create a session for Take 5!, Pick-omino/Regenwormen, or a custom game template.
3. Saved sessions and custom games are stored in browser local storage.

### Backup and install

In **Local scoresheets**, use **Export backup** in Session History to save your sessions and custom games as JSON. **Import backup** validates the whole file first and merges records that do not conflict with local IDs or game names. Imported records are stored in your browser.

While signed in and online, use **Copy to group** on a local session in **Session History**. Choose a group and link any players to its members. The group copy keeps the original date and scoring rules. Each original session can be copied once per group, even from overlapping backups on different devices.

To install the app, open it through the local server (or another HTTPS/local development server) in a browser that supports PWAs and use its Install App option. After the first load, turn off the network and reload or navigate within the app to verify the offline shell works.

When changing files listed in `web_app/service-worker.js`, increment `CACHE_VERSION` so installed copies fetch the new shell on their next visit.

Run the dependency-free automated tests with `npm test`.

See [Composable Scoring Architecture](docs/composable-scoring-architecture.md) for advanced scoring ideas that remain deferred.

### Private groups on Cloudflare

The app and `/api` run on the same Workers origin. For local group development, use Node.js 22.12 or later.

1. Run `npm ci`. In an ignored `.dev.vars` file, set `OWNER_RECOVERY_KEY` to a random secret generated with `openssl rand -hex 32`.
2. Run `npm run db:local`, then `npm run dev`. Wrangler uses a local D1 database.
3. Create the first owner and save their credentials to a new private file.

   ```sh
   npm run owner:recover -- http://localhost:8787 .dev.vars /tmp/scoresheets-owner.json owner "Owner"
   ```

4. Sign in with the username and login code. In **Manage groups**, create a group and add members by username. Enter a display name for a new account and optionally an email for contact. Copy the displayed code and share it privately with the username. Adding the same username to another group keeps its code. Replacing a code signs that account out everywhere. Sessions expire after seven days.

Signing out removes cached group history from that browser profile. If there are pending changes, the app asks for confirmation and keeps those changes for the same account to upload after signing back in.

The `preview` and `production` Wrangler environments bind separate D1 databases. For preview, apply `npm run db:preview` and run `npm run deploy:preview` with authorized Wrangler credentials. The login-code migration assigns each existing account the username `account-<account ID>` and invalidates old password sessions and links. Recover the existing owner, then issue new member codes from their group's roster. Account IDs, memberships, match history, and local queues stay in place.

To recover an existing owner, set a temporary `OWNER_RECOVERY_KEY` secret in the target environment, run the command below, then delete the deployment secret. For preview, use `npx wrangler secret put OWNER_RECOVERY_KEY --env preview` and `npx wrangler secret delete OWNER_RECOVERY_KEY --env preview`. Keep version URLs disabled while provisioning the secret so a previous Worker version cannot continue to accept it. The command keeps the owner's identity and writes the replacement code to a new file with owner-only permissions.

```sh
npm run owner:recover -- <origin> <recovery-key-file> <new-owner-credentials-file>
```

Run `npm test` and `npm run build` before deployment. With a disposable backend and a file containing its recovery key, run the API and browser checks as follows. The API check rotates the owner's code. Keep the fixture file outside the repository.

```sh
npx playwright install chromium --only-shell
npm run verify:cloud -- http://localhost:8787 .dev.vars /tmp/scoresheets-fixtures.json
npm run verify:browser -- http://localhost:8787 /tmp/scoresheets-fixtures.json
```

See the [preview verification report](docs/preview-login-code-verification.md) for measured CPU and the Workers Free rollout gate.
