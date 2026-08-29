/* ============================================================
   選手アバター（パーツ組み合わせ式・2026-08-28）
   - パワプロ／Mii式に「目・眉・口・髪」を組み合わせて2次元の顔を作る。
   - 実装はSVG。理由は3つ:
       ① パーツのズレが原理的に起きない（同じviewBox上の座標で描くため）
       ② 髪色・肌色・瞳色を無段階に変えられる（塗り分けが属性なので）
       ③ 44pxのやる気顔から300pxの卒業カードまで、1つの定義で綺麗に出る
   - 絵柄はゲームUIと同じ「インク縁取り＋フラット塗り」。塗り込みイラスト
     （タイトル絵・ローダー演者・カード絵）とは意図的に別レイヤーの表現。
     分身＝ベクター／世界＝イラスト、という使い分け（2026-08-28 本人決定）。

   座標系: viewBox="0 0 120 120"。円形に切り抜かれる前提で、
   半径60の円からはみ出す位置に意味のある要素を置かない。
     頭頂 y=16〜24 ／ 目の高さ y=62 ／ 口 y=78 ／ あご y=88 ／ 肩 y=92〜120
     目の中心 x=46（左）と x=74（右）。左右は同じ絵を反転して置く。
   ============================================================ */
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  // ---- 色（無段階に変えられるのがベクターの利点。ここは「よく使う既定値」） ----
  const PALETTE = {
    skin: ['#ffe2c9', '#f8cca9', '#e6b085', '#c98d61', '#a06a45'],
    hair: ['#2c2f3a', '#4a3428', '#7c4a2a', '#b8702f', '#e0aa3c', '#efdcae',
           '#8f3a3a', '#3d5a8a', '#5f3d80', '#d2708f'],
    eye:  ['#3a2a1c', '#63401f', '#2f6d8c', '#3b7a4e', '#7a3a5e', '#454a70'],
    wear: ['#e0574f', '#4d96ff', '#2ec4b6', '#ffd166', '#7ac74f', '#2b3a67'],
  };

  const INK = '#2b3a67';

  // 1ページに複数のアバターが並ぶので、clipPathのidは必ず重複させない
  let uid = 0;

  // 線の太さの基準。viewBox 120 に対しての値で、UIの3px縁取りと同じ強さに見えるよう調整した
  const LW_BASE = { outline: 3.1, inner: 2.4, thin: 1.8 };
  // 実際に描くときの線幅。絵柄プリセットの倍率を掛けて、描画の頭で入れ替える。
  // 描画は同期処理なので、複数の顔を並べても値が混ざることはない。
  const LW = Object.assign({}, LW_BASE);

  /* ============================================================
     絵柄プリセット（顔パーツの大きさ・間隔・線の太さをまとめて切り替える）
     - 顔の輪郭・髪の形は共通のまま、「パーツの詰まり具合」だけが変わる。
     - eye: 目の大きさ倍率 ／ gap: 両目の間隔 ／ eyeY・browY・mouthY: 縦位置
     - mouth: 口の大きさ倍率 ／ lw: 線の太さ倍率 ／ nose: 鼻の大きさ倍率
     ============================================================ */
  const PROPORTIONS = [
    { id: 'now',    label: 'いまの',       eye: 1.00, gap: 28, eyeY: 64, browY: 52, mouth: 1.00, mouthY: 79, lw: 1.00, nose: 1.00 },
    { id: 'calm',   label: 'ひかえめ',     eye: 0.85, gap: 30, eyeY: 64, browY: 53, mouth: 0.88, mouthY: 79, lw: 0.94, nose: 0.95 },
    { id: 'mii',    label: 'あっさり',     eye: 0.72, gap: 31, eyeY: 63, browY: 53, mouth: 0.78, mouthY: 78, lw: 0.86, nose: 0.80 },
    { id: 'toy',    label: 'くっきり',     eye: 0.80, gap: 30, eyeY: 64, browY: 53, mouth: 0.85, mouthY: 79, lw: 1.14, nose: 0.90 },
    { id: 'sporty', label: 'スポーツ寄り', eye: 0.74, gap: 31, eyeY: 66, browY: 55, mouth: 0.84, mouthY: 81, lw: 0.90, nose: 0.90 },
  ];
  const PROP_BY_ID = {};
  PROPORTIONS.forEach(pr => { PROP_BY_ID[pr.id] = pr; });

  // 採用した絵柄＝「ひかえめ」（2026-08-28 本人決定）。
  // 他の4案は比較用に残してある（design/avatar-styles.html で見比べられる）。
  // ここを変えるとゲーム全体の顔の印象が変わるので、変更は本人の判断で行う。
  let defaultProportion = 'calm';

  // ---- 小物 ----
  const esc = v => String(v).replace(/"/g, '&quot;');
  const p = (d, fill, sw) =>
    '<path d="' + d + '" fill="' + esc(fill || 'none') + '" stroke="' + INK +
    '" stroke-width="' + (sw === undefined ? LW.outline : sw) +
    '" stroke-linejoin="round" stroke-linecap="round"/>';
  const line = (d, sw, color) =>
    '<path d="' + d + '" fill="none" stroke="' + esc(color || INK) + '" stroke-width="' + sw +
    '" stroke-linecap="round" stroke-linejoin="round"/>';
  const ell = (cx, cy, rx, ry, fill, sw) =>
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + esc(fill) +
    (sw ? '" stroke="' + INK + '" stroke-width="' + sw : '" stroke="none') + '"/>';

  // 髪の陰影用に少しだけ暗い色を作る（塗り分けを増やさずに立体感を出す）
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = 1 - (amount === undefined ? 0.18 : amount);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ============================================================
     輪郭（5種）。
     **頭のてっぺん側（y<52あたり）はどれも同じ幅にしてある。**
     前髪は x=26〜94 の一番広い頭に合わせて描いてあるので、ここを細くすると
     髪が顔からはみ出して宙に浮く。違いは「頬から下」で出す（2026-08-29 作り直し）。
     ============================================================ */
  const FACES = [
    // 縦長・顎が細い
    { id: 'egg', label: 'たまご',
      d: 'M60 20 C79 20 91 35 91 55 C91 76 74 93 60 93 C46 93 29 76 29 55 C29 35 41 20 60 20 Z' },
    // 横広・背が低い＝まん丸
    { id: 'round', label: 'まる',
      d: 'M60 21 C81 21 93 34 93 52 C93 71 81 83 60 83 C39 83 27 71 27 52 C27 34 39 21 60 21 Z' },
    // 直線的なエラ。顎の角がはっきり出る
    { id: 'square', label: 'えら',
      d: 'M60 20 C79 20 91 33 91 51 L91 72 C91 83 84 89 74 89 L46 89 C36 89 29 83 29 72 L29 51 C29 33 41 20 60 20 Z' },
    // 頬骨が張って顎先がとがる
    { id: 'pointed', label: 'とがり',
      d: 'M60 20 C80 20 92 34 92 53 C92 68 84 80 60 95 C36 80 28 68 28 53 C28 34 40 20 60 20 Z' },
    // 下ぶくれ。頬が横へふくらむ
    { id: 'chubby', label: 'ふっくら',
      d: 'M60 20 C79 20 91 33 91 50 C94 64 90 82 78 88 C72 91 66 92 60 92 C54 92 48 91 42 88 C30 82 26 64 29 50 C29 33 41 20 60 20 Z' },
  ];

  /* ============================================================
     目（6種）。ローカル座標の原点が目の中心、+x が顔の外側。
     左目は scale(-1,1) で置くので、1つ描けば左右そろう。
     ============================================================ */
  function eyeBase(rx, ry, rot, eyeColor, opts) {
    opts = opts || {};
    const g = [];
    g.push('<g transform="rotate(' + (rot || 0) + ')">');
    g.push(ell(0, 0, rx, ry, '#ffffff', LW.inner));
    const ir = opts.iris || Math.min(rx, ry) * 0.72;
    g.push(ell(0, ry * 0.12, ir, Math.min(ir, ry * 0.92), eyeColor, 0));
    g.push(ell(0, ry * 0.12, ir * 0.46, Math.min(ir * 0.46, ry * 0.55), '#20263d', 0));
    g.push(ell(-ir * 0.5, -ry * 0.38, ir * 0.34, ir * 0.3, '#ffffff', 0));
    if (opts.sparkle) g.push(ell(ir * 0.45, ry * 0.42, ir * 0.2, ir * 0.18, '#ffffff', 0));
    if (opts.lid) {
      // ジト目: まぶたを上からかぶせる
      g.push('<path d="M' + (-rx - 1) + ' ' + (-ry * 0.15) + ' L' + (rx + 1) + ' ' + (-ry * 0.15) +
        ' L' + (rx + 1) + ' ' + (-ry - 2) + ' L' + (-rx - 1) + ' ' + (-ry - 2) + ' Z" fill="#ffffff"/>');
      g.push(line('M' + (-rx) + ' ' + (-ry * 0.15) + ' L' + rx + ' ' + (-ry * 0.15), LW.inner));
    }
    g.push('</g>');
    return g.join('');
  }

  // 星型の瞳（ほしめ用）。中心から交互に大小の半径を取った10角形。
  function starPoints(r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rr = (i % 2) ? r * 0.44 : r;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push((Math.cos(a) * rr).toFixed(1) + ',' + (Math.sin(a) * rr).toFixed(1));
    }
    return pts.join(' ');
  }

  // s = 絵柄プリセットの目の大きさ倍率。
  // 前半6種は同じ楕円の回転・比率違い。それだけだと並べたとき見分けがつかないので、
  // 後半6種は「輪郭の形そのものが変わる」ものを入れてある（2026-08-29 追加）。
  const EYES = [
    // 「たれ」「つり」は楕円を十数度回しただけで、並べても「まる」と区別がつかなかったため
    // 2026-08-29 に「まる」へ統合した。傾きで character を出したい場合は、
    // 回転ではなく まぶたの形そのものを変えたものを末尾に足すこと。
    { id: 'round',  label: 'まる',     draw: (c, s) => eyeBase(7.4 * s, 8.4 * s, 0, c) },
    { id: 'narrow', label: 'ほそ',     draw: (c, s) => eyeBase(8 * s, 5 * s, 0, c) },
    { id: 'shiny',  label: 'きらきら', draw: (c, s) => eyeBase(8 * s, 9.4 * s, 0, c, { iris: 6.2 * s, sparkle: true }) },
    { id: 'bored',  label: 'ジト',     draw: (c, s) => eyeBase(7.6 * s, 7.2 * s, 0, c, { lid: true }) },
    // ---- ここから形が大きく変わるもの ----
    // 白目を持たない点目。シルエットが根本的に違うので一目で見分けられる
    { id: 'dot',    label: 'てんてん', draw: (c, s) =>
        ell(0, 0, 4.4 * s, 5.4 * s, '#20263d', 0) + ell(-1.5 * s, -1.9 * s, 1.6 * s, 1.4 * s, '#ffffff', 0) },
    // 常に笑っている閉じ目
    { id: 'smiley', label: 'にっこり', draw: (c, s) =>
        line('M' + (-8 * s) + ' ' + (2.6 * s) + ' Q0 ' + (-6.8 * s) + ' ' + (8 * s) + ' ' + (2.6 * s), LW.outline) },
    // 外側の上まぶたにまつげ
    { id: 'lash',   label: 'まつげ',   draw: (c, s) => eyeBase(7.4 * s, 8.6 * s, 0, c) +
        line('M' + (4.6 * s) + ' ' + (-7.2 * s) + ' l' + (3.6 * s) + ' ' + (-2.8 * s) +
             ' M' + (7 * s) + ' ' + (-4.6 * s) + ' l' + (3.8 * s) + ' ' + (-1.4 * s), LW.inner) },
    // 重く角のついた上まぶたで鋭さを出す
    { id: 'hawk',   label: 'するどい', draw: (c, s) => eyeBase(8 * s, 7 * s, -12, c) +
        line('M' + (-9 * s) + ' ' + (-1.8 * s) + ' Q0 ' + (-8.8 * s) + ' ' + (9.6 * s) + ' ' + (-5.6 * s), LW.outline + 0.9) },
    // 白目が広く瞳が小さい＝驚き・気迫
    { id: 'wide',   label: 'みひらき', draw: (c, s) => eyeBase(8.2 * s, 9.6 * s, 0, c, { iris: 4.2 * s }) },
    // 瞳が星。魅せる選手向け
    { id: 'star',   label: 'ほしめ',   draw: (c, s) =>
        ell(0, 0, 7.6 * s, 8.8 * s, '#ffffff', LW.inner) +
        '<polygon points="' + starPoints(6.3 * s) + '" fill="' + esc(c) + '"/>' +
        ell(-2.5 * s, -3.1 * s, 1.9 * s, 1.7 * s, '#ffffff', 0) },
  ];

  // 表情で差し替わる目（プレイヤーが選んだ形より優先される）
  const EYE_MOODS = {
    happy: (c, s) => line('M' + (-8 * s) + ' ' + (2 * s) + ' Q0 ' + (-7 * s) + ' ' + (8 * s) + ' ' + (2 * s), LW.outline),
    sad:   (c, s) => eyeBase(8.5 * s, 9 * s, 16, c) +
                     line('M' + (-7 * s) + ' ' + (12 * s) + ' Q0 ' + (9 * s) + ' ' + (6 * s) + ' ' + (13 * s), LW.thin),
    fire:  (c, s) => eyeBase(9 * s, 11 * s, -10, c, { iris: 7.8 * s }),
    pain:  (c, s) => line('M' + (-7 * s) + ' ' + (-5 * s) + ' L' + (7 * s) + ' ' + (5 * s) +
                          ' M' + (7 * s) + ' ' + (-5 * s) + ' L' + (-7 * s) + ' ' + (5 * s), LW.outline),
  };

  /* ============================================================
     眉（4種）。表情では「外側の端を上下させる回転」だけで喜怒哀楽を作る。
     形を増やさずに表情が出るので、パーツ数を抑えられる。
     ============================================================ */
  const BROWS = [
    { id: 'normal', label: 'ふつう', d: 'M-9 2 Q0 -2.5 9 0',   w: 3.2 },
    { id: 'thick',  label: 'ふとい', d: 'M-9 2.5 Q0 -3.5 9 0.5', w: 4.6 },
    { id: 'droopy', label: 'たれ',   d: 'M-9 -1 Q0 0.5 9 4',   w: 3.0 },
    { id: 'sharp',  label: 'きりっ', d: 'M-9 3.5 Q0 -1 9 -3',  w: 3.4 },
  ];

  /* ============================================================
     口（基本5種＋表情差分）。原点は口の中心。
     ============================================================ */
  const MOUTHS = [
    { id: 'smile', label: 'にこ',     draw: () => line('M-8 -1.5 Q0 6.5 8 -1.5', LW.inner) },
    { id: 'flat',  label: 'まっすぐ', draw: () => line('M-7 0 L7 0', LW.inner) },
    { id: 'frown', label: 'への字',   draw: () => line('M-7.5 3.5 Q0 -3 7.5 3.5', LW.inner) },
    { id: 'open',  label: 'あけ',     draw: () => ell(0, 1, 4.8, 5.6, '#8c3a44', LW.inner) },
    { id: 'smirk', label: 'ニヤリ',   draw: () => line('M-8 1 Q-1 5.5 8 -3', LW.inner) },
  ];

  const MOUTH_MOODS = {
    grin: () => p('M-9 -2 Q0 1 9 -2 Q8 8 0 9 Q-8 8 -9 -2 Z', '#8c3a44', LW.inner) +
                p('M-7 -1 Q0 1.4 7 -1 Q6 1.4 0 1.6 Q-6 1.4 -7 -1 Z', '#ffffff', 0),
    smile: () => line('M-7.5 -1 Q0 6 7.5 -1', LW.inner),
    frown: () => line('M-6.5 3 Q0 -2.5 6.5 3', LW.inner),
    wavy:  () => line('M-7 2 Q-3.5 -2 0 2 Q3.5 6 7 2', LW.inner),
    grit:  () => p('M-8 -2 L8 -2 L8 4 L-8 4 Z', '#ffffff', LW.inner) +
                 line('M-3.5 -2 L-3.5 4 M0.5 -2 L0.5 4 M4.5 -2 L4.5 4', LW.thin),
    ouch:  () => line('M-6 3 Q-3 -2 0 2.5 Q3 6.5 6 1', LW.inner),
  };

  /* ============================================================
     前髪（8種）。x=26〜94・頭頂 y=16 の「最も広い頭」に合わせて描く。
     下端が生え際になるので、ここの形がキャラの印象をいちばん左右する。
     ============================================================ */
  // 生え際（下端）は 44〜48 に揃える。眉が 52、目が 64 なので、
  // ここを下げすぎると眉が髪に隠れる（2026-08-28 に一度やらかした箇所）。
  const HAIR_FRONT = [
    { id: 'blunt', label: 'ぱっつん',
      d: 'M26 57 C26 30 40 16 60 16 C80 16 94 30 94 57 L94 48 C79 43 68 46.5 60 46.5 C52 46.5 41 43 26 48 Z' },
    { id: 'side', label: 'わけ',
      d: 'M26 58 C26 30 40 16 60 16 C80 16 94 30 94 58 L93 42 C86 53 71 51 61 44.5 C51 38 38 41 30 51 Z' },
    { id: 'spiky', label: 'ツンツン',
      d: 'M26 53 L31 33 L36 44 L43 25 L49 40 L57 19 L64 37 L71 21 L78 39 L85 29 L90 45 L94 38 L94 54 C84 48 70 49 60 48 C50 47 36 47 26 53 Z' },
    { id: 'center', label: 'まんなかわけ',
      d: 'M26 58 C26 30 40 16 60 16 C80 16 94 30 94 58 L93 44 C86 40 74 40.5 66.5 48.5 L60 40 L53.5 48.5 C46 40.5 34 40 27 44 Z' },
    { id: 'back', label: 'おでこ',
      d: 'M26 53 C26 28 40 16 60 16 C80 16 94 28 94 53 L94 36 C82 30.5 70 32.5 60 32.5 C50 32.5 38 30.5 26 36 Z' },
    { id: 'soft', label: 'ふんわり',
      d: 'M24 59 C24 29 40 14 60 14 C80 14 96 29 96 59 L95 47 C88 39 78 45.5 68 43.5 C58 41.5 48 47.5 38 43.5 C32 41 27 43.5 25 49 Z' },
    { id: 'messy', label: 'ぱらり',
      d: 'M26 57 C26 30 40 16 60 16 C80 16 94 30 94 57 L92 43 C88 51 82 45 78 51 C74 57 68 47 62 51 C56 55 50 45 44 49 C38 53 32 45 27 49 Z' },
    { id: 'buzz', label: 'ぼうず',
      d: 'M27 51 C27 28 41 17 60 17 C79 17 93 28 93 51 C86 43 74 39.5 60 39.5 C46 39.5 34 43 27 51 Z' },
  ];

  /* ============================================================
     後ろ髪（5種）。顔より先（下）に描く。
     ============================================================ */
  const HAIR_BACK = [
    { id: 'none',   label: 'みじかい', d: '' },
    { id: 'medium', label: 'ミディアム',
      d: 'M24 52 C24 26 40 14 60 14 C80 14 96 26 96 52 L96 82 C96 89 90 91 87 86 L87 56 C87 36 77 27 60 27 C43 27 33 36 33 56 L33 86 C30 91 24 89 24 82 Z' },
    { id: 'long',   label: 'ロング',
      d: 'M24 52 C24 26 40 14 60 14 C80 14 96 26 96 52 L96 112 C96 118 88 119 87 113 L87 56 C87 36 77 27 60 27 C43 27 33 36 33 56 L33 113 C32 119 24 118 24 112 Z' },
    { id: 'pony',   label: 'ポニーテール',
      d: 'M24 52 C24 26 40 14 60 14 C80 14 96 26 96 52 L96 70 C96 76 90 77 88 72 L88 56 C88 36 77 27 60 27 C43 27 32 36 32 56 L32 72 C30 77 24 76 24 70 Z' +
         ' M92 44 C104 46 110 58 108 72 C107 84 100 92 94 90 C99 78 99 60 90 54 Z' },
    { id: 'twin',   label: 'ツインテール',
      d: 'M24 52 C24 26 40 14 60 14 C80 14 96 26 96 52 L96 68 C96 74 90 75 88 70 L88 56 C88 36 77 27 60 27 C43 27 32 36 32 56 L32 70 C30 75 24 74 24 68 Z' +
         ' M93 46 C104 49 108 62 104 74 C101 83 95 88 91 85 C96 74 97 58 90 53 Z' +
         ' M27 46 C16 49 12 62 16 74 C19 83 25 88 29 85 C24 74 23 58 30 53 Z' },
  ];

  /* ============================================================
     アクセサリ（顔の上に重ねる）
     ============================================================ */
  const ACCESSORIES = [
    { id: 'none',    label: 'なし',         draw: () => '' },
    // メガネは目の位置・大きさに追従させる（絵柄プリセットを変えてもズレない）
    { id: 'glasses', label: 'メガネ',       draw: (cfg, pr) => {
        const w = 21 * pr.eye + 3, h = 17 * pr.eye + 2;
        const lx = 60 - pr.gap / 2 - w / 2, rx = 60 + pr.gap / 2 - w / 2, y = pr.eyeY - h / 2;
        return '<g fill="rgba(255,255,255,.26)" stroke="' + INK + '" stroke-width="' + LW.inner + '">' +
          '<rect x="' + lx + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h * 0.38) + '"/>' +
          '<rect x="' + rx + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h * 0.38) + '"/></g>' +
          line('M' + (lx + w) + ' ' + pr.eyeY + ' Q60 ' + (pr.eyeY - 2) + ' ' + rx + ' ' + pr.eyeY, LW.inner); } },
    { id: 'band',    label: 'ヘアバンド',   draw: (cfg) =>
        p('M27 45 C40 37 80 37 93 45 L93 51 C80 43 40 43 27 51 Z', PALETTE.wear[cfg.wear % PALETTE.wear.length], LW.inner) },
    { id: 'cap',     label: 'キャップ',     draw: (cfg) => {
        const c = PALETTE.wear[cfg.wear % PALETTE.wear.length];
        return p('M27 44 C27 24 41 14 60 14 C79 14 93 24 93 44 C80 37 40 37 27 44 Z', c, LW.outline) +
               p('M25 44 C38 39 62 39 72 45 C62 50 38 50 25 49 Z', shade(c, .22), LW.inner); } },
    { id: 'plaster', label: 'ばんそうこう', draw: () =>
        '<g transform="rotate(-18 80 74)">' +
        p('M72 70 L88 70 L88 78 L72 78 Z', '#ffe9c9', LW.thin) +
        line('M77 70 L77 78 M83 70 L83 78', 1.2, '#d8b489') + '</g>' },
  ];

  /* ============================================================
     表情（やる気5段階＋覚醒＋怪我）。
     プレイヤーが選んだ顔を保ったまま、目・口・眉の角度だけを差し替える。
     ============================================================ */
  const MOODS = {
    best:    { eyes: 'happy', mouth: 'grin',  brow: -9,  blush: true },
    good:    {                mouth: 'smile', brow: -4 },
    normal:  {},
    bad:     {                mouth: 'frown', brow: 7 },
    worst:   { eyes: 'sad',   mouth: 'wavy',  brow: 12 },
    awaken:  { eyes: 'fire',  mouth: 'grit',  brow: -13, glow: true },
    injured: { eyes: 'pain',  mouth: 'ouch',  brow: 9,   forcePlaster: true },
  };
  const MOOD_KEYS = Object.keys(MOODS);

  /* ============================================================
     設定オブジェクト
     ============================================================ */
  const SLOTS = [
    { key: 'face',  list: FACES,        label: '輪郭' },
    { key: 'eyes',  list: EYES,         label: '目' },
    { key: 'brows', list: BROWS,        label: '眉' },
    { key: 'mouth', list: MOUTHS,       label: '口' },
    { key: 'hairF', list: HAIR_FRONT,   label: '前髪' },
    { key: 'hairB', list: HAIR_BACK,    label: '後ろ髪' },
    { key: 'acc',   list: ACCESSORIES,  label: '小物' },
  ];
  const COLOR_SLOTS = [
    { key: 'skin', list: PALETTE.skin, label: '肌' },
    { key: 'hair', list: PALETTE.hair, label: '髪色' },
    { key: 'eye',  list: PALETTE.eye,  label: '瞳' },
    { key: 'wear', list: PALETTE.wear, label: '服' },
  ];

  function defaults() {
    return { face: 0, eyes: 0, brows: 0, mouth: 0, hairF: 0, hairB: 0, acc: 0, skin: 0, hair: 0, eye: 0, wear: 0 };
  }

  // 保存データが壊れていても必ず描ける設定に正規化する（古いセーブ対策）
  function normalize(cfg) {
    const out = defaults();
    if (!cfg || typeof cfg !== 'object') return out;
    SLOTS.forEach(s => {
      const v = cfg[s.key];
      if (typeof v === 'number' && v >= 0 && v < s.list.length) out[s.key] = Math.floor(v);
    });
    COLOR_SLOTS.forEach(s => {
      const v = cfg[s.key];
      if (typeof v === 'number' && v >= 0 && v < s.list.length) out[s.key] = Math.floor(v);
    });
    return out;
  }

  function random(rng) {
    rng = rng || Math.random;
    const cfg = defaults();
    SLOTS.forEach(s => { cfg[s.key] = Math.floor(rng() * s.list.length); });
    COLOR_SLOTS.forEach(s => { cfg[s.key] = Math.floor(rng() * s.list.length); });
    // 小物は「なし」が出やすいほうが自然（3回に2回はなし）
    if (rng() < 0.66) cfg.acc = 0;
    return cfg;
  }

  // 名前などの文字列から決まった顔を作る。
  // アバター未設定の古い卒業生にも顔を出せるようにするための入口。
  function fromSeed(seed) {
    let h = 2166136261;
    const s = String(seed === undefined || seed === null ? '' : seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let x = (h >>> 0) || 1;
    const rng = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    return random(rng);
  }

  /* ============================================================
     描画
       opts.mood  … 'best'|'good'|'normal'|'bad'|'worst'|'awaken'|'injured'
       opts.body  … 肩から下を描くか（既定true）
       opts.bg    … 円の中の地色。省略で透明
     ============================================================ */
  function svgMarkup(config, opts) {
    opts = opts || {};
    const cfg = normalize(config);
    const mood = MOODS[opts.mood] || MOODS.normal;
    const prop = PROP_BY_ID[opts.proportion || defaultProportion] || PROP_BY_ID.now;
    // 線幅をこの絵柄の倍率へ差し替えてから描く（描画は同期処理なので混ざらない）
    LW.outline = LW_BASE.outline * prop.lw;
    LW.inner = LW_BASE.inner * prop.lw;
    LW.thin = LW_BASE.thin * prop.lw;
    const skin = PALETTE.skin[cfg.skin];
    const hairC = PALETTE.hair[cfg.hair];
    const eyeC = PALETTE.eye[cfg.eye];
    const wearC = PALETTE.wear[cfg.wear];
    const eyeL = 60 - prop.gap / 2;
    const eyeR = 60 + prop.gap / 2;
    const out = [];

    if (opts.bg) out.push('<circle cx="60" cy="60" r="60" fill="' + esc(opts.bg) + '"/>');

    // 覚醒: 背後に放射（既存の覚醒演出と同じ「金の光」の考え方）
    if (mood.glow) {
      out.push('<circle cx="60" cy="58" r="56" fill="rgba(255,209,102,.42)"/>');
      out.push('<circle cx="60" cy="58" r="42" fill="rgba(255,233,180,.55)"/>');
    }

    // 後ろ髪
    const back = HAIR_BACK[cfg.hairB];
    if (back.d) out.push(p(back.d, hairC));

    // 体（肩・首）
    if (opts.body !== false) {
      // 首。輪郭によって顎の高さが y=83〜95 と大きく変わるので、
      // どれでも隙間が出ないよう上は顎より十分高くから、下は襟のV字を覆う幅まで広げる。
      out.push(p('M50 66 L70 66 L74 100 L46 100 Z', shade(skin, .12), 0));
      out.push(p('M14 120 C15 101 30 92 45 88 L60 99 L75 88 C90 92 105 101 106 120 Z', wearC));
      out.push(line('M60 99 L60 120', LW.inner));
    }

    // 耳 → 顔
    out.push(ell(29.5, 62, 5.2, 7.4, skin, LW.outline));
    out.push(ell(90.5, 62, 5.2, 7.4, skin, LW.outline));
    out.push(p(FACES[cfg.face].d, skin));

    // ほお（絶好調のみ）
    if (mood.blush) {
      out.push(ell(38, 72, 6.4, 3.6, 'rgba(255,107,107,.5)', 0));
      out.push(ell(82, 72, 6.4, 3.6, 'rgba(255,107,107,.5)', 0));
    }

    // 目（表情差分があればそちらを使う）
    const eyeArt = mood.eyes ? EYE_MOODS[mood.eyes](eyeC, prop.eye) : EYES[cfg.eyes].draw(eyeC, prop.eye);
    out.push('<g transform="translate(' + eyeL + ' ' + prop.eyeY + ') scale(-1 1)">' + eyeArt + '</g>');
    out.push('<g transform="translate(' + eyeR + ' ' + prop.eyeY + ')">' + eyeArt + '</g>');

    // 眉（形は選んだまま、外側の端の角度だけ表情で変える）
    const brow = BROWS[cfg.brows];
    const browRot = mood.brow || 0;
    const browColor = shade(hairC, .2);
    // 眉は目ほど縮めない。目に合わせて等倍で縮めると、小さめの絵柄で眉が消えてしまう
    const browScale = (1 + prop.eye) / 2;
    [[eyeL, ' scale(-1 1)'], [eyeR, '']].forEach(([x, flip]) => {
      out.push('<g transform="translate(' + x + ' ' + prop.browY + ')' + flip +
        ' rotate(' + browRot + ') scale(' + browScale + ')">' +
        line(brow.d, brow.w * prop.lw / browScale, browColor) + '</g>');
    });

    // 鼻（小さな点だけ。デフォルメ顔なので描き込まない）
    const noseY = (prop.eyeY + prop.mouthY) / 2;
    out.push(line('M60 ' + (noseY - 1.2 * prop.nose) + ' L60 ' + (noseY + 1.3 * prop.nose), 2.6 * prop.nose));

    // 口
    const mouthArt = mood.mouth ? MOUTH_MOODS[mood.mouth]() : MOUTHS[cfg.mouth].draw();
    out.push('<g transform="translate(60 ' + prop.mouthY + ') scale(' + prop.mouth + ')">' + mouthArt + '</g>');

    // 前髪。ツヤは前髪の形でクリップした楕円なので、どの髪型でもはみ出さずに乗る
    const hairD = HAIR_FRONT[cfg.hairF].d;
    out.push(p(hairD, hairC));
    const clipId = 'hc' + (uid++);
    out.push('<clipPath id="' + clipId + '"><path d="' + hairD + '"/></clipPath>');
    out.push('<g clip-path="url(#' + clipId + ')">' +
      '<ellipse cx="45" cy="27" rx="21" ry="7.5" fill="rgba(255,255,255,.26)" transform="rotate(-16 45 27)"/>' +
      '</g>');
    const acc = mood.forcePlaster && cfg.acc === 0
      ? ACCESSORIES[ACCESSORIES.length - 1]
      : ACCESSORIES[cfg.acc];
    out.push(acc.draw(cfg, prop));

    return out.join('');
  }

  function svgString(config, opts) {
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">' +
      svgMarkup(config, opts) + '</svg>';
  }

  // DOMへ挿すとき用。innerHTMLを使わずに済むよう要素で返す
  function svgElement(config, opts) {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 120 120');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = svgMarkup(config, opts);
    return wrap;
  }

  DT.avatar = {
    PALETTE, SLOTS, COLOR_SLOTS, MOODS, MOOD_KEYS, PROPORTIONS,
    FACES, EYES, BROWS, MOUTHS, HAIR_FRONT, HAIR_BACK, ACCESSORIES,
    defaults, normalize, random, fromSeed, svgMarkup, svgString, svgElement,
    getProportion: () => defaultProportion,
    setProportion: id => { if (PROP_BY_ID[id]) defaultProportion = id; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
