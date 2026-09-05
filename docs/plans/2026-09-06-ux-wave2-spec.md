# UX Wave 2「読める・判断できる」実装仕様（Codex向け・確定版）

作成日: 2026-09-06 ／ 設計: Claude（Opus）／ 実装: Codex ／ 検証: Claude
根拠: [docs/previews/ux-review-2026-08-29/index.html](../previews/ux-review-2026-08-29/index.html) の B1・B3・C2/C3・D2・G2
数値の正本: [design/TOKEN_SHEET.md](../../design/TOKEN_SHEET.md) の **§9**（2026-09-06 追記済み）

本人判断（2026-09-06）: レビューの判断②「ホームの小レーダー4つ → ジャンル別バー4本＋前月比」は**賛成**。
レーダーは詳細画面に残す。判断③④（SVGアイコン化・タイトル説明文）は Wave 4 のため今回は触らない。

## この Wave の原則

**新しい見た目を足さない。情報を減らして、判断に効く数字へ置き換える。**
文字を大きくするぶんの高さは、レーダー置き換えで空いた分から出す。ホームは1画面のまま。
**ゲームの計算・判定・保存済みデータの意味は一切変えない。**

---

## 1. js/engine.js — 見込みゲインの計算を1本だけ足す

`computeSlotGain` の**すぐ下**に追加し、`DT.engine` へエクスポートする。

```js
  // 練習グリッドの「見込み」表示用（UXレビュー C2/C3）。実際の加算と同じ computeSlotGain を呼ぶので、
  // 表示式を app 側へ書き写さずに済む。副作用なし・rngを使わない・失敗(+0)は幅に含めない
  // （失敗が起きるのは新技開発だけで、表には注記で出す）。
  // key: 'difficulty' | 'novelty' | 'control' | 'routine'
  function previewGain(state, key, growthValue) {
    const base = key === 'routine' ? DT.DATA.SLOTS.routineGain : DT.DATA.SLOTS.gridGain;
    const room = Math.max(0, 100 - growthValue); // 100が上限なので、残り幅を超える見込みは出さない
    const at = tier => Math.min(room, computeSlotGain(state, key, base, growthValue, tier).gain);
    return { min: at('普通'), max: at('大成功') };
  }
```

- エクスポート行に `previewGain` を足す（他の要素の順序は変えない）。
- **`computeSlotGain` 本体は1文字も変えない。**

## 2. js/app.js — startTurn で「先月の習熟」を控える

`startTurn` の冒頭（`pendingMessages = [];` の直前）に追加。

```js
    // ホームのジャンルバーに「先月からの伸び」を出すため、行動前の習熟を控える（UXレビュー B3）。
    // 練習だけでなく勉強・休養・療養でも更新する（イベントでの伸びもこの差に含まれる）。
    state.prevGenreAvg = DT.DATA.GENRES.reduce(function (acc, g) {
      acc[g.id] = DT.contest.genreAvg(state, g.id);
      return acc;
    }, {});
```

## 3. js/state.js — prevGenreAvg を保存データで正規化

`normalizeProgression` の中に、他のフィールドと同じ書き方で追加する。

```js
    // 旧セーブには無いので null 許容。オブジェクト以外は捨てる（差分は「−」表示になるだけで壊れない）
    if (!state.prevGenreAvg || typeof state.prevGenreAvg !== 'object' || Array.isArray(state.prevGenreAvg)) {
      state.prevGenreAvg = null;
    }
```

- `newGame` の初期値にも `prevGenreAvg: null` を足す（`lastSlots: []` の近く）。
- **他のフィールドは触らない。**

## 4. js/app.js — ホームの技術欄をジャンルバー4本にする（B3）

`renderPlayerBoard` の直前に追加:

