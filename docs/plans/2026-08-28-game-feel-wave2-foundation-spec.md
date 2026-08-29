# Wave 2 土台 実装仕様（Codex向け・確定版）

作成日: 2026-08-28 ／ 仕様: Claude ／ 実装: Codex
親: [2026-08-28-game-feel-plan.md](./2026-08-28-game-feel-plan.md) ／ 素材側: [2026-08-28-illustration-asset-plan.md](./2026-08-28-illustration-asset-plan.md)

## この作業の目的

**イラストがまだ1枚も無い状態で、受け皿だけを先に作る。**
画像を所定パスへ置けばコード変更なしで表示に切り替わり、無ければ現在の絵文字・テキスト表示のまま
一切壊れない。月切替ローダー（`assets/loader/performer-N.png`）で実績のある方式を、
主人公の表情とイベントの顔チップへ広げる。

**この作業でイラストは作らない。プレースホルダー画像も置かない。**

## 共通ルール

- 変更してよいファイル: `js/app.js`・`css/style.css`・`scripts/build-web.mjs`・
  `tests/test-mobile-layout.js`・`index.html`（キャッシュバスト用の文字列のみ）。
  加えて `assets/chars/README.md` を**新規作成**する。
- 既存ファイルは編集前に必ず読み直す。**ファイルの削除・移動・リネームはしない。**
- ゲームロジック・数値・保存データ・関数の呼び出し順は変えない。
- 新しい色を作らない。既存トークン（`--ink` `--paper` `--cream` 等）のみ使う。
- 画像が無いときに**例外を投げない・レイアウトを崩さない・コンソールを404で埋めない**こと。

## 1. 画像スロットの共通機構（js/app.js）

`MOOD_EMOJI` の定義付近へ追加する。

```js
// ---- キャラ画像スロット（2026-08-28）----
// 「置いてあれば出す、無ければ現状の絵文字・テキストのまま」を1か所で扱う。
// 同じsrcは1セッションに1回しか読みに行かない（未配置でも404は1件で打ち止め）。
// 素材ごと止めたいときは false にする（画像を一切取りに行かなくなる）。
const CHAR_IMAGES_ENABLED = true;
const charImgState = new Map(); // src -> 'ok' | 'ng' | 'loading'
```

`mountCharImage(container, src, imgClass)` を実装する。

- `CHAR_IMAGES_ENABLED` が false、または `container`/`src` が無ければ**何もしない**。
- state が `'ok'`: 直ちに `container` の中身を `<img>` へ差し替え、`container` に class `has-img` を付ける。
- state が `'ng'` または `'loading'`: **何もしない**（呼び出し側が入れたフォールバックがそのまま残る）。
- state 未登録: `'loading'` にして `new Image()` で先読みする。
  - `onload`: state を `'ok'` にし、**`container.isConnected` が true のときだけ**中身を差し替える
    （差し替え前に再描画されていた場合は捨てる。**画面全体の再描画は絶対に呼ばない**
    — ゲージのアニメが再生し直されるため）。
  - `onerror`: state を `'ng'` にする。それ以上は何もしない。
- 生成する `<img>`: `src` を設定、`alt=''`（隣に必ず名前やラベルの文字があるため装飾扱い）、
  `className` は引数 `imgClass`、`draggable = false`。

## 2. 主人公の表情（js/app.js・css/style.css）

### パスと状態の対応

```js
const HERO_MOOD_KEY = { '絶好調': 'best', '好調': 'good', '普通': 'normal', '不調': 'bad', '絶不調': 'worst' };
const heroMoodSrc = key => 'assets/chars/hero/mood-' + key + '.png';
```

`heroMoodKey(state, moodLabel)` を追加する。**優先順位は 怪我 > 覚醒 > やる気ラベル**:

1. `state.injuredTurns > 0` → `'injured'`
2. `state.awakenTurns > 0` → `'awaken'`
3. それ以外 → `HERO_MOOD_KEY[moodLabel] || 'normal'`

### 差し込み箇所A: ホームの顔（`renderPlayerBoard` 約819行）

現在: `mood.appendChild(el('div', 'mood-face', MOOD_EMOJI[moodLabel] || '🙂'));`

→ 絵文字入りの `.mood-face` を作るところまでは今のまま。作った直後に
`mountCharImage(faceEl, heroMoodSrc(heroMoodKey(state, moodLabel)), 'mood-face-img')` を呼ぶ。

CSS:
```css
.pb-mood .mood-face.has-img { padding: 0; overflow: hidden; background: none; }
.mood-face-img { width: 100%; height: 100%; object-fit: cover; display: block; }
```
（44px円・`--line` の枠・`border-radius:50%` は既存のまま活かす）

### 差し込み箇所B: 練習メニューのチップ（`renderTrainMenu` 約960行）

