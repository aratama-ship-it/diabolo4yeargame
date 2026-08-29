# アバター統合 Wave B 実装仕様（Codex向け・確定版）

作成日: 2026-08-28 ／ 仕様・NPC造形: Claude ／ 実装: Codex
親: [2026-08-28-avatar-system-plan.md](./2026-08-28-avatar-system-plan.md)
前提: Wave A 完了済み（`avatarOf()` `mountAvatar()` `setEventSpeaker()` は実装済み）

## Wave B の範囲

**作った顔を「自分以外の場所」へ広げる。**
1. 卒業カードに自分の顔（画面表示と**PNG書き出しの両方**）
2. 卒業生名簿・先輩イベントに、その先輩の顔
3. NPC 10人の顔（手で決めたプリセット）

## 共通ルール

- 変更してよいファイル: `index.html`・`js/app.js`・`css/style.css`・`js/state.js`・`tests/test-mobile-layout.js`。
- **`js/avatar.js` と `js/cards.js` は変更しない。**
- 既存ファイルは編集前に必ず読む。ファイルの削除・移動・リネームはしない。
- ゲームロジック・数値・カードの判定条件は変えない。
- 新しい色を作らない。絵柄プリセット名をコード側に書かない。
- 顔の解決は必ず `avatarOf()` を通す（アバターが無い古いデータは名前から顔が出る）。
- `index.html` の `20260828c` を**すべて** `20260828d` に置換する。

## 1. 卒業カードに顔を載せる

### 1-1. 画面表示（`buildPlayerCard`）

カード中央アートは既存のイラスト（`assets/cards/web/*.jpg`）のまま。
その上に**丸く切り抜いた顔を右下へ重ねる**（スポーツカードの選手写真と同じ考え方）。

- `fillCardArt(art, card)` と `pcard-artlabel` の**後**に、`art` へ顔を追加する。
- **`card.isGallerySample` が真のときは顔を出さない**（見本ギャラリーは「カードの種類」の一覧で、
  特定の選手のものではないため）。
- **左下は `pcard-artlabel`（ART: ○○）が使っているので、顔は必ず右下に置く。**

```js
if (!card.isGallerySample) {
  const face = el('div', 'pcard-face');
  mountAvatar(face, avatarOf(card));
  art.appendChild(face);
}
```

`card.avatar` は無くてよい（`avatarOf` が `card.name` から顔を作る）。
図鑑の詳細も `buildPlayerCard` を通るので、これだけで顔が出る。

### 1-2. 新しいカードに実際の顔を持たせる

`showEndingWithCard(e, card)` の中で、**コレクションへ保存する前**に
`if (state.avatar) card.avatar = state.avatar;` を実行する。
（`js/cards.js` は変更しない。カードの生成後に付ける）
これで図鑑のスナップショットにも顔が入り、後から見ても当時の顔のまま残る。

### 1-3. PNG書き出しにも同じ顔を描く（`renderCardCanvas`）

**ここを飛ばすと、画面のカードと共有画像が食い違う。**
既存のSVG描画（`Blob` → `Image` → `drawImage`）と同じやり方で足す。

- キャンバスは `W=640, H=940`、アートの矩形は `x:24〜616, y:188〜488`。
- 顔は **108px・右下・余白18px** ＝ `x=490, y=362`。円形にクリップして描き、
  周囲に `#eaf2ff` の3pxリングを描く。
- `card.isGallerySample` のとき、または `DT.avatar` が無いときは描かずに進む。
- **既存の `done(cv)` を直接呼ばず、顔を描いてから呼ぶ**ように差し替える:

```js
function drawCardFace(cb) {
  if (!DT.avatar || card.isGallerySample) { cb(); return; }
  const size = 108, x = 490, y = 362;
  const markup = DT.avatar.svgString(avatarOf(card), {})
    .replace('<svg ', '<svg width="' + size + '" height="' + size + '" ');
  const img = new Image();
  img.onload = () => {
    ctx.save();
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#0e1830'; ctx.fill();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#eaf2ff'; ctx.lineWidth = 3; ctx.stroke();
    URL.revokeObjectURL(img.src);
    cb();
  };
  img.onerror = () => cb();
  img.src = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
}
```
`drawRest` の末尾で `done(cv)` としている箇所を `drawCardFace(() => done(cv))` に変える。

## 2. 卒業生に顔を持たせる

### 2-1. `js/state.js`（2か所だけ・追加のみ）

- `normalizeAlumniEntry` の返すオブジェクトへ次を追加（**他の項目は変えない**）:
  ```js
  avatar: (entry.avatar && typeof entry.avatar === 'object' && !Array.isArray(entry.avatar)) ? entry.avatar : null,
  ```
- `addGraduateAlumni` が組み立てる `normalizeAlumniEntry({...})` の引数へ
  `avatar: state.avatar || null,` を追加する。

