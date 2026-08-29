# アバター統合 Wave A 実装仕様（Codex向け・確定版）

作成日: 2026-08-28 ／ 仕様・UI設計: Claude ／ 実装: Codex
親: [2026-08-28-avatar-system-plan.md](./2026-08-28-avatar-system-plan.md)
パーツ本体: [js/avatar.js](../../js/avatar.js)（実装済み・**このファイルは変更しない**）

## Wave A の範囲

**「自分の顔を作れて、ホームに出る」までを通す。**
卒業カード・卒業生名簿・NPCへの展開は Wave B（このWaveでは触らない）。

絵柄は「ひかえめ」で確定済み（`js/avatar.js` の `defaultProportion`）。**プリセットの指定はコード側で
一切書かない**（既定を読むだけ）。将来ここを変えるだけで全画面の顔が変わる状態を保つこと。

## 共通ルール

- 変更してよいファイル: `index.html`・`js/app.js`・`css/style.css`・`tests/test-mobile-layout.js`。
- **`js/avatar.js` と `js/state.js` は変更しない。**
- 既存ファイルは編集前に必ず読む。ファイルの削除・移動・リネームはしない。
- ゲームロジック・数値・大会/イベントの挙動は変えない。
- 新しい色を作らない（既存トークンのみ）。
- `DT.avatar` が未読み込みでも例外で落ちないこと（`if (!DT.avatar) return;` のガードを入れる）。

## 1. index.html

1. `js/app.js` より**前**に `<script src="js/avatar.js?v=20260828c"></script>` を追加する
   （`js/radar.js` の次の行が分かりやすい）。
2. `20260828b` を**すべて** `20260828c` に置換する。
3. スカウト画面 `#screen-create` の `.sub-header` の**直後**（`<p class="subtitle">今年の新入生はこんな選手！</p>` の前）へ、顔を作る入口を追加:

```html
<button class="card avatar-row" id="btn-avatar-open">
  <span class="avatar-row-face" id="create-avatar"></span>
  <span class="avatar-row-meta">
    <b>顔をつくる</b>
    <small>目・髪・色を選んで自分の選手にする</small>
  </span>
  <span class="avatar-row-arrow">▸</span>
</button>
```

4. 登録確認モーダル `.registration-name-readout` の**直前**へ顔の確認を追加:

```html
<div class="registration-face" id="registration-avatar" aria-hidden="true"></div>
```

5. `#registration-modal` の**後ろ**に、顔エディタのモーダルを追加:

```html
<!-- ======== 顔をつくる（アバターエディタ） ======== -->
<div id="avatar-modal" class="modal hidden">
  <div class="modal-backdrop" data-close-avatar></div>
  <div class="modal-card avatar-modal-card">
    <div class="modal-head">
      <span class="modal-title">🙂 顔をつくる</span>
      <button class="modal-close" data-close-avatar aria-label="閉じる">×</button>
    </div>
    <div class="avatar-preview">
      <div class="avatar-preview-face" id="avatar-preview" aria-hidden="true"></div>
      <button id="btn-avatar-random" class="avatar-random" aria-label="ランダムに作り直す">🎲</button>
    </div>
    <div class="modal-list" id="avatar-parts"></div>
    <div class="avatar-savebar">
      <button id="btn-avatar-done" class="primary">この顔にする</button>
    </div>
  </div>
</div>
```

## 2. js/app.js

### 2-1. 顔の解決（どこで顔を出すときも必ずこれを通す）

```js
// 保存データに顔が無い選手（アバター導入前のセーブ）は、名前から決まった顔を出す。
// fromSeedは同じ名前なら必ず同じ顔になるので、周回をまたいでも見た目が変わらない。
function avatarOf(who) {
  if (!DT.avatar) return null;
  if (!who) return DT.avatar.defaults();
  return who.avatar ? DT.avatar.normalize(who.avatar) : DT.avatar.fromSeed(who.name || '');
}

// 器にSVGの顔を差し込む。中身は総入れ替えし、has-avatar を付ける。
function mountAvatar(container, cfg, moodKey) {
  if (!container || !DT.avatar || !cfg) return;
  container.replaceChildren(DT.avatar.svgElement(cfg, moodKey ? { mood: moodKey } : {}));
  container.classList.add('has-avatar');
}
```

### 2-2. 作成中の顔を保持する

