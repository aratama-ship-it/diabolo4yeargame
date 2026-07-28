'use strict';
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { test, summary } = require('./harness');

const css = readFileSync(require.resolve('../css/style.css'), 'utf8');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const app = readFileSync(require.resolve('../js/app.js'), 'utf8');
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
  assert.match(create[0], /id="btn-alumni"[^>]*>🌸 登場する卒業生を設定/);
  assert.match(app, /function renderCreateAlumniButton\(\)[\s\S]*?requiredAlumniCount\(profile\)[\s\S]*?profile\.selectedIds\.length/);
  assert.match(app, /!?\$\('#screen-create'\)\.classList\.contains\('hidden'\)[\s\S]*?candidate\.activeAlumni\s*=\s*DT\.state\.loadActiveAlumni/);
});

summary();
