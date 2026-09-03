# UX Wave 1「毎ターンの摩擦を削る」実装仕様（Codex向け・確定版）

作成日: 2026-08-29 ／ 設計: Claude（Fable）／ 実装: Codex
根拠: [docs/previews/ux-review-2026-08-29/index.html](../previews/ux-review-2026-08-29/index.html)（実測つきレビュー）
数値の正: [design/TOKEN_SHEET.md](../../design/TOKEN_SHEET.md) §8

## 目的（5件・すべて「挙動を変えず、毎ターンの手数と見落としを減らす」）

| # | 内容 | いま | 変更後 |
|---|---|---|---|
| C1 | 練習3枠の選択 | ジャンル→内容で6タップ | **表をタップ**で3タップ／「前回と同じ」で1タップ |
| D1 | 大会の演技方針 | 画面外＋固定ボタンの背後 | 部門の直下に見える |
| B2 | 小さなタップ領域 | 「技術グリッド詳細」23px | 行全体がタップ対象・40px以上 |
| G5 | 月送り1.5秒 | 飛ばせない | タップで飛ばせる |
| G4 | メタタグ | 非推奨警告 | 併記 |

## 共通ルール

- 変更してよいファイル: `index.html`・`js/app.js`・`css/style.css`・`tests/test-mobile-layout.js`。
- **`js/engine.js`・`js/data.js`・`js/state.js`・`js/avatar.js` は変更しない。**
  練習の計算・保存形式・`slotsUI` の中身（`null` / `'routine'` / `{genre, method}`）は一切変えない。
- 既存ファイルは編集前に必ず読む。削除・移動・リネームはしない。
- 新しい色を作らない。新設テキストは **11px 未満にしない**（`.7rem`=11.2px が下限）。
- `index.html` の `20260828d` を**すべて** `20260829a` に置換。`js/app.js` の `APP_VERSION` の末尾数字を1つ上げる（`short-test9`→`short-test10`）。

---

## C1. 練習メニュー: 能力値の表をそのままタップして枠に入れる

### 考え方
練習の判断は「ジャンル×内容」の2次元で、いまはそれを2段階のボタンで選ばせている。
**能力値の表（4ジャンル×3内容）は既に画面にあるので、その表のマスを押せば枠に入る**ようにする。
表は「眺めるもの」から「選ぶもの」になり、選択の全体像（どこが低いか）を見ながら1タップで決められる。

### index.html（`#screen-trainmenu`）
次の3つを**削除**する:
- `<div class="card slot-board" id="trainmenu-skills"></div>`
- `① ジャンルを選ぶ` のカード（`#genre-row` を含む）
- `② 内容を選ぶ → 空き枠にセット` のカード（`#method-row` を含む）

代わりに、練習スロットのカードの**下**へ1枚追加する:
```html
<div class="card slot-board">
  <div class="board-label">表をタップすると空き枠に入る（同じ内容は2枠まで）</div>
  <div class="train-grid" id="train-grid"></div>
</div>
```
練習スロットのカードは次の形に変える（見出し行に「前回と同じ」を置く）:
```html
<div class="card slot-board">
  <div class="slot-head">
    <div class="board-label">練習スロット</div>
    <button id="btn-train-repeat" class="slot-repeat hidden" type="button">🔁 前回と同じ</button>
  </div>
  <div class="slot-row3" id="slot-row"></div>
</div>
```
`.train-hint`（💡 ジャンルを選んでから…）は削除する。

### js/app.js

**`renderTrainMenu()` を書き換える。** やる気チップ・スロット行・GOボタンの処理は残し、
`#trainmenu-skills` / `#genre-row` / `#method-row` の描画と `selectedGenre` の利用をやめて、
代わりに `renderTrainGrid()` を呼ぶ。

