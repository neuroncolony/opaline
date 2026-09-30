# Procedural seamless-loop "liquid opal" background video (dark + light variants).
# Usage: python3 tools/render_bg.py dark|light  -> public/media/bg-<mode>.{mp4,webm,jpg}
import numpy as np, subprocess, sys, os
mode = sys.argv[1] if len(sys.argv) > 1 else "dark"
W, H, FPS, SEC = 768, 432, 30, 12
N = FPS * SEC
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
x = (x - W / 2) / H * 2.2
y = (y - H / 2) / H * 2.2
if mode == "dark":
    base = np.array([7, 10, 22], np.float32) / 255
    cols = np.array([[142, 240, 216], [169, 184, 255], [244, 169, 216], [243, 213, 154], [110, 140, 255]], np.float32) / 255
    gain = 0.78
else:
    base = np.array([244, 245, 250], np.float32) / 255
    cols = np.array([[168, 232, 216], [190, 200, 255], [246, 192, 224], [246, 222, 178], [180, 204, 255]], np.float32) / 255
    gain = 0.8
here = os.path.dirname(os.path.abspath(__file__))
outdir = os.path.join(here, "..", "public", "media")
os.makedirs(outdir, exist_ok=True)
out = os.path.join(outdir, f"bg-{mode}")
ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-threads", "2", "-f", "rawvideo", "-pix_fmt", "rgb24",
                       "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-vf", "gblur=sigma=5,scale=1280:720:flags=bicubic,noise=alls=2:allf=t",
                       "-pix_fmt", "yuv420p", "-c:v", "libx264", "-threads", "2", "-preset", "slow", "-crf", "27",
                       "-movflags", "+faststart", "-an", out + ".mp4"], stdin=subprocess.PIPE)
for f in range(N):
    t = 2 * np.pi * f / N  # periodic time -> perfectly seamless loop
    c, s = np.cos(t), np.sin(t)
    qx = x + 0.55 * np.sin(1.3 * y + 1.7 * c + 0.6) + 0.35 * np.sin(2.1 * x - 1.1 * s)
    qy = y + 0.55 * np.cos(1.1 * x - 1.5 * s + 0.3) + 0.35 * np.cos(1.9 * y + 1.2 * c)
    rx = qx + 0.45 * np.sin(2.3 * qy + 2 * s)
    ry = qy + 0.45 * np.cos(2.0 * qx - 2 * c)
    v = np.sin(1.6 * rx + c) * 0.5 + np.sin(1.4 * ry - s + 1.0) * 0.5
    acc = np.zeros((H, W, 3), np.float32)
    wsum = np.zeros((H, W), np.float32)
    for i, col in enumerate(cols):
        ph = i * 1.2566
        cx = 0.95 * np.sin(ph + c * 0.9 + i * 0.3)
        cy = 0.55 * np.cos(ph * 1.3 + s * 0.9)
        d = (rx - cx) ** 2 + (ry - cy) ** 2
        w = np.exp(-d * 1.6) * (0.6 + 0.4 * np.sin(3 * v + ph + t))
        acc += w[..., None] * col
        wsum += w
    inten = np.clip(wsum, 0, 1.4) / 1.4
    colr = acc / np.maximum(wsum, 1e-4)[..., None]
    sheen = np.clip(1 - np.abs(v) * 2.2, 0, 1) ** 3 * (0.3 if mode == "dark" else 0.18)
    img = base + (colr - base) * (inten * gain)[..., None]
    img = img + sheen[..., None] * (colr * 0.6 + 0.4) * inten[..., None]
    r2 = np.clip((x ** 2 + y ** 2) / 3.5, 0, 1)
    if mode == "dark":
        img = img * (1 - 0.35 * r2)[..., None]
    ff.stdin.write((np.clip(img, 0, 1) * 255).astype(np.uint8).tobytes())
ff.stdin.close()
ff.wait()
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out + ".mp4", "-c:v", "libvpx-vp9", "-threads", "2",
                "-b:v", "0", "-crf", "42", "-row-mt", "1", "-an", out + ".webm"])
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "3", "-i", out + ".mp4", "-frames:v", "1",
                "-vf", "scale=960:-1", "-q:v", "5", out + ".jpg"])
print("done", mode)
