# E3「奇数月に部の仲間が現れる」実装仕様（Codex向け・確定版）

作成日: 2026-09-04 ／ 設計・会話文: Claude（Opus）／ 実装: Codex
根拠: [docs/previews/ux-review-2026-08-29/index.html](../previews/ux-review-2026-08-29/index.html) の E3

## 問題

NPC 10人の顔を用意したのに、**1周（奇数月12回）で1〜2回しか出ない**。
実測した内訳:

| 奇数月に出るもの | 割合 | 顔 |
|---|---|---|
| キャラクターイベント（`charEvents` 12種） | 12.5% ／ **一度きり**ですぐ尽きる | あり |
| ハプニング（`happenings` 17種） | 5% | なし（📓 今月のできごと） |
| **静かな月（`quietEvents` 10種）** | **82.5%** | **なし** |

つまり大半の奇数月が「話者のいない地の文」で終わっている。

## 方針

**82.5%を占める `quietEvents` に、話者付きの日常会話を足す。**

- 既存の地の文10種は**残す**（雨の体育館、練習ノート…は良い手触りなので消さない）。
- 新たにNPCの短い日常会話17種を同じ配列へ足し、**話者ありを約75%** で引く。
- **同じ人が続かないよう、直近3人の話者を避ける。**
- **`rollGuaranteed` の戻り値は `{ kind: 'quiet', event }` のまま**（既存テストを壊さない）。
- **効果は全て `effects: {}`**。1周で12回出るため、少しでも数値を動かすとバランスに効く。
  価値は「部に人がいる」ことであって報酬ではない。

## 1. js/data.js — `quietEvents` に17件を追記

既存10件の**後ろ**に足す。`char` は `CHARACTERS` のidと一致させる。
`speaker` は書かない（表示名は `CHARACTERS` から引く。二重管理を避ける）。

```js
        // ここから話者つきの日常会話（2026-09-04 追加）。
        // 奇数月の大半が地の文で終わり、NPCの顔が1周に1〜2回しか出なかったため。
        // 効果は持たせない（1周で約12回出るのでバランスに効いてしまう）。
        { id: 'day_coach1', char: 'coach', text: '「うまい奴ほど、地味な練習の時間が長い。それだけだ」野中コーチはそう言って背を向けた。', effects: {} },
        { id: 'day_coach2', char: 'coach', text: '野中コーチが黙って隣で回し始めた。速さも高さも、まるで次元が違った。', effects: {} },
        { id: 'day_coach3', char: 'coach', text: '「今日の一本、悪くなかったな」それだけ言って、野中コーチは体育館を出て行った。', effects: {} },
        { id: 'day_yota1', char: 'yota', text: 'コースケが「今の技、名前つけようぜ。『コースケ・スペシャル』とか」と絡んできた。', effects: {} },
        { id: 'day_yota2', char: 'yota', text: 'コースケがディアボロを頭に乗せようとして失敗し、盛大に転がした。', effects: {} },
        { id: 'day_yota3', char: 'yota', text: '「なあ、腹減らない？」コースケの一言で、練習は一旦休憩になった。', effects: {} },
        { id: 'day_mikoto1', char: 'mikoto', text: '美琴先輩が採点規則の改訂点を読み上げてくれた。細かいが、ありがたい。', effects: {} },
        { id: 'day_mikoto2', char: 'mikoto', text: '「その技、難度は高いけど加点は付きにくいのよ」美琴先輩の指摘は的確だった。', effects: {} },
        { id: 'day_irie1', char: 'irie', text: 'イリエが「今の、めっちゃ良かった！」と手を叩いてくれた。', effects: {} },
        { id: 'day_irie2', char: 'irie', text: 'イリエと二人、閉館ぎりぎりまで残って回し続けた。', effects: {} },
        { id: 'day_shion1', char: 'shion', text: '志音は挨拶だけして、黙々と自分の練習に戻っていった。', effects: {} },
        { id: 'day_shion2', char: 'shion', text: '「それ、去年の私が使ってた構成だね」志音が通りすがりに言った。', effects: {} },
        { id: 'day_kaito1', char: 'kaito', text: '遠征帰りの魁人を見かけた。目が合ったが、何も言われなかった。', effects: {} },
        { id: 'day_george1', char: 'george', text: 'ジョージが「客は技を見てない。お前の顔を見てるんだ」と笑った。', effects: {} },
        { id: 'day_kazuki1', char: 'kazuki', text: 'Dr. Kazukiが回転数と滞空時間の相関を語り始めた。半分も分からなかった。', effects: {} },
        { id: 'day_ujiji1', char: 'ujiji', text: 'うじじが体育館の隅で、見たことのない技を淡々と繰り返していた。', effects: {} },
        { id: 'day_saito1', char: 'saito', text: 'SAITO会長が「今年の大会、エントリー増えてるよ」と教えてくれた。', effects: {} }
```

