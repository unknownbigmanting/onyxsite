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
| `tickets.html` | Upcoming nights and the ticket checkout (IC name, Roblox username, quantity) |
| `careers.html` | Open positions, the application form and the status tracker |
| `contact.html` | Contact form and address |
| `admin.html` | Staff editor: events, team, orders and applications |
| `assets/data/content.json` | Events + team — the site's single source of truth |
| `assets/data/orders.json` | Ticket orders, one entry per checkout |
| `assets/data/applications.json` | Crew applications and their statuses |
| `assets/site.js` | Nav, countdowns, calendar, team, tickets, applications, forms |
| `assets/admin.js` | Staff editor (talks to `/api`) |
| `assets/style.css` | All styling |
| `assets/fonts/` | Self-hosted Archivo and Inter (variable woff2, latin subset) |
| `api/` | Serverless endpoints: login, logout, session, setup, content, orders, applications |
| `scripts/dev-server.mjs` | Local dev server (static + `/api`), no dependencies |

## Run it locally

```bash
npm run dev          # = node scripts/dev-server.mjs, serves http://localhost:3000
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
  "timezone": "GMT",
  "venue": "Main Floor + The Vault",
  "tags": ["club"],
  "status": "open",
  "statusLabel": "Guest list open",
  "entry": "Free before 23:00 · $10 after",
  "ticket": 25,
  "description": "One or two lines for the card.",
  "featured": true
}
```

- In the editor the date is typed as **dd/mm/yy** with a 24-hour start time; `date` is stored
  as ISO (`2026-12-31T21:00:00`) and drives the countdown, date badge and next-night panel.
  Past events stay in the file and on the events page but drop out of the countdown.
- `timezone` (`GMT`, `BST`, `CET`, `EST`, `PST`) is the label shown next to the time.
- `ticket` is the price of one ticket for that night, charged at the door. `0` means free.
- `tags` are `club`, `community`, `special` — they match the filter buttons.
- `status` is `open` (green), `limited` or `announced` (blue), `soldout` (grey).
- `featured` pins one night into the big panel on the home page. **Only one event can be
  featured** — the editor unpins the others, and the server keeps just the first. With nothing
  featured the home page panel is hidden; `events.html` still shows the soonest night.

### Team

`content.json` → `team`. People are grouped on `team.html` by `dept`, in the order they
appear. `tags` are free text (Booking, Brand, Since 2021, Cool…). `photo` takes an `https://`
URL — leave it empty and the card shows initials. `featured` puts someone in the home preview.

### Backup

**Your data** at the bottom of the editor has a **Download backup** button. It writes one JSON
file to your computer (`club-onyx-backup-YYYY-MM-DD.json`) with everything the site knows:

```json
{ "exported": "…", "site": "Club Onyx", "content": { "events": [], "team": [] }, "orders": [], "applications": [] }
```

It is built in your browser from the same data the site serves — nothing is uploaded anywhere.
To restore, copy `content.events` and `content.team` back into `assets/data/content.json` and
the `orders` / `applications` arrays into `assets/data/orders.json` and
`assets/data/applications.json` (on GitHub or in the repo), then press **Save changes** once in
the editor so the deployment picks it up.

### Editing in the browser

Open `/admin.html`, sign in with the password you hashed, then use the **Events**, **Team** and
**Reservations** tabs. Events and team wait for **Save changes**; that commits `content.json`
to the repository, Vercel redeploys, and the live site updates in under a minute. Reservation
changes and prices save as you make them.

If the API is unreachable (for example the site is served by a plain static server), the
editor tells you — it will not pretend to save.

## Tickets

`tickets.html` is the checkout. It lists the upcoming nights (from `content.json`), each with
the price set on that event, and the form asks for the night, how many tickets, an **IC name**
and a **Roblox username**. The total is shown live and must be confirmed, nothing is charged
online, and the order is paid at the door — the door team looks it up by IC name or Roblox
username.

Set the price per night in **Events**: the event form has a **Ticket price ($)** field, `0`
meaning free entry (you still collect an order so you know who is coming).

