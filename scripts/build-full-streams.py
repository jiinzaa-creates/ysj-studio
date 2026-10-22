#!/usr/bin/env python3
"""Build full-length TAGGED streaming versions of every catalog beat.

Source masters are the local full-length MP3s; the owner's chosen producer
tag (Take 3, chopped-echo treatment, picked 2026-10-22) is mixed over the
music at 0.5s and then every 20s, so the public stream is never cleanly
rippable. The untagged master stays the paid deliverable. Output:
public/assets/full/<slug>.mp3 (160k MP3, loudness-normalized).
"""
import os
import subprocess

TAG = os.path.expanduser("~/workspace/your_files/tags/jinza-tag-final.mp3")
OUT = os.path.expanduser("~/workspace/jinza-beats/public/assets/full")
BQ = os.path.expanduser("~/workspace/beathive-queue")

SRC = {
    "red-handed": os.path.expanduser(
        "~/workspace/goals/passive-income-streams/files/releases/red-handed/RED-HANDED.mp3"),
    "underneath": f"{BQ}/UNDERNEATH.mp3",
    "doll-house": f"{BQ}/Doll House F Min.mp3",
    "winters-coming": f"{BQ}/Winters Coming Cmin.mp3",
    "soaking": f"{BQ}/Soaking .mp3",
    "tides": f"{BQ}/Tides.mp3",
    "money-not-toxic": f"{BQ}/Money not toxic.mp3",
    "on-god": f"{BQ}/On god.mp3",
    "design-of-it": f"{BQ}/Design of it.mp3",
    "war": f"{BQ}/War.mp3",
    "be-smooth": f"{BQ}/Be Smooth .mp3",
    "overzelous": f"{BQ}/Overzelous.mp3",
    "hypnotic": f"{BQ}/Hypnotic.mp3",
}

TAG_INTERVAL = 20.0   # seconds between tag drops
TAG_FIRST = 0.5       # first tag lands here
TAG_VOLUME = 0.9


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True)
    return float(out.stdout.strip())


def main():
    import sys
    args = sys.argv[1:]
    clean = "--clean" in args
    only = {a for a in args if not a.startswith("--")}
    os.makedirs(OUT, exist_ok=True)
    for slug, src in SRC.items():
        if only and slug not in only:
            continue
        d = duration(src)
        if clean:
            # Owner direction 2026-10-22: full-length streams carry NO tag.
            outp = f"{OUT}/{slug}.mp3"
            r = subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-af", "aresample=44100,loudnorm=I=-14:TP=-1.5:LRA=11",
                 "-codec:a", "libmp3lame", "-b:a", "160k", outp],
                capture_output=True, text=True)
            if r.returncode != 0:
                print("FAIL", slug, r.stderr[-800:])
                raise SystemExit(1)
            print(f"OK {slug} (clean): {d:.0f}s, "
                  f"{os.path.getsize(outp) // 1024} KB")
            continue
        positions = []
        t = TAG_FIRST
        while t < d - 4:
            positions.append(t)
            t += TAG_INTERVAL
        n = len(positions)
        parts = [
            "[0:a]aresample=44100[music]",
            "[1:a]aresample=44100,pan=stereo|c0=c0|c1=c0,"
            f"volume={TAG_VOLUME},asplit={n}"
            + "".join(f"[t{i}]" for i in range(n)),
        ]
        mix_ins = ["[music]"]
        for i, p in enumerate(positions):
            ms = int(p * 1000)
            parts.append(f"[t{i}]adelay={ms}|{ms}[m{i}]")
            mix_ins.append(f"[m{i}]")
        fc = (";".join(parts) + ";" + "".join(mix_ins)
              + f"amix=inputs={n + 1}:normalize=0,"
              + "loudnorm=I=-14:TP=-1.5:LRA=11[out]")
        outp = f"{OUT}/{slug}.mp3"
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", src, "-i", TAG,
             "-filter_complex", fc, "-map", "[out]",
             "-codec:a", "libmp3lame", "-b:a", "160k", outp],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("FAIL", slug, r.stderr[-800:])
            raise SystemExit(1)
        print(f"OK {slug}: {d:.0f}s, {n} tags, "
              f"{os.path.getsize(outp) // 1024} KB")


if __name__ == "__main__":
    main()
