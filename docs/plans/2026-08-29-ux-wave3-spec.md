# UX Wave 3「前より良くなったを見せる」実装仕様（Codex向け・確定版）

作成日: 2026-08-29 ／ 設計: Claude（Opus）／ 実装: Codex
根拠: [docs/previews/ux-review-2026-08-29/index.html](../previews/ux-review-2026-08-29/index.html) の D3・C4・F1
前提: Wave 1 実装済み（[2026-08-29-ux-wave1-spec.md](./2026-08-29-ux-wave1-spec.md)）

## ねらい

周回・年次のゲームなのに、**「前より良くなった」を計算するのがプレイヤー任せ**になっている。
16位でも「前回20位 → ▲4」と出れば前向きに受け取れる。データ（`state.results`・RECORDS）は
既に揃っているので、**計算して出すだけ**。ゲームの計算・保存形式は変えない。

| # | 場所 | 変更 |
|---|---|---|
| D3 | 大会の順位発表 | 順位の下に「前回 20位 → ▲4」「初出場」／自己ベストなら印 |
| C4 | 練習の成果 | まとめを「27 → 33」のバーにして、成果と能力の接続を見せる |
| F1 | 卒業画面 | カードの下に「今回のハイライト」3行（前回の周回との比較を含む） |

## 共通ルール

- 変更してよいファイル: `js/app.js`・`css/style.css`・`index.html`・`tests/test-mobile-layout.js`。
- **`js/engine.js`・`js/contest.js`・`js/cards.js`・`js/data.js`・`js/state.js`・`js/avatar.js` は変更しない。**
  順位・スコア・ポイントの計算、保存形式には一切触れない（**表示だけ**）。
- 既存ファイルは編集前に必ず読む。削除・移動・リネームはしない。
- 新しい色を作らない。新設テキストは **`.7rem`（11.2px）未満にしない**（トークンシート §8）。
- `index.html` の `20260829a` を**すべて** `20260829b` に置換。`APP_VERSION` を `short-test11` に上げる。

---

## D3. 順位発表に「前回比」と「自己ベスト」

### 比較の決め方（ここを間違えると意味が変わるので厳密に）

`state.results` には**今回の結果も既に入っている**（contest.js が push 済み）。
比較対象は「**同じ大会種別・同じ部門で、今回より前のターン**」の結果のうち**最も新しいもの**。

```js
// 同じ大会・同じ部門の過去の結果（今回と同じターンのものは除く）
function previousResultOf(r) {
  const past = (state.results || []).filter(x =>
    x.type === r.type && x.division === r.division && x.turn < r.turn);
  if (past.length === 0) return null;
  return past.reduce((a, b) => (b.turn > a.turn ? b : a));
}
// 過去（今回より前）の最高位。今回がそれを上回れば自己ベスト更新
function bestRankBefore(r) {
  const past = (state.results || []).filter(x =>
    x.type === r.type && x.division === r.division && x.turn < r.turn);
  if (past.length === 0) return null;
  return past.reduce((m, x) => Math.min(m, x.rank), Infinity);
}
```
- **`x.turn < r.turn`** が要。同じ大会の別部門は `division` が違うので混ざらない。
  同じターンの結果（今まさに発表中の他部門）も `turn` が同じなので自動的に除かれる。
- ジャグリング全国大会の予選行（`division === 'qualifier'`）は順位が常に1なので、
  **`r.division === 'qualifier'` のときは前回比を出さない**（意味が無い）。

### 表示（`renderRevealStage` の `rankBox` 内）

`rankBox.appendChild(el('div', 'reveal-entrants', ...))` の**直後**に差し込む。

```js
if (r.division !== 'qualifier') {
  const prev = previousResultOf(r);
  const line = el('div', 'reveal-trend');
  if (!prev) {
    line.classList.add('is-first');
    line.textContent = '初出場';
  } else {
    const d = prev.rank - r.rank; // 正なら順位が上がった
    if (d > 0) { line.classList.add('is-up'); line.textContent = '前回 ' + prev.rank + '位 → ▲' + d; }
    else if (d < 0) { line.classList.add('is-down'); line.textContent = '前回 ' + prev.rank + '位 → ▼' + (-d); }
    else { line.classList.add('is-same'); line.textContent = '前回と同じ ' + r.rank + '位'; }
  }
  rankBox.appendChild(line);
  const best = bestRankBefore(r);
  if (best !== null && r.rank < best) {
    rankBox.appendChild(el('div', 'reveal-best', '🎉 自己ベスト更新（これまで ' + best + '位）'));
  }
}
```

### CSS
```css
/* 順位の下の前回比。順位の主役ぶりを壊さないよう控えめに */
.reveal-trend { font-size: .78rem; font-weight: 800; color: var(--ink-soft); margin-top: 2px; animation: rv-fade .5s .85s both; }
.reveal-trend.is-up { color: #1f8a7e; }
.reveal-trend.is-down { color: var(--ink-soft); }
.reveal-best {
  margin-top: 4px; font-size: .74rem; font-weight: 800; color: var(--ink);
  background: var(--sun); border: 2px solid var(--ink); border-radius: 999px; padding: 2px 12px;
  animation: rv-pop .5s 1s both;
}
```
`rv-fade` / `rv-pop` は既存のキーフレーム。`prefers-reduced-motion` の既存ブロックに
`.reveal-trend, .reveal-best` を**追加**して無効化する（既存の reveal 系と同じ扱い）。

