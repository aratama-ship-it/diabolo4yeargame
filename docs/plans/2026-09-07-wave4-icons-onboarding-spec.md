# Wave 4（判断③④）実装仕様（Codex向け・確定版）

作成日: 2026-09-07 ／ 設計・アイコン作画: Claude（Opus）／ 実装: Codex ／ 検証: Claude
根拠: [docs/previews/ux-review-2026-08-29/index.html](../previews/ux-review-2026-08-29/index.html) の **G1**（判断③）と **A1**（判断④）
アイコンの見本: [docs/previews/2026-09-07-icons/index.html](../previews/2026-09-07-icons/index.html)

本人の依頼（2026-09-07）: 「レビューの判断③④（絵文字→SVGアイコン、タイトル説明文）こちらすすめてください」。

**アイコンの実体 `js/icons.js` は作成済み（Claudeが作画・目視で3回描き直した）。Codexはその中身を変更しない。**
この仕様の仕事は、**既存の絵文字と差し替える配線**と、**タイトル説明文を文脈ヒントへ置き換えること**。

---

## 方針

### ③ 絵文字 → インク線SVG（G1）

置き換えるのは **「アイコンとして単独で置かれているもの」だけ**。
文章の中の絵文字（🎉 ✨ 💧 🥇🥈🥉 🔥覚醒 ⚠ 🔒 🎋 🔁 など）は**物語と手触りの一部なので残す**。
機種で見た目が変わって困るのは、毎回目に入る「UIの器」だから。

### ④ タイトルの説明文 → その画面の一言（A1）

115字・12.5pxの説明文は、遊ぶ前に読んでも実感がなく読み飛ばされる（レビュー実測）。
消して**絵を主役**にし、ルールは**その画面でその1行だけ**出す。2周目からは出さない。

---

## 1. index.html — アイコンの配線

### 1-1. スクリプト読み込み

`js/avatar.js` の**次**、`js/app.js` の**前**に1行足す（`?v=` は下の 5. の値）:
```html
<script src="js/icons.js?v=20260908a"></script>
```

### 1-2. `data-icon` に置き換える（絵文字は消す）

| 現在 | 変更後 |
|---|---|
| `<button class="nav-btn" id="nav-home"><span class="nav-icon">🏠</span>ホーム</button>` | `<button class="nav-btn" id="nav-home" data-icon="home">ホーム</button>` |
| `nav-detail` の `<span class="nav-icon">📊</span>` | `data-icon="chart"` |
| `nav-settings` の `<span class="nav-icon">⚙️</span>` | `data-icon="gear"` |
| `<button id="btn-records">🏅 これまでの記録</button>` | `<button id="btn-records" data-icon="medal">これまでの記録</button>` |
| `<button id="btn-zukan">📖 カード図鑑</button>` | `data-icon="book"`・絵文字削除 |
| `<button id="btn-alumni" class="hidden">🌸 登場する卒業生を設定</button>` | `data-icon="flower"`・絵文字削除 |
| `<span class="modal-title">📅 今後の予定</span>` | `<span class="modal-title" data-icon="calendar">今後の予定</span>` |
| `<span class="modal-title">🏅 ポイント履歴</span>` | `data-icon="medal"` |
| `<span class="modal-title">🏅 これまでの記録</span>` | `data-icon="medal"` |
| `<span class="modal-title">🌸 卒業生名簿</span>` | `data-icon="flower"` |
| `<span class="modal-title">📖 カード図鑑</span>` | `data-icon="book"` |
| `<span class="modal-title">⚙️ 設定</span>` | `data-icon="gear"` |
| `<span class="modal-title">📖 これまでの記録ログ</span>` | `data-icon="book"` |

- `<span class="nav-icon">` の要素ごと消す（CSSの `.nav-btn .nav-icon` も 4-1 で消す）。
- **見出しの文言（「今後の予定」等）は変えない。**

### 1-3. ④用の空き枠を2つ足す