```js
// ジャンル×内容の表。マスを押すと空き枠へ入る。値は現在の能力値そのもの。
function renderTrainGrid() {
  const grid = $('#train-grid');
  const injured = state.injuredTurns > 0;
  const empty = firstEmptySlot();
  const nodes = [];
  // 見出し行
  nodes.push(el('div', 'tg-corner', ''));
  DT.DATA.METHODS.forEach(m => nodes.push(el('div', 'tg-head', m.label)));
  // ジャンル行
  DT.DATA.GENRES.forEach(g => {
    const unlocked = DT.contest.isGenreUnlocked(state, g.id);
    const head = el('div', 'tg-genre' + (unlocked ? '' : ' locked'));
    head.appendChild(el('b', '', unlocked ? g.label : '🔒 ' + g.label));
    head.appendChild(el('small', '', unlocked ? '平均 ' + DT.contest.genreAvg(state, g.id) : '未解禁'));
    nodes.push(head);
    DT.DATA.METHODS.forEach(m => {
      const entry = { genre: g.id, method: m.id };
      const n = countSameEntry(entry);
      const usable = unlocked && !injured && empty >= 0 && n < 2;
      const cell = el('button', 'tg-cell m-' + m.id + (usable ? '' : ' locked') + (n ? ' picked' : ''));
      cell.type = 'button';
      cell.appendChild(el('span', 'tg-val num', String(state.skills[g.id][m.id])));
      if (n) cell.appendChild(el('span', 'tg-count', '×' + n));
      cell.setAttribute('aria-label', g.label + ' ' + methodActionLabel(m.id) + '（現在 ' + state.skills[g.id][m.id] + '）');
      if (usable) cell.onclick = () => addSlotEntry(entry); else cell.disabled = true;
      nodes.push(cell);
    });
  });
  // ルーチン構成（全幅）
  const rn = countSameEntry('routine');
  const rUsable = empty >= 0 && rn < 2;
  const routine = el('button', 'tg-routine' + (rUsable ? '' : ' locked') + (rn ? ' picked' : ''));
  routine.type = 'button';
  routine.appendChild(el('b', '', 'ルーチン構成'));
  routine.appendChild(el('small', '', '演技構成 ' + state.composition + '・疲労回復' + (injured ? '　※怪我中はこれのみ' : '')));
  if (rn) routine.appendChild(el('span', 'tg-count', '×' + rn));
  if (rUsable) routine.onclick = () => addSlotEntry('routine'); else routine.disabled = true;
  nodes.push(routine);
  grid.replaceChildren(...nodes);
}
```
- `DT.contest.genreAvg` は既存（contest.js）。`countSameEntry` / `addSlotEntry` / `firstEmptySlot` は既存をそのまま使う。
- 「同じ内容は2枠まで」の判定は既存の `addSlotEntry` に任せる（表側は `n < 2` で押せなくするだけ）。
- `selectedGenre` 変数は不要になる。参照が残らないよう削除してよい（他で使っていないことを grep で確認）。

**「前回と同じ」**
- `startTurn(actionId, slots)` の中で、`slots` があるときに
  `state.lastTraining = JSON.parse(JSON.stringify(slots));` を入れる（保存データに乗る。追加のみで互換性は壊れない）。
- `renderTrainMenu()` で `#btn-train-repeat` を制御する:
  - `state.lastTraining` が3要素の配列で、かつ **怪我中でない** か **全要素が `'routine'`** のときだけ表示（`hidden` を外す）。
  - onclick: `slotsUI = JSON.parse(JSON.stringify(state.lastTraining)); justSetSlot = -1; renderTrainMenu();`
  - 未解禁ジャンルが含まれる可能性は無い（解禁は戻らない）ので判定不要。