現在: `$('#trainmenu-mood').textContent = (MOOD_EMOJI[mood] || '🙂') + ' ' + mood + (SHORT ? '・伸び×2' : '');`

→ チップの中身を「顔スロット（span）＋ テキスト（span）」の2ノード構成へ変える。
顔スロットには従来どおり絵文字を入れておき、`mountCharImage(faceSpan, ..., 'mood-mini-img')` を呼ぶ。
テキスト側は `' ' + mood + (SHORT ? '・伸び×2' : '')` を維持する（**表示文言は変えない**）。

CSS:
```css
#trainmenu-mood .mood-mini { display: inline-flex; align-items: center; justify-content: center; }
#trainmenu-mood .mood-mini.has-img {
  width: 18px; height: 18px; border: 2px solid var(--ink); border-radius: 50%;
  overflow: hidden; flex-shrink: 0;
}
.mood-mini-img { width: 100%; height: 100%; object-fit: cover; display: block; }
```

## 3. イベントの顔チップ（js/app.js・css/style.css）

### 話者表示の一本化

`setEventSpeaker(name, charId)` を新設し、**`#event-char` へ直接 textContent を代入している箇所をすべて
これに置き換える**（該当行: 約1219・1325・1366・1434・1464・1818・1841。行番号は目安なので
`$('#event-char').textContent` を全文検索して漏れなく置換すること）。

```js
const charPortraitSrc = id => 'assets/chars/portrait/' + id + '.png';
```

`setEventSpeaker(name, charId)` の中身:
1. 顔スロット `el('span', 'event-portrait')`（**中身は空**）と、名前 `el('span', 'event-speaker-name', name)` を作る。
2. `$('#event-char')` の中身をこの2つに差し替える。
3. `charId` があれば `mountCharImage(portraitSpan, charPortraitSrc(charId), 'event-portrait-img')` を呼ぶ。

`charId` を渡す箇所は**キャラクターイベントだけ**:
- `renderEvent`（約1434行）: `setEventSpeaker(event.speaker || (chara ? chara.name : ''), event.char)`
- `renderEvent` 内の結果表示 `showEventNotice(header, ...)`（約1455行）: 第5引数に `event.char` を渡す
- それ以外（SNS・初詣・おみくじ・卒業生・覚醒・その他の通知）は `charId` なし＝**従来どおり名前だけ**

`showEventNotice(header, text, effectLines, onContinue, charId)` は**第5引数を省略可能**にする
（他の呼び出し側は変更不要）。内部の `$('#event-char').textContent = header;` を
`setEventSpeaker(header, charId)` に置き換える。

### CSS

`.event-portrait` は**画像が付くまで領域を持たない**こと（空の丸を出さない）。

```css
#event-char { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.event-portrait { display: none; }
.event-portrait.has-img {
  display: block; width: 64px; height: 64px;
  border: var(--line); border-radius: 50%; overflow: hidden;
  background: var(--paper); box-shadow: var(--pop-shadow-sm);
}
.event-portrait-img { width: 100%; height: 100%; object-fit: cover; display: block; }
```

## 4. 配布ビルドへの同期（scripts/build-web.mjs）

`assets/loader/` の既存の任意同期と**同じ書き方**で `assets/chars/` を追加する
（`existsSync` で存在確認し、無ければ「とばしました」と出してビルドは成功させる）。
メッセージ例: `assets/chars/ は未配置のため同期をとばしました（絵文字表示のまま動きます）。`

## 5. 素材の契約書（assets/chars/README.md を新規作成）

**この1枚を読めば別マシンのエージェントが素材を作れる**よう、自己完結で書く。含める内容:

- 置き場所と命名:
  - `hero/mood-<best|good|normal|bad|worst|awaken|injured>.png`
  - `portrait/<キャラid>.png`（idは `js/data.js` の `DATA.CHARACTERS` と完全一致させる。
    現在: coach / yota / mikoto / shion / kaito / irie / ujiji / kazuki / george / saito。
    youtube・malaysia は人物ではないので**作らない**）
- 形式: PNG-32 透過、**正方形 512×512**、1枚 60KB 以下
- 構図: 正面〜わずか3/4のバストアップ。**円形に切り抜かれる**ので顔を中央に置き、
  四隅に意味のある要素を置かない。顔チップは**ディアボロ非携行**（物理拘束を避けるため）
- 画風: ねんどろいど風・2.5頭身。既存キャラ資産と同じ線の太さ・彩度
- 表示サイズ: ホームの顔 44px / 練習チップ 18px / イベント 64px（**小さく出るので描き込みすぎない**）
- 作り方の手順書へのリンク:
  `docs/reference/2026-07-14-character-consistency-workflow.md`、
  `knowledge/character-consistency-refs/`（canon承認フロー: candidates → 本人承認 → canon → 切り抜き）
