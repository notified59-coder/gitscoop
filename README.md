# GitScoop

Sign in with GitHub, pick up to 12 public repos, publish one link: `yoursite.com/u/username`.
Visitors read each project's README and browse its code without leaving the page.

**Stack:** React + Vite (client) · Express (API) · libSQL/SQLite or Turso (database) · three.js hero using your `laptop.glb`.

## Run it on your computer

Requires Node 20+.

1. **Create a GitHub OAuth app** at https://github.com/settings/developers → *New OAuth App*
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/github/callback`
   - Copy the Client ID, then generate a Client Secret.
2. Install and create your env file:
   ```bash
   npm install
   cp .env.example .env        # Windows: copy .env.example .env
   ```
3. Fill `.env`: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a `SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Start it:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173. The API runs on :8787 and Vite proxies `/api` to it.

Production check locally: `npm run build && npm start`, with `APP_URL=http://localhost:8787` in `.env` and the OAuth URLs pointed at port 8787.

## Deploy (free)

One Node service serves both the API and the built client. SQLite on a free host's disk is wiped on redeploy, so use **Turso** (free) for the database.

1. **Database:** create a DB at https://turso.tech, then copy its URL (`libsql://…`) and an auth token.
2. **Push to GitHub:** `git init && git add . && git commit -m "GitScoop"`, then push to a new repo.
3. **Host on Render:** *New → Blueprint* (or *Web Service → Docker*) and pick the repo. `render.yaml` is included. Set:
   - `APP_URL` = your live URL, e.g. `https://gitscoop.onrender.com` (no trailing slash)
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `DATABASE_URL`, `DATABASE_AUTH_TOKEN` from Turso
   - `SESSION_SECRET` is generated for you
4. **Update GitHub OAuth:** homepage = `APP_URL`, callback = `APP_URL/api/auth/github/callback`. Easiest is a second OAuth app for production.
5. **Custom domain:** add it in Render → Settings → Custom Domains, set `APP_URL` to it, and update the OAuth callback again.

The same Dockerfile works on Fly.io, Railway, or a VPS. Render's free tier sleeps when idle, so the first visit can take ~30 seconds.

## Notes

- Only **public** repos are listed. OAuth scope is `read:user`.
- Visitors can only fetch files from repos in a **published** portfolio (owners can preview drafts). Paths are validated; responses are cached 5 minutes.
- Portfolios use the owner's own GitHub token, so each user gets their own 5,000 requests/hour. `GITHUB_TOKEN` is an optional fallback.
- GitHub tokens are stored AES-256-GCM encrypted. Sessions are httpOnly SameSite=Lax cookies. CSP, rate limiting and origin checks are on.
- Shared links get a title, description and avatar preview from the server.
- `DELETE /api/me` removes a user and their portfolio.
- The server reads `client/dist/index.html` at startup, so restart after rebuilding.

## Layout

```
server/   index.js (routes) · db.js · github.js · security.js
client/   src/pages (Landing, Dashboard, Portfolio, RepoView) · src/components · styles.css
          public/mascot (Slothy sprites) · public/brand · public/models/laptop.glb
```

## Credits

3D model: "Laptop" (https://skfb.ly/pJZ9p) by TymonG, licensed under Creative Commons Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Credit appears in the site footer; keep it if you edit the footer.
