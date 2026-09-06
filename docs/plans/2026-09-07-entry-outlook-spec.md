# 予選・世界大会の「見立てカード」実装仕様（Codex向け・確定版）

作成日: 2026-09-07 ／ 設計: Claude（Opus）／ 実装: Codex ／ 検証: Claude
経緯: Wave 2 で参考表を外した結果、**部門ボタンが無い2画面**（ジャグリング全国大会予選・世界大会）の
下2/3が空いた。本人から「直してください」。

## 方針

**空白を埋めない。その画面の判断に要る数字だけを置く。**
どちらも「出るか、出ないか」の2択画面なのに、**判断材料が画面に無い**のが本当の問題だった。

実装を読んで分かった、いま隠れている事実:

| 画面 | 隠れていること | 出典 |
|---|---|---|
| 全国大会予選 | 突破条件は「5項目（4ジャンル習熟＋演技構成）の**平均60かつ最低50で確実**、**平均50かつ最低40で五分**」 | `contest.js jjfQualify` / `DATA.JJF.passSure/passHalf` |
| 〃 | **敗退するとやる気−8**（突破は +10pt・やる気+12）。つまり賭けである | `app.js renderJjfQualifier` |
| 〃 | 効くのは平均だけでなく**いちばん低い項目**。何を上げるべきかが分からない | 同上 `min` の項 |
| 世界大会 | 相手の平均スコアは `85 + 1×(学年−1)`、王者・魁人は `88 + 1.5×(学年−1)` | `LEVELS.worlds` / `DATA.RIVALS` |
| 世界大会 | **出場しても失うものがない**（能力・やる気は下がらず、順位に応じてポイント。最下位0pt） | `runAll`（単一部門なので `entryFatigue` なし／`worlds` のライバルは魁人のみで敗北ペナルティ無し） |

**画面に出す数字は必ず実装から算出する。** 定数を画面側へ書き写さない。

## 1. js/contest.js — rngを使わない「見立て」を2本、純関数で足す

### 1-1. `jjfOutlook(state)`

`jjfQualify` の直前に置き、**`jjfQualify` 自身もこれを使うように書き換える**（式が2か所に増えるのを防ぐ）。
**rng の消費回数・順序は絶対に変えない**（`tier==='half'` のときだけ `rng()` を1回。既存テストの担保）。

```js
  // 予選の見立て（rngを使わない）。判定式は jjfQualify と共有し、画面と実際の判定がずれないようにする。
  // weakest = いちばん低い項目（ここが min を決める＝「何を上げれば突破率が動くか」）。
  function jjfOutlook(state) {
    const jjf = DT.DATA.JJF;
    const items = DT.DATA.GENRES.map(g => ({ label: g.label, value: genreAvg(state, g.id) }))
      .concat([{ label: '演技構成', value: state.composition }]);
    const values = items.map(i => i.value);
    const avg = values.reduce((a, v) => a + v, 0) / values.length;
    const min = Math.min.apply(null, values);
    const weakest = items.reduce((a, b) => (b.value < a.value ? b : a));
    let tier;
    if (avg >= jjf.passSure.avg && min >= jjf.passSure.min) tier = 'sure';
    else if (avg >= jjf.passHalf.avg && min >= jjf.passHalf.min) tier = 'half';
    else tier = 'none';
    return { avg: round1(avg), min: round1(min), tier: tier, weakest: weakest,
             sure: jjf.passSure, half: jjf.passHalf };
  }
```

`jjfQualify` は次の形にする（**戻り値の形は現状のまま**）:
```js
  function jjfQualify(state, rng) {
    rng = rng || Math.random;
    const o = jjfOutlook(state);
    const passed = o.tier === 'sure' || (o.tier === 'half' && rng() < 0.5);
    return { passed: passed, tier: o.tier, avg: o.avg, min: o.min };
  }
```

### 1-2. `worldsOutlook(state, contest)`

`worldsQualified` の近くに置く。

