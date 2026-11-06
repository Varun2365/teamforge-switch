# TEAMFORGE Demo Guide — Acme Technologies

A hermetic demo org is seeded: **Acme Technologies** — Rahul (founder), Aarav (backend), Priya (design), Neha (frontend), Karan (marketing) — project **Website Launch**, five interconnected tasks, live dependency chain, a pricing decision with provenance, one pending agent-proposed approval, and demo-flagged agent activity.

Reset anytime: `npm run seed` (recreates only the `acme` org).

## Before you start

1. `npm run dev` (API :4100), `npm run dev:web` (dashboard :5183).
2. (Optional) Live agents: finish `switch/README.md` phases A–D first — the conversational demo needs the six agents in their rooms.
3. Login: nothing to log into — the dev dashboard injects the API key from `.env`.

## The 3-minute tour (dashboard-only, no agents needed)

1. **Overview** — everything is real data: 1 active project (at risk), 1 overdue task, 1 approval waiting, recent decisions (pricing, locked launch), agent feed (demo-labelled), proactive feed.
2. **Tasks** — toggle Board view. Drag-free Kanban: Aarav's urgent overdue API task sits in *In progress*; the dependency chain is visible via the drawer.
3. **Approvals** — the seeded `agent:quality-risk` request to move the launch review to launch day. Click **Approve** — watch it flip to history with your note. That's the audit trail working.
4. **Org Graph** — org at center, people and projects ringed, decisions wired to entities. Click `Website Launch` → facts with sources.
5. **Memory** — search `pricing` → decision with its source; search `Aarav` → entities; check statuses (active/superseded).
6. **People → Aarav** — skills, 1 overdue task, workload note.

## The live-agent tour (Discord, no mentions needed)

Room: `teamforge-lobby` in Mattermost (`switch/README.md`). Say things like a person, not a command.

| You say | What happens |
|---|---|
| `what's the state of the launch?` | Ops pulls `get_project` + `get_project_health` → plain-English brief: API overdue by Aarav, Neha blocked behind it, launch at risk |
| `@quality-risk scan for blast radius` | Ops delegates in the side room; Risk walks `get_affected_dependencies` → finds Neha + launch review behind Aarav's task; Ops answers with severity + options |
| `sure, propose moving the launch review to launch day` | Risk proposes `deadline_change` → card appears in Approvals — NOT applied until you approve |
| `remind Aarav at 10 tomorrow to post the API ETA` | `create_reminder` → 08:30 next morning and 10:00 tomorrow you get the nudge (dashboard feed; digest room if Phase E done) |
| `who knows PostgreSQL?` | `search_employees(skill)` → Aarav (Level 4, per Manager-confirmed skill record) |
| `what did we decide about pricing?` | Ops searches memory → "free tier + Pro ₹999, first 100 half-price — decided 7 Oct, Rahul + Karan, from kickoff record" |
| `Priya's taking over the backend from Aarav` | Knowledge + Ops: resolves both people, finds the active `Backend API integration` assignment, **proposes reassignment** (approval), preserves history |

## What to point judges at

- **Switch centrality**: rooms ARE the product surface; agents are Switch-managed OpenCode sessions; handoffs happen in a private side room; addressing governs everything.
- **Humanized voice**: read any agent reply aloud — it sounds like a person, not a PDF.
- **Honesty rails**: approvals never auto-apply; disputed facts never overwrite; every memory row has a source.
- **Proactive**: `npm run demo` (or wait for 08:30) — the morning brief lands in the feed with real task data.
- **The seeded overdue chain**: the demo's drama is the API integration blocking Neha blocking launch — it exists to show risk blast-radius reasoning end to end.

## Resetting

`npm run seed` — wipes and recreates Acme only; your other data (and other orgs) untouched.

## If something looks wrong

| Symptom | Check |
|---|---|
| Dashboard loads but is empty | API running on :4100? `npm run seed` done? Key in Settings matches `.env`? |
| Agent ignores you | Addressed with `@`? Session connected in Switch Console? Instructions pasted? See `switch/README.md` |
| Approval didn't apply | Approvals page → note the error; history keeps the attempt |
| Scheduler silent | `GET /api/scheduled-jobs` — jobs exist with `runAt`; check `/health` → `demoMode` |