- **1枚ずつ足してよい**こと（揃うまで待つ必要はない。無いものは絵文字・名前のまま）
- 主人公は7枚を**セットで揃えるのが望ましい**（表情ごとに絵と絵文字が混ざるため）。
  ただし混ざっても壊れはしない
- ゲーム側は実装済みなので**置くだけで反映される**こと（要ハードリロード）

## 6. 回帰テスト（tests/test-mobile-layout.js へ追記）

既存の静的解析スタイル（ソースを正規表現で検査）に合わせて追加する。

1. `CHAR IMAGE: 画像が無いときは絵文字へフォールバックする仕組みを持つ`
   — `js/app.js` に `CHAR_IMAGES_ENABLED` / `charImgState` / `mountCharImage` / `'ng'` があること
2. `CHAR IMAGE: 主人公の表情は7状態ぶんのパスを解決できる`
   — `HERO_MOOD_KEY` と `assets/chars/hero/mood-` の生成式、`injured` / `awaken` の優先分岐があること
3. `CHAR IMAGE: イベントの顔は話者IDから引く`
   — `assets/chars/portrait/` の生成式と `setEventSpeaker` があること、
     かつ `$('#event-char').textContent` への**直接代入が1件も残っていない**こと
4. `CHAR IMAGE: 未配置でも配布ビルドが通る`
   — `scripts/build-web.mjs` に `assets/chars` と `existsSync` の分岐があること
5. `CHAR IMAGE: 画像が付くまで空の丸を出さない`
   — `css/style.css` に `.event-portrait { display: none; }` 相当と `.event-portrait.has-img` があること

## 7. キャッシュバスト（index.html）

`index.html` 内の `20260828a` を**すべて** `20260828b` に置換する。

## 完了条件

1. `npm test` が全て通る（既存245件＋今回の追加分）。
2. `npm run build:web` が `assets/chars/` 未配置の状態で**成功**し、スキップの旨が出力される。
3. 変更が上記の許可ファイル＋新規 `assets/chars/README.md` に限られる。
4. 最後にファイルごとの変更点要約を出力する。

## 検証記録（2026-08-28 Claude実施）

- 実装: Codex（codex exec）。検証: Claude がコード読解＋テスト＋ブラウザ実機で実施。
- `npm test`: **計251件 全通過**（既存245＋Codex追加5＋Claude追加1）。Claude自身で再実行して確認。
- `npm run build:web`: 素材未配置のまま**成功**し、`assets/chars/ は未配置のため同期をとばしました` を出力。
- `assets/chars/` にプレースホルダー画像が置かれていないこと（README.md のみ）を確認。
- 変更ファイルが許可範囲内であることを `git status` で確認。

### ブラウザ実機の確認（localhost:8834・モバイル幅）

**画像なし（＝現在の公開状態）**
- ホームの顔は絵文字 😊 のまま、`has-img` なし。練習チップも `😊 好調・伸び×2` と従来どおり。
- イベント画面は名前のみ表示。`.event-portrait` は `display:none` で空の丸は出ない。
- ネットワーク: `mood-good.png` の404が**1件だけ**。再描画を繰り返しても再要求されない（メモ化が効いている）。

**画像あり（`assets/icons/*.png` を契約パスへ一時コピーして確認 → 確認後に削除済み）**
- ホームの顔が円形クリップの画像へ差し替わり、枠・44px・下のラベル位置は不変。
- 野中コーチのイベントで64pxの顔チップが名前の上に表示され、選択後の**結果画面にも引き継がれる**ことを確認。
- コピーを削除して再読込すると、顔・顔チップとも絵文字／名前のみへ**正しく戻る**ことを確認。

### 検出して修正した不具合（Claude が直接修正）

- **`portrait/awaken.png` への無駄な404リクエスト。** 「覚醒のきざし」イベントは `char: 'awaken'` という
  演出用の擬似IDを持つが、`awaken` は `DATA.CHARACTERS` に存在しない＝絵を用意しようがないID。
  Codex実装はこれを話者IDとして扱い、毎セッション404を1件出していた。
  → `charHasPortrait()` を追加し、`DATA.CHARACTERS` に実在するIDのときだけ画像を探すようにした。
  ブラウザで `DT.DATA.CHARACTERS.some(c=>c.id==='awaken') === false` / `'coach' === true` を確認済み。
  回帰テスト「実在しない話者ID（覚醒などの演出用）では画像を探さない」を追加（events.js から擬似IDを
  自動検出する形にしたので、今後 char を増やしても検出が効く）。
  `assets/chars/README.md` にも「`awaken` は表情キーであり話者IDではない」を明記した。

### 補足

- Browserペイン非表示時（`document.hidden`）はCSSアニメが途中で凍結し演出が止まって見えるが、
  タブを前面にすると正常。実機では起きない検証環境固有の事象（Wave 1 と同じ）。