**既存10件の文面・id・effects は一切変更しない。**

## 2. js/events.js — 話者を選ぶ

`rollGuaranteed` の最後の quiet 分岐を差し替える。**戻り値の形（`kind: 'quiet'`）は変えない。**

```js
  // 直近の話者（同じ人が続くのを避ける）。保存データに残るが、無くても動く。
  function recentSpeakers(state) {
    if (!Array.isArray(state.recentSpeakers)) state.recentSpeakers = [];
    return state.recentSpeakers;
  }
  function rememberSpeaker(state, charId) {
    if (!charId) return;
    const list = recentSpeakers(state);
    list.push(charId);
    while (list.length > 3) list.shift();
  }

  // 静かな月の1件を選ぶ。話者つきを優先し（約75%）、直近3人は避ける。
  // 話者つきが引けないときは地の文へ落とす（必ず1件返す）。
  function pickQuietEvent(state, rng) {
    const all = DT.DATA.EVENTS.quietEvents;
    const narration = all.filter(e => !e.char);
    const spoken = all.filter(e => e.char);
    const recent = recentSpeakers(state);
    const wantNarration = rng() < 0.25;
    if (!wantNarration && spoken.length) {
      const fresh = spoken.filter(e => recent.indexOf(e.char) < 0);
      const pool = fresh.length ? fresh : spoken;
      const picked = pool[pickIndex(pool.length, rng)];
      rememberSpeaker(state, picked.char);
      return picked;
    }
    if (narration.length) return narration[pickIndex(narration.length, rng)];
    return all[pickIndex(all.length, rng)];
  }
```
そして quiet を返す行を次に変える:
```js
    return { kind: 'quiet', event: pickQuietEvent(state, rng) };
```

- **`pickIndex` は既存の関数**をそのまま使う。
- `rememberSpeaker` は話者つきを選んだときだけ呼ぶ（地の文では記録しない）。
- **既存テスト**（`s.seenCharEvents` を全部埋めて `rng=() => 0` → `kind === 'quiet'`）は
  そのまま通る（rng が 0 なら `0 < 0.25` で地の文へ落ちる）。壊していないことを必ず確認する。

## 3. js/app.js — 顔を出す

短縮版の quiet / happening を描いている箇所（`slot.kind` の分岐の最後）:
```js
      const h = DT.events.applyHappening(state, slot.event);
      pushMsgs(h.messages);
      showEventNotice('📓 今月のできごと', slot.event.text, h.messages.slice(1), afterPreSlot);
      return;
```
を、話者があればその人の名前と顔を出す形へ変える:
```js
      const h = DT.events.applyHappening(state, slot.event);
      pushMsgs(h.messages);
      // 話者つきの日常会話なら、名前と顔を出す（顔の解決は setEventSpeaker が PNG→SVG→名前 の順で行う）
      const speakerChar = slot.event.char
        ? DT.DATA.CHARACTERS.find(c => c.id === slot.event.char) : null;
      showEventNotice(speakerChar ? speakerChar.name : '📓 今月のできごと',
        slot.event.text, h.messages.slice(1), afterPreSlot, slot.event.char);
      return;
```
- `showEventNotice(header, text, effectLines, onContinue, charId)` の**第5引数は Wave B で追加済み**。
- 通常版（48ターン）側の happening 描画（`ev.kind` の分岐）は**変更しない**
  （そちらの `happenings` には `char` が無いため、挙動は変わらない）。

