# Demo artifacts

- `thumbnail.png` — YouTube / DoraHacks cover (1280×720)
- `demo_3min_screenshots.mp4` — ~3 min MOCK screenshot demo (DEMO.md narrative)
- `demo3min/` — 1280×720 PNG frames + concat demuxer list used to build the 3 min reel
- `make_demo3min.py` + `demo3min_*.json` — regenerator (PIL + ffmpeg concat)
- `demo_reel_youtube.mp4` / `demo_reel.mp4` — shorter stills placeholders
- `demo_happy_path.*` / `demo_blocked_path.*` — terminal captures (MOCK; no invented tx hashes)
- `frame_*.png` — source stills

All demo clips are **MOCK**-labeled. Never invent a transaction hash; only paste a hash from KeeperHub LIVE.

Regenerate the 3-minute reel:

```bash
python3 artifacts/make_demo3min.py   # or frames-only then ffmpeg concat
# ffmpeg -y -f concat -safe 0 -i artifacts/demo3min/concat.txt -vf fps=30 -pix_fmt yuv420p -c:v libx264 -movflags +faststart artifacts/demo_3min_screenshots.mp4
```

Film a live terminal take from `DEMO.md` for the final YouTube upload when possible.
