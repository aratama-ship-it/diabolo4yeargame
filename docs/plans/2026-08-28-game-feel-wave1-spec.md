# Wave 1 実装仕様（Codex向け・確定版）

作成日: 2026-08-28 ／ 仕様: Claude（Fable）／ 実装: Codex
親: [2026-08-28-game-feel-plan.md](./2026-08-28-game-feel-plan.md) ／ 数値の正: [design/TOKEN_SHEET.md](../../design/TOKEN_SHEET.md)

## 共通ルール

- 対象ファイルは `css/style.css`・`js/app.js`・`index.html` の3つだけ。**削除・移動・リネームは禁止。**
- 既存ファイルは編集前に必ず読み直す（iCloud共有ワークスペースのため）。
- ゲームロジック・数値バランス・保存データ・関数の呼び出し順は変えない。**見た目と時間差だけを足す。**
- 新しい色を作らない。使ってよい色は style.css の既存トークンと、この仕様に書くHEXのみ。
- CSSの新設アニメは、`:root` に追加するモーショントークン（下記）を参照して書く。直書きduration禁止。
- すべての新設アニメ・transitionは `prefers-reduced-motion: reduce` で無効化する（最終状態を即時表示）。

## 1. `:root` へモーショントークン追加（style.css）

```css
--dur-tap: 80ms; --dur-pop: 260ms; --dur-row: 380ms; --stagger-row: 140ms;
--dur-stamp: 340ms; --dur-count: 500ms; --dur-fill: 450ms; --dur-radar: 320ms;
--dur-enter: 180ms;
--ease-pop: cubic-bezier(.34,1.56,.64,1); --ease-stamp: cubic-bezier(.2,1.7,.35,1);
```

既存アニメ（pop-in等）の書き替えは不要。

## 2. 練習の成果リザルト演出（app.js `renderTrainingResult` 約1032行〜＋CSS）

現状: `.train-rows` グリッドへ4セル×N行を即時表示 → まとめ `#training-summary` も即時表示。

### 表示シーケンス（新設）

1. 行 i（0始まり）の4セルに class `rv-cell` と `style.animationDelay = (i*140)+'ms'` を付ける。
   アニメ: opacity 0→1・translateY(12px)→0、`var(--dur-row) ease-out both`。
2. 判定セルの中身をチップ化する:
   `<span class="tr-stamp tier-great|tier-success|tier-normal|tier-fail">大成功|成功|普通|失敗</span>`
   （マッピング: 大成功=tier-great／成功=tier-success／普通=tier-normal／失敗=tier-fail）。
   チップは `animation-delay = (i*140+180)+'ms'` でハンコ演出:
   scale(1.55) rotate(-8deg) → 等倍、`var(--dur-stamp) var(--ease-stamp) both`、opacity 0→1。
   `tier-fail` はハンコ着地後に横シェイク（±4px・300ms・1回）を続けて再生
   （`animation: rv-stamp-in ..., rv-shake 300ms ease-out (i*140+180+340)ms 1 both;` の形で2つ連結）。
3. 増分セル（失敗以外）は `0` から実値まで**カウントアップ**する。
   開始 `(i*140+260)ms`・所要 `var(--dur-count)`(500ms)・requestAnimationFrame・表示は `'+'+Math.round(v)`。
   失敗セルは従来どおり `—` を即時表示（カウントなし）。
   カウントアップ中も列幅が揺れないこと（`.tr-val` は既に tabular-nums 指定あり。そのままでよい）。
4. `#training-summary` は構築だけ先に行い class `rv-wait`（opacity:0）で隠す。
   全行の演出が終わる時刻（`results.length*140 + 900` ms を目安に一括タイマー）に `rv-wait` を外し
   class `rv-in`（opacity 0→1・translateY(8px)→0・260ms ease-out）で表示。