Each checkout is stored in `assets/data/orders.json` with its `ONX-…` reference, night, ticket
price, quantity, total and status. The **Orders** tab in the admin panel lists them, totals the
tickets and the cash still due, and lets you mark an order paid or delete it.

`/api/orders` looks the event up on the server and prices the order itself (the browser cannot
choose what it pays), rate-limits submissions and uses the same origin check as the rest of the
API. `orders.json` holds names and Roblox usernames — treat the repository as private data and
keep it private on GitHub.

## Careers and applications

`careers.html` lists the four open roles and carries the application itself: one form asking
for Roblox username, Discord username, IC name, timezone, the role, whether they have a gun
licence, whether they have the melee gamepass, why they are suitable, their experience and
anything extra. Each role card has an **Apply** button that opens the form with that role
already picked.

Applications are stored in `assets/data/applications.json` with an `APP-…` reference and the
status `received`. The card beside the form is the tracker: the applicant types the Roblox
username they applied with and sees their status, the role, the dates, any note the club added
and a four-step timeline (Submitted → In review → Interview → Decision).

Statuses are `received`, `review`, `interview`, `accepted` and `declined`. The **Applications**
tab in the admin panel lists every application with its full answers, sets the status, and has
a **decision box** (up to 800 characters, line breaks kept) where you write the answer the
applicant reads with their status — accepted with a time and door, or a short no. Each change
saves immediately, and the decision box autosaves: every keystroke keeps a draft in the
browser's `localStorage`, and the note is committed to GitHub **at most once every 10 seconds**
while you type, plus immediately when you leave the box. That keeps typing from firing a Vercel
deploy per pause. The box says **Draft kept · saves every 10s**, then **Saving…**, then
**Saved**; a draft left over from a closed tab is restored and pushed on the next visit, and the
row is never re-rendered, so the cursor stays where it was.

`/api/applications` takes a POST from anyone (rate-limited, one open application per username),
answers `?username=` lookups with only that applicant's status and note, and keeps the full
list owner-only. `applications.json` sits in `.vercelignore` with the other private data files
and is never served as a static file.

The Discord invite (`https://discord.gg/SFBC8bg79z`) is still there for questions; it is set in
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

**If the deployed site loads as plain unstyled text**, Vercel picked the dev server as the
app: the project's **Framework Preset** was left on **Node.js/Express** instead of **Other**.
Only `index.html` and `package.json` reach the function then, so every `/assets/...` file and
every other page 404s. Fix it in **Settings → General → Framework Preset → Other** (also clear
**Build Command**, **Output Directory** and **Install Command**), then **Deployments → ⋯ →
Redeploy** without the build cache. The dev server now lives in `scripts/`, which
`.vercelignore` hides, so there is nothing at the root for Vercel to mistake for a server.

## Images

| File | Used for |
| --- | --- |
| `onyx-wordmark.jpg` | About panel + social preview (1024², desktop) |
| `onyx-wordmark-640.jpg` | Same wordmark for phones — `index.html` serves it under 760px |
| `venue-angle.jpg` | Hero background |
| `venue-sign.jpg`, `venue-bar.jpg` | "The room" gallery |
| `favicon.png` | Browser tab icon — the ONYX wordmark cropped out of `onyx2.webp` |

Replace any file keeping the name. Keep `venue-angle.jpg` wide and dark on the left so the
hero copy stays readable.

## Notes

- Fonts (Archivo for headings, Inter for body) are self-hosted from `assets/fonts/` as two
  variable woff2 files — no Google Fonts request blocks the first paint, and nothing breaks if
  a third-party font host is blocked or slow.
- The home page preloads the hero photo and lazy-loads the wordmark; the wordmark is stored at
  ~160 KB so the about panel does not hold up the page.
- The venue holds 85 people: one basement, opened 2019.
- Motion respects `prefers-reduced-motion`.
- `assets/data/admin.json` holds the owner username and scrypt hash,
  `assets/data/orders.json` holds IC names and Roblox usernames, and
  `assets/data/applications.json` holds Discord names, answers and application statuses. They
  are committed to the repository: keep the repo **private**, and never link those files
  directly.
- All names, figures, prices and events are fictional, for the New Campton roleplay setting.