- モジュール変数 `let candidateAvatar = null;` を追加する。
- `newCandidate()`: 生成した `next` に対して
  `if (!candidateAvatar) candidateAvatar = DT.avatar.random();` → `next.avatar = candidateAvatar;`
  **`DT.state.newCharacter` の中には手を入れない**（rngの消費順がテストでピン留めされているため）。
- `$('#btn-create-back').onclick`（タイトルへ戻る）で `candidateAvatar = null;` に戻す。
- **経歴セレクトの変更や引き直しで顔が消えないこと。** `newCandidate()` は毎回呼ばれるが、
  `candidateAvatar` は保持されるので同じ顔が付き直る。ここが壊れていないか必ず確認すること。

### 2-3. スカウト画面

`renderCreate(c)` の中で、入口ボタンの顔を描く:
```js
mountAvatar($('#create-avatar'), avatarOf(c));
```

`$('#btn-avatar-open').onclick = openAvatarEditor;`

### 2-4. 顔エディタ

```js
function openAvatarEditor() {
  if (!DT.avatar) return;
  if (!candidateAvatar) candidateAvatar = DT.avatar.random();
  renderAvatarEditor();
  $('#avatar-modal').classList.remove('hidden');
}
function closeAvatarEditor() {
  $('#avatar-modal').classList.add('hidden');
  if (candidate) mountAvatar($('#create-avatar'), avatarOf(candidate));
}
```

- `data-close-avatar` を持つ要素すべてと `#btn-avatar-done` で `closeAvatarEditor()` を呼ぶ。
- **編集は即時反映**（下書きを持たない）。閉じ方によらず選んだ顔がそのまま残る。
- 閉じたとき `candidate.avatar` も `candidateAvatar` を指しているようにする
  （`newCandidate` で同じ参照を入れているので、`candidateAvatar` を直接書き換えれば自動的に一致する。
  ただし**差し替えではなくプロパティ更新**で行うこと。`candidateAvatar = {...}` と代入すると
  `candidate.avatar` が古い参照のまま取り残される。**ランダム時も
  `Object.assign(candidateAvatar, DT.avatar.random())` の形で中身だけ入れ替える。**）

`renderAvatarEditor()`:
1. `mountAvatar($('#avatar-preview'), candidateAvatar)` でプレビューを描く。
2. `#avatar-parts` を組み直す。`DT.avatar.SLOTS` の各項目について:
   ```
   <div class="apart">
     <div class="apart-label">（slot.label）</div>
     <div class="apart-opts">
       <button class="apart-opt [on]">（その候補だけを反映した顔のSVG）</button> × 候補数
     </div>
   </div>
   ```
   候補サムネイルは「いまの設定のうち、その項目だけを候補に差し替えた顔」を描く
   （＝髪色を変えると全サムネイルの髪色も変わる。何を選ぶとどうなるかがそのまま見える）。
   押したら `candidateAvatar[slot.key] = i;` → `renderAvatarEditor()` を呼び直す。
3. 続けて `DT.avatar.COLOR_SLOTS` の各項目を、色見本のボタンで同じ形に並べる
   （`<button class="apart-sw [on]" style="background:（色）">`、`aria-label` に色番号を入れる）。
4. `$('#btn-avatar-random').onclick` = `Object.assign(candidateAvatar, DT.avatar.random()); renderAvatarEditor();`

### 2-5. 登録確認モーダル

`openRegistration()`（または `syncRegistrationName()`）で
`mountAvatar($('#registration-avatar'), avatarOf(candidate));` を呼ぶ。

### 2-6. ホームのやる気顔（**表示の解決順を PNG > SVG > 絵文字 にする**）

`renderPlayerBoard()` の該当箇所を、絵文字→SVG→PNG の順で重ねる:
```js
const faceEl = el('div', 'mood-face', MOOD_EMOJI[moodLabel] || '🙂');
const moodKey = heroMoodKey(state, moodLabel);
mountAvatar(faceEl, avatarOf(state), moodKey);              // ② SVGアバター
mountCharImage(faceEl, heroMoodSrc(moodKey), 'mood-face-img'); // ③ PNGがあれば最優先
mood.appendChild(faceEl);
```
※`mountCharImage` は読み込めたときだけ中身を置き換えるので、この順で「PNG > SVG > 絵文字」になる。

### 2-7. 練習メニューのやる気チップ

