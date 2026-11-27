# Club Onyx — website

Static site for **Club Onyx**, New Campton's largest nightlife venue — an underground club
behind a plain garage door on Vane Street.

Plain HTML, CSS and JavaScript. A few small serverless endpoints handle staff login and saving
content; everything else is static.

| File | What it is |
| --- | --- |
| `index.html` | Home: hero, rotating Cartier banner, about, next night, team preview, gallery, careers |
| `team.html` | The roster, rendered from content and grouped by department |
| `events.html` | Calendar, filters, reservations, past nights, house rules |
| `careers.html` | Open positions; applications go through Discord |
| `contact.html` | Guest list, tables, private hire, contact form |
| `admin.html` | Staff editor: events and team (sign-in required) |
| `assets/data/content.json` | Events + team — the site's single source of truth |
| `assets/site.js` | Nav, countdowns, calendar, team, reservations, forms |
| `assets/admin.js` | Staff editor (talks to `/api`) |
| `assets/style.css` | All styling |
| `api/` | Serverless endpoints: login, logout, session, content |
| `server.mjs` | Local dev server (static + `/api`), no dependencies |

## Run it locally

```bash
npm run dev          # = node server.mjs, serves http://localhost:3000
```

The local server also runs the `/api` routes, so the staff editor works offline. Use it
rather than double-clicking files: the calendar and roster are loaded with `fetch()`.

### One-time admin setup for local development

```bash
cp .env.example .env
node scripts/hash-password.mjs "a long admin password"   # prints ADMIN_PASSWORD_HASH=…
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
# set ADMIN_USERNAME too if you do not want the default "admin"
```

Paste both values into `.env`, then restart `npm run dev`. `.env` is gitignored — never
commit it.

## Security model

The admin panel is not a hidden page with a password in JavaScript any more. What happens now:

- **Username and password are checked on the server.** Only `ADMIN_USERNAME` and
  `ADMIN_PASSWORD_HASH` exist server-side; the password never reaches the browser. Hashing is
  **scrypt** (N=65536, r=8, 64 MB per attempt, random salt) rather than a bare SHA-256 digest:
  SHA-256 is deliberately fast, so leaked hashes can be brute-forced at billions of guesses a
  second, while scrypt is slow and memory-hungry by design. Both comparisons are constant-time,
  and the password is hashed even when the username is wrong so timing leaks nothing.
- **Sessions are signed.** Login returns an `HttpOnly`, `SameSite=Strict` cookie containing an
  HMAC-SHA256 signed token with an 8-hour expiry and a random ID. JavaScript cannot read it, so
  XSS cannot steal it. `Secure` is added on HTTPS.
- **Cross-site requests are refused.** Every mutating request checks `Origin` against `Host`, so
  another site cannot post to the API with a borrowed cookie.
- **Login is rate limited** (8 attempts per 15 minutes per IP; saves 30 per 5 minutes). The
  limiter is in memory, so on serverless it is per instance — a speed bump, not a full ban.
- **Everything saved is validated** against a schema (lengths, allowed tags/statuses, `https://`
  photo URLs, max 200 events / 100 people).
- **Publishing goes through GitHub.** Saves commit `assets/data/content.json` with a
  server-side token; no token or write path is exposed to the browser.

What this is not: there are no user accounts, no password reset flow and no audit log. The
public site and `content.json` are readable by anyone — never put private information there.
Do not reuse a password you use anywhere else.

### Environment variables

| Name | Where | What it does |
| --- | --- | --- |
| `ADMIN_USERNAME` | local `.env` + Vercel | username for the admin panel (defaults to `admin`) |
| `ADMIN_PASSWORD_HASH` | local `.env` + Vercel | scrypt hash from `scripts/hash-password.mjs` |
| `SESSION_SECRET` | local `.env` + Vercel | 32+ random chars used to sign session cookies |
| `GITHUB_TOKEN` | Vercel | fine-grained token with **Contents: Read and write** on this repo |
| `GITHUB_REPO` | Vercel | `owner/repo`, e.g. `unknownbigmanting/onyxsite` |
| `GITHUB_BRANCH` | Vercel (optional) | defaults to `main` |
| `ALLOW_LOCAL_STORE` | local only | `1` writes `content.json` on disk instead of GitHub |
| `APP_ORIGIN` | optional | public origin, e.g. `https://club-onyx.vercel.app`, for proxies that rewrite the `Host` header |

