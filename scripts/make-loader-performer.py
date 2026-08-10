#!/usr/bin/env python3
"""キャラ1枚絵の背景（不透明グレー）を抜いて、ローダー用PNGへ書き出す。

前提: 背景は画像の四辺につながった無地グレー。人物・小道具は連結した1つの塊。
手順: 四辺から flood fill で背景を塗り分け → 穴埋め → 輪郭を1pxぼかし → トリム → 高さ560へ縮小。

仕様は docs/specs/2026-08-08-month-loader-character-spec.md。
入力は knowledge/character-consistency-refs/characters/<キャラ>/canon/ の承認済み1枚絵のみ。

使い方（このMacでは numpy / opencv-python / Pillow が入っている前提）:
  python3 scripts/make-loader-performer.py <canonのpng> assets/loader/performer-N.png [tol] [確認用png]
第4引数を付けると、抜け残りが分かるようにピンクの市松模様に重ねた確認画像も出す。
"""
import sys
import numpy as np
import cv2
from PIL import Image


def cut(src, dst, tol=26, target_h=560, preview=None):
    bgr = cv2.imread(src, cv2.IMREAD_COLOR)
    h, w = bgr.shape[:2]
    # 背景の基準色は四辺1pxの中央値（周辺のむらに引きずられないように）
    edge = np.concatenate([bgr[0], bgr[-1], bgr[:, 0], bgr[:, -1]])
    base = np.median(edge, axis=0).astype(np.uint8)
    canvas = bgr.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    flags = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8)
    lo = up = (tol, tol, tol)
    for x, y in seeds:
        if abs(int(bgr[y, x][0]) - int(base[0])) > 60:
            continue
        cv2.floodFill(canvas, mask, (x, y), 0, lo, up, flags)
    bg = mask[1:-1, 1:-1] > 0

    # 腕と紐に囲まれて四辺とつながらない背景（例: 野中葵の左腕の内側）も抜く。
    # 背景色に近い色の塊のうち、広いものだけを対象にして小道具の陰影は残す。
    bglike = np.all(np.abs(bgr.astype(np.int16) - base.astype(np.int16)) <= tol, axis=2)
    rest = (bglike & ~bg).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(rest, 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 300:
            bg |= (lab == i)

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # 人物の内側に残った小さな抜け（背景色に近い塗り）を埋める
    filled = alpha.copy()
    n, lab, stats, _ = cv2.connectedComponentsWithStats((alpha == 0).astype(np.uint8), 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 400:
            filled[lab == i] = 255
    alpha = filled
    # 縁に残る背景色のにじみを1px削り、そのあと輪郭だけ柔らかくする
    alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8), iterations=1)
    alpha = cv2.GaussianBlur(alpha, (5, 5), 1.2)

    rgba = np.dstack([cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), alpha])
    ys, xs = np.where(alpha > 8)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(rgba, 'RGBA')
    ratio = target_h / im.height
    im = im.resize((max(1, round(im.width * ratio)), target_h), Image.LANCZOS)
    # 1枚40KB以下に収めるため256色パレットへ落とす（表示は高さ96pxなので目視では差が出ない）
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(dst, optimize=True)
    print('%s -> %s %s' % (src.split('/')[-1], dst, im.size))

    if preview:
        chk = Image.new('RGB', im.size, (255, 255, 255))
        px = chk.load()
        for y in range(im.height):
            for x in range(im.width):
                if (x // 16 + y // 16) % 2:
                    px[x, y] = (255, 90, 200)  # 抜け残りが目立つ色
        chk.paste(im, (0, 0), im)
        chk.save(preview)


if __name__ == '__main__':
    cut(sys.argv[1], sys.argv[2], tol=float(sys.argv[3]) if len(sys.argv) > 3 else 26,
        preview=sys.argv[4] if len(sys.argv) > 4 else None)