```js
  // ジャンル別の習熟バー。ホームの小レーダー4枚（79×69pxで差が読めない）を置き換える。
  // 差分＝先月の行動前(state.prevGenreAvg)からの伸び。レーダーは詳細画面に残す。
  function genreBars(state) {
    const box = el('div', 'gbar-box');
    DT.DATA.GENRES.forEach(function (g) {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const now = DT.contest.genreAvg(state, g.id);
      const row = el('div', 'gbar' + (unlocked ? '' : ' locked'));
      row.appendChild(el('span', 'gbar-label', unlocked ? g.label : '🔒 ' + g.label));
      const gauge = el('div', 'gauge');
      const fill = el('span');
      const target = Math.max(0, Math.min(100, unlocked ? now : 0)) + '%';
      fill.style.width = '0%';
      requestAnimationFrame(function () { fill.style.width = target; });
      gauge.appendChild(fill);
      row.appendChild(gauge);
      row.appendChild(el('span', 'gbar-val num', unlocked ? String(now) : '-'));
      const prev = state.prevGenreAvg ? state.prevGenreAvg[g.id] : undefined;
      const diff = (unlocked && typeof prev === 'number') ? Math.round((now - prev) * 10) / 10 : null;
      if (!unlocked) {
        row.appendChild(el('span', 'gbar-lock', '未解禁'));
      } else if (diff && diff > 0) {
        const up = el('span', 'gbar-up num', '▲' + diff);
        up.setAttribute('aria-label', '先月から' + diff + '上がった');
        row.appendChild(up);
      } else {
        row.appendChild(el('span', 'gbar-flat', '−'));
      }
      box.appendChild(row);
    });
    return box;
  }
```

`renderPlayerBoard` 末尾の組み立てを差し替える:

```js
    board.replaceChildren(head, cond, ...warns, techHead, genreBars(state), compBox);
```

- **`skillRadarGrid` の定義・`genreRadar`・`openRadar`・レーダーモーダルは残す**（詳細画面が使う）。
- ホームからレーダーが消えるだけ。詳細画面（`renderDetail`）は**変更しない**。

## 5. js/app.js — 練習マスに見込みを出す（C2/C3）

`renderTrainGrid` を次のとおり変更する（構造は保ち、表示を足すだけ）。

1. 関数の頭で得意技のルールを引く:
```js
    const favCard = state.techniqueCard
      ? DT.DATA.TECHNIQUE_CARDS.find(c => c.id === state.techniqueCard) : null;
    const favRules = (favCard && favCard.trainingRules) || [];
    // 得意技が乗るマスか（プラス補正のみ印を出す。1回の練習で1枠にしか乗らないので数値には足さない）
    const isFav = (genreId, methodId) => favRules.some(r =>
      r.amount > 0 && r.method === methodId && r.genres.indexOf(genreId) >= 0);
```

2. 各マス（`tg-cell`）で、現在値の下に見込みを足す:
```js
        cell.appendChild(el('span', 'tg-val num', String(state.skills[g.id][m.id])));
        if (unlocked) {
          const pv = DT.engine.previewGain(state, m.id, state.skills[g.id][m.id]);
          cell.appendChild(el('span', 'tg-gain', pv.min === pv.max ? '+' + pv.min : '+' + pv.min + '〜' + pv.max));
          if (isFav(g.id, m.id)) cell.appendChild(el('span', 'tg-fav', '得意技'));
        }
```
`aria-label` は末尾に見込みを足す:
`… + '（現在 ' + 値 + '・見込み ' + 見込み文字列 + '）'`（未解禁マスは従来どおり）。

3. ルーチン行の `small` を差し替える:
```js
    const rPv = DT.engine.previewGain(state, 'routine', state.composition);
    routine.appendChild(el('small', '', '演技構成 ' + state.composition
      + '（' + (rPv.max === 0 ? '円熟の域・練習では伸びない' : '+' + rPv.min + '〜' + rPv.max) + '）・疲労回復'
      + (injured ? '　※怪我中はこれのみ' : '')));
```

4. index.html の練習画面、`#train-grid` を包む `.board-label` の**次の行**に注記を1行足す:
```html
        <div class="train-note">数字は今の能力値／下は今月の伸びの見込み（普通〜大成功）。新技開発だけ失敗＝+0あり</div>
```
（`.board-label` の文言「表をタップすると空き枠に入る（同じ内容は2枠まで）」は変えない。）

