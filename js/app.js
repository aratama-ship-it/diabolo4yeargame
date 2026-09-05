(function () {
  'use strict';
  const DT = window.DT;
  const $ = (sel) => document.querySelector(sel);
  const QUERY_PARAMS = new URLSearchParams(window.location.search);
  // 公開版は24ターン版のみ。48ターン版の内部実装は将来の再検討用に残す。
  const GAME_MODE = DT.shortMode.ID;
  const SHORT = true;

  // 開発用表示（DEV PARAMSパネル・大会の不振理由）は URLに ?dev を付けたときだけ表示。
  // テスターには見えないようにするための切り替え。バージョンはタイトル画面に表示。
  const APP_VERSION = 'v0.9 short-test13';
  const DEV = QUERY_PARAMS.has('dev');
  if (DEV) document.documentElement.classList.add('dev');
  if (SHORT) document.documentElement.classList.add('short-mode');

  let state = null;
  let candidate = null;
  let candidateAvatar = null;
  let pendingLogs = [];
  let pendingMessages = [];
  let entrySelection = [];
  let pendingContest = null;
  let selectedBackground = 'highschool';
  let pendingActionId = null;
  let pendingSlots = null;          // 練習ターンのスロット構成（前スロット→練習実行まで保持）
  let pendingSkipAction = false;    // 過労で倒れる等で当ターンの行動をキャンセルするか
  let pendingScheduledPopup = null;
  let pendingPopularity = null;
  let alumniDraftProfile = null;
  let alumniDraftIds = [];
  let alumniSearchQuery = '';
  let registrationNameDraft = null;
  let registrationRenameUsed = false;
  let pendingMonthTransition = false;
  let monthTransitionTimer = null;

  // --- 練習スロット選択（UI状態。null=空き、'routine'、または{genre,method}） ---
  let slotsUI = new Array(DT.DATA.SLOTS.perMonth).fill(null);
  let justSetSlot = -1;
  let previousSlotCount = 0;
  const METHOD_ACTION_LABEL = { difficulty: '高難度技', novelty: '新技開発', control: '反復練習' };
  const MOOD_EMOJI = { '絶好調': '🤩', '好調': '😊', '普通': '🙂', '不調': '😟', '絶不調': '😫' };
  // ---- キャラ画像スロット（2026-08-28）----
  // 「置いてあれば出す、無ければ現状の絵文字・テキストのまま」を1か所で扱う。
  // 同じsrcは1セッションに1回しか読みに行かない（未配置でも404は1件で打ち止め）。
  // 素材ごと止めたいときは false にする（画像を一切取りに行かなくなる）。
  const CHAR_IMAGES_ENABLED = true;
  const charImgState = new Map(); // src -> 'ok' | 'ng' | 'loading'
  const HERO_MOOD_KEY = { '絶好調': 'best', '好調': 'good', '普通': 'normal', '不調': 'bad', '絶不調': 'worst' };
  const heroMoodSrc = key => 'assets/chars/hero/mood-' + key + '.png';
  const charPortraitSrc = id => 'assets/chars/portrait/' + id + '.png';
  // NPCの顔。役柄から手で決めたプリセット（2026-08-28）。
  // 後からイラストに戻したくなったら assets/chars/portrait/<id>.png を置く（PNGが優先される）。
  const NPC_AVATAR = {
    // 目の番号は 0まる 1ほそ 2きらきら 3ジト 4てんてん 5にっこり 6まつげ 7するどい 8みひらき 9ほしめ
    // 輪郭は 0たまご 1まる 2えら 3とがり 4ふっくら
    coach:  { face:2, eyes:7, brows:1, mouth:1, hairF:4, hairB:0, acc:0, skin:2, hair:0, eye:0, wear:5 }, // 指導者・貫禄
    yota:   { face:1, eyes:0, brows:0, mouth:4, hairF:2, hairB:0, acc:0, skin:1, hair:1, eye:1, wear:0 }, // ムードメーカー
    mikoto: { face:0, eyes:6, brows:0, mouth:1, hairF:0, hairB:2, acc:1, skin:0, hair:0, eye:5, wear:2 }, // 理論派・メガネ
    shion:  { face:3, eyes:1, brows:3, mouth:1, hairF:3, hairB:1, acc:0, skin:0, hair:7, eye:2, wear:1 }, // 天才ライバル
    kaito:  { face:2, eyes:8, brows:1, mouth:2, hairF:4, hairB:0, acc:0, skin:3, hair:0, eye:0, wear:5 }, // 王者・威圧
    irie:   { face:4, eyes:5, brows:2, mouth:0, hairF:5, hairB:0, acc:0, skin:1, hair:2, eye:1, wear:4 }, // 人懐こい同期
    ujiji:  { face:3, eyes:3, brows:3, mouth:1, hairF:6, hairB:3, acc:0, skin:2, hair:0, eye:0, wear:3 }, // 大陸からの刺客
    kazuki: { face:4, eyes:4, brows:1, mouth:1, hairF:7, hairB:0, acc:1, skin:2, hair:5, eye:4, wear:5 }, // 博士
    george: { face:1, eyes:9, brows:0, mouth:3, hairF:6, hairB:1, acc:2, skin:3, hair:3, eye:3, wear:0 }, // 大道芸人
    saito:  { face:2, eyes:1, brows:0, mouth:1, hairF:4, hairB:0, acc:1, skin:2, hair:5, eye:0, wear:5 }, // 協会の会長
  };
  const CONTEST_DESC = { oidc: '大阪国際ディアボロコンテスト', ajdc: '全日本選手権（頂点）', worlds: '世界の頂点', shizuoka: '静岡ディアボロコンテスト' };
  // 現在ターン以降で最も近い大会（CONTESTSは順不同のため最小turnを取る）
  function nextContestFrom(turn) {
    return DT.DATA.CONTESTS.filter(c => c.turn >= turn).sort((a, b) => a.turn - b.turn)[0] || null;
  }

  // ---- ラベルヘルパー ----
  function genreLabel(id) {
    const g = DT.DATA.GENRES.find(x => x.id === id);
    return g ? g.label : id;
  }
  function methodActionLabel(id) { return METHOD_ACTION_LABEL[id] || id; }
  function statLabelById(id) {
    const m = DT.DATA.METHODS.find(x => x.id === id);
    return m ? m.label : id;
  }
  function slotChipLabel(slot) {
    if (slot === 'routine') return 'ルーチン構成';
    return genreLabel(slot.genre) + '×' + methodActionLabel(slot.method);
  }
  function totalPoints() {
    return state.results.reduce((a, r) => a + r.points, 0);
  }

  // --- DOMヘルパー（innerHTML不使用） ---
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svgEl(tag, attrs, children) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    if (children) children.forEach(c => n.appendChild(c));
    return n;
  }

  function mountCharImage(container, src, imgClass) {
    if (!CHAR_IMAGES_ENABLED || !container || !src) return;
    const image = () => {
      const img = new Image();
      img.src = src;
      img.alt = '';
      img.className = imgClass;
      img.draggable = false;
      return img;
    };
    const status = charImgState.get(src);
    if (status === 'ok') {
      container.replaceChildren(image());
      container.classList.add('has-img');
      return;
    }
    if (status === 'ng' || status === 'loading') return;
    charImgState.set(src, 'loading');
    const preload = new Image();
    preload.onload = () => {
      charImgState.set(src, 'ok');
      if (!container.isConnected) return;
      container.replaceChildren(image());
      container.classList.add('has-img');
    };
    preload.onerror = () => { charImgState.set(src, 'ng'); };
    preload.src = src;
  }

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

  function heroMoodKey(state, moodLabel) {
    if (state.injuredTurns > 0) return 'injured';
    if (state.awakenTurns > 0) return 'awaken';
    return HERO_MOOD_KEY[moodLabel] || 'normal';
  }

  // イベントのcharには演出用の擬似ID（覚醒のきざしの'awaken'）が混ざる。
  // CHARACTERSに実在するIDのときだけ絵を探しにいく（無い絵への404を出さない）。
  function charHasPortrait(charId) {
    return !!charId && DT.DATA.CHARACTERS.some(c => c.id === charId);
  }

  function setEventSpeaker(name, charId, avatarCfg) {
    const portrait = el('span', 'event-portrait');
    const speakerName = el('span', 'event-speaker-name', name);
    $('#event-char').replaceChildren(portrait, speakerName);
    const cfg = avatarCfg || (charId ? NPC_AVATAR[charId] : null);
    if (cfg) mountAvatar(portrait, avatarOf({ name: name, avatar: cfg }));
    if (charHasPortrait(charId)) mountCharImage(portrait, charPortraitSrc(charId), 'event-portrait-img');
  }

  // 改称前のセーブ対策（2026-08-29）: 大会名を「JJF」→「ジャグリング全国大会」に変えたが、
  // 進行中のセーブの state.results には旧ラベルが残っている。保存データは書き換えず、
  // 表示するときだけ読み替える（同じ周回で新旧の呼び名が混ざるのを防ぐ）。
  function contestLabel(text) {
    return String(text === undefined || text === null ? '' : text).replace(/JJF/g, 'ジャグリング全国大会');
  }

  function statBar(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    const bg = el('span', 'bar-bg');
    const bar = el('span', 'bar');
    bar.style.width = '0%';
    requestAnimationFrame(() => { bar.style.width = value + '%'; });
    bg.appendChild(bar);
    row.appendChild(bg);
    row.appendChild(el('span', 'val', String(value)));
    return row;
  }
  function textRow(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    row.appendChild(el('span', '', value));
    return row;
  }

  // メーター行（label / gauge / value）。warnで疲労系の赤グラデ
  function meterRow(label, value, opts) {
    opts = opts || {};
    const row = el('div', 'meter' + (opts.wideLabel ? ' wide-label' : ''));
    row.appendChild(el('span', 'm-label', label));
    const gauge = el('div', 'gauge' + (opts.warn ? ' warn' : ''));
    const fill = el('span');
    const targetWidth = Math.max(0, Math.min(100, value)) + '%';
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = targetWidth; });
    gauge.appendChild(fill);
    row.appendChild(gauge);
    const val = el('span', 'm-val num', opts.valText !== undefined ? opts.valText : String(value));
    row.appendChild(val);
    return row;
  }

  // 三角レーダーの軸カラー（軸番号順: 0=難易度 / 1=新奇性 / 2=操作安定度）。
  // 空色背景と喧嘩する青は避け、青の補色にあたる暖色＋アクセントのティールで色分け。
  const AXIS_COLORS = ['#ff6b6b', '#f0a825', '#2ec4b6'];

  // ジャンルのフルネーム（ポップアップ見出し用）
  const GENRE_FULL = { h1d: '1ディアボロ・水平軸', v1d: '1ディアボロ・垂直軸', d2: '2ディアボロ', d3: '3ディアボロ以上' };

  // 三角レーダーのSVGを生成（小カードでも拡大ポップアップでも共通で使う。viewBox基準なのでCSSで拡縮）
  function buildRadarSvg(genreId, cell, unlocked) {
    const CX = 50, CY = 52, R = 40;
    const rp = (v, a) => DT.radar.radarPoint(v, a, CX, CY, R);
    const ptStr = pts => pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    // viewBoxの下側を詰める（内容は y=0〜約84。下部の空きをカットしてボックスの縦を節約）
    const svg = svgEl('svg', { viewBox: '0 0 100 86', class: 'radar-svg' });
    // 未解禁ジャンルはチャート本体を <g class="radar-dim"> にまとめてグレースケール＋淡色化。
    // 大きな鍵アイコンはこのグループの外に描いて鮮明なまま前面に出す。
    const bg = unlocked ? svg : svgEl('g', { class: 'radar-dim' });

    const wm = svgEl('text', {
      x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#ffd166', 'fill-opacity': '0.18', 'font-size': '40', 'font-weight': 'bold'
    });
    wm.textContent = genreLabel(genreId);
    bg.appendChild(wm);

    [100, 75, 50, 25].forEach(level => {
      const ring = [rp(level, 0), rp(level, 1), rp(level, 2)];
      bg.appendChild(svgEl('polygon', { points: ptStr(ring), fill: 'none', stroke: '#d8ddf0', 'stroke-width': '0.8' }));
    });
    // 軸スポークは各軸カラーの淡色に（どの方向がどの評価軸か色でも伝える）
    [0, 1, 2].forEach(a => {
      const o = rp(100, a);
      bg.appendChild(svgEl('line', {
        x1: CX, y1: CY, x2: o.x.toFixed(1), y2: o.y.toFixed(1),
        stroke: AXIS_COLORS[a], 'stroke-opacity': '0.35', 'stroke-width': '0.7'
      }));
    });
    if (unlocked) {
      const vpts = [rp(cell.difficulty, 0), rp(cell.novelty, 1), rp(cell.control, 2)];
      // 塗りは中立色（特定軸に偏らせない）。頂点ドットを軸カラーで色分けして識別性を上げる
      bg.appendChild(svgEl('polygon', { points: ptStr(vpts), fill: 'rgba(43,58,103,0.10)', stroke: '#9aa4c8', 'stroke-width': '1.3', class: 'radar-value' }));
      vpts.forEach((p, a) => {
        bg.appendChild(svgEl('circle', {
          cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: '2.1',
          fill: AXIS_COLORS[a], stroke: '#fff', 'stroke-width': '0.7'
        }));
      });
    }
    const labelOffset = [[0, -3], [0, 9], [0, 9]];
    [['難', 0], ['新', 1], ['操', 2]].forEach(function (lv) {
      const o = rp(100, lv[1]);
      const t = svgEl('text', {
        x: (o.x + labelOffset[lv[1]][0]).toFixed(1), y: (o.y + labelOffset[lv[1]][1]).toFixed(1),
        'text-anchor': 'middle', fill: AXIS_COLORS[lv[1]], 'font-size': '8.5', 'font-weight': 'bold'
      });
      t.textContent = lv[0];
      bg.appendChild(t);
    });
    if (!unlocked) {
      svg.appendChild(bg);
      // 未解禁は大きな鍵アイコンで中央にドンと表示（一目で「まだ使えない」と分かるように）
      const t = svgEl('text', {
        x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '46'
      });
      t.textContent = '🔒';
      svg.appendChild(t);
    }
    return svg;
  }

  // 1ジャンル分の三角レーダーカード（タップで拡大ポップアップを開く）
  function genreRadar(genreId, cell, unlocked) {
    const card = el('div', 'radar-card');
    card.appendChild(buildRadarSvg(genreId, cell, unlocked));
    card.setAttribute('role', 'button');
    card.title = 'タップで拡大';
    card.onclick = () => openRadar(genreId);
    return card;
  }

  // レーダー拡大ポップアップ。ジャンルの3軸を色分けした大きなレーダー＋数値内訳を表示
  function openRadar(genreId) {
    const unlocked = DT.contest.isGenreUnlocked(state, genreId);
    const cell = state.skills[genreId];
    $('#radar-title').textContent = '📊 ' + genreLabel(genreId) + '（' + (GENRE_FULL[genreId] || '') + '）';

    $('#radar-big').replaceChildren(buildRadarSvg(genreId, cell, unlocked));

    // 他ジャンルのサムネイル（タップでそのジャンルをメインに切替）
    const thumbs = DT.DATA.GENRES.filter(g => g.id !== genreId).map(function (g) {
      const un = DT.contest.isGenreUnlocked(state, g.id);
      const t = el('div', 'radar-thumb');
      t.appendChild(buildRadarSvg(g.id, state.skills[g.id], un));
      t.appendChild(el('div', 'radar-thumb-label', genreLabel(g.id)));
      t.setAttribute('role', 'button');
      t.title = genreLabel(g.id) + 'を拡大';
      t.onclick = () => openRadar(g.id);
      return t;
    });
    $('#radar-thumbs').replaceChildren(...thumbs);

    const legend = [];
    if (unlocked) {
      const rows = [['難易度', cell.difficulty, 0], ['新奇性', cell.novelty, 1], ['操作安定度', cell.control, 2]];
      rows.forEach(function (r) {
        const row = el('div', 'radar-leg-row');
        const dot = el('span', 'radar-leg-dot');
        dot.style.background = AXIS_COLORS[r[2]];
        row.appendChild(dot);
        row.appendChild(el('span', 'radar-leg-label', r[0]));
        row.appendChild(el('span', 'radar-leg-val num', String(r[1])));
        legend.push(row);
      });
      const avg = el('div', 'radar-leg-avg');
      avg.appendChild(el('span', 'radar-leg-label', '平均'));
      avg.appendChild(el('span', 'radar-leg-val num', String(DT.contest.genreAvg(state, genreId))));
      legend.push(avg);
    } else {
      const req = DT.DATA.SKILL_TREE[genreId].requires;
      legend.push(el('div', 'radar-leg-locked', '🔒 未解禁：' + genreLabel(req.genre) + 'の習熟' + req.threshold + '超で解禁'));
    }
    $('#radar-legend').replaceChildren(...legend);
    $('#radar-modal').classList.remove('hidden');
  }
  function closeRadar() { $('#radar-modal').classList.add('hidden'); }

  function skillRadarGrid(skills) {
    const grid = el('div', 'radar-grid');
    DT.DATA.GENRES.forEach(function (g) {
      const unlocked = DT.contest.isGenreUnlocked({ skills: skills }, g.id);
      grid.appendChild(genreRadar(g.id, skills[g.id], unlocked));
    });
    return grid;
  }

  function skillTable(skills) {
    const table = el('table', 'skill-table');
    const head = el('tr');
    head.appendChild(el('th', '', 'ジャンル'));
    DT.DATA.METHODS.forEach(m => head.appendChild(el('th', '', m.label)));
    head.appendChild(el('th', '', '平均'));
    table.appendChild(head);
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked({ skills: skills }, g.id);
      const tr = el('tr');
      tr.appendChild(el('td', '', unlocked ? g.label : '🔒 ' + g.label));
      DT.DATA.METHODS.forEach(m => tr.appendChild(el('td', '', unlocked ? String(skills[g.id][m.id]) : '-')));
      tr.appendChild(el('td', '', unlocked ? String(DT.contest.genreAvg({ skills: skills }, g.id)) : '-'));
      table.appendChild(tr);
    });
    return table;
  }

  // --- 画面切替（＋ボトムナビの表示/アクティブ制御・開発パネル更新） ---
  const NAV_OF = { '#screen-home': 'home', '#screen-detail': 'detail' };
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    const navKey = NAV_OF[id];
    $('#bottom-nav').classList.toggle('hidden', !navKey);
    $('#nav-home').classList.toggle('active', navKey === 'home');
    $('#nav-detail').classList.toggle('active', navKey === 'detail');
    updateDevPanel();
  }

  // --- タイトル ---
  function initTitle() {
    $('#btn-continue').disabled = !DT.state.load(undefined, GAME_MODE);
    $('#title-main').textContent = '４８ヶ月のディアボロ';
    $('#title-subtitle').textContent = '〜2ヶ月ずつ、大学4年間を駆け抜けろ〜';
    $('#title-manual').textContent = '1ターンで2ヶ月進む全24ターン。練習・勉強・休養を選び、得意分野を育てて大会へ挑みます。練習はジャンルと内容を組み合わせて3枠決めます。疲労がたまると失敗や怪我のリスクが上がるので注意。育てた選手は卒業時にカードとして残ります。';
    $('#app-version').textContent = APP_VERSION + (DEV ? '（DEV表示ON）' : '');
    show('#screen-title');
  }

  function newCandidate() {
    const next = DT.state.newCharacter(undefined, selectedBackground, GAME_MODE);
    if (SHORT) next.activeAlumni = DT.state.loadActiveAlumni(undefined, GAME_MODE);
    if (DT.avatar) {
      if (!candidateAvatar) candidateAvatar = DT.avatar.random();
      next.avatar = candidateAvatar;
    }
    return next;
  }

  $('#btn-new').onclick = () => renderCreate(newCandidate());
  $('#btn-continue').onclick = () => { state = DT.state.load(undefined, GAME_MODE); afterTurn([]); };

  // --- キャラ作成 ---
  function renderBackgroundButtons() {
    const sel = $('#create-bg');
    sel.replaceChildren(...DT.DATA.BACKGROUNDS.map(bg => {
      const o = el('option', '', bg.label + '（' + bg.difficulty + '）');
      o.value = bg.id;
      if (bg.id === selectedBackground) o.selected = true;
      return o;
    }));
    // 経歴を変えると難易度が変わるので選手を引き直す（旧ボタンUIと同じ挙動）
    sel.onchange = () => {
      selectedBackground = sel.value;
      renderCreate(newCandidate());
    };
  }

  function renderCreate(c) {
    candidate = c;
    registrationNameDraft = null;
    registrationRenameUsed = false;
    $('#create-name').disabled = false;
    renderBackgroundButtons();
    renderCreateAlumniButton();
    $('#create-stats').replaceChildren(
      el('div', 'section-label', '能力値'),
      skillTable(c.skills),
      skillRadarGrid(c.skills),
      statBar('演技構成', c.composition),
      statBar('学力', c.study)
    );
    mountAvatar($('#create-avatar'), avatarOf(c));
    show('#screen-create');
  }

  function renderCreateAlumniButton() {
    const button = $('#btn-alumni');
    button.classList.toggle('hidden', !SHORT);
    if (!SHORT) return;
    const profile = DT.state.loadAlumniProfile(undefined, GAME_MODE);
    const required = DT.state.requiredAlumniCount(profile);
    button.textContent = '🌸 登場する卒業生を設定（' + profile.selectedIds.length + ' / ' + required + '人）';
  }

  $('#btn-reroll').onclick = () => renderCreate(newCandidate());
  $('#btn-create-back').onclick = () => {
    candidate = null;
    candidateAvatar = null;
    registrationNameDraft = null;
    registrationRenameUsed = false;
    initTitle();
  };

  function normalizedPlayerName(value) {
    return (String(value || '').trim() || '主人公').slice(0, 8);
  }

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

  function renderAvatarEditor() {
    if (!DT.avatar || !candidateAvatar) return;
    mountAvatar($('#avatar-preview'), candidateAvatar);
    const rows = [];
    DT.avatar.SLOTS.forEach(slot => {
      const row = el('div', 'apart');
      row.appendChild(el('div', 'apart-label', slot.label));
      const options = el('div', 'apart-opts');
      slot.list.forEach((part, i) => {
        const button = el('button', 'apart-opt' + (candidateAvatar[slot.key] === i ? ' on' : ''));
        const preview = Object.assign({}, candidateAvatar);
        preview[slot.key] = i;
        button.appendChild(DT.avatar.svgElement(preview));
        button.setAttribute('aria-label', slot.label + ' ' + part.label);
        button.onclick = () => {
          candidateAvatar[slot.key] = i;
          renderAvatarEditor();
        };
        options.appendChild(button);
      });
      row.appendChild(options);
      rows.push(row);
    });
    DT.avatar.COLOR_SLOTS.forEach(slot => {
      const row = el('div', 'apart');
      row.appendChild(el('div', 'apart-label', slot.label));
      // 色見本は顔サムネイルより小さく詰められるので、折り返しの列幅を別に持つ
      const options = el('div', 'apart-opts is-colors');
      slot.list.forEach((color, i) => {
        const button = el('button', 'apart-sw' + (candidateAvatar[slot.key] === i ? ' on' : ''));
        button.style.background = color;
        button.setAttribute('aria-label', slot.label + ' ' + (i + 1));
        button.onclick = () => {
          candidateAvatar[slot.key] = i;
          renderAvatarEditor();
        };
        options.appendChild(button);
      });
      row.appendChild(options);
      rows.push(row);
    });
    $('#avatar-parts').replaceChildren(...rows);
  }

  $('#btn-avatar-open').onclick = openAvatarEditor;
  $('#btn-avatar-random').onclick = () => {
    if (!DT.avatar || !candidateAvatar) return;
    Object.assign(candidateAvatar, DT.avatar.random());
    renderAvatarEditor();
  };
  $('#btn-avatar-done').onclick = closeAvatarEditor;
  document.querySelectorAll('[data-close-avatar]').forEach(b => { b.onclick = closeAvatarEditor; });

  function syncRegistrationName() {
    const name = registrationNameDraft || '主人公';
    $('#registration-name-current').textContent = name;
    $('#registration-name-input').value = name;
    $('#btn-registration-rename').disabled = registrationRenameUsed;
    $('#btn-registration-rename').textContent = registrationRenameUsed
      ? '✓ 名前を変更済み'
      : '✏️ 名前を変更する（あと1回）';
  }

  function closeRegistration() {
    $('#registration-modal').classList.add('hidden');
    $('#registration-name-edit').classList.add('hidden');
  }

  function openRegistration() {
    if (!candidate) return;
    if (!registrationNameDraft) registrationNameDraft = normalizedPlayerName($('#create-name').value);
    syncRegistrationName();
    mountAvatar($('#registration-avatar'), avatarOf(candidate));
    $('#registration-name-edit').classList.add('hidden');
    $('#registration-modal').classList.remove('hidden');
  }

  $('#btn-registration-rename').onclick = () => {
    if (registrationRenameUsed) return;
    $('#registration-name-edit').classList.remove('hidden');
    $('#registration-name-input').focus();
  };
  $('#btn-registration-rename-ok').onclick = () => {
    registrationNameDraft = normalizedPlayerName($('#registration-name-input').value);
    registrationRenameUsed = true;
    $('#create-name').value = registrationNameDraft;
    $('#create-name').disabled = true;
    $('#registration-name-edit').classList.add('hidden');
    syncRegistrationName();
  };
  $('#btn-registration-back').onclick = closeRegistration;
  $('#btn-start').onclick = openRegistration;
  $('#btn-registration-confirm').onclick = () => {
    if (!candidate) return;
    state = candidate;
    state.name = registrationNameDraft || normalizedPlayerName($('#create-name').value);
    closeRegistration();
    DT.state.save(state);
    renderHome([]);
  };

  // --- ホーム ---
  function renderHome(logs) {
    // 学年ごとにホーム背景色を変える（1〜4年生で識別しやすく）
    const yr = Math.min(4, Math.max(1, Math.ceil(state.turn / 12)));
    const homeEl = $('#screen-home');
    homeEl.classList.remove('year-1', 'year-2', 'year-3', 'year-4');
    homeEl.classList.add('year-' + yr);

    renderHomeContest();
    renderPlayerBoard();
    $('#home-prompt').textContent = SHORT ? 'この2ヶ月はどうする？' : '今月はどうする？';

    // 毎月スロットは空にリセット（前月構成の引き継ぎはしない）。怪我中はルーチン構成のみ1枠
    slotsUI = state.injuredTurns > 0 ? [null] : new Array(DT.DATA.SLOTS.perMonth).fill(null);
    renderHomeActions();

    const log = $('#home-log');
    const body = [];
    if (logs && logs.length > 0) {
      log.classList.add('multi');
      logs.forEach(l => body.push(el('div', '', l)));
    } else {
      log.classList.remove('multi');
      body.push(el('div', '', SHORT ? '💬 偶数月の行動を決めよう。次の奇数月はイベント！' : '💬 今月はどうする？'));
    }
    // ログ帯タップで記録ログを開ける（後から見返せる）
    body.push(el('div', 'log-more', '📖 これまでの記録ログ ▸'));
    log.replaceChildren(...body);
    log.setAttribute('role', 'button');
    log.title = 'タップで記録ログ';
    log.onclick = openLog;
    show('#screen-home');
  }

  function renderHomeContest() {
    const box = $('#home-contest');
    const events = futureEvents();
    const nextContest = events.find(e => e.cls === 'contest');
    const nextOther = events.find(e => e.cls !== 'contest');
    const rows = [];
    if (nextContest) rows.push(nextContest);
    if (nextOther) rows.push(nextOther);
    box.replaceChildren(...(rows.length ? [nextEventsBox(rows)] : []));
  }

  // 次のイベント枠: 大会＋大会以外の固定イベントを1つの囲みに縦並びで表示。タップで予定一覧を開く
  function nextEventsBox(events) {
    const box = el('div', 'next-events');
    box.setAttribute('role', 'button');
    box.title = 'タップで予定一覧';
    box.onclick = openSchedule;
    const head = el('div', 'ne-head');
    head.appendChild(el('span', 'ne-title', '次のイベント'));
    head.appendChild(el('span', 'ne-hint', 'タップで予定一覧 ▸'));
    box.appendChild(head);
    events.forEach(e => {
      const row = el('div', 'ne-row ' + e.cls);
      row.appendChild(el('span', 'ne-icon', e.icon));
      row.appendChild(el('span', 'ne-name', e.name));
      const away = e.turn - state.turn;
      row.appendChild(el('span', 'ne-count', away === 0 ? '今月' : 'あと' + away + 'ヶ月'));
      box.appendChild(row);
    });
    return box;
  }

  // 今後の予定（大会・世界大会・定期テスト・練習会）を現在ターン以降で列挙
  function futureEvents() {
    const out = [];
    const nextContestTurn = (nextContestFrom(state.turn) || {}).turn;
    for (let t = state.turn; t <= DT.DATA.TOTAL_TURNS; t++) {
      const c = DT.DATA.CONTESTS.find(x => x.turn === t);
      if (c) out.push({ turn: t, icon: '🏆', name: c.name, sub: CONTEST_DESC[c.type] || '大会', cls: 'contest', isNext: t === nextContestTurn });
      const w = DT.contest.worldsContestForTurn(t);
      if (w) out.push({ turn: t, icon: '🌍', name: w.name, sub: '前年に優勝で出場権', cls: 'worlds', isNext: false });
      if (DT.DATA.EXAMS.turns.includes(t)) out.push({ turn: t, icon: '📝', name: '定期テスト', sub: '学力' + DT.DATA.EXAMS.passLine + '未満で補習2ヶ月', cls: 'exam', isNext: false });
      if (DT.DATA.JJF.qualifierTurns.includes(t)) out.push({ turn: t, icon: '🤹', name: 'ジャグリング全国大会予選', sub: '参加は任意・バランス総合力で突破', cls: 'jjf', isNext: false });
      if (DT.DATA.JJF.finalTurns.includes(t)) out.push({ turn: t, icon: '🏅', name: 'ジャグリング全国大会決勝', sub: '予選突破者のみ・10人で争う', cls: 'jjf', isNext: false });
      if (DT.engine.isMeetupMonth(t)) out.push({ turn: t, icon: '🤝', name: '練習会', sub: 'ルーチン構成・新技が伸びやすい', cls: 'meetup', isNext: false });
    }
    return out;
  }

  function openSchedule() {
    const rows = futureEvents().map(e => {
      const row = el('div', 'event-row ' + e.cls + (e.isNext ? ' next' : ''));
      row.appendChild(el('span', 'event-icon', e.icon));
      const meta = el('div', 'event-meta');
      const away = e.turn - state.turn;
      meta.appendChild(el('div', 'event-when', DT.engine.turnLabel(e.turn) + '（' + (away === 0 ? '今月' : 'あと' + away + 'ヶ月') + '）'));
      meta.appendChild(el('div', 'event-name', (e.isNext ? '🔥 ' : '') + e.name));
      meta.appendChild(el('div', 'event-sub', e.sub));
      row.appendChild(meta);
      if (e.isNext) row.appendChild(el('span', 'event-badge', '次'));
      return row;
    });
    if (rows.length === 0) rows.push(el('div', 'dev-note', '今後の予定はありません。'));
    $('#schedule-list').replaceChildren(...rows);
    $('#schedule-modal').classList.remove('hidden');
  }
  function closeSchedule() { $('#schedule-modal').classList.add('hidden'); }

  // ポイント履歴（大会での獲得記録）モーダル
  function openPoints() {
    const rows = [];
    if (!state.results || state.results.length === 0) {
      rows.push(el('div', 'dev-note', 'まだ大会でのポイント獲得はありません。'));
    } else {
      state.results.slice().reverse().forEach(r => {
        const row = el('div', 'event-row');
        row.appendChild(el('span', 'event-icon', r.type === 'worlds' ? '🌍' : '🏆'));
        const meta = el('div', 'event-meta');
        meta.appendChild(el('div', 'event-when', DT.engine.turnLabel(r.turn) + '・' + contestLabel(r.name)));
        meta.appendChild(el('div', 'event-name', contestLabel(r.divisionLabel) + '　' + r.rank + '位'));
        row.appendChild(meta);
        row.appendChild(el('span', 'event-badge', '+' + r.points + 'pt'));
        rows.push(row);
      });
    }
    $('#points-total').textContent = '通算 ' + totalPoints() + 'pt';
    $('#points-list').replaceChildren(...rows);
    $('#points-modal').classList.remove('hidden');
  }
  function closePoints() { $('#points-modal').classList.add('hidden'); }

  // 記録ログモーダル（各ターンのイベント・ステータス変化を新しい順に表示）
  function openLog() {
    const hist = (state && state.logHistory) || [];
    const rows = [];
    if (hist.length === 0) {
      rows.push(el('div', 'dev-note', 'まだ記録はありません。行動するとここに残ります。'));
    } else {
      hist.slice().reverse().forEach(entry => {
        const box = el('div', 'log-entry');
        box.appendChild(el('div', 'log-entry-turn', DT.engine.turnLabel(entry.turn)));
        entry.messages.forEach(m => box.appendChild(el('div', 'log-entry-msg', m)));
        rows.push(box);
      });
    }
    $('#log-list').replaceChildren(...rows);
    $('#log-modal').classList.remove('hidden');
  }
  function closeLog() { $('#log-modal').classList.add('hidden'); }

  // 個人記録（自己ベスト）モーダル。通算ポイント降順の一覧を表示
  function openRecords() {
    const list = DT.state.loadRecords(undefined, GAME_MODE);
    const rows = [];
    if (!list.length) {
      rows.push(el('div', 'dev-note', 'まだ記録がありません。1周プレイ（卒業/退学）すると記録されます。'));
      $('#records-sub').textContent = '';
    } else {
      $('#records-sub').textContent = '自己ベスト ' + (list[0].totalPoints || 0) + 'pt（' + list.length + '件）';
      list.forEach((r, i) => {
        const row = el('div', 'event-row' + (i === 0 ? ' next' : ''));
        row.appendChild(el('span', 'event-icon', i === 0 ? '👑' : String(i + 1)));
        const meta = el('div', 'event-meta');
        const d = new Date(r.date);
        const dateStr = isNaN(d) ? '' : (d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate());
        meta.appendChild(el('div', 'event-when', (r.name || '主人公') + '・' + (r.background || '') + (dateStr ? '・' + dateStr : '')));
        meta.appendChild(el('div', 'event-name', (r.status === 'retired' ? 'キャリアランク ' : '卒業ランク ') + r.rank + (r.status === 'expelled' ? '（退学）' : (r.status === 'retired' ? '（2年引退）' : '')) + (r.abilityAvg !== undefined ? '／能力' + r.abilityAvg : '')));
        if (r.cardTitle) meta.appendChild(el('div', 'event-cardtitle', '🃏「' + r.cardTitle + '」'));
        row.appendChild(meta);
        row.appendChild(el('span', 'event-badge', (r.totalPoints || 0) + 'pt'));
        rows.push(row);
      });
    }
    $('#records-list').replaceChildren(...rows);
    $('#records-modal').classList.remove('hidden');
  }
  function closeRecords() { $('#records-modal').classList.add('hidden'); }

  // 卒業生名簿（ショート版）: 5人未満は全員、5人以上は次周回に登場する5人を選ぶ。
  function openAlumniRoster() {
    if (!SHORT) return;
    alumniDraftProfile = DT.state.loadAlumniProfile(undefined, GAME_MODE);
    alumniDraftIds = alumniDraftProfile.selectedIds.slice();
    alumniSearchQuery = '';
    $('#alumni-search').value = '';
    renderAlumniRoster();
    $('#alumni-modal').classList.remove('hidden');
  }
  function closeAlumniRoster() {
    $('#alumni-modal').classList.add('hidden');
    alumniDraftProfile = null;
    alumniDraftIds = [];
  }
  function alumniTechniqueLabel(id) {
    return DT.events && DT.events.techniqueLabel ? DT.events.techniqueLabel(id) : id;
  }
  function alumniRosterOrder(profile) {
    const picked = alumniDraftIds.map(id => profile.pool.find(entry => entry.id === id)).filter(Boolean);
    const pickedLookup = {};
    picked.forEach(entry => { pickedLookup[entry.id] = true; });
    const defaults = profile.pool.filter(entry => entry.source === 'default' && !pickedLookup[entry.id]);
    const graduates = profile.pool.filter(entry => entry.source === 'graduate' && !pickedLookup[entry.id])
      .sort((a, b) => (b.graduatedAt || 0) - (a.graduatedAt || 0));
    return picked.concat(defaults, graduates);
  }
  function renderAlumniRoster(message) {
    if (!alumniDraftProfile) return;
    const required = DT.state.requiredAlumniCount(alumniDraftProfile);
    const count = alumniDraftIds.length;
    const poolMax = DT.state.ALUMNI_POOL_MAX;
    $('#alumni-sub').textContent = message || (
      '登場メンバー ' + count + ' / ' + required + '人'
      + (alumniDraftProfile.pool.length >= DT.state.ALUMNI_ACTIVE_MAX ? '（5人必須）' : '（全員）')
      + '　・　保存 ' + alumniDraftProfile.pool.length + ' / ' + poolMax + '人'
    );
    $('#alumni-sub').classList.toggle('cond-warn', !!message);
    const query = alumniSearchQuery.trim().toLowerCase();
    const visibleEntries = alumniRosterOrder(alumniDraftProfile).filter(entry => {
      if (!query) return true;
      return [
        entry.name,
        entry.rank,
        entry.type,
        alumniTechniqueLabel(entry.techniqueId),
        entry.cardTitle
      ].join(' ').toLowerCase().includes(query);
    });
    const rows = visibleEntries.map(entry => {
      const pickedAt = alumniDraftIds.indexOf(entry.id);
      const selected = pickedAt >= 0;
      const row = el('button', 'alumni-roster-row' + (selected ? ' selected' : ''));
      row.type = 'button';
      row.setAttribute('aria-pressed', selected ? 'true' : 'false');
      row.appendChild(el('span', 'alumni-pick', selected ? String(pickedAt + 1) : '＋'));
      const face = el('span', 'alumni-face');
      mountAvatar(face, avatarOf(entry));
      row.appendChild(face);
      const meta = el('span', 'alumni-roster-meta');
      const name = el('span', 'alumni-roster-name', entry.name);
      name.appendChild(el('span', 'alumni-origin ' + entry.source,
        entry.source === 'graduate' ? '育成' : '初期'));
      meta.appendChild(name);
      const detail = '卒業ランク' + entry.rank + '／' + entry.type + '／得意技「' + alumniTechniqueLabel(entry.techniqueId) + '」';
      meta.appendChild(el('span', 'alumni-roster-detail', detail));
      if (entry.source === 'graduate') {
        const achievement = [];
        if (entry.cardTitle) achievement.push('「' + entry.cardTitle + '」');
        if (entry.totalPoints) achievement.push(entry.totalPoints + 'pt');
        if (achievement.length) meta.appendChild(el('span', 'alumni-roster-achievement', achievement.join('・')));
      }
      row.appendChild(meta);
      row.onclick = () => {
        const at = alumniDraftIds.indexOf(entry.id);
        if (at >= 0) {
          if (alumniDraftProfile.pool.length <= required) {
            renderAlumniRoster('卒業生が5人未満の間は、保存されている全員を登場メンバーにします。');
            return;
          }
          if (alumniDraftIds.length <= required - 1) {
            renderAlumniRoster('入れ替える先輩を1人選んで、登場メンバーを5人に戻してください。');
            return;
          }
          alumniDraftIds.splice(at, 1);
        } else {
          if (alumniDraftIds.length >= required) {
            renderAlumniRoster('登場メンバーは5人です。先に入れ替える先輩を1人外してください。');
            return;
          }
          alumniDraftIds.push(entry.id);
        }
        renderAlumniRoster();
      };
      return row;
    });
    if (!rows.length) rows.push(el('div', 'dev-note', '条件に合う卒業生はいません。'));
    $('#alumni-list').replaceChildren(...rows);
    $('#btn-alumni-save').disabled = count !== required;
  }
  function saveAlumniRoster() {
    const result = DT.state.saveAlumniSelection(alumniDraftIds, undefined, GAME_MODE);
    if (!result.ok) {
      renderAlumniRoster(result.reason);
      return;
    }
    // スカウト中だけ、保存した登場メンバーを今回の候補へ即時反映する。
    // 育成開始後に名簿を見た場合は、進行中のactiveAlumniを変更しない。
    if (SHORT && candidate && !$('#screen-create').classList.contains('hidden')) {
      candidate.activeAlumni = DT.state.loadActiveAlumni(undefined, GAME_MODE);
      renderCreateAlumniButton();
    }
    closeAlumniRoster();
  }

  // 設定モーダル（ホーム右下）。リタイア＝セーブ消去してタイトルへ
  function openSettings() {
    renderSettingsMain();
    $('#settings-modal').classList.remove('hidden');
  }
  function closeSettings() { $('#settings-modal').classList.add('hidden'); }
  function renderSettingsMain() {
    const records = el('button', '', '🏅 これまでの記録');
    records.onclick = () => { closeSettings(); openRecords(); };
    const zukan = el('button', '', '📖 カード図鑑');
    zukan.onclick = () => { closeSettings(); openZukan(); };
    const alumni = el('button', '', '🌸 卒業生名簿');
    alumni.onclick = () => { closeSettings(); openAlumniRoster(); };
    const backup = el('button', '', '💾 バックアップ');
    backup.onclick = renderSettingsBackup;
    const retire = el('button', 'retire', 'リタイア（最初から）');
    retire.onclick = renderSettingsConfirm;
    const items = [
      el('p', 'settings-note', 'ゲームの設定'),
      records,
      zukan
    ];
    if (SHORT) items.push(alumni);
    items.push(backup, retire);
    $('#settings-body').replaceChildren(...items);
  }

  // ---- バックアップ（2026-07-16）: 図鑑・記録・卒業生・セーブをJSONで書き出し／復元 ----
  // localStorageはブラウザのデータ削除やiOSのストレージ自動削除で消えるため、その保険。
  function renderSettingsBackup() {
    const b = DT.state.exportBackup();
    const s = b.summary;
    const note = el('p', 'settings-note',
      '図鑑や記録はこの端末のブラウザに保存されています。データ削除などで消えるため、時々バックアップを保存してください。');
    const now = el('p', 'settings-note backup-now',
      '現在のデータ: カード ' + s.cards + '種／記録 ' + s.records + '件' +
      (s.shortCards || s.shortRecords ? '（短縮版: カード ' + s.shortCards + '種／記録 ' + s.shortRecords + '件）' : ''));
    const save = el('button', 'primary', '⬇️ バックアップを書き出す');
    save.onclick = () => {
      const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const p2 = n => String(n).padStart(2, '0');
      a.download = 'diabolo-trainer-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    // 読み込み: ファイル選択→検証→中身を見せて確認→置き換え復元
    const file = el('input', 'backup-file');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.onchange = () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = DT.state.parseBackup(String(reader.result));
        if (!parsed.ok) { renderBackupError(parsed.error); return; }
        renderBackupConfirm(parsed);
      };
      reader.onerror = () => renderBackupError('ファイルを読み込めませんでした');
      reader.readAsText(f);
    };
    const load = el('button', '', '⬆️ バックアップから復元');
    load.onclick = () => file.click();
    const back = el('button', '', '戻る');
    back.onclick = renderSettingsMain;
    $('#settings-body').replaceChildren(note, now, save, load, file, back);
  }

  function renderBackupError(msg) {
    const warn = el('p', 'settings-note cond-warn', '⚠ ' + msg);
    const back = el('button', 'primary', '戻る');
    back.onclick = renderSettingsBackup;
    $('#settings-body').replaceChildren(warn, back);
  }

  function renderBackupConfirm(parsed) {
    const s = parsed.summary;
    const when = parsed.backup.exportedAt ? String(parsed.backup.exportedAt).slice(0, 10) : '不明';
    const info = el('p', 'settings-note',
      'このバックアップ（' + when + '）を復元します。' +
      (s ? '\n内容: カード ' + s.cards + '種／記録 ' + s.records + '件' : ''));
    const warn = el('p', 'settings-note cond-warn',
      '⚠ 現在の図鑑・記録・セーブはすべて上書きされます（合体ではありません）。');
    const yes = el('button', 'retire', 'はい、復元する');
    yes.onclick = () => {
      DT.state.importBackup(parsed.backup);
      const done = el('p', 'settings-note', '✅ 復元しました。タイトルに戻ります。');
      const ok = el('button', 'primary', 'OK');
      ok.onclick = () => { closeSettings(); state = null; initTitle(); };
      $('#settings-body').replaceChildren(done, ok);
    };
    const no = el('button', 'primary', 'やめる');
    no.onclick = renderSettingsBackup;
    $('#settings-body').replaceChildren(info, warn, no, yes);
  }
  function renderSettingsConfirm() {
    const warn = el('p', 'settings-note cond-warn', '本当にリタイアしますか？ 現在のセーブは消え、タイトルに戻ります。');
    const yes = el('button', 'retire', 'はい、リタイアする');
    yes.onclick = () => { closeSettings(); DT.state.clear(undefined, GAME_MODE); state = null; initTitle(); };
    const no = el('button', '', 'やめる');
    no.onclick = renderSettingsMain;
    $('#settings-body').replaceChildren(warn, yes, no);
  }

  // 名前・やる気・ステータス（体力/学力/構成/怪我）・ジャンルバーを1枠に集約した「選手ボード」
  // ジャンル別の習熟バー。ホームの小レーダー4枚（79×69pxで差が読めない）を置き換える。
  // 差分＝先月の行動前(state.prevGenreAvg)からの伸び。レーダーは詳細画面に残す。
  function genreBars(state) {
    const box = el('div', 'gbar-box');
    DT.DATA.GENRES.forEach(function (g) {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const now = DT.contest.genreAvg(state, g.id);
      const row = el('div', 'gbar' + (unlocked ? '' : ' locked'));
      row.appendChild(el('span', 'gbar-label', unlocked ? g.label : '🔒 ' + g.label));
      const gauge = el('div', 'gauge');
      const fill = el('span');
      const target = Math.max(0, Math.min(100, unlocked ? now : 0)) + '%';
      fill.style.width = '0%';
      requestAnimationFrame(function () { fill.style.width = target; });
      gauge.appendChild(fill);
      row.appendChild(gauge);
      row.appendChild(el('span', 'gbar-val num', unlocked ? String(now) : '-'));
      const prev = state.prevGenreAvg ? state.prevGenreAvg[g.id] : undefined;
      const diff = (unlocked && typeof prev === 'number') ? Math.round((now - prev) * 10) / 10 : null;
      if (!unlocked) {
        row.appendChild(el('span', 'gbar-lock', '未解禁'));
      } else if (diff && diff > 0) {
        const up = el('span', 'gbar-up num', '▲' + diff);
        up.setAttribute('aria-label', '先月から' + diff + '上がった');
        row.appendChild(up);
      } else {
        row.appendChild(el('span', 'gbar-flat', '−'));
      }
      box.appendChild(row);
    });
    return box;
  }

  function renderPlayerBoard() {
    const board = $('#home-board');

    // ヘッダー帯（学年月・名前・TURN・ポイント）
    const head = el('div', 'pb-head');
    const hl = el('div', 'pb-head-l');
    hl.appendChild(el('div', 'pb-turn', SHORT
      ? 'SHORT TURN ' + DT.shortMode.playerTurn(state.turn) + ' / ' + DT.shortMode.PLAYER_TURNS
      : 'TURN ' + state.turn + ' / ' + DT.DATA.TOTAL_TURNS));
    hl.appendChild(el('div', 'pb-name', (SHORT
      ? DT.shortMode.periodLabel(state.turn, DT.engine.turnLabel)
      : DT.engine.turnLabel(state.turn)) + '・' + state.name));
    head.appendChild(hl);
    const pt = el('span', 'pt num', totalPoints() + 'pt');
    pt.setAttribute('role', 'button');
    pt.title = 'タップでポイント履歴';
    pt.onclick = openPoints;
    head.appendChild(pt);

    // コンディション行（やる気の顔＋メーター2×2グリッド）
    const moodLabel = DT.engine.motivationLabel(state.motivation);
    const cond = el('div', 'pb-cond');
    const mood = el('div', 'pb-mood');
    const faceEl = el('div', 'mood-face', MOOD_EMOJI[moodLabel] || '🙂');
    const moodKey = heroMoodKey(state, moodLabel);
    mountAvatar(faceEl, avatarOf(state), moodKey);
    mountCharImage(faceEl, heroMoodSrc(moodKey), 'mood-face-img');
    mood.appendChild(faceEl);
    mood.appendChild(el('div', 'mood-label', moodLabel));
    mood.appendChild(el('div', 'mood-note', 'やる気 ' + state.motivation));
    // 覚醒中バッジ（やる気の直下に「覚醒」漢字＋残り月数）
    if (state.awakenTurns > 0) mood.appendChild(el('div', 'mood-awaken', '🔥覚醒 ' + state.awakenTurns + 'ヶ月'));
    cond.appendChild(mood);
    const meters = el('div', 'pb-meters');
    meters.appendChild(meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 }));
    meters.appendChild(meterRow('学力', state.study));
    // 構成（演技構成）はジャンルバーの下に配置。怪我（injuryRisk）はプレイヤー非表示（ロジックは継続）
    cond.appendChild(meters);

    // 学業・定期テストの警告
    const warns = [];
    if (state.study < DT.DATA.STUDY_MIN) {
      warns.push(el('div', 'cond-warn', '⚠ 学業警告中！（学力' + DT.DATA.STUDY_MIN + '未満）'));
    }
    if (DT.DATA.EXAMS.turns.includes(state.turn)) {
      warns.push(el('div', 'cond-warn', '⚠ 今月末は定期テスト！（学力' + DT.DATA.EXAMS.passLine + '以上で合格）'));
    }

    // 技術（ジャンルバー＋詳細リンク）
    const techHead = el('div', 'pb-tech-head');
    techHead.onclick = renderDetail;
    techHead.setAttribute('role', 'button');
    techHead.setAttribute('aria-label', '技術グリッド詳細を開く');
    techHead.appendChild(el('span', 'board-label', '技術'));
    const link = el('button', 'detail-link', '技術グリッド詳細 ▸');
    techHead.appendChild(link);

    // 構成（演技構成）メーターをジャンルバーの下に配置
    const compBox = el('div', 'pb-comp');
    compBox.appendChild(meterRow('構成', state.composition));
    if (state.techniqueCard) {
      compBox.appendChild(el('div', 'notice-effect', '得意技「' + DT.events.techniqueLabel(state.techniqueCard) + '」'));
    }

    board.replaceChildren(head, cond, ...warns, techHead, genreBars(state), compBox);
  }

  // アクションボタンのアイコン画像（絵文字の代わり）。無い種別は絵文字にフォールバック
  const ACTION_ICON = { train: 'train.png', study: 'study.png', rest: 'rest.png', injured: 'injured.png' };
  function bigAction(kind, icon, name, desc, onclick, compact) {
    const b = el('button', 'action-btn ' + kind + (compact ? ' compact' : ''));
    const iconBox = el('span', 'icon');
    if (ACTION_ICON[kind]) {
      const img = el('img');
      img.src = 'assets/icons/' + ACTION_ICON[kind];
      img.alt = name;
      iconBox.classList.add('has-img');
      iconBox.appendChild(img);
    } else {
      iconBox.textContent = icon;
    }
    b.appendChild(iconBox);
    const t = el('span', 't');
    t.appendChild(el('span', 'name', name));
    t.appendChild(el('span', 'desc', desc));
    b.appendChild(t);
    if (!compact) b.appendChild(el('span', 'arrow', '▶'));
    b.onclick = onclick;
    return b;
  }

  // 勉強・休養(療養)を横並びにする2列の行
  function actionRow(a, b) {
    const row = el('div', 'action-row');
    row.appendChild(a);
    row.appendChild(b);
    return row;
  }

  function renderHomeActions() {
    const box = $('#home-actions');
    const study = bigAction('study', '📖', '勉 強', SHORT ? '学力アップ・伸び2倍' : '学力アップ', () => onAction('study'), true);
    if (state.injuredTurns > 0) {
      // 怪我中: 療養のほか、勉強と「ルーチン構成のみ1枠」の練習が可能
      box.replaceChildren(
        el('div', 'cond-warn', '⚠ 怪我中！練習はルーチン構成のみ（1枠）'),
        bigAction('train', '🥢', '練 習', 'ルーチン構成のみ（怪我のため軽め）', openTrainMenu),
        actionRow(study, bigAction('injured', '🩹', '療 養', '怪我を治す', () => onAction('injured'), true))
      );
      return;
    }
    if (state.banTurns > 0) {
      box.replaceChildren(
        el('div', 'cond-warn', '⚠ 補習中！練習禁止（残り' + state.banTurns + 'ヶ月）'),
        actionRow(study, bigAction('rest', '🛌', '休 養', '疲労・怪我を回復', () => onAction('rest'), true))
      );
      return;
    }
    box.replaceChildren(
      bigAction('train', '🥢', '練 習', SHORT ? '3枠を組む・能力の伸び2倍' : '3枠のメニューを組んで技術アップ', openTrainMenu),
      actionRow(study, bigAction('rest', '🛌', '休 養', '疲労・怪我を回復', () => onAction('rest'), true))
    );
  }

  // --- 練習メニュー ---
  function openTrainMenu() {
    renderTrainMenu();
  }

  function firstEmptySlot() { return slotsUI.indexOf(null); }
  // 2つのスロット内容が同じ練習メニューか（ルーチン同士 or ジャンル＆種別が一致）
  function entryEquals(a, b) {
    if (a === 'routine' || b === 'routine') return a === b;
    return !!a && !!b && a.genre === b.genre && a.method === b.method;
  }
  function countSameEntry(entry) {
    return slotsUI.filter(s => s && entryEquals(s, entry)).length;
  }
  function addSlotEntry(entry) {
    const idx = firstEmptySlot();
    if (idx < 0) return;
    if (countSameEntry(entry) >= 2) return; // 同じ練習メニューは2つまで
    slotsUI[idx] = entry;
    justSetSlot = idx;
    renderTrainMenu();
  }

  // ジャンル×内容の表。マスを押すと空き枠へ入る。値は現在の能力値そのもの。
  function renderTrainGrid() {
    const favCard = state.techniqueCard
      ? DT.DATA.TECHNIQUE_CARDS.find(c => c.id === state.techniqueCard) : null;
    const favRules = (favCard && favCard.trainingRules) || [];
    // 得意技が乗るマスと、その補正量。印だけにすると見込みが実際とずれる
    // （例: インテグラル持ちの1DH×高難度技は見込み+2〜8に対し実際+10〜16）ので、必ず量まで出す。
    // ただし見込みの数字には足さない＝1回の練習で1枠にしか乗らないため（同じマスを2枠選んでも1回だけ）。
    const favRuleFor = (genreId, methodId) => favRules.find(r =>
      r.method === methodId && r.genres.indexOf(genreId) >= 0) || null;
    const grid = $('#train-grid');
    const injured = state.injuredTurns > 0;
    const empty = firstEmptySlot();
    const nodes = [];
    // 見出し行
    nodes.push(el('div', 'tg-corner', ''));
    DT.DATA.METHODS.forEach(m => nodes.push(el('div', 'tg-head', m.label)));
    // ジャンル行
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const head = el('div', 'tg-genre' + (unlocked ? '' : ' locked'));
      head.appendChild(el('b', '', unlocked ? g.label : '🔒 ' + g.label));
      head.appendChild(el('small', '', unlocked ? '平均 ' + DT.contest.genreAvg(state, g.id) : '未解禁'));
      nodes.push(head);
      DT.DATA.METHODS.forEach(m => {
        const entry = { genre: g.id, method: m.id };
        const n = countSameEntry(entry);
        const usable = unlocked && !injured && empty >= 0 && n < 2;
        const cell = el('button', 'tg-cell m-' + m.id + (usable ? '' : ' locked') + (n ? ' picked' : ''));
        cell.type = 'button';
        cell.appendChild(el('span', 'tg-val num', String(state.skills[g.id][m.id])));
        let gainText = '';
        let favText = '';
        if (unlocked) {
          const pv = DT.engine.previewGain(state, m.id, state.skills[g.id][m.id]);
          gainText = pv.min === pv.max ? '+' + pv.min : '+' + pv.min + '〜' + pv.max;
          cell.appendChild(el('span', 'tg-gain', gainText));
          const fr = favRuleFor(g.id, m.id);
          if (fr) {
            favText = '得意技' + (fr.amount > 0 ? '+' : '') + fr.amount;
            cell.appendChild(el('span', 'tg-fav' + (fr.amount < 0 ? ' minus' : ''), favText));
          }
        }
        if (n) cell.appendChild(el('span', 'tg-count', '×' + n));
        cell.setAttribute('aria-label', g.label + ' ' + methodActionLabel(m.id) + '（現在 ' + state.skills[g.id][m.id]
          + (unlocked ? '・見込み ' + gainText : '') + (favText ? '・' + favText : '') + '）');
        if (usable) cell.onclick = () => addSlotEntry(entry); else cell.disabled = true;
        nodes.push(cell);
      });
    });
    // ルーチン構成（全幅）
    const rn = countSameEntry('routine');
    const rUsable = empty >= 0 && rn < 2;
    const routine = el('button', 'tg-routine' + (rUsable ? '' : ' locked') + (rn ? ' picked' : ''));
    routine.type = 'button';
    routine.appendChild(el('b', '', 'ルーチン構成'));
    const rPv = DT.engine.previewGain(state, 'routine', state.composition);
    routine.appendChild(el('small', '', '演技構成 ' + state.composition
      + '（' + (rPv.max === 0 ? '円熟の域・練習では伸びない' : '+' + rPv.min + '〜' + rPv.max) + '）・疲労回復'
      + (injured ? '　※怪我中はこれのみ' : '')));
    if (rn) routine.appendChild(el('span', 'tg-count', '×' + rn));
    if (rUsable) routine.onclick = () => addSlotEntry('routine'); else routine.disabled = true;
    nodes.push(routine);
    grid.replaceChildren(...nodes);
  }

  function slotButton(s, idx) {
    if (!s) {
      const d = el('button', 'slot empty', '＋ 空き');
      d.disabled = true;
      return d;
    }
    // 技の種類ごとに背景色を変える（m-<method>／ルーチンはroutine）
    const d = el('button', s === 'routine' ? 'slot filled routine' : 'slot filled m-' + s.method);
    if (s === 'routine') {
      d.appendChild(el('span', 's-genre routine-tag', '構成'));
      d.appendChild(document.createTextNode('ルーチン構成'));
    } else {
      d.appendChild(el('span', 's-genre', genreLabel(s.genre)));
      d.appendChild(document.createTextNode(methodActionLabel(s.method)));
    }
    d.appendChild(el('span', 's-x', '×'));
    d.onclick = () => { slotsUI[idx] = null; renderTrainMenu(); };
    if (idx === justSetSlot) d.classList.add('just-set');
    return d;
  }

  function renderTrainMenu() {
    const mood = DT.engine.motivationLabel(state.motivation);
    const moodMini = el('span', 'mood-mini', MOOD_EMOJI[mood] || '🙂');
    const moodText = el('span', '', ' ' + mood + (SHORT ? '・伸び×2' : ''));
    $('#trainmenu-mood').replaceChildren(moodMini, moodText);
    const moodKey = heroMoodKey(state, mood);
    mountAvatar(moodMini, avatarOf(state), moodKey);
    mountCharImage(moodMini, heroMoodSrc(moodKey), 'mood-mini-img');

    $('#slot-row').replaceChildren(...slotsUI.map(slotButton));
    justSetSlot = -1;
    renderTrainGrid();

    const lastTraining = state.lastTraining;
    const canRepeat = Array.isArray(lastTraining) && lastTraining.length === 3
      && (state.injuredTurns <= 0 || lastTraining.every(s => s === 'routine'));
    const repeat = $('#btn-train-repeat');
    repeat.classList.toggle('hidden', !canRepeat);
    repeat.onclick = canRepeat ? () => {
      slotsUI = JSON.parse(JSON.stringify(state.lastTraining));
      justSetSlot = -1;
      renderTrainMenu();
    } : null;

    const goButton = $('#btn-training-go');
    const slotCount = slotsUI.filter(Boolean).length;
    if (slotCount === 3 && previousSlotCount < 3) {
      goButton.classList.remove('ready-pulse');
      void goButton.offsetWidth;
      goButton.classList.add('ready-pulse');
      goButton.onanimationend = () => {
        goButton.classList.remove('ready-pulse');
        goButton.onanimationend = null;
      };
    } else if (slotCount !== 3) {
      goButton.classList.remove('ready-pulse');
      goButton.onanimationend = null;
    }
    previousSlotCount = slotCount;
    goButton.disabled = slotsUI.some(s => s === null);
    updateDevPanel();
    show('#screen-trainmenu');
  }

  $('#btn-training-go').onclick = () => {
    const slots = slotsUI.map(s => (s === 'routine' ? 'routine' : { genre: s.genre, method: s.method }));
    startTurn('training', slots);
  };

  // --- 練習結果 ---
  // 練習結果の成長対象（能力名）
  function trainTargetLabel(r) {
    return r.slot === 'routine' ? '演技構成' : statLabelById(r.slot.method);
  }

  // 伸びた項目を「前 → 後」のバーで見せる。成果画面で能力の変化まで見えるようにする。
  function growthRow(label, after, gain) {
    const before = Math.max(0, after - gain);
    const row = el('div', 'grow-row');
    const head = el('div', 'grow-head');
    head.appendChild(el('span', 'grow-label', label));
    head.appendChild(el('span', 'grow-delta num', '+' + gain));
    row.appendChild(head);
    const bar = el('div', 'grow-bar');
    const base = el('span', 'grow-base');
    const add = el('span', 'grow-add');
    base.style.width = Math.min(100, before) + '%';
    add.style.width = '0%';
    requestAnimationFrame(() => { add.style.width = Math.min(100 - Math.min(100, before), gain) + '%'; });
    bar.appendChild(base);
    bar.appendChild(add);
    row.appendChild(bar);
    row.appendChild(el('div', 'grow-val num', before + ' → ' + after));
    return row;
  }

  function renderTrainingResult(tr) {
    const screen = $('#screen-training');
    const summary = $('#training-summary');
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timers = new Set();
    const frames = new Set();
    const valueCells = [];
    let finalized = false;
    let totalShown = false;

    screen.classList.remove('rv-done');

    function schedule(fn, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, delay);
      timers.add(timer);
      return timer;
    }

    function requestResultFrame(fn) {
      const frame = requestAnimationFrame(now => {
        frames.delete(frame);
        fn(now);
      });
      frames.add(frame);
      return frame;
    }

    // 上部＝スロットごとの結果。列がぴったり揃うよう1つのグリッドに
    // [メニュー][判定][増分][対象] の順で流し込む
    const grid = el('div', 'train-rows');
    const tierClasses = { '大成功': 'tier-great', '成功': 'tier-success', '普通': 'tier-normal', '失敗': 'tier-fail' };
    tr.results.forEach((r, i) => {
      const fail = r.tier === '失敗';
      const rowDelay = i * 140;
      const stampDelay = rowDelay + 180;
      const menuCell = el('span', 'tr-menu rv-cell', slotChipLabel(r.slot));
      const tierCell = el('span', 'tr-tier rv-cell' + (fail ? ' fail' : ''));
      const stamp = el('span', 'tr-stamp ' + (tierClasses[r.tier] || 'tier-normal'), r.tier);
      const valueCell = el('span', 'tr-val rv-cell', fail ? '—' : '0');
      const targetCell = el('span', 'tr-target rv-cell', trainTargetLabel(r));
      [menuCell, tierCell, valueCell, targetCell].forEach(cell => { cell.style.animationDelay = rowDelay + 'ms'; });
      if (fail) {
        stamp.style.animation = 'rv-stamp-in var(--dur-stamp) var(--ease-stamp) ' + stampDelay + 'ms both, '
          + 'rv-shake 300ms ease-out ' + (stampDelay + 340) + 'ms 1 both';
      } else {
        stamp.style.animationDelay = stampDelay + 'ms';
        valueCells.push({ node: valueCell, value: r.gain, delay: rowDelay + 260 });
      }
      tierCell.appendChild(stamp);
      grid.appendChild(menuCell);
      grid.appendChild(tierCell);
      grid.appendChild(valueCell);
      grid.appendChild(targetCell);
    });
    const slotNodes = [];
    if (tr.outdoor) slotNodes.push(el('div', 'cond-warn', '⚠ 体育館工事のため屋外練習… 伸びが半減しました'));
    slotNodes.push(grid);
    $('#training-slots').replaceChildren(...slotNodes);

    const cellTotals = {};
    let compositionTotal = 0;
    tr.results.forEach(r => {
      if (r.tier === '失敗') return;
      if (r.slot === 'routine') { compositionTotal += r.gain; }
      else {
        const key = r.slot.genre + '.' + r.slot.method;
        cellTotals[key] = (cellTotals[key] || 0) + r.gain;
      }
    });
    const summaryNodes = [];
    Object.keys(cellTotals).forEach(key => {
      if (cellTotals[key] === 0) return;
      const [genre, method] = key.split('.');
      summaryNodes.push(growthRow(genreLabel(genre) + '×' + statLabelById(method),
        state.skills[genre][method], cellTotals[key]));
    });
    if (compositionTotal !== 0) summaryNodes.push(growthRow('演技構成', state.composition, compositionTotal));
    if (summaryNodes.length === 0) summaryNodes.push(el('div', 'cond-warn', '今月は実りが少なかった……'));
    summary.replaceChildren(...summaryNodes);
    summary.classList.remove('rv-in');
    summary.classList.add('rv-wait');

    const totalGrowth = Object.keys(cellTotals).reduce((sum, key) => sum + cellTotals[key], 0) + compositionTotal;
    function revealSummary() {
      summary.classList.remove('rv-wait');
      if (!summary.classList.contains('rv-in')) summary.classList.add('rv-in');
    }
    function revealTotal() {
      if (totalShown || totalGrowth === 0) return;
      totalShown = true;
      summary.appendChild(el('div', 'rv-total num', '📈 今月の伸び 合計 +' + totalGrowth));
    }
    function finalize() {
      if (finalized) return;
      finalized = true;
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      frames.forEach(frame => cancelAnimationFrame(frame));
      frames.clear();
      valueCells.forEach(item => { item.node.textContent = '+' + item.value; });
      revealSummary();
      revealTotal();
      screen.classList.add('rv-done');
    }

    screen.onclick = finalize;

    if (reduceMotion) {
      finalize();
    } else {
      valueCells.forEach(item => {
        schedule(() => {
          const startedAt = performance.now();
          const tick = now => {
            const progress = Math.min(1, (now - startedAt) / 500);
            item.node.textContent = '+' + Math.round(item.value * progress);
            if (progress < 1) requestResultFrame(tick);
          };
          requestResultFrame(tick);
        }, item.delay);
      });
      schedule(() => {
        revealSummary();
        if (totalGrowth !== 0) schedule(revealTotal, 260);
      }, tr.results.length * 140 + 900);
    }

    // その月の練習で変化したパラメーターの数値を記録ログにも残す
    const changeMsgs = [];
    Object.keys(cellTotals).forEach(key => {
      if (cellTotals[key] === 0) return;
      const [genre, method] = key.split('.');
      changeMsgs.push('📈 ' + genreLabel(genre) + '×' + statLabelById(method) + ' +' + cellTotals[key]);
    });
    if (compositionTotal !== 0) changeMsgs.push('📈 演技構成 +' + compositionTotal);

    // 練習の結果として、怪我判定→SNS投稿の順で処理（怪我は練習の直接結果なのでSNSより先）。その後に練習後スロットへ。
    $('#btn-training-ok').onclick = () => {
      finalize();
      pendingMessages.push('練習を終えた。');
      changeMsgs.forEach(m => pendingMessages.push(m));
      const inj = DT.engine.rollInjury(state);
      // 新技開発で大成功した月のみSNS投稿イベントを挟む
      const doSns = () => {
        if (tr.noveltyGreat) {
          showSnsEvent(extra => { if (extra) pendingMessages.push(extra); runPostSlot(); });
        } else {
          runPostSlot();
        }
      };
      if (inj.injured) {
        showInjurySplash(() => { pendingMessages.push(inj.message); doSns(); });
      } else {
        doSns();
      }
    };
    show('#screen-training');
  }

  // 新技開発の大成功で発生: SNSに動画を投稿するか？（投稿=高確率でバズ・低確率で既存技判明）
  function snsClampMot(delta) { state.motivation = Math.max(0, Math.min(100, state.motivation + delta)); }
  function showSnsEvent(onDone) {
    setEventSpeaker('📱 SNS');
    $('#event-text').replaceChildren(el('p', '', '新しい技が大成功！ この技の動画をSNSに投稿する？'));
    const up = el('button', 'primary', '投稿する');
    up.onclick = () => {
      let msg;
      if (Math.random() < DT.DATA.SNS_EVENT.viralChance) {
        snsClampMot(DT.DATA.SNS_EVENT.viralMotivation);
        msg = '🎉 技がバズった！やる気が大きく上がった！';
      } else {
        snsClampMot(-DT.DATA.SNS_EVENT.existingPenalty);
        msg = '💧「それ既出の技だよ」とコメントが…既存の技だった。';
      }
      onDone(msg);
    };
    const no = el('button', '', 'やめておく');
    no.onclick = () => onDone(null);
    $('#event-choices').replaceChildren(up, no);
    show('#screen-event');
  }

  // --- 詳細画面 ---
  function renderDetail() {
    $('#detail-pt').textContent = totalPoints() + 'pt';
    $('#detail-skills').replaceChildren(skillTable(state.skills));
    $('#detail-radar').replaceChildren(skillRadarGrid(state.skills));
    $('#detail-cond').replaceChildren(
      textRow('得意技', state.techniqueCard ? DT.events.techniqueLabel(state.techniqueCard) : 'まだ決まっていない'),
      meterRow('構成', state.composition),
      meterRow('学力', state.study),
      meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 })
    );
    const nextUnlock = DT.contest.nextUnlockTarget(state);
    $('#detail-unlock').textContent = nextUnlock
      ? '🔓 次の解禁: ' + genreLabel(nextUnlock.id) + '（' + genreLabel(nextUnlock.reqGenre) + 'の習熟あと' + nextUnlock.remaining + '）'
      : '🔓 全ジャンル解禁済み！';
    show('#screen-detail');
  }

  // --- ターン実行フロー ---
  // 1ターンの流れ: startTurn → ①練習前スロット(runPreSlot) → ②行動実行(runActionPhase: 練習は怪我・SNS込み)
  //                → ③練習後スロット(runPostSlot: 大会・通常版の固定イベント) → finishTurn
  //   ショート版は奇数月のイベントをrunPreSlotの1枠へ統合。大会は別枠、怪我・SNSは練習の一部（枠外）。
  const pushMsgs = arr => arr.forEach(m => pendingMessages.push(m));
  const MONTH_TRANSITION_MS = 1500;

  function startTurn(actionId, slots) {
    // ホームのジャンルバーに「先月からの伸び」を出すため、行動前の習熟を控える（UXレビュー B3）。
    // 練習だけでなく勉強・休養・療養でも更新する（イベントでの伸びもこの差に含まれる）。
    state.prevGenreAvg = DT.DATA.GENRES.reduce(function (acc, g) {
      acc[g.id] = DT.contest.genreAvg(state, g.id);
      return acc;
    }, {});
    pendingMessages = [];
    pendingActionId = actionId;
    pendingSlots = slots || null;
    if (slots) state.lastTraining = JSON.parse(JSON.stringify(slots));
    pendingSkipAction = false;
    if (SHORT || actionId === 'injured') { runActionPhase(); return; } // ショート版の偶数月と療養ターンは前スロット無し
    runPreSlot();
  }

  function renderConditionalPreEvent(cond) {
    if (cond.choices) { renderEvent(cond, afterPreSlot); return; }
    // 選択肢なしの状態イベント（過労で倒れる）。倒れた場合は当ターンの行動をキャンセル（強制休養）
    const cr = DT.events.applyConditional(state, cond);
    pushMsgs(cr.messages);
    if (cond.id === 'collapse') pendingSkipAction = true;
    showEventNotice(cond.speaker || '💫 できごと', cond.text, cr.messages.slice(1), afterPreSlot);
  }

  // ① 練習前スロット: ショート版は奇数月に1件だけ。通常版は従来どおり最大1件。
  function runPreSlot() {
    if (SHORT) {
      // 早期引退の選択も3年生5月のイベント1枠として扱い、3年生4月には出さない。
      if (state.turn === 26 && !state.retireOfferSeen) {
        renderRetireOffer(pendingMessages, afterPreSlot);
        return;
      }
      const slot = DT.events.shortEventFor(state);
      if (!slot) { afterPreSlot(); return; }
      if (slot.kind === 'scheduled') {
        const sched = slot.event;
        if (sched.choices) { renderEvent(sched, afterPreSlot); return; }
        const sr = DT.events.applyScheduled(state, sched);
        pushMsgs(sr.messages);
        showEventNotice(sched.speaker || '📅 ' + sched.name, sr.messages[0] || sched.text, [], afterPreSlot);
        return;
      }
      if (slot.kind === 'alumni') { renderAlumniEvent(slot.event, afterPreSlot); return; }
      if (slot.kind === 'omikuji') { renderOmikuji(); return; }
      if (slot.kind === 'conditional') { renderConditionalPreEvent(slot.event); return; }
      if (slot.kind === 'char') { renderEvent(slot.event, afterPreSlot); return; }
      const h = DT.events.applyHappening(state, slot.event);
      pushMsgs(h.messages);
      // 話者つきの日常会話なら、名前と顔を出す（顔の解決は setEventSpeaker が PNG→SVG→名前 の順で行う）
      const speakerChar = slot.event.char
        ? DT.DATA.CHARACTERS.find(c => c.id === slot.event.char) : null;
      showEventNotice(speakerChar ? speakerChar.name : '📓 今月のできごと',
        slot.event.text, h.messages.slice(1), afterPreSlot, slot.event.char);
      return;
    }
    if (DT.events.isOmikujiTurn(state.turn)) { renderOmikuji(); return; }
    const cond = DT.events.conditionalEventFor(state);
    if (cond) { renderConditionalPreEvent(cond); return; }
    const ev = DT.events.roll(state);
    if (ev && ev.kind === 'char') { renderEvent(ev.event, afterPreSlot); return; }
    if (ev) { // ハプニング
      const h = DT.events.applyHappening(state, ev.event);
      pushMsgs(h.messages);
      showEventNotice('📓 今月のできごと', ev.event.text, h.messages.slice(1), afterPreSlot);
      return;
    }
    afterPreSlot();
  }

  // 初詣おみくじ（毎年1月の頭・全モード共通）。「引く」で抽選→結果ページ（大吉〜大凶で能力・やる気が上下）→行動へ
  function renderOmikuji() {
    setEventSpeaker('⛩ 初詣');
    $('#event-text').replaceChildren(el('p', '', '新年あけましておめでとう！ 部のみんなと初詣に来た。今年の運勢を占ってみよう。'));
    const b = el('button', 'primary', 'おみくじを引く');
    b.onclick = () => {
      const r = DT.events.drawOmikuji(state);
      pushMsgs(r.messages);
      showEventNotice('⛩ おみくじ「' + r.fortune.label + '」', r.fortune.text, r.messages.slice(1), afterPreSlot);
    };
    $('#event-choices').replaceChildren(b);
    show('#screen-event');
  }

  function afterPreSlot() {
    // ショート版の奇数月はイベント専用。行動を挟まず大会・固定イベントへ進む。
    if (SHORT && DT.shortMode.isEventMonth(state.turn)) {
      runPostSlot();
      return;
    }
    if (pendingSkipAction) {
      // 過労で倒れた→当ターンの行動をスキップ（前ターンのdidTrain/didStudyが残らないようリセット）
      state.didTrain = false;
      state.didStudy = false;
      runPostSlot();
      return;
    }
    runActionPhase();
  }

  // ② 行動実行。練習は結果画面→怪我→SNSの順（renderTrainingResultのOKでrunPostSlotへ）。休養/勉強/療養は即runPostSlot。
  function runActionPhase() {
    if (pendingActionId === 'training') {
      renderTrainingResult(DT.engine.applyTraining(state, pendingSlots));
      return;
    }
    const r = DT.engine.applyAction(state, pendingActionId);
    pushMsgs(r.messages);
    runPostSlot();
  }

  // 選択肢のないイベント/ハプニング/状態イベントを1ページ挟んで表示（OKで続行）。効果の増減も一緒に見せる。
  function showEventNotice(header, text, effectLines, onContinue, charId) {
    setEventSpeaker(header, charId);
    const nodes = [el('p', '', text)];
    (effectLines || []).forEach(m => nodes.push(el('div', 'notice-effect', m)));
    $('#event-text').replaceChildren(...nodes);
    const b = el('button', 'primary', 'OK');
    b.onclick = onContinue;
    $('#event-choices').replaceChildren(b);
    show('#screen-event');
  }

  function onAction(actionId) {
    startTurn(actionId, null);
  }

  // ③ 練習後スロット: 大会（通常大会/世界大会/ジャグリング全国大会）→ 固定イベント の順で1件処理し、無ければターン終了。
  //   ランダム・状態イベントは練習前スロット(runPreSlot)で処理済みなのでここでは扱わない。
  function runPostSlot() {
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    const wc = DT.contest.worldsContestForTurn(state.turn);
    if (wc && DT.contest.worldsQualified(state, state.turn)) {
      pendingContest = wc;
      renderWorldsEntry(wc);
      return;
    }
    // ジャグリング全国大会予選（9月）: 参加するか選ぶ
    const jq = DT.contest.jjfQualifierForTurn(state.turn);
    if (jq) {
      pendingContest = jq;
      renderJjfQualifier(jq);
      return;
    }
    // ジャグリング全国大会決勝（10月）: 予選突破していれば自動で決勝→結果画面
    const jf = DT.contest.jjfFinalForTurn(state.turn);
    if (jf && state.jjfFinalist) {
      state.jjfFinalist = 0;
      const results = DT.contest.runJjfFinal(state, jf);
      finishTurn(pendingMessages, results);
      return;
    }
    // ショート版の固定イベントはrunPreSlotで奇数月の1枠として処理済み。
    const sched = SHORT ? null : DT.events.scheduledEventFor(state);
    if (sched) {
      // 選択肢つきの固定イベント（大会前の緊張・後輩入部・進路の悩み等）はイベント画面へ
      if (sched.choices) {
        renderEvent(sched, () => finishTurn(pendingMessages, null));
        return;
      }
      const sr = DT.events.applyScheduled(state, sched);
      // 固定イベントはホーム画面の上にポップアップで通知（afterTurnでホーム描画後に表示）
      pendingScheduledPopup = { sched: sched, effects: sr.messages };
      finishTurn(pendingMessages.concat(sr.messages), null);
      return;
    }
    finishTurn(pendingMessages, null);
  }

  // 台湾合宿「行く」で低確率発生するコミカルな追加結果（別イベント画面にはしない）。
  const TAIWAN_TOILET_CHANCE = 0.5;

  // イベント(選択肢あり)を表示。解決後にonDone()を呼ぶ（練習前スロット→行動 / 練習後スロット→ターン終了 を継続）。
  function renderEvent(event, onDone) {
    // speaker指定があれば優先（CHARACTERSに居ない一度きりのゲストNPC用。例: 斉藤会長）
    const chara = DT.DATA.CHARACTERS.find(c => c.id === event.char);
    setEventSpeaker(event.speaker || (chara ? chara.name : ''), event.char);
    $('#event-text').replaceChildren(el('p', '', event.text));
    const buttons = event.choices.map((c, i) => {
      const b = el('button', i === 0 ? 'primary' : '', c.label);
      b.onclick = () => {
        // 覚醒のきざし: 通常のapplyChoice(既読管理)を通さず専用処理（50%成功／失敗でやる気-10）
        if (event.awakenTrigger) { handleAwakenChoice(event, i, onDone); return; }
        const r = DT.events.applyChoice(state, event, i);
        const messages = r.messages.slice();
        // 台湾合宿の珍事件は、同月に2件目のイベントを出さず「台湾合宿」の結果へ統合する。
        if (event.id === 'taiwan_camp' && i === 0 && Math.random() < TAIWAN_TOILET_CHANCE) {
          const extra = DT.events.applyConditional(state, {
            id: 'taiwan_toilet',
            text: '宿舎のトイレが詰まる珍事件も起きた。言葉が通じない焦りの中で走り回り、極限の集中から難しい技への感覚が研ぎ澄まされた。',
            effects: { motivation: -20, stat: { id: 'difficulty', amount: 4 } }
          });
          messages[0] += ' ' + extra.messages[0];
          messages.push(...extra.messages.slice(1));
        }
        // 選択の結果（結果文＋効果）を専用ページで表示してから続行（ログだけにしない）
        const header = event.speaker || (chara ? chara.name : '結果');
        showEventNotice(header, messages[0], messages.slice(1), () => { pushMsgs(messages); onDone(); }, event.char);
      };
      return b;
    });
    $('#event-choices').replaceChildren(...buttons);
    show('#screen-event');
  }

  function renderAlumniEvent(event, onDone) {
    setEventSpeaker(event.speaker, null, avatarOf(event.alumni));
    const technique = DT.events.techniqueLabel(event.alumni.techniqueId);
    const rank = event.rankBonus || DT.events.alumniRankBonus(event.alumni);
    $('#event-text').replaceChildren(
      el('p', '', event.text),
      el('div', 'notice-effect', '卒業ランク' + rank.rank + '／' + event.alumni.type + '／得意技「' + technique + '」'),
      el('div', 'notice-effect alumni-rank-effect',
        'ランク補正：成功率 +' + Math.round(rank.chance * 100) + '%／成功時 やる気 +' + rank.motivation)
    );
    const buttons = event.choices.map((choice, i) => {
      const b = el('button', i === 0 ? 'primary' : '', choice.label);
      b.onclick = () => {
        const result = DT.events.applyAlumniChoice(state, event, i);
        showEventNotice(event.speaker, result.messages[0], result.messages.slice(1), () => {
          pushMsgs(result.messages);
          onDone();
        });
      };
      return b;
    });
    $('#event-choices').replaceChildren(...buttons);
    show('#screen-event');
  }

  // 覚醒のきざしイベントの選択処理。「波に乗る」=50%で覚醒モード開始／失敗はやる気-20（再到達を遅らせ頻発を防ぐ）。「落ち着く」=やる気小減。onDoneで続行。
  const AWAKEN_FAIL_MOT = 20;
  function handleAwakenChoice(event, i, onDone) {
    const choice = event.choices[i];
    if (choice.awaken) {
      if (Math.random() < 0.5) {
        const dur = DT.events.startAwakening(state);
        const mult = DT.events.awakenConf(state).mult; // 標準1.5 / ハード(大学から)2.0
        const line = '✨ 覚醒モードに入った！（今後' + dur + 'ヶ月間、練習・イベントでの能力の伸びが' + mult + '倍）';
        showAwakenSplash(() => showEventNotice('✨ 覚醒', '波に完全に乗った——感覚が研ぎ澄まされ、覚醒モードに入った！',
          ['今後' + dur + 'ヶ月間 能力の伸び ×' + mult], () => { pendingMessages.push(line); onDone(); }));
      } else {
        state.motivation = Math.max(0, state.motivation - AWAKEN_FAIL_MOT);
        showEventNotice('✨ 覚醒のきざし', '波に乗ろうとしたが、力が入りすぎて呑まれてしまった……惜しくも覚醒には至らなかった。反動でどっと気持ちが萎えた。',
          ['やる気 -' + AWAKEN_FAIL_MOT], () => { pendingMessages.push('覚醒に失敗… やる気 -' + AWAKEN_FAIL_MOT); onDone(); });
      }
    } else {
      const d = choice.declineMot || 0;
      if (d) state.motivation = Math.max(0, Math.min(100, state.motivation + d));
      const effectLines = d ? ['やる気 ' + d] : [];
      showEventNotice('✨ 覚醒のきざし', choice.result, effectLines, () => { if (d) pendingMessages.push('やる気 ' + d); onDone(); });
    }
  }

  // 全画面エフェクトを一度ドンと表示（タップ or 約1.4秒で続行）。variant='' 覚醒(金) / 'injury' 怪我(赤)
  function playSplash(word, variant, onDone) {
    const s = $('#awaken-splash');
    s.querySelector('.awaken-word').textContent = word;
    s.classList.remove('hidden', 'play', 'injury');
    if (variant) s.classList.add(variant);
    void s.offsetWidth; // アニメ再生をリスタート
    s.classList.add('play');
    let done = false;
    const finish = () => { if (done) return; done = true; s.onclick = null; s.classList.add('hidden'); onDone(); };
    s.onclick = finish;
    setTimeout(finish, 1400);
  }
  function showAwakenSplash(onDone) { playSplash('覚醒！', '', onDone); }
  function showInjurySplash(onDone) { playSplash('怪我！', 'injury', onDone); }

  // 人気者イベント: OIDC/AJDCで「3位以内 かつ その部門の新奇性が90超」の部門があれば発火。
  //   ※本来は対戦相手の新奇性スコアと比べて"トップ"だが、相手の項目別スコアはゲーム内に無いため代替条件=新奇性>90。
  //   ★1ゲームで最大1回のみ（state.popularitySeenで管理）。効果はstateに適用し、複数部門で成立したら数値を部門数ぶん重ねる。
  function evaluatePopularity(state, results) {
    const type = results[0] && results[0].type;
    if (type !== 'oidc' && type !== 'ajdc') return null;
    if (state.popularitySeen) return null; // 既に一度発生していれば起きない
    const clamp01 = v => Math.max(0, Math.min(100, v));
    const avg = id => DT.DATA.GENRES.reduce((a, g) => a + state.skills[g.id][id], 0) / DT.DATA.GENRES.length;
    const noveltyTop = r => {
      if (r.division === 'overall') return avg('novelty') > 90;
      const c = state.skills[r.division];
      return c && c.novelty > 90;
    };
    const qualifying = results.filter(r => r.rank <= 3 && noveltyTop(r));
    if (qualifying.length === 0) return null;
    state.popularitySeen = true; // 発火＝以降は二度と起きない

    const n = qualifying.length;
    state.motivation = clamp01(state.motivation + 5 * n); // やる気 +5 ×部門数
    const effectLines = ['やる気 +' + (5 * n)];
    qualifying.forEach(r => {
      if (r.division === 'overall') {
        DT.DATA.GENRES.forEach(g => { state.skills[g.id].control = clamp01(state.skills[g.id].control + 3); });
        effectLines.push('全ジャンル×操作安定度 +3');
      } else {
        state.skills[r.division].control = clamp01(state.skills[r.division].control + 3);
        effectLines.push(genreLabel(r.division) + '×操作安定度 +3');
      }
    });
    const divs = qualifying.map(r => contestLabel(r.divisionLabel)).join('・');
    const text = '大会後、「その技どうやるんですか！？」と質問攻めに！ 新奇性が評価され、一躍人気者になった。（' + divs + '）';
    return { text: text, effectLines: effectLines, count: n };
  }

  function finishTurn(messages, contestResults) {
    const end = DT.engine.endTurn(state);
    const logs = messages.concat(end.events);
    // このターンの記録を履歴に残す（endTurnでturnは進んでいるので完了ターン=state.turn-1）。あとから見返せるように保存
    const histMsgs = logs.slice();
    pendingPopularity = null;
    if (contestResults && contestResults.length) {
      contestResults.forEach(r => {
        const pts = r.points ? '・+' + r.points + 'pt' : '';
        const nums = (r.entrants ? '位/' + r.entrants + '人' : '位') + '（' + r.score + '点' + pts + '）';
        histMsgs.push('🏆 ' + contestLabel(r.name) + '　' + contestLabel(r.divisionLabel) + '　' + r.rank + nums);
      });
      // 人気者イベント（確定発火）。ショート版は同月2件目にせず、効果とログだけ大会結果へ統合する。
      pendingPopularity = evaluatePopularity(state, contestResults);
      if (pendingPopularity) {
        histMsgs.push('🌟 人気者になった！', ...pendingPopularity.effectLines);
        if (SHORT) logs.push('🌟 人気者になった！', ...pendingPopularity.effectLines);
      }
    }
    if (histMsgs.length) {
      state.logHistory = state.logHistory || [];
      state.logHistory.push({ turn: state.turn - 1, messages: histMsgs });
    }
    DT.state.save(state);
    // state.turnはendTurnで次月へ進んでいる。結果画面の確認後に、次月表示を一度だけ挟む。
    pendingMonthTransition = state.status === 'playing';
    pendingContest = null;
    pendingMessages = [];
    // 怪我判定は練習直後(rollInjury)に移したため、ここでは分岐不要
    if (contestResults) {
      pendingLogs = logs;
      renderContestResults(contestResults);
    } else {
      afterTurn(logs);
    }
  }

  function afterTurn(logs) {
    if (state.status !== 'playing') { renderEnding(); return; }
    if (pendingMonthTransition) {
      pendingMonthTransition = false;
      showMonthTransition(state.turn, () => afterTurn(logs));
      return;
    }
    // 偶数月の行動後は、そのまま次の奇数月をイベント専用月として自動処理する。
    // セーブから奇数月を再開した場合も、行動画面を出さず同じ経路へ戻す。
    if (SHORT && DT.shortMode.isEventMonth(state.turn)) {
      pendingMessages = [];
      pendingActionId = null;
      pendingSlots = null;
      pendingSkipAction = false;
      runPreSlot();
      return;
    }
    // 通常版は従来どおり3年生4月、ショート版は次の奇数月（5月）のイベント枠で提示する。
    if (!SHORT && state.turn === 25 && !state.retireOfferSeen) { renderRetireOffer(logs); return; }
    renderHomeWithPopups(logs);
  }

  function monthTransitionSub(turn) {
    if (SHORT) {
      return DT.shortMode.isEventMonth(turn)
        ? 'EVENT MONTH · 部の仲間とできごとが進む'
        : 'PRACTICE MONTH · 何を伸ばすか決めよう';
    }
    return 'NEXT MONTH · 育成を続けよう';
  }

  // ---- 切替演出のディアボロ（TIDCローディングへのオマージュ・2026-08-01） ----
  // 東京国際ディアボロ大会(TIDC)のサイトのローダーは「2本のスティックと1本の紐に複数のディアボロが乗り、
  // 低フレームのコマ撮り調で回り続ける」線画だった。その"装置と間合い"を自分の絵柄で描き直している
  // （素材・コードは複製せず、形もカクつきの周期もこのファイルで独自に組み立てている）。
  // 個数は学年連動（1年生=1個…4年生=4個）。学年はturnLabelと同じ式で出し、表示中の「N年生」と必ず一致させる。
  const MONTH_TRANSITION_MAX_DIABOLO = 4;
  const MT_FRAMES = 7;        // TIDCのGIFと同じ7コマ
  const MT_FRAME_MS = 100;    // 1コマ100ms（0.7秒で一巡）＝あのカクカクした間合い
  const MT_VIEW = { w: 200, h: 74 };
  let monthTransitionFrameTimer = null;

  // fコマ目・n個ぶんの配置を返す（純粋な計算。描画はrenderMonthTransitionSceneが行う）
  function monthTransitionPose(n, f) {
    const tipL = { x: 26, y: 24 }, tipR = { x: 174, y: 24 }; // スティックの先端
    const scale = [1, .9, .78, .68][n - 1] || .68;
    const spanL = 54, spanR = 146;
    const dia = [];
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 100 : Math.round(spanL + (spanR - spanL) * (i / (n - 1)));
      // 空中の1個は順番に入れ替わる（投げ上げているように見せる）。1個のときは常に紐の上
      const airborne = n > 1 && (f % n) === i;
      const wave = Math.round(Math.sin((f + i * 1.7) * 0.9) * 4);
      // 紐に乗っている分は互い違いに沈ませ、TIDCのようなジグザグの紐にする
      const zig = (i % 2 === 0) ? 6 : -6;
      dia.push({ x: x, y: airborne ? 16 + Math.round(wave / 2) : 52 + zig + wave, scale: airborne ? scale * 1.05 : scale, airborne: airborne });
    }
    // 紐は「左スティック→紐に乗っているディアボロ→右スティック」を順につなぐ
    const onString = dia.filter(d => !d.airborne);
    const points = [tipL].concat(onString.map(d => ({ x: d.x, y: d.y }))).concat([tipR]);
    return { tipL: tipL, tipR: tipR, dia: dia, points: points };
  }

  // 描画には既存の svgEl(tag, attrs, children) を使う（レーダーチャートと共用）
  function renderMonthTransitionScene(box, n, f) {
    const p = monthTransitionPose(n, f);
    const svg = svgEl('svg', { viewBox: '0 0 ' + MT_VIEW.w + ' ' + MT_VIEW.h, class: 'mt-svg' });
    // スティック2本（持ち手側に小さなフックを付ける）＋紐
    [[p.tipL, -1], [p.tipR, 1]].forEach(([tip, dir]) => {
      svg.appendChild(svgEl('path', {
        class: 'mt-stick',
        d: 'M' + (tip.x + dir * 7) + ' ' + (tip.y + 36) + ' L' + tip.x + ' ' + tip.y +
           ' l' + (dir * -9) + ' -3'
      }));
    });
    svg.appendChild(svgEl('polyline', { class: 'mt-string', points: p.points.map(q => q.x + ',' + q.y).join(' ') }));
    // ディアボロ（うちの絵柄のまま: 左右のカップ＋中央軸）
    p.dia.forEach(d => {
      const g = svgEl('g', { class: 'mt-dia' + (d.airborne ? ' is-air' : ''), transform: 'translate(' + d.x + ' ' + d.y + ') scale(' + d.scale + ')' });
      g.appendChild(svgEl('path', { class: 'mt-cup', d: 'M-15 -11 L-4 0 L-15 11 Z' }));
      g.appendChild(svgEl('path', { class: 'mt-cup', d: 'M15 -11 L4 0 L15 11 Z' }));
      g.appendChild(svgEl('rect', { class: 'mt-axle', x: -4, y: -3.5, width: 8, height: 7, rx: 2.5 }));
      svg.appendChild(g);
    });
    box.replaceChildren(svg);
  }

  // ---- 切替演出のキャラクター（自作のねんどろいど風部員・2026-08-08） ----
  // 絵は「ディアボロを持って回している1枚絵」で、部品に分けず1つのまとまりとして扱う。
  // 動きは上のコマ撮り（7コマ×100ms）に乗せ、左右へ小さく揺れるだけにする。関節は動かさない。
  // 並ぶ人数は学年連動（1年生=1人…4年生=4人）でディアボロ個数の考え方をそのまま引き継ぐ。
  // 素材が未配置・読み込み失敗のときは、従来のスティック＋紐のSVG装置へ自動で戻す。
  // 4枚揃うまではキャラに切り替えない（2026-08-09 決定）。1〜2年はキャラ・3年から装置、と
  // プレイ中に演出が入れ替わって見えるため。performer-4.png が置かれた時点で自動的に切り替わる。
  // 素材ごと止めたいときは false にする（画像を一切取りに行かなくなる）。
  const MT_CHARS_ENABLED = true;
  const MT_CHAR_SRC = [1, 2, 3, 4].map(n => 'assets/loader/performer-' + n + '.png');
  const MT_CHAR_SCALE = [1, .92, .82, .72];
  // 7コマぶんの揺れ。左右の往復1周期を等間隔で刻む（値はpxと度）
  const MT_SWAY = [
    { x: 0, r: 0 }, { x: 2.5, r: 2 }, { x: 3.5, r: 3 }, { x: 2.5, r: 2 },
    { x: 0, r: 0 }, { x: -2.5, r: -2 }, { x: -3.5, r: -3 }
  ];
  const mtCharReady = MT_CHAR_SRC.map(() => false);
  let mtCharNodes = null;

  // 起動時に先読みする。1枚目が無ければそこで打ち切り、素材未配置のときの404を1件に抑える。
  // 失敗は「使えない」として扱うだけで、例外にはしない。
  (function preloadMonthTransitionCharacters(i) {
    if (!MT_CHARS_ENABLED || i >= MT_CHAR_SRC.length) return;
    const img = new Image();
    img.onload = () => { mtCharReady[i] = true; preloadMonthTransitionCharacters(i + 1); };
    img.src = MT_CHAR_SRC[i];
  })(0);

  // 4枚すべて揃っているときだけキャラ表示にする。
  // 学年ぶんだけ揃っていれば出す作りにすると、1〜2年はキャラ・3年からは装置と
  // プレイ中に演出が入れ替わって見えるため、揃うまでは従来の装置で通す（2026-08-09 決定）。
  function monthTransitionCharsReady() {
    return mtCharReady.every(Boolean);
  }

  // 画像は毎コマ作り直さず、最初に組んでから transform だけを差し替える
  function buildMonthTransitionCharacters(box, n) {
    const row = el('div', 'mt-chars');
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img');
      img.className = 'mt-char';
      img.src = MT_CHAR_SRC[i];
      img.alt = '';
      img.decoding = 'async';
      row.appendChild(img);
      nodes.push(img);
    }
    box.replaceChildren(row);
    return nodes;
  }

  function applyMonthTransitionSway(nodes, n, f) {
    const scale = MT_CHAR_SCALE[n - 1] || MT_CHAR_SCALE[MT_CHAR_SCALE.length - 1];
    nodes.forEach((img, i) => {
      // 人ごとにコマをずらし、全員が同時に同じ向きへ倒れないようにする
      const sway = MT_SWAY[(f + i * 2) % MT_FRAMES];
      img.style.transform =
        'translateX(' + sway.x + 'px) rotate(' + sway.r + 'deg) scale(' + scale + ')';
    });
  }

  function stopMonthTransitionFrames() {
    if (monthTransitionFrameTimer) { clearInterval(monthTransitionFrameTimer); monthTransitionFrameTimer = null; }
  }

  function renderMonthTransitionDiabolo(turn) {
    const box = $('#month-transition-diabolo');
    if (!box) return;
    const year = Math.min(MONTH_TRANSITION_MAX_DIABOLO, Math.max(1, Math.ceil(turn / 12)));
    const useChars = monthTransitionCharsReady();
    box.dataset.count = String(year);
    box.classList.toggle('has-chars', useChars);
    stopMonthTransitionFrames();
    mtCharNodes = null;
    let f = 0;
    if (useChars) {
      mtCharNodes = buildMonthTransitionCharacters(box, year);
      applyMonthTransitionSway(mtCharNodes, year, f);
    } else {
      renderMonthTransitionScene(box, year, f);
    }
    // 動きを減らす設定のときは1コマ目で静止させる
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    monthTransitionFrameTimer = setInterval(() => {
      f = (f + 1) % MT_FRAMES;
      if (mtCharNodes) applyMonthTransitionSway(mtCharNodes, year, f);
      else renderMonthTransitionScene(box, year, f);
    }, MT_FRAME_MS);
  }

  function showMonthTransition(turn, onDone) {
    const overlay = $('#month-transition');
    clearTimeout(monthTransitionTimer);
    renderMonthTransitionDiabolo(turn);
    $('#month-transition-label').textContent = DT.engine.turnLabel(turn);
    $('#month-transition-sub').textContent = monthTransitionSub(turn);
    overlay.classList.remove('hidden', 'is-active');
    overlay.setAttribute('aria-hidden', 'false');
    // 同じクラスの連続表示でもプログレスアニメーションを先頭から再生する。
    void overlay.offsetWidth;
    overlay.classList.add('is-active');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(monthTransitionTimer);
      stopMonthTransitionFrames();
      overlay.onclick = null;
      overlay.classList.remove('is-active');
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      onDone();
    };
    overlay.onclick = finish;
    monthTransitionTimer = setTimeout(finish, MONTH_TRANSITION_MS);
  }

  function renderHomeWithPopups(logs) {
    renderHome(logs);
    // ホーム描画後に、保留中の定期イベントをポップアップ表示。無ければ覚醒終了通知（同じ枠を使うので同時は次ターンへ持ち越し）
    if (pendingScheduledPopup) {
      showScheduledPopup(pendingScheduledPopup);
      pendingScheduledPopup = null;
    } else if (state.awakenEndPending) {
      state.awakenEndPending = false;
      DT.state.save(state); // 通知済みを保存に反映（リロードで再表示しない）
      showAwakenEndPopup();
    }
  }

  // ---- 早期引退（改善プラン#4）: 2年AJDC後に「競技を続ける／区切りをつける」を選ぶ ----
  // 引退するとstatus='retired'（退学とは別扱い）で即エンディング＝現時点の実績でカード化。
  // E/Dランクのカード回収が「わざと弱く4年遊ぶ」苦行にならないための自然な導線。
  function renderRetireOffer(logs, onContinue) {
    const e = DT.ending.evaluate(state);
    const top = DT.cards.pickCandidates(Object.assign({}, state, { status: 'retired' }))[0];
    setEventSpeaker('🌸 3年生の春');
    const info = el('div', 'retire-info');
    info.appendChild(el('div', 'retire-info-head', '📈 いま区切りをつけた場合の評価'));
    info.appendChild(el('div', '', 'キャリアランク ' + e.rank + '／タイプ ' + top.typeLabel));
    info.appendChild(el('div', '', '🃏 カード「' + top.title + '」'));
    $('#event-text').replaceChildren(
      el('p', '', '2年間、ディアボロに打ち込んできた。ここから先の2年をどう使うかは自分次第だ。このまま競技を続けるか、それとも——。'),
      info
    );
    const cont = el('button', 'primary', '🔥 競技を続ける（4年生まで）');
    cont.onclick = () => {
      state.retireOfferSeen = true;
      DT.state.save(state); // リロードで再提案しない
      if (onContinue) onContinue();
      else renderHomeWithPopups(logs);
    };
    const retire = el('button', '', '🌅 ここで競技生活に区切りをつける');
    retire.onclick = () => renderRetireConfirm(logs, onContinue);
    $('#event-choices').replaceChildren(cont, retire);
    show('#screen-event');
  }

  function renderRetireConfirm(logs, onContinue) {
    setEventSpeaker('🌅 本当に区切りをつける？');
    $('#event-text').replaceChildren(
      el('p', '', '引退すると3〜4年生はプレイせず、いまの実績でエンディングになる。この決断は取り消せない。')
    );
    const yes = el('button', 'retire', '引退してエンディングへ');
    yes.onclick = () => {
      state.retireOfferSeen = true;
      state.status = 'retired';
      DT.state.save(state);
      renderEnding();
    };
    const no = el('button', 'primary', 'やっぱり続ける');
    no.onclick = () => renderRetireOffer(logs, onContinue);
    $('#event-choices').replaceChildren(no, yes);
    show('#screen-event');
  }

  // 覚醒状態が終わったことを知らせるポップアップ（定期イベントと同じ#sched-popup枠を流用）
  function showAwakenEndPopup() {
    $('#sched-title').textContent = '✨ 覚醒 終了';
    $('#sched-body').replaceChildren(el('p', 'popup-text', '研ぎ澄まされていた感覚が、すっと引いていった。覚醒状態が終わった。'));
    $('#sched-ok').onclick = () => $('#sched-popup').classList.add('hidden');
    $('#sched-popup').classList.remove('hidden');
  }

  function showScheduledPopup(p) {
    $('#sched-title').textContent = '🎉 ' + (p.sched.name || 'イベント');
    const body = [el('p', 'popup-text', p.sched.text)];
    // 効果メッセージは本文(sched.text)を含むことがあるので、重複部分を除いた効果だけを表示
    (p.effects || []).forEach(m => {
      let effect = m;
      if (p.sched.text && effect.indexOf(p.sched.text) === 0) {
        effect = effect.slice(p.sched.text.length).replace(/^[（(]|[）)]$/g, '').trim();
      }
      if (effect) body.push(el('p', 'popup-effect', effect));
    });
    $('#sched-body').replaceChildren(...body);
    $('#sched-ok').onclick = () => $('#sched-popup').classList.add('hidden');
    $('#sched-popup').classList.remove('hidden');
  }

  // --- 演技方針（改善プラン#1）: 大会ごとに1回選び全部門共通。エントリー画面で選択 ---
  let entryPolicy = 'normal';
  // その部門で使われる自分の値。エントリー画面で「どこに出れば勝負になるか」を部門ボタンだけで判断できるようにする。
  // 採点の実装（contest.js）と同じ参照先: specialist=そのジャンルの習熟／overall・technical=4ジャンル平均／performance=演技構成
  function divisionSelfValue(divisionId) {
    const div = DT.DATA.DIVISIONS.find(d => d.id === divisionId);
    const avgAll = () => Math.round(
      DT.DATA.GENRES.reduce((a, g) => a + DT.contest.genreAvg(state, g.id), 0) / DT.DATA.GENRES.length * 10) / 10;
    if (!div) return null;
    if (div.scoring === 'overall') return { value: avgAll(), note: '4ジャンル平均' };
    if (div.scoring === 'technical') return { value: avgAll(), note: '12項目の平均' };
    if (div.scoring === 'performance') return { value: state.composition, note: '演技構成' };
    return { value: DT.contest.genreAvg(state, divisionId), note: genreLabel(divisionId) + 'の習熟' };
  }

  function policySelector() {
    entryPolicy = 'normal'; // 大会ごとにリセット（引きずらない）
    const wrap = el('div', 'policy-box');
    wrap.appendChild(el('div', 'board-label', '演技方針（全部門共通）'));
    const row = el('div', 'policy-row');
    const hint = el('div', 'policy-hint');
    const pols = DT.DATA.POLICIES;
    const btns = {};
    Object.keys(pols).forEach(id => {
      const p = pols[id];
      const b = el('button', 'policy-btn' + (id === entryPolicy ? ' selected' : ''));
      b.appendChild(el('span', 'policy-icon', p.icon));
      b.appendChild(el('span', 'policy-label', p.short || p.label));
      b.appendChild(el('span', 'policy-sub', p.sub || ''));
      b.onclick = () => {
        entryPolicy = id;
        Object.values(btns).forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        hint.textContent = p.hint;
      };
      btns[id] = b;
      row.appendChild(b);
    });
    hint.textContent = pols[entryPolicy].hint;
    wrap.appendChild(row);
    wrap.appendChild(hint);
    return wrap;
  }

  // --- 世界大会 出場選択 ---
  function renderWorldsEntry(wc) {
    $('#entry-title').textContent = wc.name + ' 出場権獲得！';
    $('#entry-hint').textContent = '直近1年の優勝実績により出場できます。相手は世界トップレベル（王者・魁人も出場）。' +
      (state.injuredTurns > 0 ? '　⚠ 怪我の影響でミス率+15%！' : '');
    const enter = el('button', 'primary', '出場する');
    enter.onclick = () => {
      const results = DT.contest.runAll(state, pendingContest, ['overall'], null, entryPolicy);
      finishTurn(pendingMessages, results);
    };
    const skip = el('button', '', '見送る');
    // 世界大会は練習後スロット。ランダム/状態イベントは練習前スロットで処理済みなので、見送り時はそのままターン終了。
    skip.onclick = () => { finishTurn(pendingMessages, null); };
    const selfLine = el('div', 'entry-selfline');
    selfLine.appendChild(el('span', '', 'あなた: 4ジャンル平均 '));
    selfLine.appendChild(el('span', 'num', String(divisionSelfValue('overall').value)));
    selfLine.appendChild(el('span', '', '　演技構成 '));
    selfLine.appendChild(el('span', 'num', String(state.composition)));
    $('#entry-divisions').replaceChildren(selfLine, policySelector(), enter, skip);
    $('#btn-entry-go').classList.add('hidden');
    show('#screen-entry');
  }

  // --- ジャグリング全国大会予選（9月）: 参加/不参加を選ぶ ---
  function renderJjfQualifier(jq) {
    $('#entry-title').textContent = jq.name + '（9月）';
    $('#entry-hint').textContent = 'ジャグリング全国大会に挑戦しますか？ 全パラメータがバランス良く高いほど予選を突破できます。';
    const join = el('button', 'primary', '参加する');
    join.onclick = () => {
      const q = DT.contest.jjfQualify(state);
      const msgs = [];
      if (q.passed) {
        state.motivation = Math.max(0, Math.min(100, state.motivation + DT.DATA.JJF.passMotivation));
        state.jjfFinalist = 1;
        // 決勝進出ポイント(+10)を記録（決勝の追加ポイントは決勝側で付与）
        state.results.push({ name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'ジャグリング全国大会予選突破', rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn, standings: [], rivalMessages: [] });
        msgs.push('ジャグリング全国大会予選突破！ 決勝進出（+' + DT.DATA.JJF.finalistPoints + 'pt・やる気アップ）');
        showJjfResult(q, () => finishTurn(pendingMessages.concat(msgs), null));
      } else {
        // 敗退: 専用ページは出すが理由は書かず簡潔に。やる気だけ下げる
        state.motivation = Math.max(0, state.motivation - 8);
        msgs.push('ジャグリング全国大会予選敗退… やる気が下がった。');
        showEventNotice('💧 ジャグリング全国大会予選 敗退', '予選敗退……', ['やる気 -8'], () => finishTurn(pendingMessages.concat(msgs), null));
      }
    };
    const skip = el('button', '', '参加しない');
    skip.onclick = () => finishTurn(pendingMessages, null);
    const selfLine = el('div', 'entry-selfline');
    selfLine.appendChild(el('span', '', 'あなた: 4ジャンル平均 '));
    selfLine.appendChild(el('span', 'num', String(divisionSelfValue('overall').value)));
    selfLine.appendChild(el('span', '', '　演技構成 '));
    selfLine.appendChild(el('span', 'num', String(state.composition)));
    $('#entry-divisions').replaceChildren(selfLine, join, skip);
    $('#btn-entry-go').classList.add('hidden');
    show('#screen-entry');
  }

  // ジャグリング全国大会予選の結果をポップアップ表示（sched-popupを流用）
  function showJjfResult(q, onDone) {
    $('#sched-title').textContent = q.passed ? '🎉 ジャグリング全国大会予選 突破！' : '💧 ジャグリング全国大会予選 敗退';
    const nodes = [el('p', 'popup-text', q.passed ? '予選突破！ 来月の決勝に進出します。' : '予選敗退。総合バランスをさらに高めよう。')];
    // 突破時のみバランス評価を表示（敗退時は理由を出さない）
    if (q.passed) {
      const tierNote = q.tier === 'sure' ? '（確実圏）' : (q.tier === 'half' ? '（当落線・運）' : '（実力不足）');
      nodes.push(el('p', 'popup-effect', 'バランス評価: 平均 ' + q.avg + ' ／ 最低 ' + q.min + ' ' + tierNote));
    }
    $('#sched-body').replaceChildren(...nodes);
    $('#sched-ok').onclick = () => { $('#sched-popup').classList.add('hidden'); onDone(); };
    $('#sched-popup').classList.remove('hidden');
  }

  // --- エントリー選択 ---
  function renderEntry(contest) {
    $('#btn-entry-go').classList.remove('hidden');
    const max = DT.contest.maxEntries(state.turn);
    entrySelection = [];
    $('#entry-title').textContent = contest.name + ' エントリー';
    $('#entry-hint').textContent = 'エントリー枠: ' + max + '部門まで' +
      (state.injuredTurns > 0 ? '　⚠ 怪我の影響でミス率+15%！' : '');

    const emptyHint = el('div', 'entry-empty', '最低1部門を選択してください');
    // 未選択のうちはエントリーボタンを押せない見た目にする（押しても無反応だと理由が分からないため）
    const updateHint = () => {
      const none = entrySelection.length === 0;
      emptyHint.style.display = none ? '' : 'none';
      $('#btn-entry-go').disabled = none;
    };

    // 大会種別に対応する部門だけを対象に（OIDC/AJDC=総合＋スペシャ、静岡=テクニカル＋パフォーマンス）
    // スペシャリスト部門は該当ジャンルが未解禁なら出場不可（総合は常に出場可）
    const options = DT.DATA.DIVISIONS
      .filter(d => d.contests.indexOf(contest.type) >= 0)
      .filter(d => !(d.scoring === 'specialist' && !DT.contest.isGenreUnlocked(state, d.id)))
      .map(d => {
        const label = d.id === 'overall' ? '個人総合部門' : d.label;
        const b = el('button', 'entry-option');
        b.appendChild(el('span', 'entry-check', '✓'));
        b.appendChild(el('span', 'entry-label', label));
        const self = divisionSelfValue(d.id);
        if (self) {
          const box = el('span', 'entry-self');
          box.appendChild(el('span', 'entry-self-val num', 'あなた ' + self.value));
          box.appendChild(el('span', 'entry-self-note', self.note));
          b.appendChild(box);
        }
        b.onclick = () => {
          const idx = entrySelection.indexOf(d.id);
          if (idx >= 0) {
            entrySelection.splice(idx, 1);
            b.classList.remove('selected');
          } else if (entrySelection.length < max) {
            entrySelection.push(d.id);
            b.classList.add('selected');
          }
          updateHint();
        };
        return b;
      });
    updateHint();
    $('#entry-divisions').replaceChildren(emptyHint, ...options, policySelector());
    show('#screen-entry');
  }

  $('#btn-entry-go').onclick = () => {
    if (entrySelection.length === 0) return;
    const results = DT.contest.runAll(state, pendingContest, entrySelection, null, entryPolicy);
    finishTurn(pendingMessages, results);
  };

  const PARTS_LABELS = {
    difficulty: '難易度', variety: '多彩性', control: '操作安定度',
    novelty: '新奇性', composition: '演技構成', fundamentals: '基礎', technical: 'テクニカル'
  };

  function standingsTable(standings) {
    const table = el('table', 'results');
    const head = el('tr');
    ['順位', '名前', 'スコア'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    standings.forEach(s => {
      const tr = el('tr', s.isPlayer ? 'me-row' : '');
      tr.appendChild(el('td', '', s.rank + '位'));
      tr.appendChild(el('td', '', s.name + (s.isPlayer ? '（あなた）' : '')));
      tr.appendChild(el('td', '', String(s.score)));
      table.appendChild(tr);
    });
    return table;
  }

  // 部門の発表順（迫力の部門別リザルト）。指定外(ジャグリング全国大会決勝/世界大会等)は末尾に単独表示
  const REVEAL_ORDER = ['h1d', 'v1d', 'd2', 'd3', 'overall', 'technical', 'performance'];
  const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
  let contestReveal = null;

  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const orderOf = (r) => { const i = REVEAL_ORDER.indexOf(r.division); return i < 0 ? 99 : i; };
    const ordered = results.slice().sort((a, b) => orderOf(a) - orderOf(b));
    contestReveal = { ordered: ordered, i: 0 };
    renderRevealStage();
    show('#screen-contest');
  }

  // 同じ大会・同じ部門で、今回より前のターンに行われた直近の結果。
  function previousResultOf(r) {
    const past = (state.results || []).filter(x =>
      x.type === r.type && x.division === r.division && x.turn < r.turn);
    if (past.length === 0) return null;
    return past.reduce((a, b) => (b.turn > a.turn ? b : a));
  }

  // 同じ大会・同じ部門における、今回より前の最高順位。
  function bestRankBefore(r) {
    const past = (state.results || []).filter(x =>
      x.type === r.type && x.division === r.division && x.turn < r.turn);
    if (past.length === 0) return null;
    return past.reduce((m, x) => Math.min(m, x.rank), Infinity);
  }

  // 1部門ぶんの発表ステージ。部門名→順位ドン→スコア→内訳の順にCSSで段階表示（再描画で毎回アニメ再生）
  function renderRevealStage() {
    const r = contestReveal.ordered[contestReveal.i];
    const total = contestReveal.ordered.length;
    const isLast = contestReveal.i === total - 1;
    const stage = el('div', 'reveal-stage');

    if (total > 1) stage.appendChild(el('div', 'reveal-progress', '発表 ' + (contestReveal.i + 1) + ' / ' + total + ' 部門'));
    stage.appendChild(el('div', 'reveal-divname', contestLabel(r.divisionLabel)));

    // 順位（主役）
    const rankBox = el('div', 'reveal-rank rank-' + (r.rank <= 3 ? r.rank : 'x'));
    if (RANK_MEDAL[r.rank]) rankBox.appendChild(el('div', 'reveal-medal', RANK_MEDAL[r.rank]));
    const num = el('div', 'reveal-rank-num');
    num.appendChild(el('span', 'rn-side', '第'));
    num.appendChild(el('span', 'rn-n', String(r.rank)));
    num.appendChild(el('span', 'rn-side', '位'));
    rankBox.appendChild(num);
    rankBox.appendChild(el('div', 'reveal-entrants', r.entrants + '人中'));
    if (r.division !== 'qualifier') {
      const prev = previousResultOf(r);
      const line = el('div', 'reveal-trend');
      if (!prev) {
        line.classList.add('is-first');
        line.textContent = '初出場';
      } else {
        const d = prev.rank - r.rank;
        if (d > 0) { line.classList.add('is-up'); line.textContent = '前回 ' + prev.rank + '位 → ▲' + d; }
        else if (d < 0) { line.classList.add('is-down'); line.textContent = '前回 ' + prev.rank + '位 → ▼' + (-d); }
        else { line.classList.add('is-same'); line.textContent = '前回と同じ ' + r.rank + '位'; }
      }
      rankBox.appendChild(line);
      const best = bestRankBefore(r);
      if (best !== null && r.rank < best) {
        rankBox.appendChild(el('div', 'reveal-best', '🎉 自己ベスト更新（これまで ' + best + '位）'));
      }
    }
    if (r.rank === 1) rankBox.appendChild(el('div', 'reveal-champ', '🎉 優勝！ 🎉'));
    stage.appendChild(rankBox);

    // スコア・獲得ポイント
    const scoreLine = el('div', 'reveal-scoreline');
    scoreLine.appendChild(el('span', 'rs-score', r.score + '点'));
    scoreLine.appendChild(el('span', 'rs-pt', '+' + r.points + 'pt'));
    stage.appendChild(scoreLine);

    // 内訳・順位表（情報量は維持）
    const detail = el('div', 'reveal-detail');
    detail.appendChild(el('div', 'section-label', '内訳（素点）'));
    const div = DT.DATA.DIVISIONS.find(d => d.id === r.division);
    const weights = div ? DT.DATA.SCORING[div.scoring].weights : {};
    const maxFor = (key) => key === 'fundamentals'
      ? DT.DATA.SCORING.base.elements * DT.DATA.SCORING.base.perElement
      : weights[key];
    Object.keys(r.parts).forEach(id => {
      detail.appendChild(textRow((PARTS_LABELS[id] || id) + '点', String(r.parts[id]) + '/' + maxFor(id)));
    });
    detail.appendChild(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
    detail.appendChild(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
    detail.appendChild(textRow('特別減点', '-' + r.specialDeduction + '点'));
    // 開発用: ステータス（素点）より実スコアが低かった場合、その理由を明示（?dev時のみ）
    const raw = Math.round(r.rawTotal * 10) / 10;
    const diff = Math.round((r.score - raw) * 10) / 10;
    if (DEV && diff < 0) {
      const causes = [];
      if (r.execDeduction > 0) causes.push('ミス' + r.misses + '回 −' + r.execDeduction);
      if (r.specialDeduction > 0) causes.push('特別減点 −' + r.specialDeduction);
      if (r.judgeMod < 0) causes.push('調子・審査 ' + r.judgeMod);
      detail.appendChild(el('div', 'dev-reason',
        '🔧DEV 実力(素点' + raw + ') → 実スコア' + r.score + '（' + diff + '） 主因: ' + (causes.join(' / ') || '軽微')));
    }
    if (Array.isArray(r.standings) && r.standings.length > 0) {
      detail.appendChild(el('div', 'section-label', '順位表'));
      detail.appendChild(standingsTable(r.standings));
    }
    stage.appendChild(detail);

    $('#contest-result').replaceChildren(stage);
    $('#screen-contest').scrollTop = 0;
    $('#btn-contest-ok').textContent = isLast ? '結果を受け止める' : '次の部門へ ▸';
  }

  $('#btn-contest-ok').onclick = () => {
    if (contestReveal && contestReveal.i < contestReveal.ordered.length - 1) {
      contestReveal.i++;
      renderRevealStage();
    } else {
      contestReveal = null;
      // 通常版だけ専用ページを挟む。ショート版は奇数月1件制限のため大会ログへ統合済み。
      if (pendingPopularity && !SHORT) {
        const p = pendingPopularity; pendingPopularity = null;
        showEventNotice('🌟 人気者！', p.text, p.effectLines, () => afterTurn(pendingLogs));
      } else {
        pendingPopularity = null;
        afterTurn(pendingLogs);
      }
    }
  };

  // --- エンディング ---
  function resultsTable(results) {
    const table = el('table', 'results');
    const head = el('tr');
    ['部門', '順位', 'pt'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    let lastName = null;
    results.forEach(r => {
      if (r.name !== lastName) {
        lastName = r.name;
        const group = el('tr');
        const th = el('th', '', r.name);
        th.colSpan = 3;
        group.appendChild(th);
        table.appendChild(group);
      }
      const tr = el('tr');
      tr.appendChild(el('td', '', contestLabel(r.divisionLabel)));
      tr.appendChild(el('td', '', r.rank + '位'));
      tr.appendChild(el('td', '', r.points + 'pt'));
      table.appendChild(tr);
    });
    return table;
  }

  // 卒業時の3行。周回の締めとして「今回はどうだったか」を先に見せる（全戦績はその下）。
  function endingHighlights(e, prevBest) {
    const box = el('div', 'ending-highlights');
    box.appendChild(el('div', 'board-label', '今回のハイライト'));
    const ranked = (state.results || []).filter(r => r.division !== 'qualifier');
    // ① 最高順位
    if (ranked.length > 0) {
      const best = ranked.reduce((a, b) => (b.rank < a.rank ? b : a));
      box.appendChild(el('div', 'eh-row', '🏆 最高順位　' + contestLabel(best.name) + '　' + contestLabel(best.divisionLabel) + ' ' + best.rank + '位'));
    }
    // ② 最も伸びたジャンル（4ジャンルの平均が最も高いもの）
    const top = DT.DATA.GENRES
      .map(g => ({ label: g.label, avg: DT.contest.genreAvg(state, g.id) }))
      .reduce((a, b) => (b.avg > a.avg ? b : a));
    box.appendChild(el('div', 'eh-row', '📈 いちばん強い　' + top.label + '　平均 ' + top.avg));
    // ③ 前回の周回との比較（初回は出さない）
    if (prevBest !== null) {
      const d = e.totalPoints - prevBest;
      box.appendChild(el('div', 'eh-row' + (d > 0 ? ' is-up' : ''),
        (d > 0 ? '🎉 自己ベスト更新　' : '🔁 これまでの最高　') + prevBest + 'pt → 今回 ' + e.totalPoints + 'pt'
        + (d > 0 ? '（▲' + d + '）' : '')));
    }
    return box;
  }

  function renderEnding() {
    const e = DT.ending.evaluate(state);
    const candidates = DT.cards.pickCandidates(state); // 条件達成カードを優先度順に列挙（stateクリア前に判定）
    const top = candidates[0];
    // 改善プラン#3: 最上位カードを所持済みで、この周に条件達成した未所持カードがある時だけ
    // 「どの物語をカードとして残すか」を選ばせる（達成した偉業が所持済みカードに吸われるのを防ぐ）。
    // 記録済みの周（デモ?auto=1含む）は選択なしで最上位を表示。選択確定までは何も永続化しない
    // ＝選択中にリロードしても「つづきから」で再びこの画面に戻るだけで二重登録は起きない。
    if (!state.recorded) {
      const col = DT.state.loadCollection(undefined, GAME_MODE);
      const unownedOthers = candidates.slice(1).filter(c => !col[c.id]);
      if (col[top.id] && unownedOthers.length > 0) {
        renderCardChoice(e, top, unownedOthers);
        return;
      }
    }
    showEndingWithCard(e, top);
  }

  // カード選択画面（#screen-ending流用・改善プラン#3）。選ぶと永続化→パック開封へ
  function renderCardChoice(e, top, others) {
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : (state.status === 'retired' ? state.name + '、新たな道へ' : state.name + '、卒業！');
    const LAYER_LABEL = { special: '⭐特別', craft: '🔧職人', matrix: '🃏ランク×タイプ' };
    const wrap = el('div', 'card-choice');
    wrap.appendChild(el('p', 'center choice-lead', 'この4年間で複数の称号の条件を満たした！\nこの選手のどの物語をカードとして残しますか？'));
    const makeBtn = (card, note, primary) => {
      const b = el('button', 'choice-btn' + (primary ? ' primary' : ''));
      const head = el('span', 'choice-head');
      head.appendChild(el('b', 'choice-title', '「' + card.title + '」'));
      head.appendChild(el('span', 'choice-layer', LAYER_LABEL[card.layer] || ''));
      b.appendChild(head);
      b.appendChild(el('span', 'choice-note', note));
      b.onclick = () => showEndingWithCard(e, card);
      return b;
    };
    wrap.appendChild(makeBtn(top, '所持済み・もう一度この物語で残す（自己ベスト更新あり）', true));
    others.forEach(c => wrap.appendChild(makeBtn(c, '✨ 未所持！図鑑に新しく加わる', false)));
    $('#ending-detail').replaceChildren(wrap);
    show('#screen-ending');
  }

  // エンディング本体: 選ばれたカードで永続化（一度だけ）→パック開封演出
  function showEndingWithCard(e, card) {
    // 個人記録を保存（この周回で一度だけ）。終了したセーブは消して「つづきから」不可＆二重記録防止
    let bestNote = null;
    let colResult = null; // 図鑑登録の結果（初解禁 or 重複時の枚数/自己ベスト更新）
    let alumniResult = null; // ショート版を卒業した選手の、部の卒業生名簿への登録結果
    const prev = DT.state.loadRecords(undefined, GAME_MODE);
    const prevBest = prev.length ? Math.max.apply(null, prev.map(r => r.totalPoints || 0)) : null;
    let cardNo = prev.length + 1; // 何人目の卒業生か（カードNo.）
    if (state.avatar) card.avatar = state.avatar;
    if (!state.recorded) {
      colResult = DT.state.addToCollection(card, cardNo, undefined, GAME_MODE); // 図鑑へ登録（初解禁ならNEW表示）
      DT.state.addRecord({
        date: Date.now(),
        name: state.name,
        background: (DT.DATA.BACKGROUNDS.find(b => b.id === state.background) || {}).label || '',
        status: state.status,
        rank: e.rank,
        title: e.title,
        totalPoints: e.totalPoints,
        abilityAvg: e.abilityAvg,
        // カード情報（図鑑/一覧のミニカード表示用・Phase3で使用）
        cardId: card.id, cardTitle: card.title, cardType: card.type, cardCp: card.cp, cardNo: cardNo,
        gameMode: GAME_MODE
      }, undefined, GAME_MODE);
      alumniResult = DT.state.addGraduateAlumni(state, card, undefined, GAME_MODE);
      if (state.status !== 'expelled' && e.totalPoints > (prevBest === null ? -1 : prevBest)) bestNote = '🎉 自己ベスト更新！';
      state.recorded = true;
      DT.state.clear(undefined, GAME_MODE);
    }
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : (state.status === 'retired' ? state.name + '、新たな道へ' : state.name + '、卒業！');
    // パック開封演出（Phase2）: パック(裏面)→タップ開封→バースト→カード出現→数値カウントアップ→成績表フェードイン
    const cardEl = buildPlayerCard(card, cardNo);
    cardEl.classList.add('hidden');
    const rest = el('div', 'ending-rest hidden');
    if (colResult && colResult.isNew) {
      rest.appendChild(el('p', 'center best-note', '✨ NEWカード！図鑑に「' + card.title + '」を登録した'));
    } else if (colResult) {
      // 重複取得: 枚数と自己ベスト更新を演出（改善プラン#5）
      const ups = [];
      if (colResult.cpImproved) ups.push('自己最高CP更新 ' + colResult.bestCp);
      if (colResult.ptImproved) ups.push('自己最高pt更新 ' + colResult.bestPt);
      rest.appendChild(el('p', 'center best-note dup-note',
        '🃏「' + card.title + '」' + colResult.count + '枚目' + (ups.length ? '／🎉 ' + ups.join('・') : '')));
    }
    if (alumniResult) {
      const alumniNote = alumniResult.activated
        ? '🌸 ' + alumniResult.alumni.name + 'を卒業生名簿へ登録。次の周回から先輩候補に加わります。'
        : '🌸 ' + alumniResult.alumni.name + 'を卒業生名簿へ登録。登場枠は5人なので、名簿で入れ替えると次周回に現れます。';
      rest.appendChild(el('p', 'center best-note alumni-note', alumniNote));
      const rosterButton = el('button', 'alumni-ending-btn', '🌸 次の周回の卒業生名簿を選ぶ');
      rosterButton.onclick = openAlumniRoster;
      rest.appendChild(rosterButton);
    }
    rest.appendChild(buildCardActions(card, cardNo));
    if (bestNote) rest.appendChild(el('p', 'center best-note', bestNote));
    if (e.comment) rest.appendChild(el('p', 'center', e.comment));
    rest.appendChild(endingHighlights(e, prevBest));
    if (state.results.length > 0) rest.appendChild(resultsTable(state.results));
    // ライバル戦績の表示は非表示（スコア計算では引き続き対戦相手として登場）
    const stage = el('div', 'pack-stage');
    const pack = buildCardPack(card);
    stage.appendChild(pack);
    stage.appendChild(cardEl);
    pack.onclick = () => openPack(stage, pack, cardEl, rest, card);
    $('#ending-detail').replaceChildren(stage, rest);
    show('#screen-ending');
  }

  // カードパック（裏面）。レア度の気配だけ滲ませる（枠色は開封まで伏せ、発光色のみ）
  function buildCardPack(card) {
    const rankKey = card.expelled ? 'X' : card.rank;
    const pack = el('div', 'card-pack glow-' + rankKey);
    const inner = el('div', 'card-pack-inner');
    const logo = el('div', 'pack-logo');
    logo.innerHTML = '<svg viewBox="0 0 200 180">' + CARD_ART.allround + '</svg>';
    inner.appendChild(logo);
    inner.appendChild(el('div', 'pack-q', '?'));
    inner.appendChild(el('div', 'pack-tap', 'タップして開封'));
    pack.appendChild(inner);
    return pack;
  }

  // 開封: パックを震わせ→バースト→カード出現(reveal)→CP/pt/ステータスをカウントアップ→成績表を表示
  function openPack(stage, pack, cardEl, rest, card) {
    if (pack.classList.contains('opening')) return;
    pack.classList.add('opening');
    setTimeout(() => {
      spawnBurst(stage, card);
      pack.classList.add('hidden');
      cardEl.classList.remove('hidden');
      cardEl.classList.add('reveal');
      countUpCardNumbers(cardEl);
      setTimeout(() => rest.classList.remove('hidden'), 800);
    }, 700);
  }

  // レア度色のパーティクルを放射（CSSアニメ。S=虹/A=金/B=銀/他=淡青/X=灰少なめ）
  function spawnBurst(stage, card) {
    const rankKey = card.expelled ? 'X' : card.rank;
    const colors = {
      S: ['#67e8f9', '#c084fc', '#ff8ad4', '#ffd76a', '#818cf8'],
      A: ['#ffd76a', '#fff3c4', '#e8a12b'],
      B: ['#c3d0de', '#eef4fa', '#8fa8c8'],
      X: ['#9ca3af', '#6b7280']
    }[rankKey] || ['#9fc8ee', '#dceafc'];
    const n = rankKey === 'S' ? 26 : (rankKey === 'A' ? 20 : (rankKey === 'X' ? 8 : 14));
    const burst = el('div', 'pack-burst');
    for (let i = 0; i < n; i++) {
      const p = el('span', 'pk-particle');
      const ang = (360 / n) * i + (i % 3) * 9;
      p.style.setProperty('--a', ang + 'deg');
      p.style.setProperty('--d', (70 + (i % 5) * 26) + 'px');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.animationDelay = (i % 4) * 40 + 'ms';
      burst.appendChild(p);
    }
    stage.appendChild(burst);
    setTimeout(() => burst.remove(), 1400);
  }

  // .pcard内の数値(CP/通算pt/4系統)を0から目標値へカウントアップ（約0.9秒・easeOut）
  function countUpCardNumbers(cardEl) {
    const targets = [];
    cardEl.querySelectorAll('.pcard-num b, .pcard-stat b').forEach(b => {
      const v = parseInt(b.textContent, 10);
      if (!isNaN(v)) { targets.push({ eln: b, v }); b.textContent = '0'; }
    });
    const t0 = performance.now();
    const DUR = 900;
    function tick(now) {
      const k = Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - k, 3);
      targets.forEach(t => { t.eln.textContent = String(Math.round(t.v * ease)); });
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- 選手カード描画（Phase1: 静的表示。開封演出はPhase2） ----
  const CARD_RARITY = {
    S: { label: 'ULTRA RARE', stars: 6 }, A: { label: 'SUPER RARE', stars: 5 },
    B: { label: 'RARE', stars: 4 }, C: { label: 'NORMAL+', stars: 3 },
    D: { label: 'NORMAL', stars: 2 }, E: { label: 'NORMAL', stars: 1 },
    退学: { label: 'GAME OVER', stars: 0 }
  };
  // 中央アート: 属性Typeごとの署名ディアボロ（SVG作り置き5種、色はCSSのcurrentColor）
  const CARD_ART = {
    power: `<defs>
      <linearGradient id="power-shell-l" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="#effdff"/><stop offset=".2" stop-color="currentColor"/><stop offset=".68" stop-color="currentColor" stop-opacity=".82"/><stop offset="1" stop-color="#102345"/></linearGradient>
      <linearGradient id="power-shell-r" x1="1" y1="0" x2="0" y2=".65"><stop stop-color="#effdff"/><stop offset=".2" stop-color="currentColor"/><stop offset=".68" stop-color="currentColor" stop-opacity=".82"/><stop offset="1" stop-color="#102345"/></linearGradient>
      <linearGradient id="power-axle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f4fdff"/><stop offset=".34" stop-color="#9ae8ff"/><stop offset=".5" stop-color="#274e77"/><stop offset=".72" stop-color="#d5f8ff"/><stop offset="1" stop-color="#17304f"/></linearGradient>
      <filter id="power-glow" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="2.2"/></filter>
    </defs>
    <g stroke-linejoin="miter">
      <path d="M18 48 L70 70 M182 48 L130 70 M10 118 L56 115 M190 118 L144 115" fill="none" stroke="#54e6ff" stroke-width="2" opacity=".22" filter="url(#power-glow)"/>
      <path d="M20 68 L38 74 L32 56 L53 75 L63 64 L66 80 L90 92 L90 108 L66 120 L63 136 L53 125 L32 144 L38 126 L20 132 L30 113 L14 109 L28 100 L14 91 L30 87 Z" fill="url(#power-shell-l)" stroke="currentColor" stroke-width="1.8"/>
      <path d="M20 68 L38 74 L32 56 L53 75 L63 64 L66 80 L90 92 L90 108 L66 120 L63 136 L53 125 L32 144 L38 126 L20 132 L30 113 L14 109 L28 100 L14 91 L30 87 Z" transform="translate(200 0) scale(-1 1)" fill="url(#power-shell-r)" stroke="currentColor" stroke-width="1.8"/>
      <path d="M28 88 L65 81 L89 94 L62 99 Z M28 112 L62 101 L89 106 L65 119 Z" fill="#dffaff" opacity=".24"/>
      <path d="M28 88 L65 81 L89 94 L62 99 Z M28 112 L62 101 L89 106 L65 119 Z" transform="translate(200 0) scale(-1 1)" fill="#dffaff" opacity=".24"/>
      <path d="M31 100 L62 99 M42 75 L66 88 M42 125 L66 112 M169 100 L138 99 M158 75 L134 88 M158 125 L134 112" fill="none" stroke="#effdff" stroke-width="1.2" opacity=".52"/>
      <path d="M84 95 L116 95 L121 100 L116 105 L84 105 L79 100 Z" fill="url(#power-axle)" stroke="#dffaff" stroke-width="1"/>
      <path d="M94 91 L106 91 L110 100 L106 109 L94 109 L90 100 Z" fill="#122947" stroke="currentColor" stroke-width="2"/>
      <circle cx="100" cy="100" r="4" fill="#baf3ff"/>
      <path d="M22 50 C56 31 144 31 178 50" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="18 7 3 7" opacity=".46"/>
      <path d="M173 44 L184 51 L172 56 Z" fill="currentColor" opacity=".7"/>
      <path d="M14 151 C50 166 78 158 94 118 Q100 108 106 118 C122 158 150 166 186 151" fill="none" stroke="#8eeeff" stroke-width="2.2" opacity=".72"/>
      <path d="M14 151 L7 144 M186 151 L193 144" stroke="currentColor" stroke-width="3"/>
    </g>`,
    innovator: `<defs>
      <linearGradient id="innovator-shell-l" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dffaff"/><stop offset=".18" stop-color="currentColor"/><stop offset=".63" stop-color="#397ca5"/><stop offset="1" stop-color="#122442"/></linearGradient>
      <linearGradient id="innovator-shell-r" x1="1" y1="0" x2="0" y2="1"><stop stop-color="#b7f5ff"/><stop offset=".22" stop-color="currentColor"/><stop offset=".72" stop-color="#405b93"/><stop offset="1" stop-color="#111d3c"/></linearGradient>
      <radialGradient id="innovator-node"><stop stop-color="#efffff"/><stop offset=".35" stop-color="#65ecff"/><stop offset="1" stop-color="#31568d"/></radialGradient>
    </defs>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 79 C35 36 83 37 110 57 C136 76 159 55 181 63" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2 8" opacity=".3"/>
      <path d="M25 65 C43 54 58 75 91 91 L91 108 C70 114 48 145 26 132 C12 124 36 113 21 104 C5 94 32 81 25 65 Z" fill="url(#innovator-shell-l)" stroke="currentColor" stroke-width="2"/>
      <path d="M109 86 C131 67 151 59 171 73 C185 83 158 92 175 102 C190 113 159 120 169 134 C144 142 130 119 109 111 Z" fill="url(#innovator-shell-r)" stroke="currentColor" stroke-width="2"/>
      <path d="M29 83 C48 75 64 90 84 96 C64 99 45 93 29 107 C37 96 37 91 29 83 Z" fill="#0e1e3c" opacity=".72"/>
      <path d="M119 91 C134 77 149 74 159 80 C148 87 148 96 164 103 C144 107 132 101 116 105 Z" fill="#0e1e3c" opacity=".68"/>
      <path d="M35 69 C49 89 67 83 88 98 M25 122 C48 106 65 115 88 103 M119 88 C132 94 145 83 166 76 M118 108 C137 104 146 122 164 128" fill="none" stroke="#c7f8ff" stroke-width="1.35" opacity=".52"/>
      <path d="M86 94 C91 88 96 91 100 95 C104 88 112 90 115 96 C118 102 111 109 105 107 C101 114 92 111 92 105 C85 105 82 99 86 94 Z" fill="#193354" stroke="currentColor" stroke-width="2"/>
      <path d="M88 99 C95 97 105 102 113 98" fill="none" stroke="#dcfbff" stroke-width="2.5"/>
      <circle cx="100" cy="100" r="3.5" fill="url(#innovator-node)"/>
      <circle cx="24" cy="58" r="5" fill="url(#innovator-node)"/><circle cx="175" cy="62" r="3.5" fill="url(#innovator-node)"/><circle cx="181" cy="128" r="6" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/>
      <path d="M15 151 C48 166 75 158 92 121 C97 110 103 110 109 121 C130 160 151 164 185 146" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".72"/>
      <path d="M15 151 L9 143 M185 146 L193 140" stroke="#8ceeff" stroke-width="3"/>
      <path d="M42 151 C73 171 132 170 165 151" fill="none" stroke="#65e8ff" stroke-width="1.2" stroke-dasharray="3 7" opacity=".32"/>
    </g>`,
    technician: `<defs>
      <linearGradient id="technician-shell-l" x1="0" y1="0" x2="1" y2="0"><stop stop-color="currentColor"/><stop offset=".22" stop-color="#d9f8ff"/><stop offset=".48" stop-color="currentColor"/><stop offset="1" stop-color="#132746"/></linearGradient>
      <linearGradient id="technician-shell-r" x1="1" y1="0" x2="0" y2="0"><stop stop-color="currentColor"/><stop offset=".22" stop-color="#d9f8ff"/><stop offset=".48" stop-color="currentColor"/><stop offset="1" stop-color="#132746"/></linearGradient>
      <linearGradient id="technician-axle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f4feff"/><stop offset=".3" stop-color="#8de8ff"/><stop offset=".52" stop-color="#1b4165"/><stop offset=".72" stop-color="#c9f6ff"/><stop offset="1" stop-color="#18314e"/></linearGradient>
    </defs>
    <g stroke-linecap="round" stroke-linejoin="round">
      <circle cx="100" cy="100" r="68" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1 7" opacity=".17"/>
      <path d="M31 61 C53 67 74 80 91 92 L91 108 C74 120 53 133 31 139 C39 125 43 112 43 100 C43 88 39 75 31 61 Z" fill="url(#technician-shell-l)" stroke="currentColor" stroke-width="1.6"/>
      <path d="M31 61 C53 67 74 80 91 92 L91 108 C74 120 53 133 31 139 C39 125 43 112 43 100 C43 88 39 75 31 61 Z" transform="translate(200 0) scale(-1 1)" fill="url(#technician-shell-r)" stroke="currentColor" stroke-width="1.6"/>
      <ellipse cx="31" cy="100" rx="11" ry="39" fill="#142845" stroke="currentColor" stroke-width="2.4"/>
      <ellipse cx="31" cy="100" rx="7" ry="32" fill="none" stroke="#d9f8ff" stroke-width="1.4" opacity=".8"/>
      <ellipse cx="31" cy="100" rx="3" ry="23" fill="none" stroke="currentColor" stroke-width="1" opacity=".75"/>
      <ellipse cx="169" cy="100" rx="11" ry="39" fill="#142845" stroke="currentColor" stroke-width="2.4"/>
      <ellipse cx="169" cy="100" rx="7" ry="32" fill="none" stroke="#d9f8ff" stroke-width="1.4" opacity=".8"/>
      <ellipse cx="169" cy="100" rx="3" ry="23" fill="none" stroke="currentColor" stroke-width="1" opacity=".75"/>
      <path d="M48 76 C57 82 65 87 75 92 M48 124 C57 118 65 113 75 108 M152 76 C143 82 135 87 125 92 M152 124 C143 118 135 113 125 108" fill="none" stroke="#e7fcff" stroke-width="1.2" opacity=".62"/>
      <path d="M87 94 H113 L118 100 L113 106 H87 L82 100 Z" fill="url(#technician-axle)" stroke="#c9f6ff" stroke-width="1.1"/>
      <rect x="92" y="91" width="16" height="18" rx="4" fill="#132b49" stroke="currentColor" stroke-width="2"/>
      <circle cx="100" cy="100" r="5.5" fill="none" stroke="#ddfaff" stroke-width="1.4"/><circle cx="100" cy="100" r="2.2" fill="#9cecff"/>
      <path d="M38 52 A77 54 0 0 1 162 52" fill="none" stroke="currentColor" stroke-width="1.7" opacity=".5"/>
      <path d="M38 52 L42 43 M55 43 L57 50 M76 36 L77 46 M100 33 V44 M124 36 L123 46 M145 43 L143 50 M162 52 L158 43" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
      <path d="M156 47 L166 53 L156 57 Z" fill="currentColor" opacity=".75"/>
      <path d="M16 151 C52 165 78 157 94 117 Q100 108 106 117 C122 157 148 165 184 151" fill="none" stroke="#8cecff" stroke-width="2" opacity=".7"/>
      <path d="M16 151 L9 144 M184 151 L191 144" stroke="currentColor" stroke-width="2.8"/>
    </g>`,
    showman: `<defs>
      <linearGradient id="showman-shell-l" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5fdff"/><stop offset=".18" stop-color="currentColor"/><stop offset=".5" stop-color="#73d9f5"/><stop offset=".76" stop-color="currentColor"/><stop offset="1" stop-color="#17254b"/></linearGradient>
      <linearGradient id="showman-shell-r" x1="1" y1="0" x2="0" y2="1"><stop stop-color="#f5fdff"/><stop offset=".18" stop-color="currentColor"/><stop offset=".5" stop-color="#73d9f5"/><stop offset=".76" stop-color="currentColor"/><stop offset="1" stop-color="#17254b"/></linearGradient>
      <radialGradient id="showman-gem"><stop stop-color="#ffffff"/><stop offset=".3" stop-color="#77f1ff"/><stop offset=".67" stop-color="#9b8cff"/><stop offset="1" stop-color="#283667"/></radialGradient>
      <filter id="showman-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M29 62 C50 66 72 79 91 92 L91 108 C72 121 50 134 29 138 C36 128 40 119 38 112 C28 118 20 110 25 100 C20 90 28 82 38 88 C40 80 36 72 29 62 Z" fill="url(#showman-shell-l)" stroke="currentColor" stroke-width="1.8"/>
      <path d="M29 62 C50 66 72 79 91 92 L91 108 C72 121 50 134 29 138 C36 128 40 119 38 112 C28 118 20 110 25 100 C20 90 28 82 38 88 C40 80 36 72 29 62 Z" transform="translate(200 0) scale(-1 1)" fill="url(#showman-shell-r)" stroke="currentColor" stroke-width="1.8"/>
      <path d="M30 72 C48 83 64 85 86 96 M25 100 C48 100 65 99 88 100 M30 128 C48 117 64 115 86 104 M170 72 C152 83 136 85 114 96 M175 100 C152 100 135 99 112 100 M170 128 C152 117 136 115 114 104" fill="none" stroke="#f1fdff" stroke-width="1.25" opacity=".68"/>
      <path d="M26 62 L31 52 L36 62 L31 70 Z M26 138 L31 130 L36 138 L31 148 Z M174 62 L169 52 L164 62 L169 70 Z M174 138 L169 130 L164 138 L169 148 Z" fill="#d9fbff" stroke="currentColor" stroke-width="1"/>
      <path d="M86 94 H114 L119 100 L114 106 H86 L81 100 Z" fill="#244a70" stroke="#d9fbff" stroke-width="1.2"/>
      <path d="M93 91 L100 87 L107 91 L111 100 L107 109 L100 113 L93 109 L89 100 Z" fill="url(#showman-gem)" stroke="currentColor" stroke-width="1.7"/>
      <circle cx="100" cy="100" r="9" fill="none" stroke="#bcf8ff" stroke-width="2" opacity=".35" filter="url(#showman-glow)"/>
      <path d="M100 24 L104 34 L115 35 L106 42 L109 53 L100 47 L91 53 L94 42 L85 35 L96 34 Z" fill="currentColor" opacity=".88"/>
      <path d="M25 38 L28 46 L36 49 L28 52 L25 61 L22 52 L14 49 L22 46 Z M175 42 L178 50 L186 53 L178 56 L175 65 L172 56 L164 53 L172 50 Z" fill="#dffcff" opacity=".85"/>
      <path d="M51 31 L53 37 L59 39 L53 41 L51 47 L49 41 L43 39 L49 37 Z M149 27 L151 33 L157 35 L151 37 L149 43 L147 37 L141 35 L147 33 Z" fill="currentColor" opacity=".68"/>
      <path d="M66 51 L68 56 L73 58 L68 60 L66 65 L64 60 L59 58 L64 56 Z M137 49 L139 54 L144 56 L139 58 L137 63 L135 58 L130 56 L135 54 Z" fill="#ffffff" opacity=".7"/>
      <path d="M12 151 C51 169 77 158 94 118 Q100 108 106 118 C123 158 149 169 188 151" fill="none" stroke="currentColor" stroke-width="2.3" opacity=".76"/>
      <circle cx="58" cy="158" r="2.5" fill="#dffcff"/><circle cx="142" cy="158" r="2.5" fill="#dffcff"/>
      <path d="M12 151 L6 143 M188 151 L194 143" stroke="#9defff" stroke-width="3"/>
    </g>`,
    allround: `<defs>
      <linearGradient id="allround-shell-l" x1="0" y1="0" x2="1" y2=".75"><stop stop-color="#ecfcff"/><stop offset=".16" stop-color="currentColor"/><stop offset=".46" stop-color="#79c9e7"/><stop offset=".72" stop-color="currentColor"/><stop offset="1" stop-color="#132846"/></linearGradient>
      <linearGradient id="allround-shell-r" x1="1" y1="0" x2="0" y2=".75"><stop stop-color="#ecfcff"/><stop offset=".16" stop-color="currentColor"/><stop offset=".46" stop-color="#79c9e7"/><stop offset=".72" stop-color="currentColor"/><stop offset="1" stop-color="#132846"/></linearGradient>
      <linearGradient id="allround-axle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6feff"/><stop offset=".3" stop-color="#9beaff"/><stop offset=".53" stop-color="#214767"/><stop offset=".75" stop-color="#d6f8ff"/><stop offset="1" stop-color="#18314d"/></linearGradient>
    </defs>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path d="M34 62 C55 68 75 80 92 92 L92 108 C75 120 55 132 34 138 C42 125 46 112 46 100 C46 88 42 75 34 62 Z" fill="url(#allround-shell-l)" stroke="currentColor" stroke-width="1.8"/>
      <path d="M34 62 C55 68 75 80 92 92 L92 108 C75 120 55 132 34 138 C42 125 46 112 46 100 C46 88 42 75 34 62 Z" transform="translate(200 0) scale(-1 1)" fill="url(#allround-shell-r)" stroke="currentColor" stroke-width="1.8"/>
      <ellipse cx="34" cy="100" rx="10" ry="38" fill="#142a49" stroke="currentColor" stroke-width="2.2"/>
      <ellipse cx="34" cy="100" rx="5.5" ry="30" fill="none" stroke="#d9f8ff" stroke-width="1.3" opacity=".76"/>
      <ellipse cx="166" cy="100" rx="10" ry="38" fill="#142a49" stroke="currentColor" stroke-width="2.2"/>
      <ellipse cx="166" cy="100" rx="5.5" ry="30" fill="none" stroke="#d9f8ff" stroke-width="1.3" opacity=".76"/>
      <path d="M48 77 C61 82 74 88 88 97 M48 123 C61 118 74 112 88 103 M152 77 C139 82 126 88 112 97 M152 123 C139 118 126 112 112 103" fill="none" stroke="#e9fcff" stroke-width="1.25" opacity=".58"/>
      <rect x="85" y="95" width="30" height="10" rx="5" fill="url(#allround-axle)" stroke="#d7f8ff" stroke-width="1"/>
      <rect x="93" y="91" width="14" height="18" rx="5" fill="#16314e" stroke="currentColor" stroke-width="2"/>
      <circle cx="100" cy="100" r="4" fill="#b8f1ff"/>
      <path d="M31 56 C62 27 138 27 169 56" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="11 7" opacity=".47"/>
      <path d="M163 50 L174 57 L163 61 Z" fill="currentColor" opacity=".7"/>
      <path d="M45 145 C73 169 127 169 155 145" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 7" opacity=".28"/>
      <path d="M15 151 C51 166 78 158 94 117 Q100 108 106 117 C122 158 149 166 185 151" fill="none" stroke="#8beaff" stroke-width="2.2" opacity=".72"/>
      <path d="M15 151 L8 144 M185 151 L192 144" stroke="currentColor" stroke-width="3"/>
    </g>`
  };
  // カードID→イラスト画像パス（リポ同梱=same-origin。canvas書き出しが汚染されない）。
  // 未登録のカードは属性TypeのSVGアートにフォールバック。画像が届いたらここに1行足すだけで差し替わる。
  const CARD_IMAGE = {
    // 配布用JPEGは assets/cards/web/<カードID>.jpg に置いて1行足す（未登録カードはSVG）:
    sp_worlds: 'assets/cards/web/sp_worlds.jpg',
    mx_E_showman: 'assets/cards/web/mx_E_showman.jpg',
    mx_E_allround: 'assets/cards/web/mx_E_allround.jpg',
    sp_unhurt: 'assets/cards/web/sp_unhurt.jpg',
    sp_daikyo: 'assets/cards/web/sp_daikyo.jpg',
    sp_weed: 'assets/cards/web/sp_weed.jpg',
    sp_upset: 'assets/cards/web/sp_upset.jpg',
    sp_awakener: 'assets/cards/web/sp_awakener.jpg',
    sp_scholar: 'assets/cards/web/sp_scholar.jpg',
    sp_grandslam: 'assets/cards/web/sp_grandslam.jpg',
    sp_expelled: 'assets/cards/web/sp_expelled.jpg',
    sp_jjf: 'assets/cards/web/sp_jjf.jpg',
    sp_ajdc: 'assets/cards/web/sp_ajdc.jpg',
    sp_dynasty: 'assets/cards/web/sp_dynasty.jpg',
    sp_podium: 'assets/cards/web/sp_podium.jpg',
    sp_elite: 'assets/cards/web/sp_elite.jpg',
    sp_tokai: 'assets/cards/web/sp_tokai.jpg',
    cr_h1d: 'assets/cards/web/cr_h1d.jpg',
    cr_v1d: 'assets/cards/web/cr_v1d.jpg',
    cr_d2: 'assets/cards/web/cr_d2.jpg',
    cr_d3: 'assets/cards/web/cr_d3.jpg',
    cr_worlds: 'assets/cards/web/cr_worlds.jpg',
    mx_S_power: 'assets/cards/web/mx_S_power.jpg',
    mx_S_innovator: 'assets/cards/web/mx_S_innovator.jpg',
    mx_S_technician: 'assets/cards/web/mx_S_technician.jpg',
    mx_S_showman: 'assets/cards/web/mx_S_showman.jpg',
    mx_S_allround: 'assets/cards/web/mx_S_allround.jpg',
    mx_A_power: 'assets/cards/web/mx_A_power.jpg',
    mx_A_innovator: 'assets/cards/web/mx_A_innovator.jpg',
    mx_A_technician: 'assets/cards/web/mx_A_technician.jpg',
    mx_A_showman: 'assets/cards/web/mx_A_showman.jpg',
    mx_A_allround: 'assets/cards/web/mx_A_allround.jpg',
    mx_B_power: 'assets/cards/web/mx_B_power.jpg',
    mx_B_technician: 'assets/cards/web/mx_B_technician.jpg',
    mx_B_showman: 'assets/cards/web/mx_B_showman.jpg',
    mx_B_allround: 'assets/cards/web/mx_B_allround.jpg',
    mx_C_power: 'assets/cards/web/mx_C_power.jpg',
    mx_C_innovator: 'assets/cards/web/mx_C_innovator.jpg',
    mx_C_technician: 'assets/cards/web/mx_C_technician.jpg',
    mx_C_showman: 'assets/cards/web/mx_C_showman.jpg',
    mx_C_allround: 'assets/cards/web/mx_C_allround.jpg',
    mx_D_power: 'assets/cards/web/mx_D_power.jpg',
    mx_D_innovator: 'assets/cards/web/mx_D_innovator.jpg',
    mx_D_technician: 'assets/cards/web/mx_D_technician.jpg',
    mx_D_showman: 'assets/cards/web/mx_D_showman.jpg',
    mx_D_allround: 'assets/cards/web/mx_D_allround.jpg',
    mx_E_power: 'assets/cards/web/mx_E_power.jpg',
    mx_E_innovator: 'assets/cards/web/mx_E_innovator.jpg',
    mx_E_technician: 'assets/cards/web/mx_E_technician.jpg',
  };
  const IMG_VER = 'v=20260722a';
  function cardImageSrc(type) { const s = CARD_IMAGE[type]; return s ? (s + (s.indexOf('?') < 0 ? '?' + IMG_VER : '')) : null; }

  // アートパネルの中身を埋める: 画像があれば<img>(読み込み失敗時はSVGへフォールバック)、無ければ署名SVG。
  function fillCardArt(artEl, card) {
    const src = card.artSrcOverride || cardImageSrc(card.id);
    const svg = () => { artEl.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 200 180">' + (CARD_ART[card.type] || CARD_ART.allround) + '</svg>'); };
    if (src) {
      const im = el('img', 'pcard-artimg'); im.alt = '';
      im.onerror = () => { im.remove(); svg(); };
      im.src = src;
      artEl.appendChild(im);
    } else {
      svg();
    }
  }

  function buildPlayerCard(card, cardNo) {
    const rar = card.expelled ? CARD_RARITY['退学'] : (CARD_RARITY[card.rank] || CARD_RARITY.E);
    const wrap = el('div', 'pcard rank-' + (card.expelled ? 'X' : card.rank));
    const inner = el('div', 'pcard-inner');
    // ヘッダー: レア度＋★／ランクバッジ
    const head = el('div', 'pcard-head');
    head.appendChild(el('span', 'pcard-rarity', rar.label + ' ' + '★'.repeat(rar.stars)));
    head.appendChild(el('span', 'pcard-rankbadge', card.expelled ? '×' : card.rank));
    inner.appendChild(head);
    // 名前＋カードタイトル（称号）
    inner.appendChild(el('div', 'pcard-name', card.name));
    inner.appendChild(el('div', 'pcard-epithet', card.isGallerySample
      ? card.typeLabel + '・カードアーカイブ'
      : '「' + card.title + '」・' + card.typeLabel));
    // 中央アート（属性別ディアボロ）
    const art = el('div', 'pcard-art');
    fillCardArt(art, card);
    art.appendChild(el('span', 'pcard-artlabel', 'ART: ' + card.typeLabel));
    if (!card.isGallerySample) {
      const face = el('div', 'pcard-face');
      mountAvatar(face, avatarOf(card));
      art.appendChild(face);
    }
    inner.appendChild(art);
    // 能力CP／通算pt
    const nums = el('div', 'pcard-nums');
    const cpBox = el('div', 'pcard-num'); cpBox.appendChild(el('small', '', '能力CP')); cpBox.appendChild(el('b', 'num', String(card.cp)));
    const ptBox = el('div', 'pcard-num right'); ptBox.appendChild(el('small', '', '通算pt')); ptBox.appendChild(el('b', 'num', String(card.totalPoints)));
    nums.appendChild(cpBox); nums.appendChild(ptBox);
    inner.appendChild(nums);
    // 4系統ステータス
    const st = el('div', 'pcard-stats');
    [['難易度', card.stats.difficulty], ['操作', card.stats.control], ['新奇性', card.stats.novelty], ['構成', card.stats.composition]].forEach(([k, v]) => {
      const row = el('div', 'pcard-stat');
      row.appendChild(el('span', '', k)); row.appendChild(el('b', 'num', String(v)));
      st.appendChild(row);
    });
    inner.appendChild(st);
    // フッター: メダル／経歴・No.
    const foot = el('div', 'pcard-foot');
    foot.appendChild(el('span', 'pcard-medals', card.medals.join(' ')));
    const bgLabel = (DT.DATA.BACKGROUNDS.find(b => b.id === card.background) || {}).label || '';
    foot.appendChild(el('span', 'pcard-no', bgLabel + ' / No.' + String(cardNo).padStart(3, '0')));
    inner.appendChild(foot);
    wrap.appendChild(inner);
    return wrap;
  }

  // ---- 全カード見本ギャラリー: 50種すべてを代表データで描画してデザインを一望する（?gallery=1／設定から） ----
  // 特別/職人カードは実プレイ次第でランク/属性が変わるため、見本では代表値を割り当てる。
  const GALLERY_REP = {
    sp_expelled: ['E', 'allround', true], sp_worlds: ['S', 'allround'], sp_grandslam: ['S', 'power'],
    sp_dynasty: ['S', 'power'], sp_ajdc: ['A', 'power'], sp_jjf: ['A', 'allround'],
    sp_weed: ['S', 'technician'], sp_daikyo: ['A', 'showman'], sp_awakener: ['A', 'power'],
    sp_upset: ['B', 'technician'], sp_tokai: ['B', 'showman'], sp_elite: ['S', 'showman'],
    sp_unhurt: ['A', 'technician'], sp_scholar: ['B', 'allround'], sp_podium: ['B', 'allround'],
    cr_h1d: ['A', 'technician'], cr_v1d: ['A', 'innovator'], cr_d2: ['A', 'power'],
    cr_d3: ['A', 'showman'], cr_worlds: ['B', 'allround']
  };
  // 本番採用が保留中のカードは、見本ギャラリーだけで候補アートを表示する。
  // 通常プレイではCARD_IMAGE未登録のままなので、既存の属性SVGへフォールバックする。
  const GALLERY_ART_OVERRIDE = {
    mx_B_innovator: 'assets/cards/web/mx_B_innovator_provisional.jpg'
  };
  const RANK_BASE = { S: 90, A: 78, B: 66, C: 54, D: 42, E: 30 };
  const RANK_PT = { S: 1080, A: 860, B: 620, C: 400, D: 190, E: 80 };
  function sampleCardFor(entry) {
    let rank, type, expelled = false;
    if (entry.layer === 'matrix') { rank = entry.rank; type = entry.type; }
    else { const r = GALLERY_REP[entry.id] || ['A', 'allround']; rank = r[0]; type = r[1]; expelled = !!r[2]; }
    const base = RANK_BASE[rank] || 55;
    const stats = { difficulty: base - 3, novelty: base - 1, control: base + 1, composition: base };
    const bump = { power: 'difficulty', innovator: 'novelty', technician: 'control', showman: 'composition' }[type];
    if (bump) stats[bump] = Math.min(99, base + 9);
    return {
      id: entry.id, title: entry.title, layer: entry.layer,
      rank: expelled ? '退学' : rank, type: type, typeLabel: DT.cards.TYPE_LABEL[type],
      cp: RANK_BASE[rank] ? Math.round(RANK_BASE[rank] * 10) : 550,
      totalPoints: expelled ? 60 : (RANK_PT[rank] || 400), stats: stats, expelled: expelled,
      medals: [entry.layer === 'special' ? '⭐特別' : (entry.layer === 'craft' ? '🔧職人' : '🃏' + rank)],
      background: 'highschool', strongestGenre: '1DH', name: entry.title, isGallerySample: true,
      artSrcOverride: GALLERY_ART_OVERRIDE[entry.id] || ''
    };
  }
  function renderCardGallery() {
    const cats = DT.cards.catalog();
    const app = document.getElementById('app');
    let ov = document.getElementById('gallery-overlay');
    if (ov) ov.remove();
    document.body.classList.add('gallery-mode');
    ov = el('div', 'gallery-overlay'); ov.id = 'gallery-overlay';
    const head = el('div', 'gallery-head');
    head.appendChild(el('span', 'gallery-title', '🎴 全カードアーカイブ（' + cats.length + '種）'));
    const close = el('button', 'gallery-close', '×');
    close.onclick = () => {
      ov.remove(); document.body.classList.remove('gallery-mode');
      if (state && state.status === 'playing') show('#screen-home'); else initTitle();
    };
    head.appendChild(close);
    const note = el('p', 'gallery-note', '50枚を同じカード枠で表示しています。※特別/職人カードの数値は代表値／「奇手の使い手」のみ仮案です。');
    const grid = el('div', 'card-gallery');
    const groups = [
      { label: '⭐ 特別カード', entries: cats.filter(c => c.layer === 'special') },
      { label: '🔧 職人カード', entries: cats.filter(c => c.layer === 'craft') },
      ...['S', 'A', 'B', 'C', 'D', 'E'].map(rank => ({
        label: '🃏 ランク ' + rank,
        entries: cats.filter(c => c.layer === 'matrix' && c.rank === rank)
      }))
    ];
    groups.forEach(group => {
      grid.appendChild(el('h2', 'gallery-section-title', group.label));
      group.entries.forEach(entry => {
        const no = cats.indexOf(entry) + 1;
        const provisional = !!GALLERY_ART_OVERRIDE[entry.id];
        const cell = el('div', 'gallery-cell');
        cell.appendChild(buildPlayerCard(sampleCardFor(entry), no));
        cell.appendChild(el('div', 'gallery-cell-cap' + (provisional ? ' is-provisional' : ''),
          '#' + String(no).padStart(2, '0') + ' ' + entry.title + (provisional ? '（仮案）' : '')));
        grid.appendChild(cell);
      });
    });
    ov.appendChild(head); ov.appendChild(note); ov.appendChild(grid);
    app.appendChild(ov);
  }

  // ---- カード図鑑（Phase3）: 解禁済みコレクションの一覧・鑑賞・画像保存 ----
  const rankKeyOf = snap => (snap.expelled ? 'X' : snap.rank);

  function zukanTileArt(entry, got) {
    const art = el('span', 'zt-art' + (got ? '' : ' is-locked'));
    if (got) {
      // 旧コレクションのsnapにidが無い場合も、図鑑側のカードIDから採用イラストを引けるよう補完する。
      fillCardArt(art, Object.assign({}, got.snap, { id: entry.id }));
    } else {
      // 未解禁カードは個別イラストを伏せ、共通ディアボロをシルエット表示する。
      fillCardArt(art, { id: '', type: 'allround' });
      art.appendChild(el('span', 'zt-lockmark', '？'));
    }
    return art;
  }

  function openZukan() {
    const col = DT.state.loadCollection(undefined, GAME_MODE);
    const catalog = DT.cards.catalog();
    const owned = catalog.filter(c => col[c.id]).length;
    $('#zukan-sub').textContent = 'コンプ率 ' + owned + ' / ' + catalog.length;
    const layers = [
      { key: 'special', label: '⭐ 特別カード' },
      { key: 'craft', label: '🔧 職人カード' },
      { key: 'matrix', label: '🃏 ランク×タイプ' }
    ];
    const nodes = [];
    layers.forEach(l => {
      nodes.push(el('div', 'zukan-layer', l.label));
      const grid = el('div', 'zukan-grid');
      catalog.filter(c => c.layer === l.key).forEach(c => {
        const got = col[c.id];
        const tile = el('button', 'zukan-tile' + (got ? ' owned zrank-' + rankKeyOf(got.snap) : ' locked'));
        tile.dataset.cardId = c.id;
        tile.appendChild(zukanTileArt(c, got));
        const copy = el('span', 'zt-copy');
        if (got) {
          copy.appendChild(el('span', 'zt-title', c.title));
          copy.appendChild(el('span', 'zt-sub', (got.snap.expelled ? '×' : got.snap.rank) + ' / No.' + String(got.cardNo).padStart(3, '0')));
          tile.onclick = () => openZukanDetail(got);
        } else {
          copy.appendChild(el('span', 'zt-title', '？？？'));
        }
        tile.appendChild(copy);
        grid.appendChild(tile);
      });
      nodes.push(grid);
    });
    $('#zukan-list').replaceChildren(...nodes);
    $('#zukan-sub').replaceChildren(document.createTextNode('コンプ率 ' + owned + ' / ' + catalog.length + '　'));
    const galleryLink = el('button', 'zukan-gallery-link', '🎴 全カード見本を見る');
    galleryLink.onclick = () => { closeZukan(); renderCardGallery(); };
    $('#zukan-sub').appendChild(galleryLink);
    $('#zukan-modal').classList.remove('hidden');
  }
  function closeZukan() { $('#zukan-modal').classList.add('hidden'); }

  function openZukanDetail(got) {
    const d = new Date(got.date);
    const dateStr = isNaN(d) ? '' : (d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate());
    const cardEl = buildPlayerCard(got.snap, got.cardNo);
    // 取得枚数・自己ベスト（改善プラン#5）。旧形式(count無し)は初回分の1枚・スナップ値で表示
    const count = got.count || 1;
    const bestCp = (got.bestCp !== undefined) ? got.bestCp : ((got.snap && got.snap.cp) || 0);
    const bestPt = (got.bestPt !== undefined) ? got.bestPt : ((got.snap && got.snap.totalPoints) || 0);
    const info = el('p', 'center zukan-date',
      '初解禁 ' + dateStr + '・取得' + count + '枚／最高CP ' + bestCp + '・最高pt ' + bestPt);
    $('#zukan-detail-body').replaceChildren(cardEl, info, buildCardActions(got.snap, got.cardNo));
    $('#zukan-detail').classList.remove('hidden');
  }
  function closeZukanDetail() { $('#zukan-detail').classList.add('hidden'); }

  // ---- カード画像ダウンロード（Phase3）: canvasに描画してPNG保存（外部ライブラリ不使用） ----
  const CARD_FRAME_COLORS = {
    S: ['#67e8f9', '#818cf8', '#c084fc'], A: ['#ffd76a', '#e8a12b', '#fff3c4'],
    B: ['#c3d0de', '#5b6b82', '#e2eaf2'], C: ['#d9a37c', '#9a6a44', '#e8c3a4'],
    D: ['#46577a', '#46577a', '#5b6b82'], E: ['#7a8aa8', '#7a8aa8', '#8a9ab8'],
    X: ['#6b7280', '#4b5563', '#6b7280']
  };
  // カードをcanvasに描画し、完成したcanvasを done(cv) で返す（downloadとshareで共用）
  function renderCardCanvas(card, cardNo, done) {
    const rankKey = card.expelled ? 'X' : card.rank;
    const rar = card.expelled ? CARD_RARITY['退学'] : (CARD_RARITY[card.rank] || CARD_RARITY.E);
    const W = 640, H = 940;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    // フレーム（レア度グラデ）＋本体
    const fc = CARD_FRAME_COLORS[rankKey] || CARD_FRAME_COLORS.E;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, fc[0]); g.addColorStop(.5, fc[1]); g.addColorStop(1, fc[2]);
    ctx.fillStyle = g; rr(0, 0, W, H, 36); ctx.fill();
    ctx.fillStyle = card.expelled ? '#1c2129' : '#0e1830'; rr(10, 10, W - 20, H - 20, 28); ctx.fill();
    // ヘッダー: レア度＋★／ランクバッジ
    const accent = rankKey === 'S' ? '#8fe6ff' : (rankKey === 'A' ? '#ffd76a' : '#9fb6e8');
    ctx.fillStyle = accent; ctx.font = '800 22px ' + FONT; ctx.textBaseline = 'alphabetic';
    ctx.fillText(rar.label + ' ' + '★'.repeat(rar.stars), 34, 62);
    ctx.fillStyle = rankKey === 'S' ? '#67e8f9' : (rankKey === 'A' ? '#ffd76a' : '#b9c8dc');
    rr(W - 90, 28, 56, 56, 14); ctx.fill();
    ctx.fillStyle = '#0e1830'; ctx.font = '800 34px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText(card.expelled ? '×' : card.rank, W - 62, 70); ctx.textAlign = 'left';
    // 名前・称号
    ctx.fillStyle = card.expelled ? '#c8ccd4' : '#eaf2ff'; ctx.font = '800 46px ' + FONT;
    ctx.fillText(card.name, 34, 130);
    ctx.fillStyle = '#a9c4ff'; ctx.font = '700 23px ' + FONT;
    ctx.fillText('「' + card.title + '」・' + card.typeLabel, 34, 166);
    // アートパネル
    rr(24, 188, W - 48, 300, 20);
    ctx.fillStyle = card.expelled ? '#252b36' : '#141f3d'; ctx.fill();
    ctx.strokeStyle = card.expelled ? '#3a414f' : '#3b4f86'; ctx.lineWidth = 2; ctx.stroke();
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
    // 数値・ステータス・フッター（アート描画の完了後に確定描画→保存）
    const drawRest = () => {
      // ART:ラベルはアートの上に載せる（画像がパネル全面を覆うケースにも対応）
      ctx.fillStyle = '#cbd8ef'; ctx.font = '700 17px ' + FONT;
      ctx.fillText('ART: ' + card.typeLabel, 44, 474);
      ctx.fillStyle = '#7f97cf'; ctx.font = '800 19px ' + FONT;
      ctx.fillText('能力CP', 34, 530);
      ctx.textAlign = 'right'; ctx.fillText('通算pt', W - 34, 530); ctx.textAlign = 'left';
      ctx.fillStyle = rankKey === 'S' ? '#8fe6ff' : '#eaf2ff'; ctx.font = '800 54px ' + FONT;
      ctx.fillText(String(card.cp), 34, 584);
      ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'right'; ctx.fillText(String(card.totalPoints), W - 34, 584); ctx.textAlign = 'left';
      const stats = [['難易度', card.stats.difficulty, '操作', card.stats.control], ['新奇性', card.stats.novelty, '構成', card.stats.composition]];
      ctx.font = '700 24px ' + FONT;
      stats.forEach((row, i) => {
        const y = 640 + i * 42;
        ctx.fillStyle = '#a9c4ff'; ctx.fillText(row[0], 34, y);
        ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'right'; ctx.fillText(String(row[1]), 300, y); ctx.textAlign = 'left';
        ctx.fillStyle = '#a9c4ff'; ctx.fillText(row[2], 350, y);
        ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'right'; ctx.fillText(String(row[3]), W - 34, y); ctx.textAlign = 'left';
      });
      // フッター帯（本体の角丸内にクリップして塗る）
      rr(10, 10, W - 20, H - 20, 28); ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(0, 0, 0, .35)'; ctx.fillRect(10, H - 108, W - 20, 98); ctx.restore();
      ctx.fillStyle = '#ffe4a3'; ctx.font = '700 23px ' + FONT;
      ctx.fillText(card.medals.join(' '), 34, H - 64);
      const bgLabel = (DT.DATA.BACKGROUNDS.find(b => b.id === card.background) || {}).label || '';
      ctx.fillStyle = '#8a9ac0'; ctx.font = '700 19px ' + FONT; ctx.textAlign = 'right';
      ctx.fillText(bgLabel + ' / No.' + String(cardNo).padStart(3, '0'), W - 34, H - 32); ctx.textAlign = 'left';
      drawCardFace(() => done(cv));
    };
    // アート: 画像(CARD_IMAGE・same-origin)があればPNGをパネルにcover描画、無ければ署名SVG。画像失敗時はSVGへ。
    const artSrc = cardImageSrc(card.id);
    const drawSvgArt = () => {
      const artColor = rankKey === 'S' ? '#8fe6ff' : (rankKey === 'A' ? '#ffdf8f' : (rankKey === 'X' ? '#8a919c' : '#8fc4e8'));
      const svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="340" height="306" style="color:' + artColor + '">' + (CARD_ART[card.type] || CARD_ART.allround) + '</svg>';
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, (W - 340) / 2, 186, 340, 306); URL.revokeObjectURL(img.src); drawRest(); };
      img.onerror = () => drawRest();
      img.src = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
    };
    if (artSrc) {
      const pimg = new Image();
      pimg.onload = () => {
        ctx.save(); rr(24, 188, W - 48, 300, 20); ctx.clip();
        const iw = pimg.width, ih = pimg.height, tw = W - 48, th = 300, tr = tw / th; // object-fit: cover
        let sw, sh, sx, sy;
        if (iw / ih > tr) { sh = ih; sw = Math.round(ih * tr); sx = Math.round((iw - sw) / 2); sy = 0; }
        else { sw = iw; sh = Math.round(iw / tr); sx = 0; sy = Math.round((ih - sh) / 2); }
        ctx.drawImage(pimg, sx, sy, sw, sh, 24, 188, tw, th);
        ctx.restore(); drawRest();
      };
      pimg.onerror = drawSvgArt;
      pimg.src = artSrc;
    } else {
      drawSvgArt();
    }
  }

  // カード下のアクション行（🔗シェア＋📷保存）。エンディング・図鑑詳細で共用
  function buildCardActions(card, cardNo) {
    const row = el('div', 'card-actions');
    row.appendChild(buildShareButton(card, cardNo));
    const dl = el('button', 'card-dl-btn', '📷 保存');
    dl.onclick = () => downloadCardImage(card, cardNo);
    row.appendChild(dl);
    return row;
  }

  const cardFileName = (card, cardNo) => 'diabolo-card-No' + String(cardNo).padStart(3, '0') + '-' + card.id + '.png';

  // カードをPNGのFileにして返す（シェア用に先読みしておく）
  function renderCardFile(card, cardNo) {
    return new Promise(resolve => {
      renderCardCanvas(card, cardNo, cv => cv.toBlob(
        b => resolve(b ? new File([b], cardFileName(card, cardNo), { type: 'image/png' }) : null), 'image/png'));
    });
  }

  function downloadCardImage(card, cardNo) {
    renderCardCanvas(card, cardNo, cv => cv.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = cardFileName(card, cardNo);
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
    }, 'image/png'));
  }

  // シェア文言＋URL（バックエンドなし＝ゲームのURL。?auto等のクエリは落とす）
  function shareText(card) {
    return '４８ヶ月のディアボロで「' + card.title + '」に！\n#４８ヶ月のディアボロ';
  }
  function shareUrl() { return location.origin + location.pathname; }

  // シェアボタン: 表示時に画像を先読み(filePromise)し、クリック(ユーザー操作)時に即share
  function buildShareButton(card, cardNo) {
    const btn = el('button', 'card-share-btn', '🔗 シェア');
    const filePromise = renderCardFile(card, cardNo).catch(() => null);
    btn.onclick = () => doShareCard(card, cardNo, filePromise);
    return btn;
  }

  async function doShareCard(card, cardNo, filePromise) {
    const text = shareText(card);
    const url = shareUrl();
    let file = null;
    try { file = await filePromise; } catch (e) { file = null; }
    const canFile = file && navigator.canShare && navigator.canShare({ files: [file] });
    try {
      if (navigator.share && canFile) { await navigator.share({ files: [file], text: text, url: url }); return; }
      if (navigator.share) { await navigator.share({ text: text, url: url }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // ユーザーがシェアシートを閉じただけ
      // それ以外はフォールバックへ
    }
    shareFallback(text, url, file, card, cardNo);
  }

  // PC/非対応: X(Twitter) intentを開く＋画像を手動添付できるようDL
  function shareFallback(text, url, file, card, cardNo) {
    if (file) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = cardFileName(card, cardNo);
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
    }
    const intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text + '\n' + url);
    window.open(intent, '_blank', 'noopener');
  }

  $('#btn-restart').onclick = () => { DT.state.clear(undefined, GAME_MODE); state = null; initTitle(); };

  // --- ボトムナビ・戻る ---
  $('#nav-home').onclick = () => { if (state) show('#screen-home'); };
  $('#nav-detail').onclick = () => { if (state) renderDetail(); };
  $('#nav-settings').onclick = () => { if (state) openSettings(); };
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => show('#screen-home'); });
  document.querySelectorAll('[data-close-schedule]').forEach(b => { b.onclick = closeSchedule; });
  document.querySelectorAll('[data-close-points]').forEach(b => { b.onclick = closePoints; });
  document.querySelectorAll('[data-close-settings]').forEach(b => { b.onclick = closeSettings; });
  document.querySelectorAll('[data-close-records]').forEach(b => { b.onclick = closeRecords; });
  document.querySelectorAll('[data-close-alumni]').forEach(b => { b.onclick = closeAlumniRoster; });
  document.querySelectorAll('[data-close-radar]').forEach(b => { b.onclick = closeRadar; });
  document.querySelectorAll('[data-close-log]').forEach(b => { b.onclick = closeLog; });
  document.querySelectorAll('[data-close-registration]').forEach(b => { b.onclick = closeRegistration; });
  $('#btn-records').onclick = openRecords;
  $('#btn-alumni').onclick = openAlumniRoster;
  $('#btn-alumni-save').onclick = saveAlumniRoster;
  $('#alumni-search').oninput = () => {
    alumniSearchQuery = $('#alumni-search').value || '';
    renderAlumniRoster();
  };
  $('#btn-zukan').onclick = openZukan;
  document.querySelectorAll('[data-close-zukan]').forEach(b => { b.onclick = closeZukan; });
  document.querySelectorAll('[data-close-zukan-detail]').forEach(b => { b.onclick = closeZukanDetail; });

  // --- 開発用パラメータパネル ---
  function devRow(k, v, cls) {
    const row = el('div', 'dev-row');
    row.appendChild(el('span', 'k', k));
    row.appendChild(el('span', 'v' + (cls ? ' ' + cls : ''), v));
    return row;
  }
  function devSection(label, children) {
    const s = el('div', 'dev-section');
    s.appendChild(el('div', 'dev-label', label));
    children.forEach(c => s.appendChild(c));
    return s;
  }

  function updateDevPanel() {
    const body = $('#dev-body');
    if (!state) {
      body.replaceChildren(el('div', 'dev-note', 'ゲーム開始後に現在のstateを表示します。'));
      return;
    }
    const bd = DT.contest.breakdown(state, 'overall');
    const rawTotal = Object.values(bd).reduce((a, v) => a + v, 0);
    const nextContest = nextContestFrom(state.turn);
    const nextWorlds = DT.DATA.WORLDS_TURNS.find(t => t >= state.turn);
    const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
    const nextUnlock = DT.contest.nextUnlockTarget(state);

    const stateRows = [
      devRow('turn', state.turn + ' / ' + DT.DATA.TOTAL_TURNS + '（' + DT.engine.turnLabel(state.turn) + '）'),
      devRow('totalPoints', totalPoints() + 'pt'),
      devRow('motivation', state.motivation + '（' + DT.engine.motivationLabel(state.motivation) + '）', state.motivation >= 60 ? 'good' : (state.motivation < 40 ? 'warn' : '')),
      devRow('fatigue', String(state.fatigue), state.fatigue >= 55 ? 'warn' : ''),
      devRow('injuryRisk', String(state.injuryRisk), state.injuryRisk >= 40 ? 'warn' : ''),
      devRow('study', String(state.study), state.study < DT.DATA.STUDY_MIN ? 'warn' : ''),
      devRow('composition', String(state.composition)),
      devRow('banTurns', String(state.banTurns)),
      devRow('injuredTurns', String(state.injuredTurns)),
      devRow('outdoorTurns', String(state.outdoorTurns || 0), state.outdoorTurns > 0 ? 'warn' : '')
    ];

    const grid = el('table', 'dev-grid');
    const gh = el('tr');
    ['genre', 'diff', 'nov', 'ctrl', 'avg'].forEach(h => gh.appendChild(el('th', '', h)));
    grid.appendChild(gh);
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const tr = el('tr', unlocked ? '' : 'locked');
      tr.appendChild(el('td', '', g.id + (unlocked ? '' : ' 🔒')));
      DT.DATA.METHODS.forEach(m => tr.appendChild(el('td', '', String(state.skills[g.id][m.id]))));
      tr.appendChild(el('td', 'avg', String(DT.contest.genreAvg(state, g.id))));
      grid.appendChild(tr);
    });

    const forecastRows = [
      devRow('next', nextContest ? nextContest.name + ' (t' + nextContest.turn + ')' : '—'),
      devRow('worldsQualified', nextWorlds && DT.contest.worldsQualified(state, nextWorlds) ? 'true' : 'false',
        nextWorlds && DT.contest.worldsQualified(state, nextWorlds) ? 'good' : 'warn'),
      devRow('expectedScore', String(Math.round((DT.DATA.SCORING.scale.base + rawTotal * DT.DATA.SCORING.scale.mult) * 10) / 10)),
      devRow('missRate', DT.contest.missRate(state, 'overall') + '%'),
      devRow('nextExam', nextExam ? 't' + nextExam : '—'),
      devRow('meetupMonth', DT.engine.isMeetupMonth(state.turn) ? 'true' : 'false', DT.engine.isMeetupMonth(state.turn) ? 'good' : ''),
      devRow('nextUnlock', nextUnlock ? nextUnlock.id + '（' + nextUnlock.reqGenre + 'あと' + nextUnlock.remaining + '）' : '全解禁')
    ];

    const uiRows = [
      devRow('slotsUI', slotsUI.map(s => !s ? 'null' : (s === 'routine' ? 'routine' : s.genre + '.' + s.method.slice(0, 4))).join(' | ')),
      devRow('status', state.status)
    ];

    body.replaceChildren(
      devSection('STATE', stateRows),
      devSection('SKILLS（GRID 4×3）', [grid]),
      devSection('CONTEST / FORECAST', forecastRows),
      devSection('TRAINING UI STATE', uiRows),
      el('div', 'dev-note', '※ 開発用。幅1100px未満（＝スマホ実機）では非表示。')
    );
  }

  // ---- おまかせ自動プレイ（デモ/確認用・2026-07-15） ----
  // URLに ?auto=1 で高校(ノーマル)、?auto=college / juniorhigh で経歴指定。
  // CPUが4年分を即時プレイしてエンディング(パック開封)へ直行。記録(RECORDS)には保存しない。
  // リロードするたび新しい結果＝別のカードが出る（開封演出のガチャ的確認ツール）。
  function autoPlayDemo(backgroundId) {
    const clampV = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    state = DT.state.newCharacter(undefined, backgroundId);
    state.name = 'おまかせ';
    let guard = 0;
    while (state.status === 'playing' && guard++ < 100) {
      // 練習前スロット: おみくじ → 状態イベント → ランダム（イベントは先頭選択）
      let skip = false;
      if (DT.events.isOmikujiTurn(state.turn)) {
        DT.events.drawOmikuji(state);
      } else {
        const cond = DT.events.conditionalEventFor(state);
        if (cond) {
          if (cond.awakenTrigger) {
            if (Math.random() < 0.5) DT.events.startAwakening(state);
            else state.motivation = clampV(state.motivation - 20, 0, 100);
          } else if (cond.choices) { DT.events.applyChoice(state, cond, 0); }
          else { DT.events.applyConditional(state, cond); if (cond.id === 'collapse') skip = true; }
        } else {
          const ev = DT.events.roll(state);
          if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
          else if (ev) DT.events.applyHappening(state, ev.event);
        }
      }
      // 行動: 怪我=療養 / 補習・学力低=勉強 / 疲労高=休養 / それ以外=弱点補強の練習
      if (!skip) {
        let act = 'train';
        if (state.injuredTurns > 0) act = 'injured';
        else if (state.banTurns > 0) act = state.fatigue > 55 ? 'rest' : 'study';
        else {
          const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
          if (nextExam !== undefined && nextExam - state.turn <= 1 && state.study < 45) act = 'study';
          else if (state.study < 30) act = 'study';
          else if (state.fatigue > 55) act = 'rest';
        }
        if (act === 'train') {
          const unlockedG = DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(state, g.id));
          const cells = [];
          unlockedG.forEach(g => DT.DATA.METHODS.forEach(m => cells.push({ genre: g.id, method: m.id, v: state.skills[g.id][m.id] })));
          cells.sort((a, b) => a.v - b.v);
          const s1 = { genre: cells[0].genre, method: cells[0].method };
          const s2 = cells[1] ? { genre: cells[1].genre, method: cells[1].method } : 'routine';
          DT.engine.applyTraining(state, [s1, s2, 'routine']);
          DT.engine.rollInjury(state);
        } else {
          DT.engine.applyAction(state, act);
        }
      } else { state.didTrain = false; state.didStudy = false; }
      // 練習後スロット: 大会 → 世界 → ジャグリング全国大会 → 固定イベント
      const contest = DT.contest.contestForTurn(state.turn);
      const wc = DT.contest.worldsContestForTurn(state.turn);
      const jq = DT.contest.jjfQualifierForTurn(state.turn);
      const jf = DT.contest.jjfFinalForTurn(state.turn);
      if (contest) {
        let ids;
        if (contest.type === 'shizuoka') { ids = ['technical', 'performance']; }
        else {
          const sp = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id)).map(d => d.id);
          ids = ['overall'].concat(sp.slice(0, DT.contest.maxEntries(state.turn) - 1));
        }
        DT.contest.runAll(state, contest, ids);
      } else if (wc && DT.contest.worldsQualified(state, state.turn)) {
        DT.contest.runAll(state, wc, ['overall']);
      } else if (jq) {
        const q = DT.contest.jjfQualify(state);
        if (q.passed) {
          state.motivation = clampV(state.motivation + DT.DATA.JJF.passMotivation, 0, 100);
          state.jjfFinalist = 1;
          state.results.push({ name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'ジャグリング全国大会予選突破',
            rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn, standings: [], rivalMessages: [] });
        } else { state.motivation = clampV(state.motivation - 8, 0, 100); }
      } else if (jf && state.jjfFinalist) {
        state.jjfFinalist = 0;
        DT.contest.runJjfFinal(state, jf);
      } else {
        const sched = DT.events.scheduledEventFor(state);
        if (sched) { if (sched.choices) DT.events.applyChoice(state, sched, 0); else DT.events.applyScheduled(state, sched); }
      }
      DT.engine.endTurn(state);
    }
    state.recorded = true; // デモは記録(RECORDS)を汚さない
    renderEnding();
  }

  // DEV専用の卒業生イベント確認画面。実プレイのセーブや記録には触れない。
  function previewAlumniEvent() {
    state = DT.state.newCharacter(() => 0.5, 'highschool', GAME_MODE);
    state.turn = 28;
    state.alumniSchedule = [{ turn: 28, alumniId: 'kudo_masashi' }];
    state.alumniScheduleReady = true;
    renderAlumniEvent(DT.events.alumniEventFor(state), () => renderHome([]));
  }

  const autoParam = QUERY_PARAMS.get('auto');
  if (QUERY_PARAMS.get('gallery')) {
    initTitle();
    renderCardGallery();
  } else if (DEV && QUERY_PARAMS.get('preview') === 'transition') {
    state = DT.state.newCharacter(() => 0.5, 'highschool', GAME_MODE);
    state.turn = 2;
    initTitle();
    showMonthTransition(state.turn, initTitle);
  } else if (DEV && QUERY_PARAMS.get('preview') === 'create') {
    initTitle();
    renderCreate(newCandidate());
  } else if (DEV && SHORT && QUERY_PARAMS.get('preview') === 'alumni') {
    previewAlumniEvent();
  } else if (DEV && SHORT && QUERY_PARAMS.get('preview') === 'alumni-roster') {
    initTitle();
    openAlumniRoster();
  } else if (autoParam) {
    const bg = DT.DATA.BACKGROUNDS.some(b => b.id === autoParam) ? autoParam : 'highschool';
    autoPlayDemo(bg);
  } else {
    initTitle();
  }
})();