### css/style.css（数値はトークンシート §8）
```css
.slot-head { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }
.slot-repeat {
  padding: 5px 12px; border: 2px solid var(--ink); border-radius: 999px;
  background: var(--paper); color: var(--ink); font-family: inherit; font-size: .72rem; font-weight: 800;
  box-shadow: 0 2px 0 var(--ink);
}
.slot-repeat:active { transform: translateY(2px); box-shadow: none; }

/* ジャンル×内容の表。4列＝ジャンル見出し＋内容3つ。最後のルーチン行だけ全幅 */
.train-grid { display: grid; grid-template-columns: 62px repeat(3, 1fr); gap: 5px; }
.tg-corner { }
.tg-head { font-size: .7rem; font-weight: 800; color: var(--ink-soft); text-align: center; letter-spacing: .04em; align-self: end; padding-bottom: 2px; }
.tg-genre { display: flex; flex-direction: column; justify-content: center; gap: 1px; padding-left: 2px; }
.tg-genre b { font-size: .88rem; }
.tg-genre small { font-size: .7rem; font-weight: 700; color: var(--ink-soft); }
.tg-genre.locked { color: #8a90a8; }
.tg-genre.locked b { font-size: .8rem; }
.tg-cell {
  position: relative; min-height: 46px; padding: 0;
  border: 2px solid var(--ink); border-radius: 12px; background: var(--paper);
  box-shadow: var(--pop-shadow-sm); font-family: inherit; cursor: pointer;
  display: grid; place-items: center;
}
.tg-cell .tg-val { font-size: 1.05rem; font-weight: 800; color: var(--ink); }
.tg-cell.m-difficulty { background: #ffe1d9; border-color: var(--coral); }
.tg-cell.m-novelty    { background: #dbe8ff; border-color: var(--blue); }
.tg-cell.m-control    { background: #d1f4ef; border-color: var(--teal); }
.tg-cell:active { transform: translateY(3px); box-shadow: none; }
.tg-cell.picked { outline: 3px solid var(--sun); outline-offset: -3px; }
.tg-cell.locked, .tg-routine.locked { background: var(--lock); border-color: #8a90a8; color: #8a90a8; box-shadow: none; cursor: default; }
.tg-cell.locked .tg-val { color: #8a90a8; }
.tg-count {
  position: absolute; top: -7px; right: -7px; min-width: 20px; height: 20px; padding: 0 5px;
  border: 2px solid var(--ink); border-radius: 999px; background: var(--coral); color: #fff;
  font-size: .66rem; font-weight: 800; line-height: 16px; text-align: center;
}
.tg-routine {
  grid-column: 1 / -1; position: relative; min-height: 46px; padding: 6px 12px;
  border: 2px solid #e0a500; border-radius: 12px; background: #ffeec2; color: var(--ink);
  box-shadow: var(--pop-shadow-sm); font-family: inherit; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.tg-routine b { font-size: .92rem; }
.tg-routine small { font-size: .7rem; font-weight: 700; color: var(--ink-soft); }
.tg-routine:active { transform: translateY(3px); box-shadow: none; }
.tg-routine.picked { outline: 3px solid var(--sun); outline-offset: -3px; }
```
`.pick-grid4` / `.pick-grid2` / `.pick-btn*` / `.train-hint` のCSSは**残してよい**（他画面で使っていないなら削除してもよいが必須ではない）。

### 完了の見え方
- 3枠を埋めるのに**3タップ**（前回と同じなら1タップ）。
- 押したマスに「×1」「×2」の印が付き、2枠入ったマスは押せなくなる。
- 未解禁ジャンルの行は鍵付きで押せない。怪我中はジャンルのマスが全部押せず、ルーチンだけ押せる。

---

## D1. 大会エントリー: 部門→演技方針→（参考）能力値 の順にする

### index.html（`#screen-entry`）
`<div class="card slot-board" id="entry-status"></div>` を `<div id="entry-divisions"></div>` の**下**へ移動する
（順: `#entry-title` → `#entry-hint` → `#entry-divisions` → `#entry-status` → CTA）。

### js/app.js
- `renderEntryStatus()` の先頭に `el('div', 'board-label', '参考: 現在の能力値')` を足す（表の前に1行）。
- `renderEntry()` は `#entry-divisions` に `emptyHint, ...options, policySelector()` を入れており、
  これで **部門 → 演技方針 → 参考表** の順になる。変更不要。
- ジャグリング全国大会予選（`renderJjfQualifier`）・世界大会（`renderWorldsEntry`）も同じ画面を使うので、
  自動的に「選択肢 → 参考表」の順になる。壊れていないことを確認する。

### css/style.css
- `#entry-divisions { margin-top: auto; ... }` の **`margin-top: auto` を `margin-top: 4px` に変える**
  （これが部門リストを画面下へ押し下げていた原因）。
- `.policy-box { margin-top: 12px; ...}` はそのまま。

---

## B2. タップ領域: 行全体を押せるようにする

### js/app.js（`renderPlayerBoard`）
- 「技術」見出し行 `techHead`（`.pb-tech-head`）に `techHead.onclick = renderDetail;` を付け、
  中の `link.onclick` は**外す**（二重発火を防ぐ。ピルは「押せる印」として残す）。
- `techHead.setAttribute('role', 'button')`、`techHead.setAttribute('aria-label', '技術グリッド詳細を開く')`。

### css/style.css
```css
.pb-tech-head { min-height: 40px; cursor: pointer; border-radius: 10px; }
.pb-tech-head:active { background: rgba(43,58,103,.06); }
.pb-head .pt { min-height: 34px; display: inline-flex; align-items: center; padding: 4px 14px; }
```

---

## G5. 月送り: タップで飛ばせる