Create the token at GitHub → Settings → Developer settings → **Fine-grained tokens** → only
select this repository → Repository permissions → Contents: **Read and write**. Paste it into
Vercel, never into a file in the repo.

## Content

### Events

`content.json` → `events`. Each entry:

```json
{
  "id": "after-hours-dec-12",
  "title": "After Hours",
  "date": "2026-12-12T22:00:00",
  "displayDate": "Saturday 12 December 2026",
  "time": "22:00 – 04:00",
  "venue": "Main Floor + The Vault",
  "tags": ["club"],
  "status": "open",
  "statusLabel": "Guest list open",
  "entry": "Free before 23:00 · $10 after",
  "description": "One or two lines for the card.",
  "featured": true
}
```

- `date` drives the countdown, date badge and next-night panel. Past events stay in the file
  but stop being promoted.
- `tags` are `club`, `music`, `community`, `special` — they match the filter buttons.
- `status` is `open` (green), `limited` or `announced` (blue), `soldout` (grey).
- The soonest future event is promoted automatically; `featured` pins a different one.

### Team

`content.json` → `team`. People are grouped on `team.html` by `dept`, in the order they
appear. `tags` are free text (Booking, Brand, Since 2021, Cool…). `photo` takes an `https://`
URL — leave it empty and the card shows initials. `featured` puts someone in the home preview.

### Editing in the browser

Open `/admin.html`, sign in with the password you hashed, then use the **Events** and **Team**
tabs. Nothing is written until you press **Save changes**; that commits `content.json` to the
repository, Vercel redeploys, and the live site updates in under a minute.

If the API is unreachable (for example the site is served by a plain static server), the
editor tells you — it will not pretend to save.

## Reservations

Each event card has **Reserve**, which fills the reservation form on `events.html`
(`#reserve`): night, name, Discord, party size, booking type (guest list / table / booth /
private hire) and notes. That is the logistics sheet you need at the door.

Delivery uses the same form pipeline as everything else: set `formEndpoint` in
`assets/config.js` to a free [Formspree](https://formspree.io) / [Basin](https://usebasin.com) /
[Getform](https://getform.io) endpoint and each reservation lands in your inbox with every
field labelled. With `formEndpoint` empty, the form opens the visitor's mail app pre-filled.

Reservations are **not** stored in the repository — only events and team are. Keep them in
the inbox, a spreadsheet or your Discord.

## Careers

`careers.html` lists the four open roles and sends people to the club's Discord
(`https://discord.gg/SFBC8bg79z`) to apply — there is no application form on the site. The same
invite powers the Discord icon in the header and the footer button; it is set in
`assets/config.js` (`links.discord`) and in the header/footer markup.

## Deploy to Vercel (free `.vercel.app` domain)

1. Push the repository to GitHub (already done for `onyxsite`).
2. Vercel → **Add New → Project** → import the repo. Framework preset **Other**, no build
   command, no output directory.
3. Add the environment variables from the table above (at least `ADMIN_PASSWORD_HASH`,
   `SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`).
4. Deploy, then test `/admin.html` on the live URL: sign in, change an event, save, confirm
   the commit appears in GitHub and the site updates.
5. Rename the subdomain under **Settings → Domains** while it is free.

The `/api` folder is detected automatically as Node functions — no `vercel.json` needed.

## Images

| File | Used for |
| --- | --- |
| `onyx-wordmark.jpg` | About panel + social preview |
| `venue-angle.jpg` | Hero background |
| `venue-sign.jpg`, `venue-bar.jpg` | "The room" gallery |
| `favicon.svg` | Browser tab icon |

Replace any file keeping the name. Keep `venue-angle.jpg` wide and dark on the left so the
hero copy stays readable.

## Notes

- Fonts (Archivo for headings, Inter for body) load from Google Fonts; images are local.
- The venue holds 85 people: one basement, opened 2019.
- Motion respects `prefers-reduced-motion`.
- All names, figures, prices and events are fictional, for the New Campton roleplay setting.