`renderTrainMenu()` の `moodMini` に対して、同じ順で `mountAvatar` → `mountCharImage` を呼ぶ
（`mountAvatar(moodMini, avatarOf(state), heroMoodKey(state, mood))`）。**表示文言は変えない。**

## 3. css/style.css

```css
/* 顔の器（SVGアバター）。PNG版(.has-img)と同じ扱いにする */
.mood-face.has-avatar { padding: 0; overflow: hidden; background: none; }
.mood-face.has-avatar svg,
.mood-mini.has-avatar svg { width: 100%; height: 100%; display: block; }
#trainmenu-mood .mood-mini.has-avatar {
  width: 18px; height: 18px; border: 2px solid var(--ink); border-radius: 50%;
  overflow: hidden; flex-shrink: 0;
}

/* スカウト画面の入口 */
.avatar-row {
  display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
  font-family: inherit; color: var(--ink); cursor: pointer;
}
.avatar-row:active { transform: translateY(3px); box-shadow: none; }
.avatar-row-face {
  width: 54px; height: 54px; flex-shrink: 0;
  border: 2px solid var(--ink); border-radius: 50%; overflow: hidden; background: var(--paper);
}
.avatar-row-face svg { width: 100%; height: 100%; display: block; }
.avatar-row-meta { flex: 1; min-width: 0; }
.avatar-row-meta b { display: block; font-size: .95rem; font-weight: 800; }
.avatar-row-meta small { display: block; font-size: .58rem; font-weight: 700; color: var(--ink-soft); }
.avatar-row-arrow { font-size: 1.1rem; font-weight: 800; color: var(--ink-soft); }

/* 登録確認の顔 */
.registration-face {
  width: 78px; height: 78px; margin: 0 auto 4px;
  border: var(--line); border-radius: 50%; overflow: hidden; background: var(--paper);
  box-shadow: var(--pop-shadow-sm);
}
.registration-face svg { width: 100%; height: 100%; display: block; }

/* 顔エディタ */
.avatar-modal-card { max-height: 92%; }
.avatar-preview { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 2px 16px 8px; flex-shrink: 0; }
.avatar-preview-face {
  width: 124px; height: 124px;
  border: var(--line); border-radius: 50%; overflow: hidden; background: var(--paper);
  box-shadow: var(--pop-shadow);
}
.avatar-preview-face svg { width: 100%; height: 100%; display: block; }
.avatar-random {
  width: 48px; height: 48px; font-size: 1.3rem;
  border: var(--line); border-radius: 14px; background: var(--sun); color: var(--ink);
  box-shadow: var(--pop-shadow-sm);
}
.avatar-random:active { transform: translateY(3px); box-shadow: none; }
.apart { display: flex; flex-direction: column; gap: 4px; }
.apart-label { font-size: .62rem; font-weight: 800; color: var(--ink-soft); letter-spacing: .1em; }
/* 候補は横スクロール。縦にカテゴリ、横に候補、が指1本で辿れる */
.apart-opts { display: flex; gap: 6px; overflow-x: auto; padding: 1px 0 3px; -webkit-overflow-scrolling: touch; }
.apart-opt {
  width: 56px; height: 56px; flex-shrink: 0; padding: 0;
  border: 2px solid var(--ink); border-radius: 50%; overflow: hidden; background: var(--paper);
}
.apart-opt svg { width: 100%; height: 100%; display: block; }
.apart-opt.on { outline: 3px solid var(--teal); outline-offset: 2px; }
.apart-sw {
  width: 34px; height: 34px; flex-shrink: 0;
  border: 2px solid var(--ink); border-radius: 10px; box-shadow: 0 2px 0 var(--ink);
}
.apart-sw.on { outline: 3px solid var(--teal); outline-offset: 2px; }
.apart-sw:active { transform: translateY(2px); box-shadow: none; }
.avatar-savebar {
  flex-shrink: 0; padding: 10px 14px max(14px, env(safe-area-inset-bottom));
  border-top: 2px dashed #bdc6dd; background: var(--cream);
}
.avatar-savebar button {
  width: 100%; padding: 12px; border: var(--line); border-radius: 14px;
  background: var(--coral); color: #fff; font-family: inherit; font-size: 1rem; font-weight: 800;
  box-shadow: var(--pop-shadow-sm);
}
.avatar-savebar button:active { transform: translateY(3px); box-shadow: none; }
```