---

## C4. 練習の成果を「27 → 33」のバーにする

いまは `textRow('1DH×難易度', '+12')` の文字だけ。**伸びた後の値と、その中での位置**を見せる。

`renderTrainingResult` のまとめ部分（`summaryNodes` を作るところ）を差し替える。
`state` は **applyTraining 適用後**なので現在値が新しい値。**古い値 = 現在値 − 伸び**で出す。

```js
// 伸びた項目を「前 → 後」のバーで見せる。成果画面で能力の変化まで見えるようにする。
function growthRow(label, after, gain) {
  const before = Math.max(0, after - gain);
  const row = el('div', 'grow-row');
  const head = el('div', 'grow-head');
  head.appendChild(el('span', 'grow-label', label));
  head.appendChild(el('span', 'grow-delta num', '+' + gain));
  row.appendChild(head);
  const bar = el('div', 'grow-bar');
  const base = el('span', 'grow-base');   // 伸びる前の分
  const add = el('span', 'grow-add');     // 今回伸びた分
  base.style.width = Math.min(100, before) + '%';
  add.style.width = '0%';
  requestAnimationFrame(() => { add.style.width = Math.min(100 - Math.min(100, before), gain) + '%'; });
  bar.appendChild(base); bar.appendChild(add);
  row.appendChild(bar);
  row.appendChild(el('div', 'grow-val num', before + ' → ' + after));
  return row;
}
```
差し替え:
```js
const summaryNodes = [];
Object.keys(cellTotals).forEach(key => {
  if (cellTotals[key] === 0) return;
  const [genre, method] = key.split('.');
  summaryNodes.push(growthRow(genreLabel(genre) + '×' + statLabelById(method),
    state.skills[genre][method], cellTotals[key]));
});
if (compositionTotal !== 0) summaryNodes.push(growthRow('演技構成', state.composition, compositionTotal));
if (summaryNodes.length === 0) summaryNodes.push(el('div', 'cond-warn', '今月は実りが少なかった……'));
```
- 合計ピル（`.rv-total`）は**そのまま残す**（まとめの最後に付く既存処理を壊さない）。
- スキップ（画面タップ）時は既存の `finalize()` がまとめを即表示する。バーの `transition` は
  CSS 側なので、reduced-motion では下記で無効になる。

### CSS
```css
.grow-row { display: flex; flex-direction: column; gap: 2px; padding: 3px 0; }
.grow-head { display: flex; align-items: baseline; justify-content: space-between; }
.grow-label { font-size: .82rem; font-weight: 800; color: var(--ink); }
.grow-delta { font-size: .82rem; font-weight: 800; color: var(--coral-deep); }
.grow-bar { display: flex; height: 12px; border: 2px solid var(--ink); border-radius: 999px; background: #eef1fa; overflow: hidden; }
.grow-base { display: block; height: 100%; background: linear-gradient(90deg, var(--teal), #7fd8cf); }
.grow-add { display: block; height: 100%; background: var(--sun); transition: width var(--dur-fill) ease-out; }
.grow-val { font-size: .72rem; font-weight: 800; color: var(--ink-soft); text-align: right; }
```
`prefers-reduced-motion` の既存ブロックに `.grow-add { transition: none; }` を追加する。

---

## F1. 卒業画面に「今回のハイライト」

成績表61行の前に、周回の締めとして3行だけ出す。

`showEndingWithCard(e, card)` で、成績表（`resultsTable`）を差し込んでいる箇所の**直前**に入れる。

```js
// 卒業時の3行。周回の締めとして「今回はどうだったか」を先に見せる（全戦績はその下）
function endingHighlights(e) {
  const box = el('div', 'ending-highlights');
  box.appendChild(el('div', 'board-label', '今回のハイライト'));
  const ranked = (state.results || []).filter(r => r.division !== 'qualifier');
  // ① 最高順位
  if (ranked.length > 0) {
    const best = ranked.reduce((a, b) => (b.rank < a.rank ? b : a));
    box.appendChild(el('div', 'eh-row', '🏆 最高順位　' + contestLabel(best.name) + '　' + contestLabel(best.divisionLabel) + ' ' + best.rank + '位'));
  }
  // ② 最も伸びたジャンル（4ジャンルの平均が最も高いもの）
  const top = DT.DATA.GENRES
    .map(g => ({ label: g.label, avg: DT.contest.genreAvg(state, g.id) }))
    .reduce((a, b) => (b.avg > a.avg ? b : a));
  box.appendChild(el('div', 'eh-row', '📈 いちばん強い　' + top.label + '　平均 ' + top.avg));
  // ③ 前回の周回との比較（RECORDSの最高ptと比べる。初回は出さない）
  const prev = DT.state.loadRecords(undefined, GAME_MODE);
  const prevBest = prev.length ? Math.max.apply(null, prev.map(x => x.totalPoints || 0)) : null;
  if (prevBest !== null) {
    const d = e.totalPoints - prevBest;
    box.appendChild(el('div', 'eh-row' + (d > 0 ? ' is-up' : ''),
      (d > 0 ? '🎉 自己ベスト更新　' : '🔁 これまでの最高　') + prevBest + 'pt → 今回 ' + e.totalPoints + 'pt'
      + (d > 0 ? '（▲' + d + '）' : '')));
  }
  return box;
}
```
**注意**: `showEndingWithCard` は記録を書き込む前（`state.recorded` が false のとき `addRecord` を呼ぶ）に
この関数を呼ぶこと。**`addRecord` の後だと今回の記録自身が `prevBest` に混ざる**。
既存コードは `addRecord` → 表示の順なので、**`prevBest` は `addRecord` より前に取得して変数に保持**しておく。

