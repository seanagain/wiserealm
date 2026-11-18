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
| **Mr. C’s Maze** | (Optional **⚡ Edison Mode**: purple maze with lightning bolts to zap the Mr. C’s.) Students steer their heroes with arrow buttons on their iPads. Locked gates need a correct answer (everyone unlocks their own). A wild Mr. C roams the maze: if he catches you, answer right to bonk him away or lose a heart. Escape for a big bonus. Everyone plays at their own pace; settings for maze size, time limit and number of Mr. C’s. |

## The pages

| Page | Who uses it |
|---|---|
| `teacher.html` | You. Make question sets, start any of the three games, and see students' coins (**Students & coins**). |
| `host.html` | Opens when you start a game. Put it on the projector. |
| `index.html` | Students join games here (wiserealm.org). |
| `shop.html` | Students design their hero and buy items with coins. |
| `me.html` | Students' profile: join a class, see their stats, progress chart and badges. |

## Coins and the shop

- Signed-in students earn coins at the end of each game: **20 for playing, 10 per correct answer,
  +30/20/10 for the top 3, +25 if the class beats the boss** (max 300 per game).
- Coins are only awarded when **you are signed in on the projector** as a teacher. The lobby shows
  "Coins: on" or "Coins: off".
- The shop has hats, outfits, capes, face items and pets (30 items, 50–400 coins). Students can try
  anything on before buying. Prices live in the database, so they can't be changed from a browser.
- On **Students & coins** you can give bonus coins (or take some away with a minus number).
- Guests can still play every game; they just don't earn coins.

## Classes and progress

- On the teacher page, **📊 Classes & progress → Create class** (e.g. "Grade 8 · Period 2"). Each class
  gets a 6-letter code. Click **Show join code** to put it on the projector.
- Students join from **wiserealm.org/me.html** (their profile page) by typing the code, or automatically:
  pick the class in the game lobby's **Class** menu and everyone who plays signed in is added.
- After every game (when you're signed in), each signed-in student's score, accuracy and missed
  questions are saved to the class.
- Open a class to see: every student's accuracy, a trend chart of their last 10 games, coins,
  game history with per-question results, and **What to reteach** (the questions the class gets
  wrong most). Tick questions there and click **Make a review set** to replay just those.
- **Export CSV** downloads the class summary for your gradebook.
- Students see their own stats, accuracy chart, recent games and achievement badges on **My profile**.
- Only signed-in students are tracked; guests can play but nothing is saved for them.

## Teacher account

- Sign in at the top of the teacher page. Your **question sets are saved to your account**
  and appear on any computer where you sign in (the first time you sign in, sets already on
  that computer are uploaded). The badge shows "☁ Saved to your account".
- **Add colleagues:** Classes & progress → **Teachers** → type their email. Each teacher only
  sees their own classes, students' progress and question sets.

## Emotes

- Students can send emotes from their iPad **between questions only** (lobby, after each answer,
  results). They pop up above their hero on the projector.
- 3 are free for everyone (Hi!, GG, Nice one!); 10 more are in the shop (e.g. **67**, Sheesh, Bruh,
  Big Brain, +1000 Aura, Victory Dance).
- Limits: one emote every few seconds per student, a cap on how many show at once, and only
  emotes a student really owns. Turn them off any time with **Student emotes** in the lobby or the
  **😀 Emotes on/off** button during a game.

## Practice at home (single-player study games)

- Open a class → **Practice at home** → tick the question sets students can practice
  (sets must be saved to your account; duplicate a sample set to use it).
- Students go to **wiserealm.org/practice.html** (or **Practice** on their profile) and pick a set and a game:
  - **Training Grounds:** flashcards with ★★★ mastery; missed cards come back.
  - **Asteroid Blaster:** answers fall as asteroids; blast the right one.
  - **Memory Match:** flip cards to match words/questions with answers.
  - **Dungeon Crawl:** explore 3 floors; monsters are questions; final boss: Mr. C.
- Weakest cards come up first. The database grades every answer, tracks each student's mastery per
  card, keeps a daily practice streak, and pays at most **50 practice coins per day** (nothing for
  impossibly fast answering).
- The **Practice at home** tab shows each student's sessions, minutes, mastery and streak.

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

## Running a class session

- **Switch games without a new code:** after a game, click **Back to lobby (switch game)**. Pick a
  different **Game** or **Question set** in the lobby; the room code and everyone who joined stay.
  **Play again** restarts the same game right away.
- **Auto-next** can be turned on/off during a game with the **⏩ Auto-next** button.
- Guests can tap **Sign in to earn coins** on their waiting screen; they come straight back into the game.

## Boss Raid details

- **Boss health:** Easy / Normal / Hard / Epic (lobby). **Boss attacks back** (on by default): after each
  question the boss hits the team; more misses = bigger hit. **Team HP 0 = the boss wins.**
- **STREAK CRIT:** 3+ right answers in a row deal double damage.


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
js/modes/maze.js       Mr. C's Maze
js/play.js             student iPad screens
js/shop.js             the shop
js/me.js               student profile page
js/classes.js          teacher classes & progress dashboard
js/charts.js           small progress charts
js/practice.js         practice hub (practice.html)
js/solo/*.js           the four single-player study games
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