### js/app.js（`showMonthTransition`）
タイマー完了時の処理を `finish` 関数にまとめ、**タップでも同じ処理**を呼ぶ。二重実行を防ぐ。
```js
let finished = false;
const finish = () => {
  if (finished) return;
  finished = true;
  clearTimeout(monthTransitionTimer);
  stopMonthTransitionFrames();
  overlay.onclick = null;
  overlay.classList.remove('is-active');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  onDone();
};
overlay.onclick = finish;
monthTransitionTimer = setTimeout(finish, MONTH_TRANSITION_MS);
```
### index.html / css
- `.month-transition-card` の最後（進行バーの下）に `<div class="month-transition-skip">タップで進む</div>` を追加。
- CSS: `.month-transition-skip { margin-top: 8px; font-size: .7rem; font-weight: 800; color: var(--ink-soft); letter-spacing: .08em; }`
  `.month-transition { cursor: pointer; }`

---

## G4. メタタグ
`<meta name="apple-mobile-web-app-capable" content="yes">` の直前に
`<meta name="mobile-web-app-capable" content="yes">` を追加する。

---

## テスト（tests/test-mobile-layout.js に追記・既存の静的解析スタイル）

1. `UX1: 練習は能力値の表をタップして枠に入れる` — html に `id="train-grid"` と `id="btn-train-repeat"` があり、
   `id="genre-row"` と `id="method-row"` と `id="trainmenu-skills"` が**無い**こと。app に `function renderTrainGrid(` と
   `state.lastTraining = ` があること。
2. `UX1: 大会は部門→演技方針→参考表の順` — html で `id="entry-divisions"` の出現位置が `id="entry-status"` より前。
   css の `#entry-divisions` ルールに `margin-top: auto` が無いこと。
3. `UX1: 技術見出し行は行全体で詳細を開く` — app に `techHead.onclick = renderDetail` があること。
   css `.pb-tech-head` に `min-height: 40px` があること。
4. `UX1: 月送りはタップで飛ばせる` — app の `showMonthTransition` 内に `overlay.onclick = finish` があること。
   html に `month-transition-skip` があること。
5. `UX1: mobile-web-app-capable を併記` — html に `name="mobile-web-app-capable"`。
6. `UX1: 新設テキストは11px未満にしない` — css の `.tg-head`, `.tg-genre small`, `.tg-routine small`,
   `.month-transition-skip`, `.slot-repeat` の `font-size` がすべて `.7rem` 以上（正規表現で数値を取り出して比較）。

## 完了条件
1. `npm test` が全て通る。
2. `npm run build:web` が成功する。
3. 変更が許可4ファイルに限られる。
4. ファイルごとの変更点要約を出力する。

## 検証記録（2026-08-29 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋Playwright（390×844）で実施。
- `npm test`: **269件 全通過**（Wave B 263＋今回6）／ `npm run build:web`: 成功。
- 変更は指定4ファイルのみ。`APP_VERSION` は `short-test10`。

### 実機で確認したこと（数値は実測）
- **C1 練習グリッド**: 旧の `#genre-row` `#method-row` `#trainmenu-skills` は消え、`#train-grid` に 4ジャンル×3内容＝12マス＋ルーチン行。
  マス 86×46px、見出し列 62px、ルーチン行 334×46px。新設文字は 11.2px（.7rem）、値は 16.8px。
  **3タップで3枠**が埋まる。同じマスは2回目で「×2」バッジ、3回目は押せない。3枠埋まると全マスとルーチンが無効。
  画面はスクロール無し（GOボタン下端 567px／844px）。
- **前回と同じ**: 1回練習したあと `#btn-train-repeat` が現れ、**1タップで3枠が前回どおり**に復元。
  `state.lastTraining` がセーブに入っていることを確認（`[{h1d,difficulty},{h1d,difficulty},{d2,control}]`）。
- **D1 エントリー**: 並びは title → hint → divisions → status → cta。
  1年OIDCで演技方針ボックスは y=444〜627、固定CTAは y=776 → **方針が隠れず全部見える**（改修前は画面外＋CTAの背後）。
  参考表は y=633 以降。ジャグリング全国大会予選の画面も同じ並びで崩れなし。
- **B2 タップ領域**: 技術見出し行 340×40px・行に onclick あり。ポイントチップ 57×34px。
- **G5 月送り**: 表示直後にタップ → **1ms で消えて次へ進む**。二重実行なし（イベント月へ正常遷移）。
- **G4**: `mobile-web-app-capable` を併記済み。

### 補足
- 撮影: `docs/previews/ux-review-2026-08-29/shots/21〜23`（グリッド空／3枠／エントリー改修後）。
- 未コミット。公開は本人の指示を待つ。
