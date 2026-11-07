"""Build TEAMFORGE prototype video: 10 title cards + main.mp3 -> 1080p MP4.

Usage:
    python build.py
Needs: pillow, imageio-ffmpeg (pip install pillow imageio-ffmpeg)
"""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
BEATS = json.loads((HERE / "beats.json").read_text(encoding="utf-8"))
AUDIO = ROOT / "main.mp3"
OUTDIR = HERE / "out"
CARDS = HERE / "cards"
OUT = OUTDIR / "teamforge_prototype.mp4"

W, H = 1920, 1080
FPS = 30

def draw_card(beat, idx, total):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), (11, 18, 32))
    d = ImageDraw.Draw(img)
    # accent top bar
    d.rectangle([0, 0, W, 10], fill=(110, 231, 255))
    # faint panel
    d.rounded_rectangle([140, 200, W - 140, H - 220], radius=28, fill=(17, 27, 46))
    d.rounded_rectangle([140, 200, W - 140, H - 220], radius=28, outline=(60, 80, 120))
    # header
    d.text((160, 90), f"TEAMFORGE  •  SWITCH DEMO  •  {idx+1:02d}/{total:02d}", fill=(110, 231, 255))
    # beat number watermark
    d.text((W - 320, H - 260), f"{beat['n']:02d}", fill=(30, 45, 70))
    # title / sub
    d.text((200, 300), beat["title"], fill=(255, 255, 255))
    d.text((200, 380), beat["sub"], fill=(170, 190, 215))
    # discord command box
    d.rounded_rectangle([200, 480, W - 200, 590], radius=14, fill=(10, 15, 28))
    d.rounded_rectangle([200, 480, W - 200, 590], radius=14, outline=(110, 231, 255))
    d.text((230, 505), "> " + beat["cmd"], fill=(110, 231, 255))
    # VO line (wrapped crudely)
    vo = beat["vo"]
    lines, cur = [], ""
    for w in vo.split():
        if len(cur) + len(w) + 1 > 72:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    y = 640
    for ln in lines[:4]:
        d.text((200, y), ln, fill=(210, 220, 235))
        y += 55
    # progress bar
    done = sum(b["dur"] for b in BEATS[:idx + 1])
    total_d = sum(b["dur"] for b in BEATS)
    frac = done / total_d
    d.rectangle([200, H - 150, W - 200, H - 138], fill=(30, 45, 70))
    d.rectangle([200, H - 150, 200 + int((W - 400) * frac), H - 138], fill=(110, 231, 255))
    d.text((200, H - 110), "Voiceover generated with ElevenLabs.", fill=(120, 135, 160))
    return img

def main():
    try:
        import imageio_ffmpeg
    except ImportError:
        sys.exit("pip install imageio-ffmpeg pillow")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    OUTDIR.mkdir(exist_ok=True); CARDS.mkdir(exist_ok=True)

    total = sum(b["dur"] for b in BEATS)
    # check real audio length
    try:
        from mutagen.mp3 import MP3
        alen = MP3(str(AUDIO)).info.length
        print(f"main.mp3 = {alen:.1f}s, cards total = {total:.1f}s")
        if abs(alen - total) > 1.0:
            print(f"WARNING: drift {alen-total:+.1f}s — tweak beats.json durs, or output uses -shortest.")
    except Exception as e:
        print("audio length check skipped:", e)

    # render cards
    pngs = []
    for i, b in enumerate(BEATS):
        p = CARDS / f"beat{i+1:02d}.png"
        draw_card(b, i, len(BEATS)).save(p)
        pngs.append((p, b["dur"]))
        print(f"card {i+1}: {b['title'][:40]:40s} {b['dur']:.1f}s")

    # ffmpeg: N image inputs + audio, concat video, mux audio
    cmd = [ffmpeg, "-y"]
    for p, dur in pngs:
        cmd += ["-loop", "1", "-t", f"{dur:.2f}", "-i", str(p)]
    cmd += ["-i", str(AUDIO)]
    n = len(pngs)
    filt = "".join(f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS},scale={W}:{H},format=yuv420p[v{i}];" for i in range(n))
    filt += "".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]"
    cmd += ["-filter_complex", filt, "-map", "[v]", "-map", f"{n}:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(OUT)]
    print("encoding...")
    subprocess.run(cmd, check=True)
    print("OK ->", OUT, f"({OUT.stat().st_size/1e6:.1f} MB)")

if __name__ == "__main__":
    main()
