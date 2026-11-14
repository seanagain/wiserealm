# WiseRealm

Turn your question sets and vocabulary lists into live class games. Students sign in with their
school Google account (or play as a guest), design a pixel hero, join with a code, and play on
their iPads while the game runs on the projector. Playing earns coins to spend in the shop.

**Cost: $0.** Plain web files with no build step, hosted free on GitHub Pages, using Supabase's free tier.

## The games

| Game | How it works |
|---|---|
| **Boss Raid** | The class teams up. Correct answers attack the boss; fast answers hit harder. Beat the boss before the questions run out. |
| **Four Corners Dash** | Each answer is a corner of the map. Students tap a corner and their hero runs there (they can switch until time's up). Wrong corners turn to lava. 3 hearts each; knocked-out heroes become ghosts who revive after 2 correct answers in a row. |
| **Treasure Hunt** | A correct answer earns a dig. Diggers pick a spot on the island from their iPads to find gold, gems, chests… or a trap. Luck keeps it close. |

## The pages

| Page | Who uses it |
|---|---|
| `teacher.html` | You. Make question sets, start any of the three games, and see students' coins (**Students & coins**). |
| `host.html` | Opens when you start a game. Put it on the projector. |
| `index.html` | Students join games here (wiserealm.org). |
| `shop.html` | Students design their hero and buy items with coins. |

## Coins and the shop

- Signed-in students earn coins at the end of each game: **20 for playing, 10 per correct answer,
  +30/20/10 for the top 3, +25 if the class beats the boss** (max 300 per game).
- Coins are only awarded when **you are signed in on the projector** as a teacher. The lobby shows
  "Coins: on" or "Coins: off".
- The shop has hats, outfits, capes, face items and pets (30 items, 50–400 coins). Students can try
  anything on before buying. Prices live in the database, so they can't be changed from a browser.
- On **Students & coins** you can give bonus coins (or take some away with a minus number).
- Guests can still play every game; they just don't earn coins.

## Try it right now (Local Test Mode / Preview)

Without Supabase settings, games only connect tabs in the same browser, and accounts run in
**Preview mode** (a pretend account with 500 coins, saved on that device):

1. Open `teacher.html` and click a game on a sample set.
2. Click **+ Add 5 test bots** and/or **Open a test student**.
3. Click **Start game!**

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

### 3. Student accounts with Google sign-in (one-time, about 20 minutes)

**a. Create the database tables.** In Supabase open **SQL Editor → New query**, paste the whole
file `supabase/schema.sql`, and click **Run**. (Safe to run again after updates.)

**b. Make yourself the teacher.** In the SQL Editor run (with your own email):

```sql
insert into public.teachers (email) values ('you@yourschool.org');
```

**c. Create a Google sign-in key** at **console.cloud.google.com** (any Google account works):
1. Create a project called `WiseRealm`.
2. **APIs & Services → OAuth consent screen**: choose **External**, app name `WiseRealm`, your email
   as support/contact email. Add the scopes `email`, `profile`, `openid` only. Then **Publish app**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Authorized JavaScript origins: `https://wiserealm.org`
   - Authorized redirect URIs: `https://jcmaiiubsvtrfbamaaqh.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

**d. Turn on Google in Supabase.** **Authentication → Sign In / Providers → Google**: switch it on,
paste the Client ID and Client secret, and save. Then **Authentication → URL Configuration**:
- Site URL: `https://wiserealm.org`
- Redirect URLs: add `https://wiserealm.org/**`

**e. Ask your school's IT admin to allow WiseRealm.** Google Workspace for Education blocks
students under 18 from signing in to outside apps unless an admin allows them. Give IT the
**Client ID** from step c and ask them to mark it as **Trusted** in the Admin console
(**Security → Access and data control → API controls → Manage third-party app access**).
Until then, students can still play as guests.

**What's stored about students:** their Google email, first name and last initial, their hero,
coins and items. Nothing else. No passwords are ever seen by WiseRealm.

## Boss Raid details

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
index.html  teacher.html  host.html  shop.html
css/style.css          fonts/ (pixel fonts, open license)
js/config.js           ← your Supabase settings
js/supa.js             accounts, coins, shop (Supabase or Preview mode)
js/net.js              live game messaging
js/host.js             projector game engine (lobby, questions, scoring, coins)
js/modes/raid.js       Boss Raid
js/modes/corners.js    Four Corners Dash
js/modes/treasure.js   Treasure Hunt
js/play.js             student iPad screens
js/shop.js             the shop
js/items.js            shop items (pixel art + prices)
js/avatar.js           hero art     js/boss.js  boss art     js/sound.js  chiptune sounds
js/sets.js             question sets     js/teacher.js  teacher page
supabase/schema.sql    database tables and rules
tools/gen-shop-sql.mjs copies item prices from js/items.js into schema.sql
```

**Changing a price or adding an item:** edit `js/items.js`, run `node tools/gen-shop-sql.mjs`,
then run `supabase/schema.sql` again in the Supabase SQL Editor.

## Roadmap
1. ✅ Question editor + Boss Raid
2. ✅ Four Corners Dash
3. ✅ Treasure Hunt
4. ✅ Google sign-in, coins and the item shop
5. Next ideas: question sets saved to your account, class rosters, more games and items
