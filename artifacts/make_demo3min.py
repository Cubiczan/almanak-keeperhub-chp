#!/usr/bin/env python3
"""Generate Almanak KeeperGate ~3min DoraHacks demo from cards + terminal frames."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace/hackathon/almanak-keeperhub-chp")
OUT = ROOT / "artifacts" / "demo3min"
ART = ROOT / "artifacts"
W, H = 1280, 720

BG = (12, 16, 28)
TERM_BG = (10, 14, 22)
CYAN = (100, 210, 255)
MAGENTA = (196, 140, 255)
GREEN = (80, 220, 150)
YELLOW = (255, 210, 80)
RED = (255, 110, 120)
WHITE = (235, 240, 250)
MUTED = (150, 160, 185)
DIM = (110, 120, 145)
ORANGE = (255, 170, 90)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def gradient_bar(draw: ImageDraw.ImageDraw, y: int, thickness: int = 3) -> None:
    for x in range(W):
        t = x / max(W - 1, 1)
        r = int(120 + 80 * t)
        g = int(80 + 140 * t)
        b = int(220 - 80 * t)
        draw.line([(x, y), (x, y + thickness - 1)], fill=(r, g, b))


def badge(draw: ImageDraw.ImageDraw, text: str, xy, fill=YELLOW, bg=(40, 35, 10)) -> None:
    f = font(FONT_BOLD, 18)
    x, y = xy
    bbox = draw.textbbox((x, y), text, font=f)
    pad = 8
    draw.rounded_rectangle(
        [bbox[0] - pad, bbox[1] - pad // 2, bbox[2] + pad, bbox[3] + pad // 2],
        radius=8,
        fill=bg,
        outline=fill,
        width=2,
    )
    draw.text((x, y), text, font=f, fill=fill)


def card_base(title: str, subtitle: str | None = None):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    gradient_bar(draw, 0, 4)
    gradient_bar(draw, H - 4, 4)
    draw.text((64, 48), title, font=font(FONT_BOLD, 44), fill=WHITE)
    if subtitle:
        draw.text((64, 110), subtitle, font=font(FONT, 24), fill=MAGENTA)
    badge(draw, "MOCK labeled · no invented tx hashes", (64, H - 56))
    return img, draw


def wrap_text(draw, text: str, fnt, max_width: int):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def save_card(name: str, title: str, subtitle: str, bullets, accent=CYAN) -> Path:
    img, draw = card_base(title, subtitle)
    y = 170
    f = font(FONT, 26)
    for b in bullets:
        for line in wrap_text(draw, f"• {b}", f, W - 140):
            bullet = "• "
            draw.text((72, y), bullet, font=f, fill=accent)
            draw.text((72 + draw.textlength(bullet, font=f), y), line[2:], font=f, fill=WHITE)
            y += 40
        y += 8
    path = OUT / name
    img.save(path, "PNG")
    return path


def terminal_frame(name: str, lines, header: str, highlight_substrings=None, footer=None) -> Path:
    highlight_substrings = highlight_substrings or []
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    gradient_bar(draw, 0, 3)
    gradient_bar(draw, H - 3, 3)

    margin = 36
    top = 70
    draw.rounded_rectangle([margin, top, W - margin, H - 50], radius=14, fill=TERM_BG, outline=(40, 50, 70), width=2)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        draw.ellipse([margin + 18 + i * 22, top + 14, margin + 30 + i * 22, top + 26], fill=c)
    draw.text((margin + 100, top + 10), header, font=font(FONT_MONO, 16), fill=MUTED)
    badge(draw, "MOCK", (W - margin - 90, top + 8), fill=YELLOW, bg=(45, 40, 12))

    mono = font(FONT_MONO, 15)
    mono_b = font(FONT_MONO_BOLD, 15)
    y = top + 48
    max_y = H - 70
    for raw in lines:
        line = raw.rstrip("\n")
        if y > max_y:
            break
        color = WHITE
        use = mono
        low = line.lower()
        if "════" in line or line.strip().startswith("Almanak KeeperGate"):
            color = MAGENTA
            use = mono_b
        elif line.strip().startswith(("1.", "2.", "3.", "4.", "5.", "6.")):
            color = CYAN
            use = mono_b
        elif "BLOCKED" in line:
            color = RED
            use = mono_b
        elif "LOCKED" in line:
            color = GREEN
            use = mono_b
        elif "MOCK" in line or "tx hash" in low:
            color = YELLOW
            use = mono_b
        elif "HMAC verify" in line or line.strip().endswith("ok"):
            color = GREEN
        elif any(h in line for h in highlight_substrings):
            color = ORANGE
            use = mono_b
        elif line.strip().startswith(("{", "}", '"')) or '"intent_type"' in line:
            color = (180, 220, 255)
        while draw.textlength(line, font=use) > W - margin * 2 - 40 and len(line) > 10:
            line = line[:-4] + "…"
        draw.text((margin + 20, y), line, font=use, fill=color)
        y += 18

    if footer:
        draw.text((margin, H - 36), footer, font=font(FONT, 16), fill=MUTED)

    path = OUT / name
    img.save(path, "PNG")
    return path


def extract_sections(text: str):
    lines = text.splitlines()
    while lines and (not lines[0].strip() or lines[0].startswith(">") or "tsx src" in lines[0]):
        lines = lines[1:]
    sections = {"banner": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "howto": []}
    current = "banner"
    for line in lines:
        s = line.strip()
        if s.startswith("1. Almanak"):
            current = "1"
        elif s.startswith("2. Compile"):
            current = "2"
        elif s.startswith("3. CHP gate"):
            current = "3"
        elif s.startswith("4. KeeperHub simulate"):
            current = "4"
        elif s.startswith("5. KeeperHub execute"):
            current = "5"
        elif s.startswith("6. Dual audit"):
            current = "6"
        elif s.startswith("How to land"):
            current = "howto"
        sections[current].append(line)
    return sections


def section_frame(name, banner, body, header, highlights) -> Path:
    combined = []
    for ln in banner[:12]:
        if ln.strip():
            combined.append(ln)
    combined.append("")
    for ln in body:
        combined.append(ln)
    max_lines = 28
    if len(combined) > max_lines:
        combined = combined[:18] + ["  …"] + combined[-(max_lines - 19):]
    return terminal_frame(name, combined, header, highlights)


def make_thumbnail(happy_path: Path, blocked_path: Path) -> Path:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    gradient_bar(draw, 0, 5)
    gradient_bar(draw, H - 5, 5)
    draw.text((W // 2, 160), "Almanak KeeperGate", font=font(FONT_BOLD, 56), fill=WHITE, anchor="mm")
    draw.text((W // 2, 230), "Almanak → CHP Gate → KeeperHub", font=font(FONT, 28), fill=MAGENTA, anchor="mm")
    draw.text((W // 2, 290), "KeeperHub · Agent Economy Hackathon · DoraHacks", font=font(FONT, 20), fill=MUTED, anchor="mm")
    draw.text((W // 2, 325), "Main track: Best Integration into a Live Project", font=font(FONT, 20), fill=MUTED, anchor="mm")
    draw.text((W // 2, 390), "MOCK demo path · no invented tx hashes", font=font(FONT_BOLD, 22), fill=YELLOW, anchor="mm")
    for path, box in [(happy_path, (48, 470, 48 + 360, 470 + 200)), (blocked_path, (W - 48 - 360, 470, W - 48, 470 + 200))]:
        if path.exists():
            thumb = Image.open(path).convert("RGB").resize((360, 200))
            overlay = Image.new("RGB", thumb.size, (0, 0, 0))
            thumb = Image.blend(thumb, overlay, 0.25)
            img.paste(thumb, (box[0], box[1]))
            draw.rectangle(box, outline=(60, 70, 95), width=2)
    out = ART / "thumbnail.png"
    img.save(out, "PNG")
    img.save(ART / "frame_00_title_yt.png", "PNG")
    return out


ACCENTS = {"CYAN": CYAN, "MAGENTA": MAGENTA, "GREEN": GREEN, "ORANGE": ORANGE, "RED": RED, "YELLOW": YELLOW}

def build_frames():
    import json
    cards = json.loads((ART / "demo3min_cards.json").read_text())
    durations = json.loads((ART / "demo3min_durations.json").read_text())
    dur_map = {k: float(v) for k, v in durations}

    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()

    frames = []
    happy = (ART / "demo_happy_path.txt").read_text()
    blocked = (ART / "demo_blocked_path.txt").read_text()
    hs = extract_sections(happy)
    bs = extract_sections(blocked)

    # cards first in order when present in durations
    for name, meta in [
        ("01_title.png", cards["01_title.png"]),
        ("02_almanak_live.png", cards["02_almanak_live.png"]),
        ("03_problem.png", cards["03_problem.png"]),
        ("04_architecture.png", cards["04_architecture.png"]),
    ]:
        p = save_card(name, meta["title"], meta["subtitle"], meta["bullets"], accent=ACCENTS[meta["accent"]])
        frames.append((p, dur_map[name]))

    term_specs = [
        ("05_happy_banner.png", hs["banner"], hs["banner"][12:] if len(hs["banner"]) > 12 else [], "happy path (MOCK)", ["MOCK", "happy path"]),
        ("06_section1_intent.png", hs["banner"], hs["1"], "1/6 Almanak strategy intent", ["intent_type", "swap", "amount_usd", "uniswap_v3", "confidence"]),
        ("07_section2_compile.png", hs["banner"], hs["2"], "2/6 Compile to KeeperHub plan", ["84532", "execute_transfer", "notional", "remapped"]),
        ("08_section3_chp_locked.png", hs["banner"], hs["3"], "3/6 CHP gate to LOCKED", ["LOCKED", "EXPLORING", "PROVISIONAL", "trail"]),
        ("09_section4_simulate.png", hs["banner"], hs["4"], "4/6 KeeperHub simulate (MOCK)", ["MOCK", "wouldRevert", "simulate"]),
        ("10_section5_execute.png", hs["banner"], hs["5"], "5/6 KeeperHub execute MOCK no tx hash", ["MOCK", "tx hash", "executionId", "invent"]),
        ("11_section6_audit.png", hs["banner"], hs["6"], "6/6 Dual audit trail", ["HMAC verify", "ok", "MOCK id", "CHP"]),
    ]
    for name, banner, body, header, highs in term_specs:
        p = section_frame(name, banner, body, header, highs)
        frames.append((p, dur_map[name]))

    meta = cards["12_blocked_intro.png"]
    p = save_card("12_blocked_intro.png", meta["title"], meta["subtitle"], meta["bullets"], accent=ACCENTS[meta["accent"]])
    frames.append((p, dur_map["12_blocked_intro.png"]))

    blocked_specs = [
        ("13_blocked_intent.png", bs["banner"], bs["1"], "blocked Intent.swap 5000", ["5000", "amount_usd", "swap"]),
        ("14_blocked_gate.png", bs["banner"], bs["3"], "CHP to BLOCKED (max_notional)", ["BLOCKED", "max_notional", "5000"]),
        ("15_blocked_skipped.png", bs["banner"], bs["4"] + [""] + bs["5"] + [""] + bs["6"][:8], "Simulate/execute skipped", ["Skipped", "No execute", "BLOCKED", "HMAC verify"]),
    ]
    for name, banner, body, header, highs in blocked_specs:
        p = section_frame(name, banner, body, header, highs)
        frames.append((p, dur_map[name]))

    meta = cards["16_close.png"]
    p = save_card("16_close.png", meta["title"], meta["subtitle"], meta["bullets"], accent=ACCENTS[meta["accent"]])
    frames.append((p, dur_map["16_close.png"]))
    return frames


def refresh_stills():
    img_lines = [ln for ln in (ART / "demo_happy_path.txt").read_text().splitlines() if ln.strip()][:36]
    terminal_frame("_tmp_happy_full.png", img_lines, "demo happy (MOCK)", ["LOCKED", "MOCK", "tx hash"])
    Image.open(OUT / "_tmp_happy_full.png").save(ART / "demo_happy_path.png")
    Image.open(OUT / "_tmp_happy_full.png").save(ART / "frame_happy.png")
    img_lines_b = [ln for ln in (ART / "demo_blocked_path.txt").read_text().splitlines() if ln.strip()][:36]
    terminal_frame("_tmp_blocked_full.png", img_lines_b, "demo blocked (MOCK)", ["BLOCKED", "Skipped", "max_notional"])
    Image.open(OUT / "_tmp_blocked_full.png").save(ART / "demo_blocked_path.png")
    Image.open(OUT / "_tmp_blocked_full.png").save(ART / "frame_blocked.png")
    t = Image.new("RGB", (W, H), (28, 32, 40))
    td = ImageDraw.Draw(t)
    td.text((48, 48), "Almanak x KeeperHub via Cubiczan CHP", font=font(FONT_MONO_BOLD, 28), fill=CYAN)
    td.text((48, 100), "DoraHacks Agent Economy · Best Integration into a Live Project", font=font(FONT_MONO, 18), fill=MUTED)
    td.text((48, 140), "MOCK labeled · no invented transaction hashes", font=font(FONT_MONO, 18), fill=YELLOW)
    t.save(ART / "frame_title.png")
    make_thumbnail(ART / "demo_happy_path.png", ART / "demo_blocked_path.png")
    for tmp in OUT.glob("_tmp_*.png"):
        tmp.unlink()


def write_concat(frames):
    concat_path = OUT / "concat.txt"
    with concat_path.open("w") as f:
        for path, dur in frames:
            f.write("file '%s'\n" % path.resolve())
            f.write("duration %.3f\n" % dur)
        f.write("file '%s'\n" % frames[-1][0].resolve())
    return concat_path


def encode(concat_path):
    out_mp4 = ART / "demo_3min_screenshots.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path),
        "-vf", "fps=30", "-pix_fmt", "yuv420p", "-c:v", "libx264",
        "-movflags", "+faststart", str(out_mp4),
    ]
    print("encode", out_mp4)
    subprocess.run(cmd, check=True)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(out_mp4)],
        capture_output=True, text=True, check=True,
    )
    duration = float(probe.stdout.strip())
    print("OUTPUT", out_mp4, "duration=%.3f" % duration, "size=%d" % out_mp4.stat().st_size)
    return duration


def main():
    frames = build_frames()
    total = sum(d for _, d in frames)
    print("frames=%d planned=%.1fs" % (len(frames), total))
    refresh_stills()
    concat_path = write_concat(frames)
    encode(concat_path)
    for path, dur in frames:
        print(" ", path.name, "%.1fs" % dur)


if __name__ == "__main__":
    main()
