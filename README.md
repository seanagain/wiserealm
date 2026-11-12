# WiseRealm: Boss Raid (Step 1)

Turn your question sets and vocabulary lists into a live class game. Students make a hero on
their iPad, join with a code, and the whole class fights a boss on the projector by answering
questions correctly.

**Cost: $0.** It's plain web files with no build step. It runs on free GitHub Pages hosting
and Supabase's free tier.

## The pages

| Page | Who uses it |
|---|---|
| `teacher.html` | You. Make and edit question sets, paste from Google Sheets or Flippity, and start a game. |
| `host.html` | Opened automatically when you click **Boss Raid**. Put it on the projector. |
| `index.html` | Students. They go to the site's main address on their iPads. |

## Try it right now (Local Test Mode)

With no Supabase connection, the game runs in **Local Test Mode**. Everything works, but only
between tabs in the same browser on one computer:

1. Open `teacher.html` and click **⚔ Boss Raid** on a sample set.
2. Click **+ Add 5 test bots** and/or **Open a test student** (opens a student tab).
3. Click **Start battle**.

## Going live with student iPads (one-time setup, about 15 minutes)

### 1. Create a free Supabase project (this relays messages between iPads and the projector)
1. Go to **supabase.com** and click **Start your project**. Sign in with GitHub.
2. Click **New project**. Name it `wiserealm`, make up a database password (save it somewhere), pick the region closest to you, and choose the **Free** plan.
3. When it finishes setting up, open **Project Settings → API Keys**. Find the **Legacy API keys** tab and copy the **`anon` `public`** key.
4. Open **Project Settings → Data API** (or the **Connect** button) and copy the **Project URL** (it looks like `https://abcdefgh.supabase.co`).
5. Paste both into `js/config.js`:
   ```js
   export const CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   };
   ```
   The anon key is designed to be public in web pages, so it's safe to put here.
   (Never put the `service_role` / secret key here.)

No database tables are needed for Step 1. The game uses Supabase "Realtime" messaging only.

> Free Supabase projects pause after about a week of no use. The keep-awake ping below
> prevents that. If games ever stop connecting, log in to Supabase and click **Restore project**.

### Keep-awake ping (stops the free project from pausing)
A GitHub Action (`.github/workflows/keepalive.yml`) reads one row from a tiny table every 3 days.
One-time setup: in Supabase open **SQL Editor → New query**, paste this, and click **Run**:

```sql
create table if not exists public.keepalive (
  id int primary key,
  pinged_at timestamptz default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security;
drop policy if exists "Anyone can read keepalive" on public.keepalive;
create policy "Anyone can read keepalive" on public.keepalive for select using (true);
```

Then on GitHub, open the repo's **Actions** tab → **Supabase keep-awake ping** → **Run workflow** to test it.
A green check means it works. If a ping ever fails, GitHub emails you.

### 2. Put the site online with GitHub Pages (free)
The code lives at https://github.com/seanagain/wiserealm.

1. In the repo on GitHub, go to **Settings → Pages**.
2. Under "Build and deployment", choose **Deploy from a branch**, then the `main` branch and `/ (root)` folder. Click **Save**.
3. After a minute or two your site is live:
   - Students go to **https://wiserealm.org** (or scan the QR code on the projector).
   - You go to **https://wiserealm.org/teacher.html**.

### Custom domain: wiserealm.org
The `CNAME` file in this repo tells GitHub Pages to serve the site at `wiserealm.org`.
At your domain registrar's DNS settings, add these records (delete any existing "parking" A/CNAME records for `@` and `www` first):

| Type | Host / Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | seanagain.github.io |

Then in the repo's **Settings → Pages**, make sure **Custom domain** shows `wiserealm.org`, wait for the
DNS check to pass, and tick **Enforce HTTPS**. DNS changes can take from a few minutes up to 24 hours.

Recommended: verify the domain in your GitHub account (**Settings → Pages → Add a domain**, under your
profile settings, not the repo) so no one else can ever point it at their own GitHub site.

Any change pushed to the `main` branch updates the live site automatically.

**Tip for iPads:** In Safari, tap Share → **Add to Home Screen** so WiseRealm opens like an app.

## How Boss Raid works

- **Boss health** scales with the number of players and questions, so the class needs roughly
  65–70% correct to win.
- **Damage:** a correct answer deals 100 plus a speed bonus of up to 100. Three or more correct in
  a row gives +25%. Wrong or no answer deals 0.
- **Boss heals** 5% if fewer than 40% of the class gets a question right, so everyone has a reason
  to try.
- The projector only shows the **top 5**. Each student sees their own rank on their iPad.
- **Click a hero** in the lobby to remove them (for example, an inappropriate name).
- Keyboard: **Space / Enter** starts the game and goes to the next question.

## Question sets

- Sets are saved **in your browser** on the computer you use. Use **Download backup** on the
  teacher page to keep a copy or move sets to another computer. (Step 4 moves them to the cloud.)
- **Pasting from Google Sheets / Flippity:** select the cells, copy, paste.
  - Column 1 = question/word, column 2 = answer/definition, extra columns = wrong answers.
  - A header row (Front/Back, Question/Answer, Term/Definition, …) is detected and skipped.
  - With only two columns, wrong choices are borrowed from the other answers. This is great for vocab.
  - An answer of `True` / `False` becomes a True/False question.
- **Flip vocab cards** (in game settings) shows the definition and asks for the word.

## Files

```
index.html  teacher.html  host.html
css/style.css
js/config.js   ← your Supabase settings
js/net.js      messaging (Supabase or local test mode)
js/sets.js     question sets, spreadsheet paste, question building
js/avatar.js   hero character art (layers, ready for shop items later)
js/boss.js     boss art
js/host.js     projector game logic
js/play.js     student iPad screens
js/teacher.js  teacher page
js/sound.js    sound effects
```

## Roadmap
1. ✅ Question editor + Boss Raid
2. Four Corners Dash (tap-to-move)
3. Treasure Island
4. Student accounts, coins, and the item shop