- `#screen-trainmenu` の `.sub-header` の**直後**に `<div id="trainmenu-tip"></div>`
- `#screen-training` の `<h2>練習の成果</h2>` の**直後**に `<div id="training-tip"></div>`

### 1-4. タイトルの説明文を消す

`<p class="title-manual" id="title-manual">…115字…</p>` の**行ごと削除**。

---

## 2. js/app.js — アイコンの配線

### 2-1. 起動時に静的アイコンを差し込む

`initTitle()` の中（`$('#app-version').textContent = …` の近く）で1回呼ぶ:
```js
    DT.icons.applyStatic();   // data-icon を持つ要素へインク線SVGを差し込む（絵文字の置き換え）
```

### 2-2. `$('#title-manual')` への代入行を削除

`js/app.js:385` 付近の `$('#title-manual').textContent = '1ターンで2ヶ月…';` を**行ごと削除**。

### 2-3. レーダーの見出し

```js
    $('#radar-title').textContent = '📊 ' + genreLabel(genreId) + '（' + (GENRE_FULL[genreId] || '') + '）';
```
を次に変える（**textContent を入れてから差し込む**。順番を逆にすると消える）:
```js
    $('#radar-title').textContent = genreLabel(genreId) + '（' + (GENRE_FULL[genreId] || '') + '）';
    DT.icons.prepend($('#radar-title'), 'chart');
```

### 2-4. ホームのログ帯

```js
      body.push(el('div', '', SHORT ? '💬 偶数月の行動を決めよう。次の奇数月はイベント！' : '💬 今月はどうする？'));
```
を次に変える:
```js
      const prompt = el('div', 'log-prompt', SHORT ? '偶数月の行動を決めよう。次の奇数月はイベント！' : '今月はどうする？');
      DT.icons.prepend(prompt, 'chat');
      body.push(prompt);
```

### 2-5. 予定一覧のアイコンをアイコン名にする

`futureEvents()` の `icon:` を絵文字からアイコン名に変える（**それ以外は変えない**）:

| 現在 | 変更後 |
|---|---|
| `icon: '🏆'`（大会） | `icon: 'trophy'` |
| `icon: '🌍'`（世界大会） | `icon: 'globe'` |
| `icon: '📝'`（定期テスト） | `icon: 'pencil'` |
| `icon: '🤹'`（全国大会予選） | `icon: 'diabolo'` |
| `icon: '🏅'`（全国大会決勝） | `icon: 'medal'` |
| `icon: '🤝'`（練習会） | `icon: 'people'` |

`nextEventsBox` の
```js
      row.appendChild(el('span', 'ne-icon', e.icon));
```
を
```js
      const ic = el('span', 'ne-icon');
      DT.icons.prepend(ic, e.icon);
      row.appendChild(ic);
```
に。`openSchedule` の
```js
      row.appendChild(el('span', 'event-icon', e.icon));
```
も同じ形（クラスは `event-icon` のまま）に変える。

- `openSchedule` の `'🔥 ' + e.name`（次の予定の印）は**そのまま残す**（物語側の絵文字）。

---

## 3. js/state.js — 初回案内の既読

`RECORDS_KEY` などの保存キー群の近くに足し、`DT.state` へエクスポートする。

```js
  // 初回だけ出す案内の既読。**周回をまたいで残す**ので state（セーブ）ではなく専用キーに置く。
  // BACKUP_KEYS には入れない＝進行データではなく、この端末の見た目の状態だから。
  const HINTS_KEY = 'diabolo-trainer-hints-v1';
  function loadHints(storage) {
    try {
      const raw = (storage || global.localStorage).getItem(HINTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function hintSeen(id, storage) { return loadHints(storage).indexOf(id) >= 0; }
  function markHint(id, storage) {
    const list = loadHints(storage);
    if (list.indexOf(id) >= 0) return list;
    list.push(id);
    (storage || global.localStorage).setItem(HINTS_KEY, JSON.stringify(list));
    return list;
  }
```
エクスポート行に `loadHints, hintSeen, markHint, HINTS_KEY` を足す（既存要素の順序は変えない）。
**`BACKUP_KEYS` は変更しない。**

