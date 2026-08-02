/*
 * Service Worker（2026-07-28）
 *
 * 方針: ネットワーク優先（network-first）。
 *   - オンラインなら必ずサーバーの最新を返す → index.htmlの `?v=` によるキャッシュ破棄運用と両立する
 *     （キャッシュ優先にすると古いJS/CSSが残り、`?v=` を上げても反映されない事故が起きるため採用しない）。
 *   - 取得できたレスポンスは都度キャッシュへ保存し、オフライン時だけそれを返す。
 *   - 対象は同一オリジンのGETのみ。Google Fontsなどの外部リソースは介入しない
 *     （オフライン時はシステムフォントにフォールバックする）。
 *
 * 更新: CACHE_VERSION を上げると activate で古いキャッシュを削除する。
 *   skipWaiting + clients.claim により、次回読み込みから新しいSWがすぐ効く。
 */
'use strict';

const CACHE_VERSION = 'v20260803a';
const CACHE_NAME = 'diabolo4yeargame-' + CACHE_VERSION;

// オフライン初回起動に最低限必要なもの。取得に失敗しても install は成功させる（配信構成の差異に強くする）
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/short-mode.js',
  './js/state.js',
  './js/engine.js',
  './js/contest.js',
  './js/events.js',
  './js/ending.js',
  './js/cards.js',
  './js/radar.js',
  './js/app.js',
  './assets/pwa/icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 1つでも失敗すると install ごと落ちる cache.addAll は使わず、個別に best-effort で入れる
    await Promise.all(CORE_ASSETS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* 取得できないものは諦める（オンライン時に順次キャッシュされる） */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('diabolo4yeargame-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部CDNには介入しない

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // 正常応答のみ保存（opaque/エラーは保存しない）
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      // オフライン: キャッシュ → 画面遷移なら index.html にフォールバック
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