**アバター導入前に卒業した先輩は `avatar: null` のまま**でよい（表示側が名前から顔を作る）。

### 2-2. 名簿の行（`renderAlumniRoster`）

`.alumni-pick`（番号の丸）の**直後**に顔を差し込む:
```js
const face = el('span', 'alumni-face');
mountAvatar(face, avatarOf(entry));
row.appendChild(face);
```

### 2-3. 先輩イベントの話者（`renderAlumniEvent`）

`setEventSpeaker(event.speaker)` を
`setEventSpeaker(event.speaker, null, avatarOf(event.alumni))` に変える。

## 3. NPCの顔（プリセット）

`js/app.js` に次の表を追加する。**キーは `DT.DATA.CHARACTERS` のidと完全一致**させること。
`youtube` と `malaysia` は人物ではないので**入れない**（顔を出さない）。

```js
// NPCの顔。役柄から手で決めたプリセット（2026-08-28）。
// 後からイラストに戻したくなったら assets/chars/portrait/<id>.png を置く（PNGが優先される）。
const NPC_AVATAR = {
  coach:  { face:2, eyes:2, brows:1, mouth:1, hairF:4, hairB:0, acc:0, skin:2, hair:0, eye:0, wear:5 }, // 指導者・貫禄
  yota:   { face:1, eyes:0, brows:0, mouth:4, hairF:2, hairB:0, acc:0, skin:1, hair:1, eye:1, wear:0 }, // ムードメーカー
  mikoto: { face:0, eyes:5, brows:0, mouth:1, hairF:0, hairB:2, acc:1, skin:0, hair:0, eye:5, wear:2 }, // 理論派・メガネ
  shion:  { face:0, eyes:2, brows:3, mouth:1, hairF:3, hairB:1, acc:0, skin:0, hair:7, eye:2, wear:1 }, // 天才ライバル
  kaito:  { face:2, eyes:3, brows:1, mouth:2, hairF:4, hairB:0, acc:0, skin:3, hair:0, eye:0, wear:5 }, // 王者・威圧
  irie:   { face:1, eyes:1, brows:2, mouth:0, hairF:5, hairB:0, acc:0, skin:1, hair:2, eye:1, wear:4 }, // 人懐こい同期
  ujiji:  { face:0, eyes:3, brows:3, mouth:1, hairF:6, hairB:3, acc:0, skin:2, hair:0, eye:0, wear:3 }, // 大陸からの刺客
  kazuki: { face:2, eyes:5, brows:1, mouth:1, hairF:7, hairB:0, acc:1, skin:2, hair:5, eye:4, wear:5 }, // 博士
  george: { face:1, eyes:4, brows:0, mouth:3, hairF:6, hairB:1, acc:2, skin:3, hair:3, eye:3, wear:0 }, // 大道芸人
  saito:  { face:2, eyes:3, brows:0, mouth:1, hairF:4, hairB:0, acc:1, skin:2, hair:5, eye:0, wear:5 }, // 協会の会長
};
```

`setEventSpeaker` を**第3引数つき**に拡張し、解決順を **PNG > SVG > 名前のみ** にする:

```js
function setEventSpeaker(name, charId, avatarCfg) {
  const portrait = el('span', 'event-portrait');
  const speakerName = el('span', 'event-speaker-name', name);
  $('#event-char').replaceChildren(portrait, speakerName);
  const cfg = avatarCfg || (charId ? NPC_AVATAR[charId] : null);
  if (cfg) mountAvatar(portrait, cfg);                     // ② SVGアバター
  if (charHasPortrait(charId)) {                            // ③ PNGがあれば最優先
    mountCharImage(portrait, charPortraitSrc(charId), 'event-portrait-img');
  }
}
```
**既存の呼び出し側（第2引数まで）は変更不要。**

## 4. css/style.css

```css
/* 卒業カードの選手フェイス（左下のART表記と重ならないよう右下に置く） */
.pcard-face {
  position: absolute; right: 8px; bottom: 8px; width: 58px; height: 58px;
  border: 3px solid #eaf2ff; border-radius: 50%; overflow: hidden;
  background: #0e1830; box-shadow: 0 3px 10px rgba(0, 0, 0, .5);
}
.pcard-face svg { width: 100%; height: 100%; display: block; }

/* 卒業生名簿の顔 */
.alumni-face {
  width: 36px; height: 36px; flex-shrink: 0;
  border: 2px solid var(--ink); border-radius: 50%; overflow: hidden; background: var(--paper);
}
.alumni-face svg { width: 100%; height: 100%; display: block; }

/* イベントの顔チップ: SVGでもPNGと同じ枠で出す */
.event-portrait.has-avatar {
  display: block; width: 64px; height: 64px;
  border: var(--line); border-radius: 50%; overflow: hidden;
  background: var(--paper); box-shadow: var(--pop-shadow-sm);
}
.event-portrait.has-avatar svg { width: 100%; height: 100%; display: block; }
```