```js
  // 世界大会の見立て（rngを使わない）。相手の平均・王者の目安は runDivision と同じ式から出す。
  // raw は breakdown の合計＝ミス減点・審査ぶれの前の素点（演技方針は通常）。
  function worldsOutlook(state, contest) {
    const lv = LEVELS.worlds;
    const scale = DT.DATA.SCORING.scale;
    const year = Math.ceil(contest.turn / 12);
    const fieldMean = round1(scale.base + (lv.base + lv.growth * (year - 1)) * scale.mult);
    const king = DT.DATA.RIVALS.find(r => r.contests.indexOf('worlds') >= 0) || null;
    const kingMean = king ? round1(scale.base + (king.base + king.growth * (year - 1)) * scale.mult) : null;
    const parts = breakdown(state, 'overall');
    const raw = round1(Object.values(parts).reduce((a, v) => a + v, 0));
    // 相手のばらつき1つ分(sd)以内なら「食らいつける」。sdは相手生成に使っている値そのもの。
    const tier = raw >= fieldMean ? 'sure' : (raw >= fieldMean - lv.sd ? 'half' : 'none');
    return { fieldMean: fieldMean, kingName: king ? king.name : null, kingMean: kingMean,
             raw: raw, entrants: lv.entrants, sd: lv.sd, tier: tier };
  }
```

エクスポートに `jjfOutlook, worldsOutlook` を足す（既存要素の順序は変えない）。
**`playerScore`・`breakdown`・`runDivision`・`runAll`・`LEVELS` の中身は1文字も変えない。**

## 2. js/app.js — 見立てカードを描く

`renderJjfQualifier` / `renderWorldsEntry` の直前に、共通の部品を置く。

```js
  // 「出る／出ない」を決めるための見立てカード。空白を埋めるためではなく、
  // 判断に要る数字（突破条件・相手の格・勝ったとき負けたとき）をこの画面に出すために置く。
  const GATE_VERDICT = {
    jjf: { sure: '突破できる', half: '五分（およそ50%）', none: 'いまの力では届かない' },
    worlds: { sure: '勝負になる', half: '食らいつける', none: '胸を借りる' }
  };
  function gateRow(key, value, need) {
    const row = el('div', 'gate-row');
    row.appendChild(el('span', 'gate-k', key));
    row.appendChild(el('span', 'gate-v num', String(value)));
    row.appendChild(el('span', 'gate-need', need));
    return row;
  }
  function gateBox(kind, title, tier, rows, note) {
    const box = el('div', 'card slot-board gate-box');
    box.appendChild(el('div', 'board-label', title));
    box.appendChild(el('div', 'gate-verdict is-' + tier, GATE_VERDICT[kind][tier]));
    rows.forEach(r => box.appendChild(r));
    box.appendChild(el('div', 'gate-note', note));
    return box;
  }
```

### 2-1. 予選（`renderJjfQualifier`）

`entry-selfline` の4行を**削除**し、代わりに:

```js
    const o = DT.contest.jjfOutlook(state);
    const gate = gateBox('jjf', '突破の見立て', o.tier, [
      gateRow('5項目の平均', o.avg, '確実 ' + o.sure.avg + '／五分 ' + o.half.avg),
      gateRow('いちばん低い項目（' + o.weakest.label + '）', o.weakest.value,
              '確実 ' + o.sure.min + '／五分 ' + o.half.min)
    ], '突破すれば +' + DT.DATA.JJF.finalistPoints + 'pt とやる気アップ。敗退するとやる気が下がる。');
    $('#entry-divisions').replaceChildren(gate, join, skip);
```

`#entry-hint` の文言も、条件が下に出るので短くする:
`'ジャグリング全国大会に挑戦しますか？ 4ジャンルの習熟と演技構成が、どれも高いほど突破できます。'`

### 2-2. 世界大会（`renderWorldsEntry`）

同じく `entry-selfline` の4行を削除し:

```js
    const w = DT.contest.worldsOutlook(state, wc);
    const rows = [gateRow('相手の平均', w.fieldMean, w.entrants + '人・ばらつき大')];
    if (w.kingName) rows.push(gateRow('王者 ' + w.kingName, w.kingMean, 'この大会の基準'));
    rows.push(gateRow('あなたの素点', w.raw, '通常・ミス減点の前'));
    const gate = gateBox('worlds', '相手の格', w.tier, rows,
      '出場しても能力・やる気は下がらない。順位に応じてポイントが入る（最下位は0pt）。');
    $('#entry-divisions').replaceChildren(gate, policySelector(), enter, skip);
```

- `divisionSelfValue` は `renderEntry`（部門ボタン）で引き続き使うので**残す**。
- `entry-selfline` を使う箇所が無くなるので、`css/style.css` の `.entry-selfline` も削除する。

## 3. css/style.css

`.entry-selfline` の定義を次に置き換える。数値は `design/TOKEN_SHEET.md` §9 の下限に従う。

```css
/* ---------- 出る／出ないを決める「見立てカード」（2026-09-07） ---------- */
.gate-box { margin-bottom: 10px; }
.gate-verdict {
  display: inline-block; margin: 2px 0 8px; padding: 3px 12px; border-radius: 999px;
  border: 2px solid var(--ink); font-size: .95rem; font-weight: 800; color: var(--ink);
}
.gate-verdict.is-sure { background: var(--sun); }
.gate-verdict.is-half { background: #d1f4ef; }
.gate-verdict.is-none { background: #ffe1d9; }
.gate-row {
  display: grid; grid-template-columns: 1fr 3.2em 8.2em; align-items: baseline; gap: 8px;
  padding: 3px 0; border-top: 2px dotted #dfe4f2;
}
.gate-k { font-size: .78rem; font-weight: 800; color: var(--ink); }
.gate-v { font-size: 1.05rem; font-weight: 800; color: var(--ink); text-align: right; }
.gate-need { font-size: .7rem; font-weight: 700; color: var(--ink-soft); text-align: right; }
.gate-note { margin-top: 8px; font-size: .75rem; font-weight: 700; color: var(--ink-soft); line-height: 1.45; }
```

- 判定チップの3色は既存の実測済み配色（sun 7.65:1 ／ #d1f4ef 9.40:1 ／ #ffe1d9 8.94:1・すべて文字は `--ink`）。
  **新しい色を作らない。白抜き文字にしない。**

## 4. tests/ に追記（**4件すべて実装すること**）

`tests/test-contest.js` に:
1. `見立て: jjfOutlook の判定は jjfQualify と一致する` — 3水準（sure / half / none になる state）を作り、
   `jjfOutlook().tier` が `jjfQualify()` の `tier` と一致すること。`avg`・`min` も一致すること。
2. `見立て: jjfQualify の乱数消費は変わらない` — 呼び出し回数を数える rng を渡し、
   **sure と none では0回、half では1回**であること（rng消費順が変わっていない担保）。
3. `見立て: worldsOutlook は実装と同じ式で出す` — 相手平均が `LEVELS.worlds.base + growth*(year-1)`
   （`SCORING.scale` 適用後）と一致し、`raw` が `breakdown(state,'overall')` の合計と一致すること。
   `tier` が fieldMean / fieldMean-sd の境界で切り替わること。

`tests/test-mobile-layout.js` に:
4. `見立て: 部門の無い2画面には見立てカードを出す` — `js/app.js` の `renderJjfQualifier` と
   `renderWorldsEntry` がどちらも `gateBox(` を呼び、`entry-selfline` という文字列が
   js/app.js と css/style.css のどこにも残っていないこと。

## 共通ルール

- 変更してよいファイル: `js/contest.js`・`js/app.js`・`css/style.css`・`index.html`・
  `tests/test-contest.js`・`tests/test-mobile-layout.js`。