## 6. js/app.js — 部門ボタンに自分の値／参考表を消す（D2・G2）

`policySelector` の直前に追加:

```js
  // その部門で使われる自分の値。エントリー画面で「どこに出れば勝負になるか」を部門ボタンだけで判断できるようにする。
  // 採点の実装（contest.js）と同じ参照先: specialist=そのジャンルの習熟／overall・technical=4ジャンル平均／performance=演技構成
  function divisionSelfValue(divisionId) {
    const div = DT.DATA.DIVISIONS.find(d => d.id === divisionId);
    const avgAll = () => Math.round(
      DT.DATA.GENRES.reduce((a, g) => a + DT.contest.genreAvg(state, g.id), 0) / DT.DATA.GENRES.length * 10) / 10;
    if (!div) return null;
    if (div.scoring === 'overall') return { value: avgAll(), note: '4ジャンル平均' };
    if (div.scoring === 'technical') return { value: avgAll(), note: '12項目の平均' };
    if (div.scoring === 'performance') return { value: state.composition, note: '演技構成' };
    return { value: DT.contest.genreAvg(state, divisionId), note: genreLabel(divisionId) + 'の習熟' };
  }
```

`renderEntry` の部門ボタン生成で、ラベルの後ろに自分の値を足す:
```js
        b.appendChild(el('span', 'entry-label', label));
        const self = divisionSelfValue(d.id);
        if (self) {
          const box = el('span', 'entry-self');
          box.appendChild(el('span', 'entry-self-val num', 'あなた ' + self.value));
          box.appendChild(el('span', 'entry-self-note', self.note));
          b.appendChild(box);
        }
```

**参考表を消す（G2）:**
- `renderEntryStatus` を削除し、`renderEntry` / `renderWorldsEntry` / `renderJjfEntry`（3か所）の呼び出しも削除する。
- index.html の `<div class="card slot-board" id="entry-status"></div>` を削除する。
- 部門ボタンが無い**世界大会・ジャグリング全国大会予選**の2画面は、情報が消えないよう
  `#entry-divisions` の先頭に1行だけ自分の値を出す:
```js
    const selfLine = el('div', 'entry-selfline');
    selfLine.appendChild(el('span', '', 'あなた: 4ジャンル平均 '));
    selfLine.appendChild(el('span', 'num', String(divisionSelfValue('overall').value)));
    selfLine.appendChild(el('span', '', '　演技構成 '));
    selfLine.appendChild(el('span', 'num', String(state.composition)));
```
（`$('#entry-divisions').replaceChildren(...)` の第1引数として渡す。）

**演技方針ボタンの折り返しを直す:**
- `js/data.js` の `POLICIES` の各項目に `short` と `sub` を足す。**`label` は変えない**（保存・既存参照のため）:
  - safe: `short: '安全', sub: 'ミスを減らす'`
  - normal: `short: '通常', sub: '練習どおり'`
  - attack: `short: '攻め', sub: '難度を上げる'`
- `policySelector` のボタン内容を `icon` ＋ `.policy-label`=`p.short || p.label` ＋ `.policy-sub`=`p.sub || ''` にする。
  選択時に下へ出る `hint` はそのまま（`p.hint` を使う）。

## 7. css/style.css

### 7-1. 文字の下限（B1・§9-1）

`css/style.css` の **`font-size` が `.7rem` 未満のものをすべて洗い出し**、次のとおり直す。

