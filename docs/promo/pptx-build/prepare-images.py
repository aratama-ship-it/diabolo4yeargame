"""チラシPPTX用の画像を用意する。

PowerPointでは再現できない「下端の白フェード」「角丸マスク」を画像側へ焼き込む。
出力先は tmp/pptx/（Git管理外）。使い方:

    python3 docs/promo/pptx-build/prepare-images.py
    node docs/promo/pptx-build/build-pptx.js
"""
from PIL import Image, ImageDraw
from pathlib import Path
import qrcode

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "tmp" / "pptx"
OUT.mkdir(parents=True, exist_ok=True)

DPI = 300
mm = lambda v: int(round(v / 25.4 * DPI))
URL = "https://aratama-ship-it.github.io/diabolo4yeargame/"

# タイトル画: HTML版と同じ cover + object-position 50% 38% + 下端26mmの白フェード + 角丸3mm
src = Image.open(ROOT / "assets/title/title-card-combo-trail-v4-people-3d.png").convert("RGB")
W, H = mm(184), mm(80)
scale = max(W / src.width, H / src.height)
scaled = src.resize((int(src.width * scale), int(src.height * scale)), Image.LANCZOS)
art = scaled.crop((0, int((scaled.height - H) * 0.38), W, int((scaled.height - H) * 0.38) + H)).convert("RGBA")

fade_h = mm(26)
fade = Image.new("RGBA", (W, fade_h), (255, 255, 255, 0))
fd = ImageDraw.Draw(fade)
for y in range(fade_h):
    fd.line([(0, y), (W, y)], fill=(255, 255, 255, int(255 * min(1.0, (y / fade_h) / 0.92))))
art.alpha_composite(fade, (0, H - fade_h))

mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=mm(3), fill=255)
art.putalpha(Image.composite(art.split()[3], Image.new("L", (W, H), 0), mask))
art.save(OUT / "art.png")

# ホーム画面アイコン: iOSと同じ約22.4%の角丸
icon = Image.open(ROOT / "assets/pwa/apple-touch-icon.png").convert("RGBA")
S = mm(25)
icon = icon.resize((S, S), Image.LANCZOS)
m = Image.new("L", (S, S), 0)
ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.224), fill=255)
icon.putalpha(m)
icon.save(OUT / "icon.png")

# QR: HTML版と同じ 誤り訂正M・余白2モジュール
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2, box_size=30)
q.add_data(URL)
q.make(fit=True)
q.make_image(fill_color="black", back_color="white").save(OUT / "qr.png")

print("tmp/pptx/ に art.png / icon.png / qr.png を作成しました（QR型番 %s）" % q.version)