---

## 4. js/app.js — その画面の一言（④）

`renderHomeActions` の直前あたりに置く:

```js
  // 初回だけ出す一言。タイトルの115字を読ませる代わりに、その画面でその1行だけ出す。
  // 既に進んでいるセーブには出さない（turn<=2）。既読は周回をまたいで残るので2周目からは出ない。
  function coachTip(id, text) {
    if (state.turn > 2 || DT.state.hintSeen(id)) return null;
    const tip = el('div', 'coach-tip');
    tip.appendChild(el('span', 'coach-tip-text', text));
    const close = el('button', 'coach-tip-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '案内を閉じる');
    close.onclick = () => tip.remove();
    DT.state.markHint(id);
    return tip;
  }
```

差し込む3か所:

1. **ホーム** — `renderHomeActions` の**末尾**（3つの `replaceChildren` 分岐すべての後で効くように、関数の最後）:
```js
    const tip = coachTip('home', 'まず「練習」を選んでみよう');
    if (tip) box.insertBefore(tip, box.firstChild);
```
2. **練習メニュー** — `renderTrainMenu` の中（`renderTrainGrid();` の直後）:
```js
    const tTip = coachTip('train', '表のマスを3つ押して、下のボタンで実行');
    $('#trainmenu-tip').replaceChildren(...(tTip ? [tTip] : []));
```
3. **練習の成果** — `renderTrainingResult` の中（`const summary = $('#training-summary');` の近く、演出の開始前）:
```js
    const rTip = coachTip('result', '「大成功」が出ると伸びが2倍になる');
    $('#training-tip').replaceChildren(...(rTip ? [rTip] : []));
```

---

## 5. css/style.css

### 5-1. アイコンの基準

```css
/* ---------- UIアイコン（インク線SVG・絵文字の置き換え。2026-09-07） ---------- */
.ui-icon { width: 1.05rem; height: 1.05rem; display: block; flex-shrink: 0; color: inherit; }
```

### 5-2. 置き換えに伴う調整

- `.nav-btn .nav-icon { font-size: 1.05rem; }` を**削除**し、代わりに:
  `.nav-btn .ui-icon { width: 19px; height: 19px; }`
- `.modal-title` に `display: flex; align-items: center; gap: 6px;` を足す（`.ui-icon` は 20px）:
  `.modal-title .ui-icon { width: 20px; height: 20px; }`
- `.ne-icon { font-size: 1.05rem; flex-shrink: 0; }` → `.ne-icon { display: flex; flex-shrink: 0; }`
  ＋ `.ne-icon .ui-icon { width: 18px; height: 18px; }`
- `.event-icon { font-size: 1.3rem; flex-shrink: 0; }` → `.event-icon { display: flex; flex-shrink: 0; }`
  ＋ `.event-icon .ui-icon { width: 22px; height: 22px; }`
- タイトル画面と卒業生設定のボタンは、アイコンと文字を横並び中央に:
```css
#screen-title > button, #btn-alumni { display: flex; align-items: center; justify-content: center; gap: 8px; }
#screen-title > button .ui-icon, #btn-alumni .ui-icon { width: 20px; height: 20px; }
```
- ログ帯の一言:
```css
.log-prompt { display: flex; align-items: center; gap: 6px; }
.log-prompt .ui-icon { width: 16px; height: 16px; color: var(--ink-soft); }
```

### 5-3. `.title-manual` の削除

`.title-manual { … }` の定義、`#screen-title > .title-manual` を含むセレクタ行の該当部分、
`@media (max-height: 700px)` の中の `.title-manual { … }` を**すべて削除**する。
`#screen-title > h1, #screen-title > .subtitle, #screen-title > .title-manual { flex-shrink: 0; }` は
`#screen-title > h1, #screen-title > .subtitle { flex-shrink: 0; }` にする。