- **説明文**（行動ボタンの説明 `.action-btn .t .desc` と `.action-btn.compact .t .desc`、練習の注記 `.train-hint`／`.train-note`）→ **`.75rem`**
- **それ以外のUIラベル・数値・バッジ** → **`.7rem`**
- **例外（そのままでよい）**: `.pcard-rarity` / `.pcard-artlabel` / `.pcard-num small` / `.dev-section .dev-label` / `.dev-row`
- `.tg-count` バッジ（`.6rem`）は `.7rem` へ。バッジの幅・高さ(20px)は変えない。
- **覚醒バッジ `.mood-awaken`**（`.52rem`）は `.7rem` にすると幅が足りないので、
  **文言のほうを短くする**: js/app.js の `'🔥覚醒 あと' + state.awakenTurns + 'ヶ月'` → `'🔥覚醒 ' + state.awakenTurns + 'ヶ月'`。
- 変更した**セレクタと旧値→新値の一覧を報告に出すこと**（検証で突き合わせる）。

### 7-2. ジャンルバー（§9-2）

```css
/* ---------- ホームのジャンルバー（レーダー置き換え・UXレビュー B3） ---------- */
.gbar-box { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.gbar { display: grid; grid-template-columns: 3.2em 1fr 2.2em 2.8em; align-items: center; gap: 8px; min-height: 26px; }
.gbar-label { font-size: .78rem; font-weight: 800; color: var(--ink); }
.gbar-val { font-size: .95rem; font-weight: 800; text-align: right; color: var(--ink); }
.gbar-up {
  font-size: .7rem; font-weight: 800; color: var(--ink); background: #ffeec2;
  border-radius: 999px; padding: 1px 6px; text-align: center;
}
.gbar-flat { font-size: .7rem; font-weight: 800; color: var(--ink-soft); text-align: center; }
.gbar-lock { font-size: .7rem; font-weight: 800; color: var(--ink-soft); text-align: center; }
.gbar.locked .gbar-label, .gbar.locked .gbar-val { color: #8a90a8; }
```
`.gbar` の中の `.gauge` は既存の `.gauge` をそのまま使う（新しい高さ・色を作らない）。

### 7-3. 練習マス（§9-3）

- `.tg-cell` の `min-height: 46px` → **`54px`**、`place-items: center` → 縦積みにする:
  `display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;`
- 追加:
```css
.tg-cell .tg-gain { font-size: .7rem; font-weight: 700; color: var(--ink-soft); line-height: 1; }
.tg-cell .tg-fav {
  position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%);
  font-size: .7rem; font-weight: 800; color: var(--ink); background: var(--sun);
  border: 2px solid var(--ink); border-radius: 999px; padding: 0 6px; line-height: 14px; white-space: nowrap;
}
.train-note { font-size: .75rem; font-weight: 700; color: var(--ink-soft); padding: 2px 2px 4px; line-height: 1.4; }
```
- **選択済みマスの数字が灰色になる粗（Wave 1 の残り）を直す**:
```css
/* 3枠が埋まって押せなくなっても、選んだマス（picked）の数字は色を保つ＝何を選んだかが読める */
.tg-cell.locked.picked { background: var(--paper); color: var(--ink); }
.tg-cell.locked.picked .tg-val, .tg-cell.locked.picked .tg-gain { color: var(--ink); }
.tg-cell.m-difficulty.locked.picked { background: #ffe1d9; }
.tg-cell.m-novelty.locked.picked    { background: #dbe8ff; }
.tg-cell.m-control.locked.picked    { background: #d1f4ef; }
.tg-routine.locked.picked { background: #ffeec2; color: var(--ink); }
```

### 7-4. エントリー画面（§9-4）

```css
.entry-option { }               /* 既存。以下を足すだけ */
.entry-self { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.entry-self-val { font-size: .78rem; font-weight: 800; color: var(--ink); }
.entry-self-note { font-size: .7rem; font-weight: 700; color: var(--ink-soft); }
.entry-selfline { font-size: .75rem; font-weight: 800; color: var(--ink); padding: 2px 2px 6px; }
.policy-sub { font-size: .7rem; font-weight: 700; color: var(--ink-soft); }
```
- `.policy-btn { font-size: .78em; }` は `.82rem`（em→rem）にし、`.policy-label` が折り返さないことを保証する。
- `.entry-option` が `display: flex` でないなら `display: flex; align-items: center; gap: 8px;` を足す
  （`entry-self` を右端へ寄せるため）。既存の見た目・高さは変えない。

