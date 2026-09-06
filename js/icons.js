(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  // UIの器（ナビ・モーダル見出し・予定一覧）のアイコン。
  // 絵文字は機種とOSで見た目が変わり、アバターや行動ボタンのインク線とトーンが揃わないため
  // （2026-08-29 UXレビュー G1）、同じ「インク線・角丸・塗りなし」で描き直したもの。
  //
  // 描き方の決まり:
  //   - 24×24 の枠。線幅2・線端と角は丸。塗りは原則なし（点だけ塗る）。
  //   - 色は currentColor＝親のテキスト色を継ぐ。ナビの選択中（黄地にインク）でもそのまま効く。
  //   - 物語の中の絵文字（🎉 ✨ 💧 🥇 🔥覚醒 ⚠ 🔒 など）は置き換えない。
  //     置き換えるのは「アイコンとして単独で置かれているもの」だけ。
  const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
                   'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

  // 花びらを中心から等角に5つ置く（桜＝卒業生）。角度は上を起点に72度ずつ。
  function petals() {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const a = (-90 + i * 72) * Math.PI / 180;
      const cx = 12 + Math.cos(a) * 4.3;
      const cy = 12 + Math.sin(a) * 4.3;
      out.push('M' + cx.toFixed(2) + ' ' + (cy - 2.7).toFixed(2)
        + 'a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z');
    }
    return out;
  }

  const PATHS = {
    // ホーム: 切妻屋根の家。扉まで描くと24pxでも「家」と読める
    home: ['M3.2 11.6 12 4.2l8.8 7.4', 'M5.6 10.4V19.8h12.8V10.4', 'M9.8 19.8v-5.2h4.4v5.2'],
    // 詳細: 能力の高低を見る画面なので棒グラフ
    chart: ['M3.4 20.2h17.2', 'M6.6 20.2v-6.2', 'M12 20.2V7.6', 'M17.4 20.2v-9.2'],
    // 設定: つまみ2つのスライダー。歯車を線だけで描くと太陽に見えたので、
    //       「調整するもの」が一目で分かる形にした（2026-09-07 目視で差し替え）
    gear: ['M3.6 8.4h9.6', 'M18.4 8.4h2', 'M3.6 15.6h3.6', 'M12.4 15.6h8',
           'M15.8 6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z',
           'M9.8 13.2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z'],
    // メダル: リボン2本＋円盤。円の中に線を足すと「的」に見えるので何も入れない
    medal: ['M7.2 3.2 10.3 10.2', 'M16.8 3.2 13.7 10.2',
            'M12 9.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4Z'],
    // 本: 見開き。図鑑と記録ログ
    book: ['M12 6.6C10.3 5.3 7.9 4.7 4.4 4.7v13.6c3.5 0 5.9.6 7.6 1.9 1.7-1.3 4.1-1.9 7.6-1.9V4.7c-3.5 0-5.9.6-7.6 1.9Z',
           'M12 6.6v13.6'],
    // カレンダー: 今後の予定
    calendar: ['M4.4 5.8h15.2a1.8 1.8 0 0 1 1.8 1.8v11.2a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8V7.6a1.8 1.8 0 0 1 1.8-1.8Z',
               'M2.6 10.6h18.8', 'M8 3.2v4.4', 'M16 3.2v4.4'],
    // 桜: 卒業生名簿
    flower: petals(),
    // トロフィー: 大会
    trophy: ['M7.8 4.2h8.4v4.6a4.2 4.2 0 0 1-8.4 0Z',
             'M7.8 5.6H5.2v1.4a3.2 3.2 0 0 0 2.8 3.2', 'M16.2 5.6h2.6v1.4a3.2 3.2 0 0 1-2.8 3.2',
             'M12 13v3.4', 'M9.8 16.4h4.4v3.8', 'M8.6 20.2h6.8'],
    // 地球: 世界大会
    globe: ['M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2Z', 'M3.6 12h16.8',
            'M12 3.4c2.6 2.4 3.9 5.2 3.9 8.6s-1.3 6.2-3.9 8.6c-2.6-2.4-3.9-5.2-3.9-8.6S9.4 5.8 12 3.4Z'],
    // 鉛筆: 定期テスト
    pencil: ['M4.2 19.8 5.3 15.6 15.9 5l3.1 3.1L8.4 18.7Z', 'M14.4 6.5 17.5 9.6'],
    // ディアボロ: 全国大会予選。三角2つだけだと砂時計に見えたので、
    //             カップの縁を楕円で描いて立体にした（2026-09-07 目視で差し替え）
    diabolo: ['M6.3 6.2a5.7 1.7 0 1 0 11.4 0 5.7 1.7 0 1 0-11.4 0',
              'M6.3 6.2c.2 3 2.6 5.1 5.7 5.5', 'M17.7 6.2c-.2 3-2.6 5.1-5.7 5.5',
              'M6.3 17.8a5.7 1.7 0 1 0 11.4 0 5.7 1.7 0 1 0-11.4 0',
              'M6.3 17.8c.2-3 2.6-5.1 5.7-5.5', 'M17.7 17.8c-.2-3-2.6-5.1-5.7-5.5'],
    // 人がふたり: 練習会
    people: ['M8.6 4.8a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z',
             'M3.4 20.2c0-3 2.3-5.2 5.2-5.2s5.2 2.2 5.2 5.2',
             'M16.4 6.4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
             'M15.2 15.3c.4-.2.8-.3 1.2-.3 2.4 0 4.2 1.9 4.2 4.4'],
    // 吹き出し: ホームのログ帯
    chat: ['M4.4 5.4h15.2a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H10.6L6 20.4v-4.2H4.4a1.6 1.6 0 0 1-1.6-1.6V7a1.6 1.6 0 0 1 1.6-1.6Z']
  };

  // 中心の点だけは塗る（花の芯）。線だけだと桜に見えないため。
  const DOTS = { flower: [{ cx: 12, cy: 12, r: 1.35 }] };

  const NS = 'http://www.w3.org/2000/svg';

  function svg(name, cls) {
    const paths = PATHS[name];
    if (!paths) return null;
    const root = document.createElementNS(NS, 'svg');
    root.setAttribute('viewBox', '0 0 24 24');
    root.setAttribute('class', 'ui-icon' + (cls ? ' ' + cls : ''));
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('focusable', 'false');
    paths.forEach(function (d) {
      const p = document.createElementNS(NS, 'path');
      Object.keys(STROKE).forEach(k => p.setAttribute(k, STROKE[k]));
      p.setAttribute('d', d);
      root.appendChild(p);
    });
    (DOTS[name] || []).forEach(function (c) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', c.cx); dot.setAttribute('cy', c.cy); dot.setAttribute('r', c.r);
      dot.setAttribute('fill', 'currentColor');
      root.appendChild(dot);
    });
    return root;
  }

  // 要素の先頭にアイコンを差し込む（既にあれば何もしない）。
  function prepend(target, name, cls) {
    if (!target || target.querySelector(':scope > .ui-icon')) return null;
    const node = svg(name, cls);
    if (node) target.insertBefore(node, target.firstChild);
    return node;
  }

  // data-icon を持つ静的な要素へ一括で差し込む。index.html 側に名前を書けるので、
  // 見出しやボタンを足すたびにJSを触らずに済む。
  function applyStatic(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (elm) {
      prepend(elm, elm.getAttribute('data-icon'));
    });
  }

  DT.icons = { svg: svg, prepend: prepend, applyStatic: applyStatic, PATHS: PATHS, names: Object.keys(PATHS) };
})(typeof window !== 'undefined' ? window : globalThis);