## 5. tests/test-mobile-layout.js（既存の静的解析スタイルで追記）

1. `AVATAR: 卒業カードに選手の顔を重ねる` — `app` に `'pcard-face'` と
   `mountAvatar(face, avatarOf(card))` 相当、`css` に `.pcard-face` があること。
2. `AVATAR: 見本ギャラリーには選手の顔を出さない` — `app` に `isGallerySample` を条件にした
   顔の出し分けがあること。
3. `AVATAR: 書き出したカード画像にも顔を描く` — `app` に `function drawCardFace(` があり、
   `drawCardFace(() => done(cv))` の形で呼ばれていること（`done(cv)` の直接呼び出しが残っていないこと）。
4. `AVATAR: 卒業生レコードに顔を保存する` — `state`（`js/state.js` を読み込む）に
   `normalizeAlumniEntry` 内の `avatar:` と `avatar: state.avatar` があること。
5. `AVATAR: NPCの顔はCHARACTERSに実在するIDだけ` — `app` の `NPC_AVATAR` のキーを取り出し、
   すべて `js/data.js` の `CHARACTERS` に存在すること。かつ `youtube` と `malaysia` を含まないこと。
6. `AVATAR: 話者の顔もPNG→SVG→名前の順に解決する` — `setEventSpeaker` 内で
   `mountAvatar(portrait` が `mountCharImage(portrait` より前にあること。

※ このテストファイルは現在 `js/state.js` を読んでいないので、先頭に
`const state = readFileSync(require.resolve('../js/state.js'), 'utf8');` を追加する。

## 完了条件

1. `npm test` が全て通る。
2. `npm run build:web` が成功する。
3. 変更が許可5ファイルに限られる。
4. 最後にファイルごとの変更点要約を出力する。

## 検証記録（2026-08-29 Claude実施）

- 実装: Codex。検証: Claude がコード読解＋テスト＋ブラウザ実機で実施。
- `npm test`: **263件 全通過**（Wave A の257＋今回6）／ `npm run build:web`: 成功。
- 変更が許可5ファイルに限られることを `git status` で確認
  （`scripts/build-web.mjs` の差分は Wave 2 の既存分）。
- **今回はCodexが指定6件のテストをすべて実装した**（Wave A では3件しか作らなかったので明示的に指示した）。

### 実機で確認できたこと

- **卒業カードに顔**: カードイラストの上、**右下**に丸く重なる。左下の「ART: 万能型」とぶつからない。
- **PNG書き出しの顔**: 書き出しと同じ経路（`svgString` → Blob → Image → drawImage）を
  ブラウザで実行し、**108×108・不透明6212px・157色でラスタライズできることを実測**。
  SVGのcanvas描画は無音で失敗しやすいので、ここは実データで確かめた。
- **卒業生名簿**: 3行すべてに顔。アバター導入前の初期メンバーも名前由来の顔が出る。
- **先輩イベント**（`?dev&preview=alumni`）: 話者の上に顔が出て、**名簿と同じ顔**になる。
- 図鑑の詳細は `buildPlayerCard` を通るので自動的に顔付きになる。

### NPCの顔について（実機の通しは未達・代わりに行った検証）

キャラクターイベントは発生率12.5%で、プレビュー用のクエリも無い。
ブラウザペインが非表示だと `setInterval` が1秒に制限され、自動プレイでの捕獲に至らなかった
（`DT.DATA.EVENTS.probs.char = 1` での強制も試したが、JJF予選画面で進行が止まり断念）。
代わりに次を確認した:

1. `renderEvent` が `setEventSpeaker(..., event.char)` を渡していること（ソース確認）。
2. `setEventSpeaker` が `NPC_AVATAR[charId]` を引き、**mountAvatar → mountCharImage の順**で
   解決していること（ソース確認＋回帰テスト）。
3. **描画経路そのものは先輩イベントで実機確認済み**（同じ `.event-portrait.has-avatar`・同じ `mountAvatar`）。
   NPCとの違いは設定オブジェクトの出どころだけ。
4. NPC 10人ぶんの設定を Node で検証し、**全員が有効なパーツ範囲内・描画にNaN無し・設定の重複なし**。
   範囲外だと黙って既定値に丸められるため、ここは実際に `normalize` と突き合わせた。

**残っている未確認**: ゲーム内でキャラクターイベントが実際に出たときの見え方。
テストプレイで coach / コースケ / ジョージ 等のイベントに当たったら見てほしい。

### NPCの顔は提案段階

役柄から手で決めたプリセット（貫禄の野中コーチ、ツンツン頭のコースケ、メガネの美琴先輩…）。
**気に入らない顔は言ってもらえれば数値を差し替えるだけで直る**（`js/app.js` の `NPC_AVATAR`）。