## 8. index.html・sw.js（配信まわり）

- `?v=20260904a` を**すべて** `?v=20260906a` に置換（16か所）。
- `js/app.js` の `APP_VERSION` を `'v0.9 short-test13'` に上げる。
- `sw.js` の `CACHE_VERSION` を `'v20260906a'` に上げる。
- **`navigator.serviceWorker.register('sw.js?v=20260906a')` を `register('sw.js')` にする**
  （既知の不具合。スクリプトURLに `?v=` を付けると更新のたびに別登録になり、古いSWが生き残って
  実機の更新が1回遅れる。スコープは同じなので既存端末も次回起動で新SWへ寄る）。
  この行の直上にその理由をコメントで残す。

## 9. tests/ に追記（**5件すべて実装すること**）

`tests/test-engine.js` に:
1. `previewGain: 普通〜大成功の幅を返す` — 適当な state で `previewGain(s,'difficulty',30)` の
   `min <= max` かつ `min >= 1`。さらに `computeSlotGain` 経由の実値と一致することを、
   `applyTraining` を rng 固定（常に大成功が出る rng）で1枠回した結果の gain が `max` と一致することで確認。
2. `previewGain: 上限100を超えない` — `previewGain(s,'difficulty',99).max <= 1`。

`tests/test-state.js` に:
3. `prevGenreAvg: 旧セーブは null になる` — `prevGenreAvg` を持たない／配列である保存データを
   `load` した結果が `null`。

`tests/test-mobile-layout.js` に（ソース文字列の静的検査。既存の書き方に合わせる）:
4. `Wave2: 文字の下限` — `css/style.css` の `font-size: .Nrem` のうち `.7rem` 未満のものが、
   §9-1 の例外5セレクタを含む行だけであること（それ以外に `.7rem` 未満が残っていたら失敗）。
5. `Wave2: ホームはバー・エントリーに参考表は無い` — `js/app.js` に
   `board.replaceChildren(head, cond, ...warns, techHead, genreBars(state), compBox)` 相当があり、
   `renderEntryStatus` という識別子が js/app.js と index.html のどこにも無いこと。
   かつ `skillRadarGrid` は `renderDetail` から**まだ呼ばれている**こと（レーダーを消していない担保）。

## 共通ルール

- 変更してよいファイル: `js/app.js`・`js/engine.js`・`js/data.js`・`js/state.js`・`css/style.css`・
  `index.html`・`sw.js`・`tests/test-engine.js`・`tests/test-state.js`・`tests/test-mobile-layout.js`。
- **`js/contest.js`・`js/events.js`・`js/cards.js`・`js/avatar.js`・`js/radar.js`・`js/ending.js`・`js/short-mode.js` は変更しない。**
- **ゲームの数値・判定ロジック・採点式は変えない。** `computeSlotGain` 本体、`DATA.SLOTS`、`DATA.SCORING`、
  `POLICIES` の `label`/`diffMult`/`missMult`/`hint` は触らない。
- 既存のイベント文・大会名・キャラクター定義は触らない。
- 色・サイズは §9 の値だけを使う。新しい色を作らない。**白抜き文字のチップは作らない**（AA未達のため）。

## 完了条件

1. `npm test` が全て通る（既存282件＋今回5件）。
2. `npm run build:web` が成功する。
3. 変更が上記の許可ファイルに限られる。
4. **7-1 で変更した font-size のセレクタ一覧**（旧値→新値）と、ファイルごとの変更点要約を出力する。

## 検証記録（2026-09-06 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋ブラウザ実測（390×844）で実施。
- `npm test`: **290件 全通過**（Codex実装後289件＋Claudeが追加した回帰テスト1件）／ `npm run build:web`: 成功。
- 変更は許可ファイルのみ。`computeSlotGain`・採点式・`POLICIES` の数値は無改変。
- ルートの font-size は 16px（実測）＝ `.7rem` は 11.2px、`.75rem` は 12px。