### 5-4. 初回案内

```css
/* 初回だけ出る一言。読ませる説明ではなく、次の一手を指す短い声かけ */
.coach-tip {
  display: flex; align-items: center; gap: 8px;
  border: 2px solid var(--ink); border-radius: 999px; background: var(--sun);
  color: var(--ink); padding: 6px 8px 6px 14px; margin-bottom: 6px;
  box-shadow: var(--pop-shadow-sm);
}
.coach-tip-text { flex: 1; font-size: .78rem; font-weight: 800; line-height: 1.35; }
.coach-tip-x {
  flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--ink); background: var(--paper); color: var(--ink);
  font-size: .9rem; font-weight: 800; line-height: 1;
}
```
（`--sun` に `--ink` は実測 7.65:1・AA OK。既に TOKEN_SHEET §1 にある組み合わせ。**新しい色を作らない**。）

---

## 6. sw.js — オフライン用の一覧に不足を足す

`CORE_ASSETS` に **`'./js/avatar.js'`**（以前から抜けていた）と **`'./js/icons.js'`** を、
`'./js/radar.js'` と `'./js/app.js'` の間に足す。`CACHE_VERSION` は下の 7. で上げる。

---

## 7. バージョン

- `index.html` の `?v=20260907a` を**すべて** `20260908a` に置換（新しい `icons.js` の行を含めて16か所）。
- `js/app.js` の `APP_VERSION` を `'v0.9 short-test15'`。
- `sw.js` の `CACHE_VERSION` を `'v20260908a'`。

---

## 8. tests/ に追記（**5件すべて実装すること**）

`tests/test-state.js` に:
1. `初回案内: 既読は保存され、2度目は出ない` — 偽の storage を渡して `hintSeen('home')` が最初 false、
   `markHint('home')` 後に true。同じidを2回 markHint しても配列は1件のまま。
   壊れた値（`'{'` や `'3'`）が入っていても `loadHints` が `[]` を返すこと。
2. `初回案内: バックアップの対象に入れない` — `DT.state.BACKUP_KEYS` に `HINTS_KEY` が**含まれない**こと
   （進行データではないため）。

`tests/test-mobile-layout.js` に（ソース文字列の静的検査。既存の書き方に合わせる）:
3. `アイコン: UIの器から絵文字が消えている` — `index.html` の `.nav-btn` 3つと `.modal-title` 7つ、
   `#btn-records` / `#btn-zukan` / `#btn-alumni` の**行に絵文字が無く**、`data-icon="…"` を持つこと。
   さらに `js/icons.js` が `index.html` で `js/app.js` より**前**に読み込まれていること。
4. `アイコン: data-icon の名前は実在する` — `index.html` の全 `data-icon="X"` の X が、
   `js/icons.js` の `PATHS` のキーに存在すること（綴り間違いをテストで止める）。
   同様に `js/app.js` の `DT.icons.prepend(..., 'X')` と `futureEvents` の `icon: 'X'` も実在すること。
5. `初回案内: タイトルの説明文は無い` — `index.html` と `js/app.js` に `title-manual` が残っていないこと。
   `js/app.js` が `coachTip('home', …)` `coachTip('train', …)` `coachTip('result', …)` の3か所を持ち、
   `coachTip` が `state.turn > 2` と `DT.state.hintSeen(` で出し分けていること。

---

## 共通ルール

- 変更してよいファイル: `index.html`・`js/app.js`・`js/state.js`・`css/style.css`・`sw.js`・
  `tests/test-state.js`・`tests/test-mobile-layout.js`。
- **`js/icons.js` は変更しない**（作画済み。パスも線幅も触らない）。
- **`js/data.js`・`js/engine.js`・`js/contest.js`・`js/events.js`・`js/cards.js`・`js/avatar.js`・`js/radar.js` は変更しない。**
- ゲームの数値・判定・保存形式（`state`）は変えない。
- 文章の中の絵文字は消さない。消すのは表に挙げた「単独のアイコン」だけ。
- 色・文字サイズは `design/TOKEN_SHEET.md` §9 の範囲から出ない。**白抜き文字のチップは作らない。**

