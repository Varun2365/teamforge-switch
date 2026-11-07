# TEAMFORGE — 5-min prototype video (main.mp3 is your voiceover)

Your `main.mp3` = **127.0s (2:07)**. That's the ALL-IN-ONE block from
`elevenlabs.md` read at natural pace (the full 2:28 breakdown scaled by 0.86).

I couldn't do word-level transcription on this machine (no whisper/parakeet),
so this prototype does NOT need word timestamps. It builds timed title cards
from `elevenlabs.md` per-beat breakdown, synced to your 127s audio.

## Fastest path (2 commands, ~3 min)

```powershell
cd D:\SwitchHackathon2\prototype_video
python build.py
```

Output: `prototype_video\out\teamforge_prototype.mp4` (1920x1080, 30fps,
with `main.mp3` as audio). Submit that as-is, or drop it under your screen
recording as a fallback.

Requires: `pillow`, `imageio-ffmpeg` (already installed above). No ffmpeg
install, no HeyGen key, no network.

## What you get

10 cards = the 10 beats in `elevenlabs.md` § Per-beat breakdown, retimed to
127s. Each card shows the Discord command to type (from RECORDING.md) + the
VO line for that beat. If a judge mutes the video, the story still reads.

| # | Card | Scaled time | VO (from elevenlabs.md) |
|---|------|-------------|-------------------------|
| 01 | Intro — 6 agents, one room | 0:00–0:15 | This is Teamforge... I just talk to my team. |
| 02 | who's handling QA... | 0:15–0:27 | Watch. Who's handling QA... |
| 03 | who knows React? | 0:27–0:36 | Who knows React? Priya. Already on frontend. |
| 04 | launch update, 3 bullets | 0:36–0:50 | Write a short launch update... |
| 05 | API blocked → cascade | 0:50–1:07 | Now, the important part. The API is blocked... |
| 06 | status of Website Launch? | 1:07–1:16 | What's the status of Website Launch?... |
| 07 | PDF status report | 1:16–1:29 | Create a project status report, as a PDF... |
| 08 | remind me in 1 minute... | 1:29–1:38 | Remind me in one minute... And then I stop asking. |
| 09 | chatbot vs teammate | 1:38–2:00 | This is the difference between a chatbot and a teammate... |
| 10 | And there it is. | 2:00–2:07 | And there it is. I never asked again. |

Exact text per card is in `beats.json`.

## If you have 15 more minutes (better version)

1. Screen-record Discord `#teamforge-lobby` following `RECORDING.md` §4 table.
2. In CapCut/Premiere: lay screen recording on V1, `main.mp3` on A1.
3. Use `EDIT_TABLE.md` in this folder as your cut list — it maps each VO line
   to the exact message to type on screen.
4. Export 1080p. Add end card: "Voiceover generated with ElevenLabs."
   (required for free plan — see elevenlabs.md).

## If a card feels off-sync

Your reading pace won't match my scale exactly. Fix in seconds — open
`beats.json`, tweak any `dur` (seconds), re-run `python build.py`.
Total must stay ≈127s (script warns if it drifts >1s from main.mp3).