### Claude が見つけて直した不具合（2件）

**① 得意技が乗るマスの見込みが実際と食い違っていた（重い）**
仕様どおり「印だけ・数値には足さない」で実装したが、複製したstateで実測すると
インテグラル持ちの 1DH×高難度技は **見込み +2〜8 に対し実際 +10〜16**（差はすべて得意技の+8）。
「何点伸びるか」を出すのがこの項目の目的なので、印だけでは目的を果たさない。
→ `favRuleFor()` でルールごと引き、**チップに補正量まで書く**形に変更（`得意技+8`）。
伸びを抑える側のルール（例: ハイトスの新奇性 -1）も同じ形で出し、背景だけ #ffe1d9 に変えて区別する。
見込みの数字に足さないのは据え置き（1回の練習で1枠にしか乗らないため）。
注記に「得意技の補正は1回の練習で1枠にだけ乗る」を追記。回帰テストを1件追加。

**② 得意技チップが下のマスに重なり、肝心の見込みを隠していた**
`position: absolute; bottom: -7px` でマスからはみ出していたため、チップが自分のマスの `.tg-gain` を覆い、
下のマスの上辺にも重なっていた（スクリーンショットで確認）。
→ **マスの中の3行目**に置き、`.tg-cell` を 54px → **62px**（実測66px）に。TOKEN_SHEET §9-3 も更新。

### 実測（390×844・DOM実測）

| 項目 | 実測 |
|---|---|
| ホーム: 11.2px未満の文字 | **0件**（TURN 11.2 ／ 盤面ラベル 11.2 ／ 詳細リンク 11.2 ／ ボトムナビ 11.2 ／ 行動の説明 12.0） |
| ホーム: レーダー | **0枚**（詳細画面には4枚残っている・確認済み） |
| ジャンルバー | 4本・各26px・バー欄 116px。ラベル/値/差分いずれもはみ出し 0 |
| 差分チップ | 背景 #ffeec2・文字 #2b3a67 = **9.59:1**（AA OK）。`▲6.3` の形 |
| 旧セーブ（prevGenreAvg 無し） | 差分は `−`。未解禁ジャンルは `🔒`＋`未解禁` |
| ホームの縦 | 844px 以内・**スクロールなし** |
| 練習: マス | 66px・現在値 16.8px・見込み 11.2px。GO下端 **701px**・スクロールなし |
| 練習: 選択済みマス | 3枠が埋まっても **色と数字を保つ**（opacity 1・ink）。未選択の無効マスは従来どおり灰色 0.45 |
| エントリー(OIDC) | 5部門すべてに `あなた NN`＋参照先。参考表・レーダーは **0**。方針ボタンは1行（折り返しなし） |
| エントリー(静岡DC) | テクニカル `27.3`（12項目の平均）／パフォーマンス `50`（演技構成） |
| エントリー(全国大会予選) | 部門が無い画面には1行の `あなた: 4ジャンル平均 27.3　演技構成 47` |
| 演技方針 | ボックス 456〜635px、固定CTA 775px → **隠れない**（Wave 1 の状態を維持） |
| JSエラー | **0件**（404は未配置のPNG＝SVGアバターへのフォールバックのみ） |

### 見込みの正しさ（複製stateで applyTraining と突き合わせ）

| マス | 見込み | 実際（普通/大成功） | 一致 |
|---|---|---|---|
| 1DH×操作安定度(43) | +6〜24 | 6 / 24 | ✅ |
| 2D×操作安定度(25) | +8〜32 | 8 / 32 | ✅ |
| 1DH×高難度技(34・得意技) | +2〜8（＋得意技+8） | 10 / 16 | ✅（内訳が一致） |

### 残した粗

- 全国大会予選・世界大会の画面は、参考表を外したぶん**下2/3が空く**。
  判断が2択だけの画面なので埋めない方針（レビュー C4 と同じ考え方）。気になれば Wave 3 で扱う。