- **`js/data.js`・`js/engine.js`・`js/events.js`・`js/state.js`・`js/cards.js`・`js/avatar.js` は変更しない。**
- **ゲームの数値・判定・rng消費順・保存形式は変えない。** 定数（60/50/40/85/88…）を
  app.js や CSS へ書き写さない。必ず `DT.DATA` と contest.js の関数から取る。
- `index.html` の `?v=20260906a` を**すべて** `20260907a` に置換。`APP_VERSION` を `'v0.9 short-test14'`、
  `sw.js` の `CACHE_VERSION` を `'v20260907a'` に上げる（sw.js は変更可）。

## 完了条件

1. `npm test` が全て通る（既存290件＋今回4件）。
2. `npm run build:web` が成功する。
3. 変更が許可ファイルに限られる。
4. ファイルごとの変更点要約を出力する。

---

# 追加仕様（2026-09-07・第1版の実装後にClaudeが実測して追加）

第1版を実装して 390×844 で測ったところ、**カードは出たが画面はまだ 389px（約46%）空いていた**
（`#entry-divisions` の下端 455px ／ 画面 844px）。本人の依頼は「空きを直す」なので、もう一段厚くする。
**ここでも埋めるためのものは足さない。** 判断に効くものだけを足す。

第1版に足りなかったのは「**どれが足を引っ張っているか**」の一覧。予選の条件は5項目それぞれに掛かるのに、
平均と最低の2つの数字しか出していなかった。5項目を並べれば、どこが線に届いていないかが一目で分かる。

## A. js/app.js — 目盛り付きのバーを追加

`gateRow` の隣に足す。ゲージは**既存の `.gauge` をそのまま使う**（新しいゲージを作らない）。

```js
  // 目盛り付きゲージ。ticks は 0〜100 の位置に縦線を引く（＝越えるべきライン）。
  // `.gauge > span` が塗り、目盛りは <i> なので既存のセレクタとぶつからない。
  function gateGauge(value, ticks) {
    const g = el('div', 'gauge gate-gauge');
    const fill = el('span');
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = Math.max(0, Math.min(100, value)) + '%'; });
    g.appendChild(fill);
    (ticks || []).forEach(t => {
      const m = el('i', 'gate-tick');
      m.style.left = Math.max(0, Math.min(100, t)) + '%';
      g.appendChild(m);
    });
    return g;
  }
  function gateBar(label, value, ticks, cls) {
    const row = el('div', 'gate-bar' + (cls ? ' ' + cls : ''));
    row.appendChild(el('span', 'gate-bl', label));
    row.appendChild(gateGauge(value, ticks));
    row.appendChild(el('span', 'gate-bv num', String(value)));
    return row;
  }
```

`gateBox` の引数はそのまま（`rows` に `gateRow` でも `gateBar` でも入れられる）。

## B. 予選: 5項目を並べる

`renderJjfQualifier` の `rows` を次の構成にする。**数値・ラインは `jjfOutlook` の戻り値から取る**。

```js
    const o = DT.contest.jjfOutlook(state);
    const ticks = [o.half.min, o.sure.min];            // 40 と 50（項目ごとに掛かるのは min の線）
    const rows = o.items.map(it => gateBar(it.label, it.value, ticks));
    rows.push(gateBar('5項目の平均', o.avg, [o.half.avg, o.sure.avg], 'is-total'));  // 50 と 60
    rows.push(el('div', 'gate-legend', '縦線は 五分ライン と 確実ライン'));
```

- `jjfOutlook` の戻り値に **`items`（`[{label, value}]` の5件）を足す**（`weakest` は既に同じ配列から出している）。
  contest.js のこの1点だけ追加で、判定式は変えない。
- `gate-note` は**現在地に応じて書き分ける**（同じ定数から作る。コーチの一言として読めるように）:

```js
    let advice;
    if (o.tier === 'sure') advice = '確実に突破できる。';
    else if (o.tier === 'half') advice = 'いまは五分。' + o.weakest.label + 'を' + o.sure.min
      + '、平均を' + o.sure.avg + 'まで上げると確実になる。';
    else if (o.min < o.half.min) advice = 'いちばん低い' + o.weakest.label + 'が' + o.weakest.value
      + '。五分ライン' + o.half.min + 'に届いていないので、まずここを上げる。';
    else advice = '最低ラインは越えている。平均が' + o.avg + 'で、五分ライン' + o.half.avg + 'に届いていない。';
    const note = advice + '　突破すれば +' + DT.DATA.JJF.finalistPoints
      + 'pt とやる気アップ。敗退するとやる気が下がる。';
```

## C. 世界大会: 素点を目盛り付きバーにする

`rows` の3行目（あなたの素点）を `gateRow` から `gateBar` に変え、目盛りに相手平均と王者を置く。

```js
    const rows = [gateRow('相手の平均', w.fieldMean, w.entrants + '人・ばらつき大')];
    if (w.kingName) rows.push(gateRow('王者 ' + w.kingName, w.kingMean, 'この大会の基準'));
    rows.push(gateBar('あなたの素点', w.raw, w.kingMean ? [w.fieldMean, w.kingMean] : [w.fieldMean]));
    rows.push(el('div', 'gate-legend', '縦線は 相手の平均 と 王者の目安（ミス減点の前の素点で比べている）'));
```

## D. 選択ボタンを画面の下へ

決める操作が画面の真ん中に浮いているので、**親指の届く下端へ寄せる**。
**この2画面だけ**に効かせる（部門選択の `renderEntry` に効かせると、以前 D1 で直した
「選択肢が画面下へ押し下げられる」不具合が再発する）。

- `renderJjfQualifier` / `renderWorldsEntry` では、ボタン類を `el('div', 'gate-choices')` に入れてから
  `#entry-divisions` へ渡し、**`$('#entry-divisions').classList.add('gate-layout')`** を呼ぶ。
- `renderEntry`（部門選択）では **`classList.remove('gate-layout')`** を必ず呼ぶ。
- 世界大会は `policySelector()` を `gate-choices` の**外**（カードの下・ボタンの上）に置く。

```css
#entry-divisions.gate-layout { flex: 1; }
#entry-divisions.gate-layout .gate-choices { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
```

## E. css/style.css 追記

```css
.gate-verdict { align-self: flex-start; }   /* カード幅いっぱいに伸びないようにする */
.gate-bar { display: grid; grid-template-columns: 4.4em 1fr 2.6em; align-items: center; gap: 8px; min-height: 26px; }
.gate-bl { font-size: .78rem; font-weight: 800; color: var(--ink); }
.gate-bv { font-size: .95rem; font-weight: 800; color: var(--ink); text-align: right; }
.gate-gauge { position: relative; }
.gate-tick { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ink); opacity: .38; }
.gate-bar.is-total { border-top: 2px dotted #dfe4f2; margin-top: 4px; padding-top: 6px; }
.gate-legend { font-size: .7rem; font-weight: 700; color: var(--ink-soft); padding-top: 6px; }
```

## F. tests/ に追記（**3件すべて実装すること**）

`tests/test-contest.js` に:
1. `見立て: jjfOutlook は5項目を返す` — `items` が4ジャンル＋演技構成の5件で、
   `weakest` が `items` の最小と一致し、`avg` が `items` の平均と一致すること。

`tests/test-mobile-layout.js` に:
2. `見立て: 予選は5項目のバーを出す` — `renderJjfQualifier` の中で `o.items.map(` と `gateBar(` を使い、
   目盛りに `o.half.min` / `o.sure.min` を渡していること。
3. `見立て: 下寄せは部門選択に持ち込まない` — `renderJjfQualifier` と `renderWorldsEntry` が
   `classList.add('gate-layout')` を呼び、**`renderEntry` が `classList.remove('gate-layout')` を呼ぶ**こと
   （2026-08-29 に直した「演技方針が画面下へ押し下げられる」不具合の再発防止）。

