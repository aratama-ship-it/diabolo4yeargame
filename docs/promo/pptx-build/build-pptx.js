// A4縦1枚のチラシをPPTXで書き出す。文字はすべて編集可能なテキストボックスで置く。
// グラデーション・角丸マスクはPowerPointで再現できないため、画像側へ焼き込む。
// 先に prepare-images.py を実行して tmp/pptx/*.png を用意すること。
//   python3 docs/promo/pptx-build/prepare-images.py
//   node    docs/promo/pptx-build/build-pptx.js
const pptxgen = require('pptxgenjs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const IMG = path.join(ROOT, 'tmp', 'pptx');
const mm = v => v / 25.4;            // mm → inch
const pt = v => v * 2.83464567;      // mm → pt（CSSのmm指定フォントサイズを合わせる）

const INK = '22355F', INK_SOFT = '5B6B8C', RED = 'D8452F', CREAM = 'F4EDE0', GRAY = '96A2B8';
const JP = 'Hiragino Maru Gothic ProN';

const pres = new pptxgen();
pres.defineLayout({ name: 'A4P', width: mm(210), height: mm(297) });
pres.layout = 'A4P';
const s = pres.addSlide();

const PAD = 13, CW = 184;            // 外周余白と本文幅(mm)
let y = 13;

// ---- 上部のバッジ2つ ----
const badge = (x, w, text, fill) => {
  s.addShape(pres.ShapeType.roundRect, {
    x: mm(x), y: mm(y), w: mm(w), h: mm(6.4), fill: { color: fill }, rectRadius: mm(3.2), line: { color: fill }
  });
  s.addText(text, {
    x: mm(x), y: mm(y), w: mm(w), h: mm(6.4), align: 'center', valign: 'middle', margin: 0,
    fontFace: JP, fontSize: pt(3.1), bold: true, color: 'FFFFFF', charSpacing: 0.6
  });
};
badge(PAD, 88, 'iPhoneのホーム画面に追加して、アプリとして遊べる', INK);
badge(PAD + 91, 34, 'β版・テスト公開中', RED);

// ---- タイトル ----
y = 22;
s.addText(
  [
    { text: '４８', options: { color: RED } },
    { text: 'ヶ月の\nディアボロ', options: { color: INK } }
  ],
  { x: mm(PAD - 1), y: mm(y), w: mm(120), h: mm(48), margin: 0, align: 'left', valign: 'top',
    fontFace: JP, fontSize: pt(21), bold: true, lineSpacing: pt(21) * 1.02 }
);
s.addText('４年間ディアボロ漬けの育成ゲーム。', {
  x: mm(PAD - 1), y: mm(70), w: mm(120), h: mm(8), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(5), bold: true, color: INK_SOFT
});

// ---- 右上: ホーム画面に追加したあとの見え方 ----
s.addImage({ path: path.join(IMG, 'icon.png'), x: mm(PAD + CW - 29.5), y: mm(25), w: mm(25), h: mm(25) });
s.addText('４８ヶ月のディアボロ', {
  x: mm(PAD + CW - 34), y: mm(51.5), w: mm(34), h: mm(5), margin: 0, align: 'center',
  fontFace: JP, fontSize: pt(2.8), bold: true, color: INK
});
s.addText('ホーム画面には\nこのアイコンで並びます', {
  x: mm(PAD + CW - 34), y: mm(56), w: mm(34), h: mm(9), margin: 0, align: 'center',
  fontFace: JP, fontSize: pt(2.6), bold: true, color: INK_SOFT, lineSpacing: pt(2.6) * 1.45
});

// ---- タイトル画（白フェード・角丸を焼き込み済み） ----
const ART_Y = 81;
s.addImage({ path: path.join(IMG, 'art.png'), x: mm(PAD), y: mm(ART_Y), w: mm(CW), h: mm(80) });

// ---- メインコピー ----
s.addText(
  [
    { text: 'その48ヶ月で、', options: { color: INK } },
    { text: 'どの部門を極める？', options: { color: RED } }
  ],
  { x: mm(PAD), y: mm(ART_Y + 74), w: mm(CW), h: mm(14), margin: 0, align: 'center', valign: 'top',
    fontFace: JP, fontSize: pt(9.4), bold: true }
);
s.addText(
  [
    { text: 'ディアボロの大会に出て、ポイントを稼ごう。', options: { color: INK_SOFT, breakLine: true } },
    { text: 'オールラウンダーか、特化型か。どんな選手になるかは、あなた次第。', options: { color: INK_SOFT, breakLine: true } },
    { text: '世界大会に、出場できるか。', options: { color: INK } }
  ],
  { x: mm(PAD), y: mm(ART_Y + 89), w: mm(CW), h: mm(24), margin: 0, align: 'center', valign: 'top',
    fontFace: JP, fontSize: pt(4.6), bold: true, lineSpacing: pt(4.6) * 1.5 }
);

// ---- 卒業カードコレクション（上の罫線は元デザインの区切り） ----
const P_Y = 202;
s.addShape(pres.ShapeType.rect, { x: mm(PAD), y: mm(P_Y), w: mm(CW), h: mm(0.8), fill: { color: INK }, line: { color: INK } });
s.addText('卒業カードコレクション', {
  x: mm(PAD), y: mm(P_Y + 3), w: mm(64), h: mm(8), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(5.2), bold: true, color: INK
});
s.addText('4年間の育て方に応じた称号と能力のカードが図鑑に残ります。次にプレイするときは、先輩として後輩の前に現れます。', {
  x: mm(PAD + 66), y: mm(P_Y + 3.8), w: mm(CW - 66), h: mm(12), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(3.4), color: INK_SOFT, lineSpacing: pt(3.4) * 1.6
});

// ---- QRブロック ----
const C_Y = 222, C_H = 60;
s.addShape(pres.ShapeType.roundRect, {
  x: mm(PAD), y: mm(C_Y), w: mm(CW), h: mm(C_H),
  fill: { color: CREAM }, line: { color: INK, width: pt(1) }, rectRadius: mm(4)
});
s.addShape(pres.ShapeType.rect, { x: mm(PAD + 6), y: mm(C_Y + 9.5), w: mm(41), h: mm(41), fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } });
s.addImage({ path: path.join(IMG, 'qr.png'), x: mm(PAD + 8), y: mm(C_Y + 11.5), w: mm(37), h: mm(37) });