5. まとめ表示の 260ms 後、まとめカード末尾に**合計ピル**を追加:
   `<div class="rv-total num">📈 今月の伸び 合計 +N</div>`
   N = 失敗以外の全行 gain 合計（演技構成含む。既存 `cellTotals`＋`compositionTotal` の総和）。
   合計が0のときはピルを出さない（既存の「今月は実りが少なかった……」だけをまとめ表示に含める）。
   見た目: 文字 `var(--ink)`・背景 `var(--sun)`・`border: 2px solid var(--ink)`・radius 999px・
   padding 4px 14px・font-size .92rem・display inline-block。
   出現: scale(.4)→(1.12)→1、`var(--ease-stamp)`、340ms。

### スキップ（必須）

- `#screen-training` のどこかをタップしたら演出を打ち切り最終状態へ:
  全 setTimeout / rAF を cancel し、増分セルへ確定値をセットし、section に class `rv-done` を付ける。
- CSS: `#screen-training.rv-done .rv-cell, #screen-training.rv-done .tr-stamp,
  #screen-training.rv-done .rv-total { animation: none; opacity: 1; transform: none; }`
  ＋ `.rv-done #training-summary` は rv-wait を無視して表示（JS側で rv-wait を外すでもよい）。
- finalize は冪等にする。OKボタン押下時にも finalize を必ず呼び、タイマーを残さない
  （OKの既存処理・遷移は変更しない）。
- `matchMedia('(prefers-reduced-motion: reduce)').matches` の場合は最初から最終状態で描画
  （タイマーを一切作らない）。

## 3. ゲージの伸び（app.js `meterRow` 約99行・`statBar` 約80行＋CSS）

- CSS: `.gauge > span, .stat-row .bar { transition: width var(--dur-fill) ease-out; }`
- JS: 両ヘルパーで、幅を最初 `0%` で挿入し、`requestAnimationFrame` を1回挟んでから実値`%`をセットする
  （2重rAF可）。reduced-motion時はCSS側で transition が無効になるため、JSは分岐不要。
- 対象はこの2ヘルパー経由の全ゲージ（ホーム体力/学力/構成、スカウト、エントリー等）。
  月送りの `.month-transition-progress` は**触らない**。

## 4. レーダー描画イン（app.js `buildRadarSvg` 約121行＋CSS）

- `buildRadarSvg` 内で「現在値のポリゴン」（グリッド線・軸ラベルではなく、値で描く多角形）に
  class `radar-value` を追加する。どの要素が値ポリゴンかは関数を読んで特定すること。
- CSS:
  ```css
  .radar-svg .radar-value { transform-box: fill-box; transform-origin: center;
    animation: radar-in var(--dur-radar) var(--ease-pop) both; }
  @keyframes radar-in { from { opacity: 0; transform: scale(.55); } }
  ```
- 未解禁（`.radar-dim`）はグレーのまま同アニメで問題ない。

## 5. タイトル紙吹雪の浮遊（style.cssのみ）

- `.title-confetti i:nth-child(5n)` の `transform: rotate(45deg)` を `--tr: 45deg` に置き換える
  （width/heightはそのまま。ベースの `transform: rotate(var(--tr, 18deg))` に乗る）。
- ベースへ `animation: tc-drift var(--tc-dur, 7s) ease-in-out var(--tc-delay, 0s) infinite alternate;` を追加。
- keyframes:
  ```css
  @keyframes tc-drift {
    from { transform: translate3d(0, -4px, 0) rotate(var(--tr, 18deg)); }
    to   { transform: translate3d(var(--tc-dx, 3px), 7px, 0) rotate(calc(var(--tr, 18deg) + 7deg)); }
  }
  ```
- ばらけさせる: `:nth-child(2n){--tc-dur:8.5s;--tc-delay:-2.4s;--tc-dx:-3px}`
  `:nth-child(3n){--tc-dur:6.2s;--tc-delay:-4.1s}` `:nth-child(4n+1){--tc-dur:5.5s;--tc-delay:-1.2s;--tc-dx:4px}`
  程度の3ルールでよい。透明度・色・配置は変えない。

## 6. スロット装着ポップ＋GO脈動（app.js `addSlotEntry` 約923行・`renderTrainMenu` 約951行＋CSS）