### CSS
```css
.ending-highlights { border: 2px dashed #c7cfe6; border-radius: 12px; background: rgba(255,255,255,.55); padding: 8px 11px; margin: 6px 0; display: flex; flex-direction: column; gap: 3px; }
.eh-row { font-size: .82rem; font-weight: 800; color: var(--ink); }
.eh-row.is-up { color: #1f8a7e; }
```

---

## テスト（tests/test-mobile-layout.js に追記）

1. `UX3: 順位に前回比を出す` — app に `function previousResultOf(` があり、フィルタが
   `x.turn < r.turn` を使っていること。`'初出場'` と `'reveal-trend'` があること。
2. `UX3: 予選行には前回比を出さない` — app に `r.division !== 'qualifier'` の分岐があること。
3. `UX3: 自己ベストは過去だけと比べる` — app に `function bestRankBefore(` があり、
   これも `x.turn < r.turn` を使っていること。
4. `UX3: 練習の成果は前→後のバーで出す` — app に `function growthRow(` と
   `before + ' → ' + after` 相当、css に `.grow-bar` と `.grow-add` があること。
5. `UX3: 卒業のハイライトは記録追加より前の最高ptと比べる` — app に `function endingHighlights(`
   があり、`prevBest` を `DT.state.addRecord(` より**前**に取得していること（出現位置の比較）。
6. `UX3: 新設の演出はreduced-motionで無効化する` — css の `prefers-reduced-motion` ブロックに
   `.reveal-trend` `.reveal-best` `.grow-add` が含まれること。
7. `UX3: 新設テキストは11px未満にしない` — `.reveal-trend` `.reveal-best` `.eh-row` `.grow-val`
   の font-size がすべて `.7rem` 以上。

## 完了条件
1. `npm test` が全て通る。
2. `npm run build:web` が成功する。
3. 変更が許可4ファイルに限られる。
4. ファイルごとの変更点要約を出力する。

## 検証記録（2026-09-04 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋Playwright（390×844）で実施。
- `npm test`: **276件 全通過**（Wave 1 の269＋今回7）／ `npm run build:web`: 成功。
- 変更は指定4ファイルのみ。保護6ファイル（engine/contest/cards/data/state/avatar）は未変更。

### 実機で確認したこと

- **D3 順位の前回比**: 2年OIDCの直前状態を作って検証（1年OIDC 総合20位・水平軸3位を過去実績として用意）。
  - 個人総合（過去あり）→ **「前回 20位 → ▲15」**（`is-up`）＋**「🎉 自己ベスト更新（これまで 20位）」**。
  - 1ディアボロ垂直軸（過去なし）→ **「初出場」**（`is-first`）。
  - **同じターンの別部門（水平軸3位）が混ざらない**ことを確認（`x.turn < r.turn` が効いている）。
  - 文字は 12.48px / 11.84px でどちらも下限 11.2px 以上。
- **C4 練習の成果**: 「1DH×難易度 +10 ／ 55 → 65」のバーが出る。
  バーは伸びる前（teal）と今回の伸び（sun）を塗り分け、幅は 55% + 10% と値に一致。合計ピルも従来どおり残る。
- **F1 卒業ハイライト**: 1周目は2行（最高順位・いちばん強いジャンル）で、前回比の行は出ない＝正しい。
  前周の記録（400pt）を用意して再実行すると3行目
  **「🎉 自己ベスト更新　400pt → 今回 881pt（▲481）」**（`is-up`）が出た。
  `prevBest` は `DT.state.addRecord` より前（2491行 vs 2496行）で取得しており、今回の記録は混ざらない。

### 補足
- 撮影: `docs/previews/ux-review-2026-08-29/shots/24-reveal-trend.png`, `25-training-growth-bars.png`。
- 途中でCodexが「stdin待ち」で固まり1回空振りした（`</dev/null` の付け忘れ。CLAUDE.md記載の既知の落とし穴）。
  付け直して再実行し、上記の結果を得ている。
