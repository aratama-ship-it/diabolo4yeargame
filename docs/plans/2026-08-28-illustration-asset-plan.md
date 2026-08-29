# イラスト資産 生成・統合プラン

作成日: 2026-08-28 ／ 作成: Claude（Fable）
親プラン: [2026-08-28-game-feel-plan.md](./2026-08-28-game-feel-plan.md)（Wave 2 の詳細）

> **2026-08-28 方針変更あり。** 「パワプロ／Mii式のパーツ組み合わせでキャラを作りたい」という
> 本人の希望により、**Phase A（主人公の表情7枚）と Phase B（NPC顔12枚）は
> [アバターシステム](./2026-08-28-avatar-system-plan.md) に置き換わった**（SVGベクターで生成不要）。
> このファイルの Phase A / B は**当面着手しない**。ただし表示側は
> 「PNG → SVGアバター → 絵文字/名前」の順で解決するので、**あとから絵を描いて
> PNGを置けばそちらが優先される**（NPCをイラストに戻したくなったとき用。本人の要望）。
> **Phase C（月送りローダー）と Phase E（一枚絵）は塗り込み絵柄のまま有効。**

このファイルだけで別マシンのエージェントが引き継げるよう、前提と契約をすべて書く。

## 前提（既存の決まりごと。全フェーズで従う）

- **画風**: ねんどろいど風・2.5頭身。既存キャラ資産と同じ線の太さ・彩度。
- **キャラ資産の台帳**: `knowledge/character-consistency-refs/characters/`（`catalog.yaml` が状態管理）。
  生成物はまず `candidates/` → 本人承認後に `canon/` 昇格 → ゲームへは canon の派生（切り抜き）だけを入れる。
- **手順書**: [docs/reference/2026-07-14-character-consistency-workflow.md](../reference/2026-07-14-character-consistency-workflow.md)
  （キャラ仕様書＋基準画像パック＋差分編集運用。想定ツール ChatGPT Images 2.0）。
- **物理拘束**: ディアボロを持たせる構図は `knowledge/character-consistency-refs/diabolo-physics-lock.yaml`
  （user-approved-active）に全面的に従う。本体は剛体・本数固定・紐の前後関係。
  **顔チップ（バストアップ）はディアボロ非携行の構図を基本にし、この最難関拘束を回避する。**
- **フォールバック設計**: 画像が無ければ現状表示（絵文字・テキスト）に自動で戻る。公開を止めない
  （ローダー performer 方式 = `2026-08-08-month-loader-character-spec.md` を踏襲）。
- 画像は canon から書き出した**透過PNG**をゲームに入れる。既存の切り抜きスクリプト
  `scripts/make-loader-performer.py`（flood fill＋トリム＋縮小＋256色化）を流用・改修する。

## Phase A: 主人公の姿（最優先。育成ゲームの核）

**使い所**: ①ホームのやる気顔（現在は絵文字1個）→ 表情差分に差替
②新入生スカウト画面 → 立ち絵（現在は数値表のみ）
③将来: 練習リザルトのリアクション・カード中央アート連携

**必要枚数**: バストアップ表情 7種
| キー | 対応する状態（コード上の値） |
|---|---|
| normal | やる気「普通」 |
| best / good / bad / worst | 「絶好調」「好調」「不調」「絶不調」 |
| awaken | 覚醒中（炎エフェクトは絵に入れず、UI側バッジで表現） |
| injured | 怪我・療養中 |

＋ 立ち絵1枚（スカウト画面用・ディアボロ携行可＝physics-lock遵守）

**ファイル契約**:
- 置き場所: `assets/chars/hero/mood-<キー>.png`、立ち絵 `assets/chars/hero/standing.png`
- 形式: PNG-32 透過、バストアップは正方形 512×512、1枚 60KB 以下
- JS側: `MOOD_EMOJI` の隣に `MOOD_IMAGE` マップを追加し、画像ロード成功時のみ差替（プリロード判定は
  ローダーの `preloadMonthTransitionCharacters` 方式）

**先に本人が決めること（勝手に進めない）**:
1. 主人公のデザイン: 新規デザイン1体を起こすか、既存 canon（浦和新）を主人公に転用するか。
   推奨は**新規1体**（プレイヤーが名付ける存在なので、実在モデルと切り離した中性的な部員デザイン）。
2. 髪型・服（部Tシャツ等）の方向性 → Core Identity Sheet に固定してから生成に入る。

## Phase B: イベントの顔チップ（12キャラ）

