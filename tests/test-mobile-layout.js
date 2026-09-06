'use strict';
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { test, summary } = require('./harness');

const css = readFileSync(require.resolve('../css/style.css'), 'utf8');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const app = readFileSync(require.resolve('../js/app.js'), 'utf8');
const state = readFileSync(require.resolve('../js/state.js'), 'utf8');
const data = readFileSync(require.resolve('../js/data.js'), 'utf8');
const events = readFileSync(require.resolve('../js/events.js'), 'utf8');
const buildWeb = readFileSync(require.resolve('../scripts/build-web.mjs'), 'utf8');

test('MOBILE LAYOUT: iPhone Safariの表示領域にアプリの高さが追従する', () => {
  const mobileApp = css.match(/@media \(max-width: 480px\)[\s\S]*?#app\s*\{([^}]*)\}/);
  assert.ok(mobileApp, 'スマホ用の#appルールが必要');
  assert.match(mobileApp[1], /height:\s*100vh;[\s\S]*?height:\s*-webkit-fill-available;[\s\S]*?height:\s*100dvh;/,
    '100vhの後に旧Safari用フォールバックと動的ビューポート高を指定する');
});

test('MOBILE LAYOUT: ボトムナビは端末下部のセーフエリアを避ける', () => {
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test('MOBILE LAYOUT: 更新したCSSを参照する', () => {
  // ?v=はコード変更のたびに更新する運用のため日付は固定しない（クエリの存在だけ検証）\n  assert.match(html, /css\/style\.css\?v=[0-9a-z]+/);
});

test('MONTH TRANSITION: 次月へ進む前に1.5秒の月表示を挟む', () => {
  assert.match(html, /id="month-transition"/);
  assert.match(html, /id="month-transition-label"/);
  assert.match(html, /js\/app\.js\?v=[0-9a-z]+/);
  assert.match(app, /const MONTH_TRANSITION_MS\s*=\s*1500/);
  assert.match(app, /pendingMonthTransition\s*=\s*state\.status\s*===\s*'playing'/);
  assert.match(app, /showMonthTransition\(state\.turn, \(\) => afterTurn\(logs\)\)/);
  assert.match(app, /month-transition-label'\)\.textContent\s*=\s*DT\.engine\.turnLabel\(turn\)/);
  assert.match(css, /\.month-transition\.is-active \.month-transition-progress span\s*\{[\s\S]*?1\.5s/);
});

test('CREATE FLOW: 最終登録前に主人公名を一度だけ変更できる', () => {
  assert.match(html, /id="registration-modal"/);
  assert.match(html, /id="btn-registration-rename"[\s\S]*?あと1回/);
  assert.match(html, /id="btn-registration-confirm"[\s\S]*?選手登録/);
  assert.match(html, /js\/app\.js\?v=[0-9a-z]+/);
  assert.match(app, /function openRegistration\(\)[\s\S]*?registration-modal/);
  assert.match(app, /registrationRenameUsed\s*=\s*true/);
  assert.match(app, /\$\('#btn-start'\)\.onclick\s*=\s*openRegistration/);
  assert.match(app, /\$\('#btn-registration-confirm'\)\.onclick[\s\S]*?DT\.state\.save\(state\)/);
});

test('AVATAR: パーツ定義を読み込む', () => {
  const avatarScript = html.indexOf('js/avatar.js?v=');
  const appScript = html.indexOf('js/app.js?v=');
  assert.ok(avatarScript >= 0, 'index.htmlでjs/avatar.jsを読み込む');
  assert.ok(appScript >= 0, 'index.htmlでjs/app.jsを読み込む');
  assert.ok(avatarScript < appScript, 'js/avatar.jsをjs/app.jsより前に読み込む');
});

test('AVATAR: 顔をつくる導線と編集モーダルがある', () => {
  assert.match(html, /id="btn-avatar-open"/);
  assert.match(html, /id="avatar-modal"/);
  assert.match(html, /id="avatar-preview"/);
  assert.match(html, /id="btn-avatar-done"/);
});

test('AVATAR: 顔が無い古いセーブは名前から顔を作る', () => {
  assert.match(app, /function avatarOf\(/);
  assert.match(app, /DT\.avatar\.fromSeed\(/);
});

test('AVATAR: 顔の表示はPNG→SVG→絵文字の順に解決する', () => {
  // mountCharImage は読み込めたときだけ中身を差し替えるので、SVGより後に呼ぶ必要がある。
  // 逆順にすると、絵を置いてもSVGに上書きされてPNGが出なくなる。
  [['faceEl', 'ホームのやる気顔'], ['moodMini', '練習メニューのチップ']].forEach(([node, where]) => {
    const svgAt = app.indexOf('mountAvatar(' + node);
    const pngAt = app.indexOf('mountCharImage(' + node);
    assert.ok(svgAt >= 0 && pngAt >= 0, where + 'でSVGとPNGの両方を試すこと');
    assert.ok(svgAt < pngAt, where + 'はmountAvatarの後にmountCharImageを呼ぶこと');
  });
});

test('AVATAR: 経歴を変えても作った顔が消えない', () => {
  // newCandidate は経歴の変更・引き直しのたびに呼ばれる。ここで顔を作り直すと
  // せっかく作った顔が消えるので、未作成のときだけ生成して使い回す。
  assert.match(app, /if \(!candidateAvatar\) candidateAvatar = DT\.avatar\.random\(\)/);
  assert.match(app, /next\.avatar = candidateAvatar/);
  // ランダムは代入ではなくObject.assign（代入すると candidate.avatar の参照が切れる）
  assert.match(app, /Object\.assign\(candidateAvatar, DT\.avatar\.random\(\)\)/);
  // candidateAvatar への代入は「未作成のときだけ」に限る。無条件の代入を1つでも許すと参照が切れる。
  const needle = 'candidateAvatar = DT.avatar.random()';
  for (let at = app.indexOf(needle); at >= 0; at = app.indexOf(needle, at + 1)) {
    assert.ok(app.slice(Math.max(0, at - 22), at).includes('if (!candidateAvatar) '),
      'candidateAvatar への random() 代入は if (!candidateAvatar) で守ること');
  }
});

test('AVATAR: 絵柄プリセットをコード側で指定しない', () => {
  // 採用した絵柄は js/avatar.js の defaultProportion 一箇所で決める。
  // 呼び出し側で proportion を指定すると、絵柄を変えたときに取り残しが出る。
  assert.doesNotMatch(app, /proportion/);
});

test('AVATAR: 卒業カードに選手の顔を重ねる', () => {
  assert.match(app, /'pcard-face'/);
  assert.match(app, /mountAvatar\(face, avatarOf\(card\)\)/);
  assert.match(css, /\.pcard-face\s*\{/);
});

test('AVATAR: 見本ギャラリーには選手の顔を出さない', () => {
  assert.match(app, /if \(!card\.isGallerySample\)\s*\{[\s\S]*?mountAvatar\(face, avatarOf\(card\)\)/);
});

test('AVATAR: 書き出したカード画像にも顔を描く', () => {
  assert.match(app, /function drawCardFace\(/);
  assert.match(app, /drawCardFace\(\(\) => done\(cv\)\)/);
  assert.doesNotMatch(app, /^\s*done\(cv\);\s*$/m);
});

test('AVATAR: 卒業生レコードに顔を保存する', () => {
  assert.match(state, /function normalizeAlumniEntry\([\s\S]*?avatar:\s*\(entry\.avatar/);
  assert.match(state, /function addGraduateAlumni\([\s\S]*?avatar:\s*state\.avatar\s*\|\|\s*null/);
});

test('AVATAR: NPCの顔はCHARACTERSに実在するIDだけ', () => {
  const npcBlock = app.match(/const NPC_AVATAR\s*=\s*\{([\s\S]*?)\n\s*\};/);
  const charactersBlock = data.match(/CHARACTERS:\s*\[([\s\S]*?)\n\s*\],\n\s*EVENTS:/);
  assert.ok(npcBlock, 'NPC_AVATARが必要');
  assert.ok(charactersBlock, 'CHARACTERSが必要');
  const npcIds = Array.from(npcBlock[1].matchAll(/^\s+([a-z][a-z0-9_]*):\s*\{/gm), m => m[1]);
  const characterIds = new Set(Array.from(charactersBlock[1].matchAll(/id:\s*'([^']+)'/g), m => m[1]));
  assert.equal(npcIds.length, 10, '人物NPC 10人ぶんの顔を定義する');
  npcIds.forEach(id => assert.ok(characterIds.has(id), id + 'はCHARACTERSに存在すること'));
  assert.ok(!npcIds.includes('youtube'));
  assert.ok(!npcIds.includes('malaysia'));
});

test('AVATAR: 話者の顔もPNG→SVG→名前の順に解決する', () => {
  const speaker = app.match(/function setEventSpeaker\(name, charId, avatarCfg\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(speaker, '第3引数avatarCfgを受けるsetEventSpeakerが必要');
  const svgAt = speaker[1].indexOf('mountAvatar(portrait');
  const pngAt = speaker[1].indexOf('mountCharImage(portrait');
  assert.ok(svgAt >= 0 && pngAt >= 0, 'SVGとPNGの両方を解決すること');
  assert.ok(svgAt < pngAt, 'SVGを置いた後でPNGを優先すること');
});

test('TITLE ART: 採用イラストを中央に大きく配置し紙吹雪を画面全体へ拡張する', () => {
  const title = html.match(/<section id="screen-title"[\s\S]*?<\/section>/);
  assert.ok(title);
  assert.match(title[0], /class="title-art-stage"[\s\S]*?title-card-combo-trail-v4-people-3d\.png/);
  assert.match(title[0], /class="title-confetti"/);
  assert.match(css, /\.title-art-stage\s*\{[\s\S]*?mask-image:/);
  assert.match(css, /\.title-art-stage img\s*\{[\s\S]*?width:\s*126%/);
  assert.match(css, /\.title-confetti\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(buildWeb, /assets\/title\/title-card-combo-trail-v4-people-3d\.png/);
});

test('CARD CATALOG: 一覧の取得済みカードにイラストを表示する', () => {
  assert.match(app, /function zukanTileArt\(entry, got\)[\s\S]*?fillCardArt\(art, Object\.assign\(\{\}, got\.snap, \{ id: entry\.id \}\)\)/);
  assert.match(app, /tile\.appendChild\(zukanTileArt\(c, got\)\)/);
  assert.match(css, /\.zukan-tile \.zt-art\s*\{[\s\S]*?aspect-ratio:\s*592\s*\/\s*300/);
  assert.match(css, /\.zukan-tile \.zt-art \.pcard-artimg\s*\{[\s\S]*?object-fit:\s*cover/);
});

test('CARD GALLERY: 長いカード名でも同じ行のカード高とアート位置を揃える', () => {
  assert.match(css, /\.gallery-cell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(css, /\.gallery-cell \.pcard\s*\{[\s\S]*?height:\s*100%/);
  assert.match(css, /\.gallery-cell \.pcard-name\s*\{[\s\S]*?min-height:\s*2\.3em/);
  assert.match(css, /\.gallery-cell \.pcard-epithet\s*\{[\s\S]*?min-height:\s*2\.5em/);
  assert.match(css, /\.gallery-cell \.pcard-foot\s*\{[\s\S]*?margin-top:\s*auto/);
});

test('SHORT EVENT FLOW: 奇数月のイベントを1件に統一する', () => {
  assert.match(app, /const slot = DT\.events\.shortEventFor\(state\)/);
  assert.match(app, /const sched = SHORT \? null : DT\.events\.scheduledEventFor\(state\)/);
  assert.match(app, /state\.turn === 26 && !state\.retireOfferSeen[\s\S]*?renderRetireOffer\(pendingMessages, afterPreSlot\)/);
  assert.doesNotMatch(app, /function showTaiwanToilet\(/);
});

test('E3: 日常会話は名前と顔つきで出す', () => {
  assert.match(app, /DT\.DATA\.CHARACTERS\.find\(c => c\.id === slot\.event\.char\)/);
  assert.match(app, /showEventNotice\([\s\S]{0,300}?slot\.event\.text,[\s\S]{0,300}?afterPreSlot,\s*slot\.event\.char\)/);
});

test('PUBLIC MODE: 24ターン版を既定にして48ターン版の導線を表示しない', () => {
  assert.match(app, /const GAME_MODE = DT\.shortMode\.ID;/);
  assert.match(app, /const SHORT = true;/);
  assert.doesNotMatch(html, /id="btn-mode-switch"/);
  assert.doesNotMatch(html, /id="mode-badge"/);
  assert.doesNotMatch(app, /通常版（48ターン）へ戻る/);
});

test('MOBILE LAYOUT: 卒業生名簿の保存バーは下部セーフエリアを避ける', () => {
  assert.match(css, /\.alumni-savebar\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(html, /id="alumni-modal"/);
  assert.match(html, /id="alumni-search"/);
});

test('NAVIGATION: 新入生スカウトからタイトルへ戻れる', () => {
  assert.match(html, /id="btn-create-back"[^>]*aria-label="タイトルへ戻る"/);
  assert.match(app, /\$\('#btn-create-back'\)\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?candidate\s*=\s*null;[\s\S]*?initTitle\(\);/);
  assert.match(app, /QUERY_PARAMS\.get\('preview'\)\s*===\s*'create'[\s\S]*?renderCreate\(newCandidate\(\)\);/);
});

test('NAVIGATION: 卒業生名簿はタイトルではなく新入生スカウトで設定する', () => {
  const title = html.match(/<section id="screen-title"[\s\S]*?<\/section>/);
  const create = html.match(/<section id="screen-create"[\s\S]*?<\/section>/);
  assert.ok(title && create);
  assert.doesNotMatch(title[0], /id="btn-alumni"/);
  assert.match(create[0], /id="btn-alumni"[^>]*data-icon="flower"[^>]*>登場する卒業生を設定/);
  assert.match(app, /function renderCreateAlumniButton\(\)[\s\S]*?requiredAlumniCount\(profile\)[\s\S]*?profile\.selectedIds\.length/);
  assert.match(app, /!?\$\('#screen-create'\)\.classList\.contains\('hidden'\)[\s\S]*?candidate\.activeAlumni\s*=\s*DT\.state\.loadActiveAlumni/);
});

test('CHAR IMAGE: 画像が無いときは絵文字へフォールバックする仕組みを持つ', () => {
  assert.match(app, /const CHAR_IMAGES_ENABLED\s*=\s*true/);
  assert.match(app, /const charImgState\s*=\s*new Map\(\)/);
  assert.match(app, /function mountCharImage\(container, src, imgClass\)/);
  assert.match(app, /'ng'/);
});

test('CHAR IMAGE: 主人公の表情は7状態ぶんのパスを解決できる', () => {
  assert.match(app, /const HERO_MOOD_KEY\s*=\s*\{/);
  assert.match(app, /assets\/chars\/hero\/mood-/);
  assert.match(app, /function heroMoodKey\(state, moodLabel\)[\s\S]*?state\.injuredTurns > 0[\s\S]*?return 'injured'[\s\S]*?state\.awakenTurns > 0[\s\S]*?return 'awaken'/);
});

test('CHAR IMAGE: イベントの顔は話者IDから引く', () => {
  assert.match(app, /assets\/chars\/portrait\//);
  assert.match(app, /function setEventSpeaker\(name, charId, avatarCfg\)/);
  assert.doesNotMatch(app, /\$\('#event-char'\)\.textContent\s*=/);
});

test('CHAR IMAGE: 実在しない話者ID（覚醒などの演出用）では画像を探さない', () => {
  // イベントのcharには'awaken'のような演出用の擬似IDが混ざる。
  // CHARACTERSに無いIDで画像を取りに行くと、絵を用意しようのない404が毎回出る。
  assert.match(app, /function charHasPortrait\(charId\)[\s\S]*?DT\.DATA\.CHARACTERS\.some/);
  assert.match(app, /if \(charHasPortrait\(charId\)\) mountCharImage\(/);
  const pseudoIds = (events.match(/char: '([a-z_]+)'/g) || [])
    .map(m => m.replace(/char: '|'/g, ''))
    .filter(id => !new RegExp("{ id: '" + id + "',[\\s\\S]*?name:").test(data));
  assert.ok(pseudoIds.includes('awaken'), '擬似IDの検出が効いていること（awakenが拾えるはず）');
});

test('CHAR IMAGE: 未配置でも配布ビルドが通る', () => {
  assert.match(buildWeb, /assets\/chars\//);
  assert.match(buildWeb, /const charAssets\s*=\s*new URL\('assets\/chars\/'[\s\S]*?if\s*\(existsSync\(charAssets\)/);
});

test('CHAR IMAGE: 画像が付くまで空の丸を出さない', () => {
  assert.match(css, /\.event-portrait\s*\{\s*display:\s*none;/);
  assert.match(css, /\.event-portrait\.has-img\s*\{/);
});


test('MONTH TRANSITION: ディアボロは学年の数だけ並ぶ（1年生=1個…4年生=4個）', () => {
  // 生成側: turnLabelと同じ式で学年を出し、最大4個にクランプする
  assert.match(app, /Math\.min\(MONTH_TRANSITION_MAX_DIABOLO, Math\.max\(1, Math\.ceil\(turn \/ 12\)\)\)/);
  assert.match(app, /const MONTH_TRANSITION_MAX_DIABOLO\s*=\s*4/);
  assert.match(app, /renderMonthTransitionDiabolo\(turn\)/);
  assert.match(html, /id="month-transition-diabolo"/);
  // TIDCローダーのオマージュ: 2本のスティックと紐の装置をSVGで描き、7コマ×100msでコマ送りする
  assert.match(app, /const MT_FRAMES\s*=\s*7/);
  assert.match(app, /const MT_FRAME_MS\s*=\s*100/);
  assert.match(app, /function monthTransitionPose\(n, f\)/);
  assert.match(app, /class: 'mt-string'/);
  assert.match(app, /class: 'mt-stick'/);
  // 非表示になったらコマ送りを止める（タイマーを残さない）
  assert.match(app, /stopMonthTransitionFrames\(\);[\s\S]{0,120}overlay\.classList\.add\('hidden'\)/);
  assert.match(css, /\.mt-string\s*\{[^}]*stroke:/);
});

test('UX1: 練習は能力値の表をタップして枠に入れる', () => {
  assert.match(html, /id="train-grid"/);
  assert.match(html, /id="btn-train-repeat"/);
  assert.doesNotMatch(html, /id="(?:genre-row|method-row|trainmenu-skills)"/);
  assert.match(app, /function renderTrainGrid\(/);
  assert.match(app, /state\.lastTraining\s*=/);
});

test('UX1: 大会は部門→演技方針の順', () => {
  assert.match(app, /replaceChildren\(emptyHint,\s*\.\.\.options,\s*policySelector\(\)\)/);
  const divisionsRule = css.match(/#entry-divisions\s*\{([^}]*)\}/);
  assert.ok(divisionsRule, '#entry-divisionsルールが必要');
  assert.doesNotMatch(divisionsRule[1], /margin-top:\s*auto/);
});

test('UX1: 技術見出し行は行全体で詳細を開く', () => {
  assert.match(app, /techHead\.onclick\s*=\s*renderDetail/);
  assert.match(css, /\.pb-tech-head\s*\{[^}]*min-height:\s*40px/);
});

test('UX1: 月送りはタップで飛ばせる', () => {
  const transition = app.match(/function showMonthTransition\([\s\S]*?\n  function renderHomeWithPopups/);
  assert.ok(transition, 'showMonthTransitionが必要');
  assert.match(transition[0], /overlay\.onclick\s*=\s*finish/);
  assert.match(html, /class="month-transition-skip"/);
});

test('UX1: mobile-web-app-capable を併記', () => {
  assert.match(html, /name="mobile-web-app-capable"/);
});

test('UX1: 新設テキストは11px未満にしない', () => {
  ['.tg-head', '.tg-genre small', '.tg-routine small', '.month-transition-skip', '.slot-repeat'].forEach(selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    assert.ok(rule, selector + 'ルールが必要');
    const size = rule[1].match(/font-size:\s*([0-9.]+)rem/);
    assert.ok(size, selector + 'にremのfont-sizeが必要');
    assert.ok(Number(size[1]) >= 0.7, selector + 'は.7rem以上にする');
  });
});

test('UX3: 順位に前回比を出す', () => {
  const previous = app.match(/function previousResultOf\(r\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(previous, 'previousResultOfが必要');
  assert.match(previous[1], /x\.turn < r\.turn/);
  assert.match(app, /'初出場'/);
  assert.match(app, /'reveal-trend'/);
});

test('UX3: 予選行には前回比を出さない', () => {
  assert.match(app, /if \(r\.division !== 'qualifier'\)/);
});

test('UX3: 自己ベストは過去だけと比べる', () => {
  const best = app.match(/function bestRankBefore\(r\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(best, 'bestRankBeforeが必要');
  assert.match(best[1], /x\.turn < r\.turn/);
});

test('UX3: 練習の成果は前→後のバーで出す', () => {
  assert.match(app, /function growthRow\(/);
  assert.match(app, /before \+ ' → ' \+ after/);
  assert.match(css, /\.grow-bar\s*\{/);
  assert.match(css, /\.grow-add\s*\{/);
});

test('UX3: 卒業のハイライトは記録追加より前の最高ptと比べる', () => {
  assert.match(app, /function endingHighlights\(/);
  const endingAt = app.indexOf('function showEndingWithCard(');
  const prevBestAt = app.indexOf('const prevBest =', endingAt);
  const addRecordAt = app.indexOf('DT.state.addRecord(', endingAt);
  assert.ok(prevBestAt >= endingAt, 'showEndingWithCard内でprevBestを取得する');
  assert.ok(addRecordAt > prevBestAt, 'prevBestはaddRecordより前に取得する');
});

test('UX3: 新設の演出はreduced-motionで無効化する', () => {
  const blocks = Array.from(css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g), m => m[1]);
  const block = blocks.find(body => body.includes('.reveal-trend') && body.includes('.reveal-best') && body.includes('.grow-add'));
  assert.ok(block, 'reduced-motionブロックにreveal-trend・reveal-best・grow-addを含める');
});

test('UX3: 新設テキストは11px未満にしない', () => {
  ['.reveal-trend', '.reveal-best', '.eh-row', '.grow-val'].forEach(selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    assert.ok(rule, selector + 'ルールが必要');
    const size = rule[1].match(/font-size:\s*([0-9.]+)rem/);
    assert.ok(size, selector + 'にremのfont-sizeが必要');
    assert.ok(Number(size[1]) >= 0.7, selector + 'は.7rem以上にする');
  });
});

test('Wave2: 文字の下限', () => {
  const exceptions = new Set([
    '.pcard-rarity', '.pcard-artlabel', '.pcard-num small', '.dev-section .dev-label', '.dev-row'
  ]);
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().split(',').map(s => s.trim());
    for (const size of rule[2].matchAll(/font-size:\s*([0-9.]+)rem/g)) {
      if (Number(size[1]) < 0.7 && !selectors.every(s => exceptions.has(s))) {
        bad.push(rule[1].trim() + ': ' + size[1] + 'rem');
      }
    }
  }
  assert.deepStrictEqual(bad, [], '.7rem未満を許すのは指定の5セレクタだけ');
});

test('Wave2: ホームはバー・エントリーに参考表は無い', () => {
  const home = app.match(/function renderPlayerBoard\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(home, 'ホームの描画関数が必要');
  assert.match(home[1], /board\.replaceChildren\(head,\s*cond,\s*\.\.\.warns,\s*techHead,\s*genreBars\(state\),\s*compBox\)/);
  assert.doesNotMatch(app, /\brenderEntryStatus\b/);
  assert.doesNotMatch(html, /\brenderEntryStatus\b/);
  assert.doesNotMatch(html, /id="entry-status"/);
  const detail = app.match(/function renderDetail\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(detail, '詳細画面の描画関数が必要');
  assert.match(detail[1], /skillRadarGrid\(state\.skills\)/, '詳細画面はレーダーを引き続き使う');
});


test('RENAME: 大会の表示名はジャグリング全国大会に統一する', () => {
  // 表示に出る文字列に JJF が残っていないこと（内部ID・データキー・関数名は 'jjf' のまま残す）
  const shown = [app, readFileSync(require.resolve('../js/contest.js'), 'utf8'),
                 readFileSync(require.resolve('../js/cards.js'), 'utf8')].join('\n');
  const literals = shown.match(/'[^'\n]*'/g) || [];
  const bad = literals.filter(t => /JJF/.test(t) && !/^'jjf/.test(t));
  assert.deepStrictEqual(bad, [], '表示文字列にJJFを残さない: ' + bad.join(' '));
  // 内部IDは据え置き（改名するとセーブとカード図鑑が壊れる）
  assert.match(shown, /type: 'jjf'/);
  assert.match(shown, /sp_jjf/);
});

test('RENAME: 改称前のセーブの旧ラベルも表示時に読み替える', () => {
  assert.match(app, /function contestLabel\(text\)[\s\S]*?replace\(\/JJF\/g, 'ジャグリング全国大会'\)/);
  // divisionLabel を画面に出すところは全て contestLabel を通す
  const raw = app.match(/[^(]r\.divisionLabel/g) || [];
  assert.deepStrictEqual(raw, [], 'divisionLabelはcontestLabel()を通して表示する');
});

test('Wave2: 得意技が乗るマスは補正量まで出す', () => {
  // 印だけにすると見込みが実際とずれる（2026-09-06 実測: インテグラル持ちの1DH×高難度技は
  // 見込み+2〜8に対し実際+10〜16だった）。量まで書いて初めて「何点伸びるか」が読める。
  const grid = app.match(/function renderTrainGrid\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(grid, '練習グリッドの描画関数が必要');
  assert.match(grid[1], /favRuleFor\(/, '得意技はルールごと引く（有無だけの判定にしない）');
  assert.match(grid[1], /'得意技' \+ \(fr\.amount > 0 \? '\+' : ''\) \+ fr\.amount/, '補正量を表示する');
  assert.doesNotMatch(grid[1], /'tg-fav',\s*'得意技'\s*\)/, '量の無い「得意技」だけの印に戻さない');
});

test('見立て: 部門の無い2画面には見立てカードを出す', () => {
  ['renderJjfQualifier', 'renderWorldsEntry'].forEach(name => {
    const body = app.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\}'));
    assert.ok(body, name + 'の描画関数が必要');
    assert.match(body[1], /\bgateBox\(/, name + 'で見立てカードを描く');
  });
  assert.doesNotMatch(app, /entry-selfline/);
  assert.doesNotMatch(css, /entry-selfline/);
});

test('見立て: 予選は5項目のバーを出す', () => {
  const body = app.match(/function renderJjfQualifier\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, '予選の描画関数が必要');
  assert.match(body[1], /const ticks\s*=\s*\[o\.half\.min,\s*o\.sure\.min\]/,
    '項目ごとの目盛りは見立ての最低ラインから取る');
  assert.match(body[1], /o\.items\.map\(it\s*=>\s*gateBar\(it\.label,\s*it\.value,\s*ticks\)\)/,
    '5項目すべてのラベル・値と目盛りをバーへ渡す');
  // ラベル文言は変わりうるので固定しない。見るのは「平均の目盛りが平均用のラインから来ているか」
  assert.match(body[1], /gateBar\('[^']*',\s*o\.avg,\s*\[o\.half\.avg,\s*o\.sure\.avg\],\s*'is-total'\)/,
    '平均のバーは平均用のライン(50/60)を目盛りにする');
  // 項目の線(40/50)と平均の線(50/60)は位置が違うので、凡例に数字を書く
  assert.match(body[1], /gate-legend[\s\S]*?o\.half\.min[\s\S]*?o\.sure\.min[\s\S]*?o\.half\.avg[\s\S]*?o\.sure\.avg/,
    '凡例に4つのラインの数値を出す');
});

test('見立て: 下寄せは部門選択に持ち込まない', () => {
  ['renderJjfQualifier', 'renderWorldsEntry'].forEach(name => {
    const body = app.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\}'));
    assert.ok(body, name + 'の描画関数が必要');
    assert.match(body[1], /\$\('#entry-divisions'\)\.classList\.add\('gate-layout'\)/);
    assert.match(body[1], /el\('div',\s*'gate-choices'\)/);
  });
  const entry = app.match(/function renderEntry\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(entry, '部門選択の描画関数が必要');
  assert.match(entry[1], /\$\('#entry-divisions'\)\.classList\.remove\('gate-layout'\)/,
    '予選・世界大会から戻っても下寄せを残さない');
  assert.match(css, /#entry-divisions\.gate-layout\s*\{\s*flex:\s*1;/);
  assert.match(css, /#entry-divisions\.gate-layout \.gate-choices\s*\{\s*margin-top:\s*auto;/);
});

test('アイコン: UIの器から絵文字が消えている', () => {
  const navLines = html.split('\n').filter(line => /class="nav-btn"/.test(line));
  const titles = ['今後の予定', 'ポイント履歴', 'これまでの記録', '卒業生名簿', 'カード図鑑', '設定', 'これまでの記録ログ'];
  // 顔作成・選手登録など仕様の置換表にない見出しは対象外。
  const modalLines = titles.map(title => {
    const lines = html.split('\n').filter(line => line.includes('class="modal-title"') && line.includes(title + '</span>'));
    assert.strictEqual(lines.length, 1, title);
    return lines[0];
  });
  const buttonLines = ['btn-records', 'btn-zukan', 'btn-alumni'].map(id => {
    const lines = html.split('\n').filter(line => line.includes('id="' + id + '"'));
    assert.strictEqual(lines.length, 1, id);
    return lines[0];
  });
  assert.strictEqual(navLines.length, 3);
  assert.strictEqual(modalLines.length, 7);
  [...navLines, ...modalLines, ...buttonLines].forEach(line => {
    assert.doesNotMatch(line, /\p{Extended_Pictographic}|[\uFE0F\u20E3]/u, line);
    assert.match(line, /data-icon="[a-z]+"/, line);
  });
  const iconsAt = html.indexOf('js/icons.js?v=');
  const appAt = html.indexOf('js/app.js?v=');
  assert.ok(iconsAt >= 0 && appAt > iconsAt, 'icons.jsをapp.jsより先に読み込む');
  assert.ok(html.indexOf('js/avatar.js?v=') < iconsAt, 'avatar.jsの次にicons.jsを読み込む');
  const alumni = app.match(/function renderCreateAlumniButton\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(alumni);
  assert.doesNotMatch(alumni[1], /🌸/);
  const labelAt = alumni[1].indexOf('button.textContent =');
  const iconAt = alumni[1].indexOf("DT.icons.prepend(button, 'flower')");
  assert.ok(labelAt >= 0 && iconAt > labelAt, '人数更新後にも卒業生アイコンを戻す');
});

test('アイコン: data-icon の名前は実在する', () => {
  const icons = readFileSync(require.resolve('../js/icons.js'), 'utf8');
  const paths = icons.match(/const PATHS\s*=\s*\{([\s\S]*?)\n  \};/);
  assert.ok(paths, 'PATHSの定義が必要');
  const names = new Set(Array.from(paths[1].matchAll(/^\s*([a-z]+):/gm), m => m[1]));
  assert.ok(names.size > 0, 'PATHSから名前を取得する');
  const staticNames = Array.from(html.matchAll(/data-icon="([^"]+)"/g), m => m[1]);
  // 件数は下限で見る。アイコンを足すたびにテストが落ちるのは意味がない（見たいのは
  // 「配線が残っていること」と「名前が実在すること」）
  assert.ok(staticNames.length >= 13, 'data-iconの配線が減っていないこと: ' + staticNames.length);
  // 第1引数の $() などに含まれる括弧も許容して、リテラルの第2引数を拾う。
  const prependNames = Array.from(app.matchAll(/DT\.icons\.prepend\([^;\n]*?,\s*'([^']+)'/g), m => m[1]);
  assert.ok(prependNames.length >= 3, '動的な差し込みが減っていないこと: ' + prependNames.length);
  const future = app.match(/function futureEvents\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(future, 'futureEventsが必要');
  const eventNames = Array.from(future[1].matchAll(/icon:\s*'([^']+)'/g), m => m[1]);
  assert.strictEqual(eventNames.length, 6, '予定一覧の6種はこの数のまま');
  [...staticNames, ...prependNames, ...eventNames].forEach(name => {
    assert.ok(names.has(name), name + 'はPATHSに存在すること');
  });
});

test('初回案内: タイトルの説明文は無い', () => {
  assert.doesNotMatch(html, /title-manual/);
  assert.doesNotMatch(app, /title-manual/);
  assert.doesNotMatch(css, /title-manual/);
  ['home', 'train', 'result'].forEach(id => {
    assert.match(app, new RegExp("coachTip\\('" + id + "',"));
  });
  const coach = app.match(/function coachTip\(id, text\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(coach, 'coachTipが必要');
  assert.match(coach[1], /if \(state\.turn > 2 \|\| DT\.state\.hintSeen\(id\)\) return null/);
  assert.match(coach[1], /DT\.state\.markHint\(id\)/);
  assert.match(coach[1], /close\.onclick = \(\) => tip\.remove\(\)/);
  assert.match(coach[1], /tip\.appendChild\(close\)/);
});

summary();