- モジュール変数 `justSetSlot = -1` を追加。`addSlotEntry` で装着に成功した枠の index を入れる。
- `renderTrainMenu` の枠描画時、`idx === justSetSlot` の枠にだけ class `just-set` を付け、描画後に `-1` へ戻す。
- CSS: `.slot.just-set { animation: slot-pop 240ms var(--ease-pop); }`
  `@keyframes slot-pop { 0%{transform:scale(.82)} 60%{transform:scale(1.06)} 100%{transform:scale(1)} }`
- GO脈動: モジュール変数で直前の装着数を覚え、**3枠に到達した描画のとき一度だけ** `#btn-training-go` に
  class `ready-pulse` を付ける（`animationend` で外す）。
  CSS: `@keyframes go-pulse { 0%{transform:scale(1)} 50%{transform:scale(1.03)} 100%{transform:scale(1)} }`
  500ms・1回。既存の `:active`/`:disabled` スタイルは壊さない。

## 7. 画面入場の統一（style.cssのみ）

- `.screen { animation: screen-in var(--dur-enter) ease-out; }`
  `@keyframes screen-in { from { opacity: 0; transform: translateY(8px); } }`
  （`.hidden` は display:none なので、表示のたび再生される。それで正しい）
- イベント画面だけ時間差:
  `#event-text { animation: screen-part-in 240ms ease-out .06s both; }`
  `#event-choices { animation: screen-part-in 240ms ease-out .14s both; }`
  `@keyframes screen-part-in { from { opacity: 0; transform: translateY(10px); } }`

## 8. reduced-motion 一括無効（style.css）

既存の `@media (prefers-reduced-motion: reduce)` ブロックへ追記（または同条件の新ブロック）:
`tc-drift / rv-* / radar-in / slot-pop / go-pulse / screen-in / screen-part-in` の animation を none にし、
`.gauge > span, .stat-row .bar` の transition を none にする。opacity/transform が初期値で残らないよう
`opacity:1; transform:none;` を明示する。

## 9. キャッシュバスト（index.html）

`index.html` 内の文字列 `20260811a` を**すべて** `20260828a` に置換する（css/js/manifest/アイコン/sw 共通）。

## 完了条件

1. `npm test` が全て通る（`scripts/run-tests.mjs`）。
2. 上記1〜9がすべて実装され、対象3ファイル以外に変更がない。
3. 実装後、変更点の要約（ファイルごと・何を足したか）を出力する。

## 検証記録（2026-08-28 Claude実施）

- 実装: Codex（codex exec）。検証: Claude がコード読解＋ `npm test` ＋ブラウザ実機で実施。
- `npm test`: 12スイート **計245件 全通過**（Claude自身で再実行して確認）。
- 変更ファイルが指定3ファイルのみであることを `git status` / `git diff --stat` で確認。
- ブラウザ実機（localhost:8834・モバイル幅）で確認済み:
  行の時間差入場／判定チップのハンコ／カウントアップ（+4/+10/+12 等）／まとめフェード／
  合計ピル（📈 今月の伸び 合計 +26）／**タップスキップ**（GO後100msのタップで即確定・rv-done付与）／
  スキップ後のOK→月送りの正常続行／ゲージ伸び（体力92のバーが途中→実値に到達する瞬間を撮影）／
  紙吹雪 tc-drift 稼働／slot just-set・GO ready-pulse 発火／大会リビール・イベント・エントリー画面の非破壊。
- コンソールエラー: 新規なし（performer-3/4 の404は既存設計どおりのフォールバック探索）。
- **仕様逸脱1件を修正**（Claude が直接修正）: Codex実装の判定チップが「成功=teal地白抜き（2.17:1）／
  失敗=coral地白抜き（2.78:1）」でAA未達だったため、トークンシートどおり淡色地＋インク文字
  （9.40:1／8.94:1）へ変更。
- Codex が仕様外で大会リビール既存アニメも reduced-motion 対象に追加していた。アクセシビリティ向上の
  ため採用（挙動退行なし）。
- 検証環境の注意: Browserペイン非表示（document.hidden）だと描画が凍結し演出が止まって見えるが、
  タブを前面にすると正常。実機では起きない事象。