**使い所**: イベント画面の話者名の上、イベント結果ポップアップのヘッダ。

**優先順**（登場頻度と物語上の重み。上から作る）:
1. coach 野中コーチ（最頻出。canon「野中葵」からの派生で最短）
2. shion 志音（同学年ライバル・大会にも登場）
3. kaito 魁人（王者・大会にも登場）
4. yota コースケ ／ 5. mikoto 美琴先輩 ／ 6. irie イリエ ／ 7. george 大道芸人ジョージ
8. ujiji うじじ ／ 9. saito SAITO会長 ／ 10. kazuki Dr. Kazuki
- youtube / malaysia は人物でない状況イベントのため**アイコンのまま**（作らない）

**ファイル契約**:
- 置き場所: `assets/chars/portrait/<キャラid>.png`（idは `js/data.js` の `CHARACTERS` と一致させる）
- 形式: PNG-32 透過、正方形 512×512（表示は円形クリップ 64〜80px）、1枚 60KB 以下
- 構図: 正面〜わずか3/4のバストアップ、ディアボロ非携行
- JS側: `CHAR_IMAGE` マップ＋ロード成功時のみ表示（無いキャラは現状どおり名前のみ）

**生成手順**（1キャラずつ）:
1. Core Identity Sheet（役割から性格→外見を言語化。ワークフロー文書の§8テンプレ）を書き、本人が承認
2. 正面基準 → candidates/ → 承認 → canon/
3. canon から 512px 正方形へ書き出し `assets/chars/portrait/` へ配置

## Phase C: 月送りローダー performer-3 / performer-4（既存スペックの未決解消）

- 仕様は確定済み: [docs/specs/2026-08-08-month-loader-character-spec.md](../specs/2026-08-08-month-loader-character-spec.md)
  （4枚揃った時点で自動的にキャラ表示へ切替わる。コード変更不要）
- 残作業: キャラ2体の**選定（本人判断）**→ ディアボロ携行1枚絵の生成（physics-lock遵守が最難関）→
  `make-loader-performer.py` で切り抜き
- 候補: catalog.yaml の10体のうち、承認済みディアボロ携行絵が無い8体
  （せいそん／将軍／ポチ／島広行／海里／田川ゆうき／子供ガーデン／成人女性ステージ衣装）

## Phase D: 練習メニューのアイコン4種

- 対象: 高難度技／新技開発／反復練習／ルーチン構成（現在テキストのみのボタン）
- 参考: ホームの行動アイコン `assets/icons/train.png` 等（既に画像運用の実績あり）と同じテイスト
- 置き場所: `assets/icons/method-<difficulty|novelty|control|routine>.png`、表示 32px 角
- 人物なしの小物アイコン（例: 高難度=多段トスの軌跡、反復=メトロノーム風）で
  キャラ一貫性の制約を受けずに作れる＝**着手しやすい**

## Phase E: 以降（方向決めしてから）

- 大会リビールのライバルカットイン（志音・魁人の煽り顔差分）
- エンディング卒業式の一枚絵（タイトル絵と同じ「一枚絵」路線）

## 進め方の推奨順

**A（主人公）→ C（ローダー完成）→ B上位3体 → D → B残り → E**
- AとCが「毎周必ず目に入る場所」。Bは1体ずつ増やしても壊れない設計なので隙間時間に積み増せる。
- 生成セッションの前に、このファイル＋ワークフロー文書＋physics-lock を読み込むこと。
- 生成はチャット対話型（ChatGPT Images 2.0 系）を想定。Claude側で行う場合も同じ参照パック・
  同じ承認フロー（candidates→本人承認→canon）を必ず通す。

## ステータス

- 2026-08-28: プラン起票。Phase A の主人公デザイン方針と Phase C の2体選定が本人待ち。
- 2026-08-28: **Phase A / B のゲーム側受け皿を実装完了**（Codex実装・Claude検証済み）。
  絵を所定パスへ置くだけで反映される。実際の契約（パス・寸法・構図・承認手順）は
  [assets/chars/README.md](../../assets/chars/README.md) が正。**素材生成のセッションはまずそれを読むこと。**
  - Phase A: `assets/chars/hero/mood-<best|good|normal|bad|worst|awaken|injured>.png`（7枚）
  - Phase B: `assets/chars/portrait/<キャラid>.png`（1枚ずつ追加可）
  - Phase A のスカウト画面立ち絵と Phase D のアイコンは**受け皿も未着手**
    （レイアウト設計が要るため、絵の方向が決まってから）。