## 共通ルール（追加分）

- 変更してよいファイルは第1版と同じ。**`js/contest.js` への追加は `jjfOutlook` の `items` だけ**。
- 判定式・rng消費・保存形式は変えない。定数を app.js / CSS へ書き写さない。
- `index.html` の `?v=` と `APP_VERSION`・`CACHE_VERSION` は第1版で上げた `20260907a` /
  `short-test14` / `v20260907a` のままでよい（まだ公開していないため）。

## 完了条件（追加分）

1. `npm test` が全て通る（第1版294件＋今回3件＝297件）。
2. `npm run build:web` が成功する。
3. ファイルごとの変更点要約を出力する。

---

## 検証記録（2026-09-07 Claude実施）

- 実装: Codex（第1版・追加仕様の2回）。検証: Claude がコード読解＋テスト＋ブラウザ実測（390×844）。
- `npm test`: **297件 全通過** ／ `npm run build:web`: 成功。
- `playerScore`・`breakdown`・`runDivision`・`runAll`・`LEVELS`・保存形式は無改変。
  `jjfQualify` は `jjfOutlook` を呼ぶ形に変えたが、**戻り値の形も rng 消費回数（sure/none=0回・half=1回）も同じ**
  （テストで固定）。

### Claude が直した3点

1. **`.cta-wrap` の余白が残っていた** — この2画面は `#btn-entry-go` を隠すだけで、空の `.cta-wrap`（padding 28px）が
   残り、下寄せしたボタンを押し出していた。`#entry-divisions.gate-layout ~ .cta-wrap { display: none }` で解消。
   結果、ボタン下端は画面下から **16px**（元の `.cta-wrap` の padding-bottom と同じ）。
2. **「5項目の平均」が2行に折り返していた** — ラベル列 4.4em に対し6文字。列を 4.9em にし
   `.gate-bl { white-space: nowrap }`、ラベルを「平均」に短縮。
3. **項目の線(40/50)と平均の線(50/60)が同じ凡例で説明されていた** — 縦線の位置が段で違うのに
   「五分ライン と 確実ライン」としか書いておらず誤読しうる。凡例に数値を入れた
   （`縦線は 五分ライン と 確実ライン（各項目は40／50、平均は50／60）`）。数値は定数から組み立てる。
   静的テストがラベル文言を固定していたので、**構造だけを見る形に直した**（文言は変わりうる）。

### 実測（390×844・入場アニメを finish() させてから測定）

| 項目 | 実測 |
|---|---|
| 予選: カード | 5項目バー＋平均バー＋凡例。各バー26px・ラベルの折り返し 0 |
| 予選: 目盛り | 各項目 40%/50%、平均 50%/60%（`o.half`/`o.sure` から） |
| 予選: 助言 | tier=half で「いまは五分。3D+を50、平均を60まで上げると確実になる。」 |
| 予選: ボタン | 713〜828px。**画面下から16px**・高さ54px |
| 世界大会 | 相手の平均 86／王者 魁人 89.5／あなたの素点 83.1（バーに2本の目盛り）→ 判定「食らいつける」 |
| 縦スクロール | 予選・世界大会とも **なし**（844px以内） |
| 部門選択(OIDC)への影響 | `gate-layout` は付かず、`.cta-wrap` も表示のまま。演技方針 454〜633px で**隠れない**（D1の状態を維持） |
| JSエラー | **0件**（404は未配置PNG 8件のみ＝SVGアバターへのフォールバック） |

### やらなかったこと

- **過去の挑戦履歴は出していない。** 予選の敗退は `state.results` に記録されない（突破だけ記録される）ため、
  「履歴なし」が未挑戦なのか全敗なのか区別できない。記録の意味を変えると得点・エンディング計算に波及するので見送った。