## 完了条件

1. `npm test` が全て通る（既存297件＋今回5件＝302件）。
2. `npm run build:web` が成功する。
3. 変更が許可ファイルに限られる。
4. ファイルごとの変更点要約を出力する。

---

## 検証記録（2026-09-07 Claude実施）

- アイコン作画: Claude（目視で3回描き直し。見本 `docs/previews/2026-09-07-icons/index.html`）。
  配線の実装: Codex。検証: Claude がコード読解＋テスト＋ブラウザ実測（390×844）。
- `npm test`: **302件 全通過** ／ `npm run build:web`: 成功。
- `js/icons.js` は Codex による変更なし（差分ゼロを確認）。ゲームの数値・判定・保存形式は無改変。

### 作画で描き直した3つ（Claudeが目視で判断）

| アイコン | 直した理由 |
|---|---|
| 設定 | 歯車を線だけで描くと**太陽**に見えた → つまみ2つのスライダーへ |
| 全国大会予選 | 三角2つだと**砂時計**に見えた → カップの縁を楕円にして立体のディアボロへ |
| 記録・ポイント | リボンの開き角が狭く**風船**に見えた → 開き角を広げ、円盤を小さく |

### Claude が見つけて直した2点

1. **ログ帯に絵文字が残っていた** — 仕様に入れ忘れていた `📖 これまでの記録ログ ▸`。
   新しい吹き出しSVGの真横に絵文字が並んでいて、かえって不揃いが目立っていた。`book` アイコンへ。
2. **「学力アップ・伸び2倍」が2行に折り返していた**（Wave 2 で説明文を12pxへ上げたため）。
   TOKEN_SHEET §9-1 のとおり**文字を小さく戻さず語を削り**、`学力アップ×2` に。
   ついでに静的テストが `data-icon` の**件数を厳密一致で固定**していたので、下限（`>=`）に直した
   （アイコンを1つ足すたびにテストが落ちるのは、見たいこと＝配線が残っているか、とずれている）。

### 実測（390×844）

| 項目 | 実測 |
|---|---|
| ナビ3つ | `home` / `chart` / `gear` のSVG（19px）。選択中は黄地に `--ink`＝`currentColor` で追従 |
| モーダル見出し | 7つすべてSVG（20px）。文言は無改変 |
| 予定一覧 | 6種すべてSVG（一覧22px／ホーム18px）。残る絵文字は「次」印の🔥のみ（意図どおり） |
| タイトル画面 | 説明文（115字）が消え、絵が主役に。記録・図鑑ボタンにSVG |
| ホームの残り絵文字 | `🔒` のみ（ジャンル名に付く鍵＝文中の記号なので残す） |
| 初回案内 | ホーム→練習→成果の3画面で1行ずつ表示。既読は `diabolo-trainer-hints-v1` に残り、2度目は出ない |
| 進行済みセーブ | `state.turn > 2` では出ない |
| 行動ボタンの説明 | 3つとも1行（18px）に収まった |
| スクロール | ホーム・練習・成果とも **なし** |
| JSエラー | **0件**（404は未配置PNGのみ） |
| 読み込み順 | `icons.js` は `app.js` の前（実測のリソース順で確認） |

### 残した絵文字（意図的）

物語と手触りの側の絵文字は残す: 🎉 ✨ 💧 🎋（イベント）／🥇🥈🥉（順位）／🔥（覚醒・次の予定の印）／
⚠（警告）／🔒（未解禁）／🔁（前回と同じ）／🥢🛌📖🩹（行動ボタンの絵は自作PNG）／📈（今月の伸びピル）。
**機種差で困るのは毎回目に入る「器」だけ**、という線引き。