## 4. tests/test-events.js に追記

1. `日常会話: 話者つきのquietイベントを持つ` — `DT.DATA.EVENTS.quietEvents` に `char` を持つ項目が
   10件以上あり、**すべての `char` が `DT.DATA.CHARACTERS` に実在する**こと。
2. `日常会話: 効果を持たない` — `char` を持つ quietEvents の `effects` がすべて空オブジェクトであること
   （1周で約12回出るため、数値を動かさない）。
3. `日常会話: 同じ話者が3回続かない` — `rollGuaranteed` を rng=0.9 固定で20回呼び、
   得られた話者列に**同じ話者が3連続しない**こと。
4. `日常会話: 地の文も残る` — rng=0 のとき（`seenCharEvents` を全部埋めた状態で）
   `kind === 'quiet'` かつ **`event.char` が無い**（地の文）ことを確認。既存の手触りが消えていない担保。

## 5. tests/test-mobile-layout.js に追記

5. `E3: 日常会話は名前と顔つきで出す` — `js/app.js` に
   `DT.DATA.CHARACTERS.find(c => c.id === slot.event.char)` 相当があり、
   `showEventNotice(` の呼び出しに `slot.event.char` が第5引数として渡っていること。

## 共通ルール

- 変更してよいファイル: `js/data.js`・`js/events.js`・`js/app.js`・`tests/test-events.js`・`tests/test-mobile-layout.js`。
- **`js/engine.js`・`js/contest.js`・`js/cards.js`・`js/state.js`・`js/avatar.js`・`css/style.css` は変更しない。**
- 既存の quietEvents 10件と、charEvents・happenings は**一切変更しない**。
- ゲームの数値・保存形式・判定ロジックは変えない。
- `index.html` の `20260829b` を**すべて** `20260904a` に置換。`APP_VERSION` を `short-test12` に上げる。

## 完了条件
1. `npm test` が全て通る（**既存の rollGuaranteed テストを含む**）。
2. `npm run build:web` が成功する。
3. 変更が許可5ファイル＋index.htmlに限られる。
4. ファイルごとの変更点要約を出力する。

## 検証記録（2026-09-04 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋200周シミュレーション＋ブラウザ実機で実施。
- `npm test`: **282件 全通過** ／ `npm run build:web`: 成功。
- `js/data.js` の差分は**追記のみ**（削除1行は既存最終行への末尾カンマ追加で、文面は同一）。
  既存 quietEvents 10件・charEvents・happenings は無改変。
- 日常会話17件はすべて `char` が `CHARACTERS` に実在し、`effects` は全て空。
  話者別: coach 3 / yota 3 / mikoto 2 / irie 2 / shion 2 / kaito 1 / george 1 / kazuki 1 / ujiji 1 / saito 1。

### 効果の実測（200周＝2400奇数月のシミュレーション）

| | 改修前 | 改修後 |
|---|---|---|
| 顔が出る奇数月 | 約12.5%（charEventsのみ・すぐ尽きる） | **76.2%** |
| 1周あたりの顔の回数 | 約1.5回 | **9.1回** |
| 同じ話者の3連続 | — | **0件**（2連続は24件／2400月） |

### 見つけて直した不具合（Claude が直接修正）

初回実測で**同じ話者の3連続が4件（0.17%）**発生した。原因は
**`charEvents`（一度きりの物語イベント）が話者の記録に参加していなかった**こと。
「コーチの物語 → コーチの日常会話 → コーチの物語」が繋がり得た。
`rollGuaranteed` の char 分岐で `rememberSpeaker` を呼ぶようにして解消（再測定で3連続0件）。
**抽選そのものは絞り込まない**（一度きりの物語イベントを話者かぶりで潰さないため、記録だけ行う）。
回帰テスト「物語イベントの話者も記録し、直後の日常会話でかぶらない」を追加。

### 実機確認
- ショート版を進めて日常会話が出ることを確認。話者名と顔（`.event-portrait.has-avatar`）が表示される。
- 撮影: `docs/previews/ux-review-2026-08-29/shots/26-daily-npc.png`。
- 地の文（雨の体育館・練習ノート等）も引き続き約24%で出ており、手触りは残っている。