const TX = PAD + 53, TW = CW - 53 - 6;
s.addText('iPhoneのカメラで読みこめば、\nすぐ遊べる。', {
  x: mm(TX), y: mm(C_Y + 7), w: mm(TW), h: mm(18), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(6.2), bold: true, color: INK, lineSpacing: pt(6.2) * 1.25
});
s.addText('ホーム画面に追加して ［PWA］ アプリにする', {
  x: mm(TX), y: mm(C_Y + 25), w: mm(TW), h: mm(6), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(3.3), bold: true, color: INK
});
s.addText('① カメラでQRを読む　② 共有ボタンを押す　③「ホーム画面に追加」を選ぶ', {
  x: mm(TX), y: mm(C_Y + 30.5), w: mm(TW), h: mm(6), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(3.2), bold: true, color: INK
});
s.addText('aratama-ship-it.github.io/diabolo4yeargame/', {
  x: mm(TX), y: mm(C_Y + 36.5), w: mm(TW), h: mm(6), margin: 0, valign: 'top',
  fontFace: 'Arial', fontSize: pt(3.5), bold: true, color: INK
});
s.addText('PWAは、ホーム画面に追加するだけでアプリのように使えるWebの仕組みです。\nApp Storeからの入手も会員登録も不要。一度ひらけば、電波がなくても遊べます。', {
  x: mm(TX), y: mm(C_Y + 42.5), w: mm(TW), h: mm(12), margin: 0, valign: 'top',
  fontFace: JP, fontSize: pt(3.1), bold: true, color: INK_SOFT, lineSpacing: pt(3.1) * 1.5
});

// ---- フッター ----
s.addText('４８ヶ月のディアボロ　β版 v0.9　／　iPhone・Android・PCのブラウザで動きます', {
  x: mm(PAD), y: mm(285), w: mm(CW), h: mm(5), margin: 0, align: 'right',
  fontFace: JP, fontSize: pt(2.6), bold: true, color: GRAY
});

pres.writeFile({ fileName: path.join(ROOT, 'docs/promo/2026-08-09-a4-flyer.pptx') })
  .then(f => console.log('書き出し:', f));
