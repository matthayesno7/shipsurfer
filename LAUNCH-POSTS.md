# Tester recruitment posts — post AFTER FINAL-TEST.md Part 1 is green

**One rule for all of these:** lead with a screen recording. 60 seconds:
app open in Claude Code → "ship this with ShipSurfer" → connect → surfer
animation → live HTTPS URL on a subdomain. Record it during today's final test
(QuickTime is fine). The video does the selling; the post just asks.

---

## 1. r/ClaudeAI (primary)

**Title:**
I built a tool that takes your Claude Code app live — repo, database, hosting, domain — in a few clicks. Looking for ~10 beta testers (free)

**Body:**

Every app I built with Claude Code died at the same spot: it worked locally,
then I'd face the GitHub repo, the Supabase project, the Railway config, the
DATABASE_URL copy-paste between three dashboards… and shipping it became a
weekend job.

So I built ShipSurfer. You open your project in Claude Code and say "ship this
with ShipSurfer." It opens a local app where you connect GitHub, Railway and
Supabase once (OAuth — it runs on your machine and I never see your tokens or
your code), then it creates the repo, provisions the database, deploys, and
puts it on a free `yourname.shipsurfer.app` subdomain with HTTPS. Everything
lands on **your own accounts** — it's not hosting, there's no lock-in, and if
you delete ShipSurfer tomorrow your app keeps running.

[VIDEO — 60s, local app → live URL]

It's in beta and **free for testers**. What you need: a Mac, Node 18+, and
free-tier GitHub/Railway/Supabase accounts. What I need: you shipping one real
project and telling me exactly where it broke or felt confusing.

Sign up at https://shipsurfer.app or comment/DM and I'll send the install
one-liner. Happy to answer anything about how it works under the hood.

---

## 2. r/SideProject / r/indiehackers (secondary, same week)

**Title:**
ShipSurfer — deploy the app Claude built for you, onto your own cloud accounts, without touching a terminal

**Body:** reuse the r/ClaudeAI body, swap the first line to:

"If you build with AI but the deploy step (repos, env vars, DNS) is where you
stall out, this is for you."

---

## 3. Comment/DM reply template

Thanks! No terminal needed — paste this into Claude Code:

"Install ShipSurfer for me: `curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | bash`"

then open your project in Claude Code and say "ship this with ShipSurfer".
Guide: https://shipsurfer.app/paddleout
— during the beta the checkout is in test mode, use card 4242 4242 4242 4242
(no charge). Whatever breaks, paste me the exact error and I'll fix it same day.

---

## Posting notes

- Post morning UK time (US morning traffic peaks are r/ClaudeAI's busiest).
- Check r/ClaudeAI self-promo rules; frame as "looking for testers," engage
  every comment — replies drive the ranking.
- Don't post all channels the same day; r/ClaudeAI first, judge response,
  iterate the pitch before the next one.
- Track: beta signups (license-server volume) + installs vs. ships — the gap
  between them is your first funnel metric.