## 4. tests/test-mobile-layout.js（既存の静的解析スタイルで追記）

1. `AVATAR: パーツ定義を読み込む` — `index.html` に `js/avatar.js?v=` があり、
   `js/app.js` の読み込みより前にあること（インデックスの比較で検証）。
2. `AVATAR: 顔をつくる導線と編集モーダルがある` — `index.html` に
   `id="btn-avatar-open"` / `id="avatar-modal"` / `id="avatar-preview"` / `id="btn-avatar-done"` があること。
3. `AVATAR: 顔が無い古いセーブは名前から顔を作る` — `js/app.js` に
   `function avatarOf(` と `DT.avatar.fromSeed(` があること。
4. `AVATAR: 表示はPNG→SVG→絵文字の順に解決する` — `js/app.js` で
   `mountAvatar(faceEl` の**後に** `mountCharImage(faceEl` が来ること（出現位置の比較で検証）。
5. `AVATAR: 経歴を変えても作った顔が消えない` — `js/app.js` に `candidateAvatar` があり、
   `newCandidate` 内で再代入せず使い回していること（`if (!candidateAvatar)` の存在を検証）。
6. `AVATAR: 絵柄プリセットをコード側で指定していない` — `js/app.js` に `proportion` の文字列指定が無いこと
   （`assert.doesNotMatch(app, /proportion:/)`）。

## 完了条件

1. `npm test` が全て通る。
2. `npm run build:web` が成功する。
3. 変更が許可4ファイルに限られる。
4. 最後にファイルごとの変更点要約を出力する。

## 検証記録（2026-08-28 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋ブラウザ実機で実施。
- `npm test`: **257件 全通過** ／ `npm run build:web`: 成功。
- 変更が許可4ファイルに限られることを `git diff --stat` で確認
  （`scripts/build-web.mjs` の差分は Wave 2 の既存分のみで、今回の変更ではない）。

### ブラウザ実機（375×812）で確認したこと

- スカウト画面に「顔をつくる」の入口と現在の顔が出る。
- 顔エディタ: プレビュー＋🎲＋**縦にカテゴリ11種・横に候補**の一覧が出る。
  カテゴリは 輪郭／目／眉／口／前髪／後ろ髪／小物／肌／髪色／瞳／服。
  候補サムネイルは「その候補だけを反映した顔」なので、選ぶ前に結果が分かる。
- **経歴を2回変えても作った顔が保たれる**（`candidateAvatar` の使い回しが効いている）。
  ※SVGの `clipPath` id は描画のたびに変わるので、同一判定は `hc\d+` を正規化してから行うこと。
- 登録確認モーダルに顔が出る。確定後、`localStorage` の `avatar` に11項目が保存される。
- ホームのやる気顔がアバターになり、**やる気5に下げると「絶不調」の表情（下がり眉・悲しい目）に変わる**。
- 練習メニューの18pxチップにも顔が出る。**文言「普通・伸び×2」は変わっていない。**
- **古いセーブの移行**: `avatar` を消して名前を「あさひ」にしたセーブで再開しても顔が出る
  （`fromSeed` による名前由来の顔）。セーブは書き換えず、表示時に解決している。
- 404は想定どおりの2件のみ（`performer-3.png`＝月送りの既存フォールバック、
  `chars/hero/mood-*.png`＝PNG上書きの探索。表情キーごとに1回でメモ化される）。

### Claude が追加で直したこと

- **Codexが実装したのは指定6件のうち3件のテストだけだった。** 残り3件（
  「PNG→SVG→絵文字の解決順」「経歴を変えても顔が消えない」「絵柄プリセットをコード側で指定しない」）を
  Claudeが追加。実装自体は3点とも仕様どおりだったが、いちばん壊れやすい不変条件なので保護を入れた。
- 追加テストの1つが、正当な初期化（`if (!candidateAvatar) candidateAvatar = ...`）まで
  禁止パターンとして拾ってしまったため、**「random() の代入はすべてガード付きであること」**を
  検査する形へ書き直した。

### 検証中の副作用（報告）

- 動作確認のため `http://localhost:8834` の `localStorage` を消去した。
  **開発プレビュー上のテストデータのみ**で、公開版（GitHub Pages）のセーブ・記録・図鑑には影響しない。
