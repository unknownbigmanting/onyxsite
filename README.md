# Club Onyx — website

Static site for **Club Onyx**, New Campton's largest nightlife venue — an underground club
behind a plain garage door on Broad St.

Plain HTML, CSS and JavaScript. A few small serverless endpoints handle staff login and saving
content; everything else is static.

| File | What it is |
| --- | --- |
| `index.html` | Home: hero, rotating Cartier banner, about, next night, team preview, gallery, careers |
| `team.html` | The roster, rendered from content and grouped by department |
| `events.html` | Calendar, filters and house rules |
| `reserve.html` | Reservation form: night, party size, price, paid at the door |
| `careers.html` | Open positions; applications go through Discord |
| `contact.html` | Contact form and address |
| `admin.html` | Staff editor: events, team, reservations and prices |
| `assets/data/content.json` | Events + team — the site's single source of truth |
| `assets/data/reservations.json` | Reservations plus the prices set in the admin panel |
| `assets/site.js` | Nav, countdowns, calendar, team, reservations, forms |
| `assets/admin.js` | Staff editor (talks to `/api`) |
| `assets/style.css` | All styling |
| `api/` | Serverless endpoints: login, logout, session, content, reserve, reservations |
| `server.mjs` | Local dev server (static + `/api`), no dependencies |

## Run it locally

```bash
npm run dev          # = node server.mjs, serves http://localhost:3000
```

The local server also runs the `/api` routes, so the staff editor works offline. Use it
rather than double-clicking files: the calendar and roster are loaded with `fetch()`.

### The owner account

There is **one** admin account, and it is created on the site rather than in a terminal:

1. Open `/admin.html` (or `http://localhost:3000/admin.html` locally).
2. If no account exists yet, the page shows **Create the owner account**. The first person to
   finish that form (username + a password of 12+ characters) owns the panel.
3. It is stored as `assets/data/admin.json` — username plus a scrypt hash, never the password —
   and the setup form then locks itself for good.

The session cookie needs `SESSION_SECRET` (32+ random characters). Locally that means a `.env`
file: `cp .env.example .env`, then start the dev server. On Vercel it is a single environment
variable. On Vercel the account file is written to the repository through `GITHUB_TOKEN`, so
that variable must be set or setup cannot be saved.

To start over, delete `assets/data/admin.json` and redeploy. `ADMIN_USERNAME` and
`ADMIN_PASSWORD_HASH` still work as an email-free fallback while no account file exists.

## Security model

The admin panel is not a hidden page with a password in JavaScript any more. What happens now:

- **One account, checked server-side.** The owner is created once at `/admin.html` and stored as
  a **scrypt** hash (N=65536, r=8, 64 MB per attempt, random salt) — not a bare SHA-256 digest,
  which is fast enough to grind through billions of guesses a second. The password never reaches
  the browser, and the password is hashed even when the username is wrong so timing leaks
  nothing.
- **Sessions are HS256 JWTs.** Login returns an `HttpOnly`, `SameSite=Strict` cookie holding a
  JWT with an `{"alg":"HS256","typ":"JWT"}` header, signed with `SESSION_SECRET` over
  `header.payload`, compared in constant time, expiring after eight hours. JavaScript cannot read
  the cookie, so XSS cannot lift it, and `Secure` is added on HTTPS.
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
| `SESSION_SECRET` | local `.env` + Vercel | 32+ random chars, the HS256 key for session cookies (required) |
| `ADMIN_USERNAME` | optional | fallback login while no `admin.json` exists |
| `ADMIN_PASSWORD_HASH` | optional | fallback scrypt hash from `scripts/hash-password.mjs` |
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
  "id": "new-year-blue-dec-31",
  "title": "New Year in Blue",
  "date": "2026-12-31T21:00:00",
  "displayDate": "Thursday 31 December 2026",
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
- `tags` are `club`, `community`, `special` — they match the filter buttons.
- `status` is `open` (green), `limited` or `announced` (blue), `soldout` (grey).
- The soonest future event is promoted automatically; `featured` pins a different one.

### Team

`content.json` → `team`. People are grouped on `team.html` by `dept`, in the order they
appear. `tags` are free text (Booking, Brand, Since 2021, Cool…). `photo` takes an `https://`
URL — leave it empty and the card shows initials. `featured` puts someone in the home preview.

### Editing in the browser

Open `/admin.html`, sign in with the password you hashed, then use the **Events**, **Team** and
**Reservations** tabs. Events and team wait for **Save changes**; that commits `content.json`
to the repository, Vercel redeploys, and the live site updates in under a minute. Reservation
changes and prices save as you make them.

If the API is unreachable (for example the site is served by a plain static server), the
editor tells you — it will not pretend to save.

## Reservations

`reserve.html` is the only booking form. A visitor picks a night, gives a name and Discord,
the party size and what they need (guest list, table or the VIP booth). The page shows the
price live, they tick to confirm the amount, and nothing is charged online — they pay at the
door.

Prices live in the admin panel under **Reservations → Prices**: guest list is per person, table
and VIP booth are one price for the group. Each booking is stored in
`assets/data/reservations.json` with its night, party size, amount and an `ONX-…` reference,
and the panel lists who is coming, what they owe and whether it has been paid.

`/api/reserve` recomputes the price on the server (the browser cannot choose what it pays),
rate-limits submissions and uses the same origin check as the rest of the API.
`reservations.json` holds names and Discord handles — treat the repository as private data,
keep it private on GitHub, or move that file somewhere only you can read before taking real
bookings.

## Careers

`careers.html` lists the four open roles and sends people to the club's Discord
(`https://discord.gg/SFBC8bg79z`) to apply — there is no application form on the site. The same
invite powers the Discord icon in the header and the footer button; it is set in
`assets/config.js` (`links.discord`) and in the header/footer markup.

## Deploy to Vercel (free `.vercel.app` domain)

1. Push the repository to GitHub (already done for `onyxsite`).
2. Vercel → **Add New → Project** → import the repo. Framework preset **Other**, no build
   command, no output directory. `/api` becomes serverless functions automatically, and
   `.vercelignore` keeps the private data files out of the public upload.
3. Environment variables (Production and Preview): `SESSION_SECRET`, `GITHUB_TOKEN`,
   `GITHUB_REPO`. No `ADMIN_*` values are needed any more.
4. Deploy, open `https://your-site.vercel.app/admin.html` and create the owner account on that
   first visit. Then change an event, save, and confirm the commit appears in GitHub.
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
- `assets/data/admin.json` holds the owner username and scrypt hash, and
  `assets/data/reservations.json` holds guest names and Discord handles. Both are committed to
  the repository: keep the repo **private**, and never link those files directly.
- All names, figures, prices and events are fictional, for the New Campton roleplay setting.
