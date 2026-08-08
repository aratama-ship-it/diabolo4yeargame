'use strict';

// ショート版の得意技カード候補を、現行の最適方針シミュレーター上で比較する。
// 3年生5月（内部turn 26）の固定イベントでカードを選び、通常イベント1件の代わりに発動する。
// ゲイン補正は「ショート倍率適用後」に加算し、成功した該当スロットだけに適用する。
//
// Usage:
//   node tests/simulate-technique-card-balance.js [selectionN] [validationN] [evaluationN] [outputJson]

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const projectRoot = path.resolve(__dirname, '..');
const sourceSimulator = path.join(__dirname, 'simulate-optimal-difficulty.js');
const contestPath = path.join(projectRoot, 'js', 'contest.js');

// ハプニングだけはプレイヤーの審査員ぶれ幅を変えるため、分析プロセス内で
// contest.js の同一式を差し替えて読み込む。製品コードそのものは変更しない。
const originalJsLoader = Module._extensions['.js'];
Module._extensions['.js'] = function techniqueSimulationLoader(module, filename) {
  if (path.resolve(filename) !== contestPath) {
    originalJsLoader(module, filename);
    return;
  }
  let source = fs.readFileSync(filename, 'utf8');
  const original = "const judgeMod = Math.round(((state.motivation - 50) * DT.DATA.MOTIVATION.judgeCoef + (rng() * 6 - 3)) * 10) / 10;";
  const replacement = [
    "const happeningMatch = /^happening(\\d+)$/.exec(state.techniqueCard || '');",
    "const judgeHalfRange = happeningMatch ? Number(happeningMatch[1]) : 3;",
    "const judgeMod = Math.round(((state.motivation - 50) * DT.DATA.MOTIVATION.judgeCoef",
    "  + (rng() * judgeHalfRange * 2 - judgeHalfRange)) * 10) / 10;"
  ].join('\n    ');
  if (!source.includes(original)) throw new Error('contest.js の審査員ぶれ式が見つかりません');
  source = source.replace(original, replacement);
  module._compile(source, filename);
};

function loadSimulatorLibrary() {
  const source = fs.readFileSync(sourceSimulator, 'utf8');
  const marker = 'const selectionN = Number.parseInt(process.argv[2], 10) || 200;';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error('最適方針シミュレーターのCLI境界が見つかりません');
  const librarySource = source.slice(0, index) + [
    '',
    'module.exports = {',
    '  DT, play, candidates, TRAIN_PLANS, ACADEMICS,',
    '  unlockedCells, slot, fill3, mean, RANKS',
    '};',
    ''
  ].join('\n');
  const simulatorModule = new Module(sourceSimulator, module);
  simulatorModule.filename = sourceSimulator;
  simulatorModule.paths = Module._nodeModulePaths(path.dirname(sourceSimulator));
  simulatorModule._compile(librarySource, sourceSimulator);
  return simulatorModule.exports;
}

const sim = loadSimulatorLibrary();
Module._extensions['.js'] = originalJsLoader;

const DT = sim.DT;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mean = (rows, getter) => rows.reduce((sum, row) => sum + getter(row), 0) / rows.length;
const SIGNATURE_EVENT_TURN = 26;

const CARDS = [
  { id: 'none', label: 'カードなし', rules: [] },
  { id: 'integral', label: 'インテグラル', rules: [{ genres: ['h1d'], method: 'difficulty', amount: 8 }] },
  {
    id: 'high_toss',
    label: 'ハイトス',
    rules: [
      { genres: ['d2', 'd3'], method: 'control', amount: 6 },
      { genres: ['d2', 'd3'], method: 'novelty', amount: -1 }
    ]
  },
  { id: 'fts', label: 'FTS', rules: [{ genres: ['d3'], method: 'difficulty', amount: 10 }] },
  { id: 'picture', label: 'ピクチャー', rules: [{ genres: ['h1d', 'v1d'], method: 'novelty', amount: 3 }] },
  {
    id: 'pirouette',
    label: 'ピルエット',
    rules: [{ initial: true, genres: ['h1d', 'v1d', 'd2', 'd3'], method: 'difficulty', amount: 1 }]
  },
  { id: 'sadistic', label: 'サディスティック', rules: [{ genres: ['h1d'], method: 'novelty', amount: 5 }] },
  { id: 'on_beat', label: '音はめ', rules: [{ initial: true, routine: true, amount: 2 }] },
  {
    id: 'body',
    label: 'ボディ系',
    rules: [{ initial: true, genres: ['h1d', 'v1d', 'd2', 'd3'], method: 'novelty', amount: 2 }]
  },
  { id: 'happening6', label: 'ハプニング（±6）', rules: [] },
  { id: 'happening8', label: 'ハプニング（±8）', rules: [] },
  { id: 'happening10', label: 'ハプニング（±10）', rules: [] }
];

let activeCard = CARDS[0];
let activeTechniqueDelta = 0;
let activeTechniqueTrainingActions = 0;

function ruleForSlot(card, trainingSlot) {
  return card.rules.find(rule => {
    if (rule.initial) return false;
    if (trainingSlot === 'routine') return !!rule.routine;
    return !rule.routine
      && rule.method === trainingSlot.method
      && rule.genres.includes(trainingSlot.genre);
  });
}

function positiveTargets(state, card) {
  const targets = [];
  card.rules.filter(rule => !rule.initial && rule.amount > 0).forEach(rule => {
    if (rule.routine) {
      if (state.composition < 85) targets.push({ slot: 'routine', value: state.composition, amount: rule.amount });
      return;
    }
    rule.genres.forEach(genre => {
      if (!DT.contest.isGenreUnlocked(state, genre)) return;
      targets.push({
        slot: { genre, method: rule.method },
        value: state.skills[genre][rule.method],
        amount: rule.amount
      });
    });
  });
  return targets.sort((a, b) => a.value - b.value || b.amount - a.amount);
}

sim.TRAIN_PLANS.signature = {
  label: '得意技集中',
  slots(state) {
    const targets = positiveTargets(state, activeCard);
    if (targets.length === 0) return sim.TRAIN_PLANS.balance.slots(state);
    const fallback = sim.unlockedCells(state);
    return sim.fill3([
      targets[0].slot,
      targets[0].slot,
      targets[1] ? targets[1].slot : sim.slot(fallback[0])
    ]);
  }
};

sim.TRAIN_PLANS.signatureBlend = {
  label: '得意技＋弱点補強',
  slots(state) {
    const targets = positiveTargets(state, activeCard);
    if (targets.length === 0) return sim.TRAIN_PLANS.balance.slots(state);
    const weakest = sim.unlockedCells(state);
    return sim.fill3([
      targets[0].slot,
      sim.slot(weakest[0]),
      state.composition < 85 ? 'routine' : (targets[1] ? targets[1].slot : sim.slot(weakest[1]))
    ]);
  }
};

const originalNewCharacter = DT.state.newCharacter;
DT.state.newCharacter = function newCharacterWithTechnique(rng, background, mode) {
  const state = originalNewCharacter(rng, background, mode);
  state.techniqueCard = 'none';
  state.techniqueCardSelectedAt = null;
  return state;
};

function activateTechniqueCard(state) {
  if (state.techniqueCardSelectedAt !== null) return;
  state.techniqueCard = activeCard.id;
  state.techniqueCardSelectedAt = state.turn;
  activeCard.rules.filter(rule => rule.initial).forEach(rule => {
    if (rule.routine) {
      const before = state.composition;
      state.composition = clamp(state.composition + rule.amount, 0, 100);
      activeTechniqueDelta += state.composition - before;
      return;
    }
    rule.genres.forEach(genre => {
      const before = state.skills[genre][rule.method];
      state.skills[genre][rule.method] = clamp(before + rule.amount, 0, 100);
      activeTechniqueDelta += state.skills[genre][rule.method] - before;
    });
  });
}

// 固定イベントは、同月に抽選される通常イベント（状態依存イベントを含む）1件を置き換える。
// 3年生5月はおみくじ月ではないため、conditionalEventForの入口で発動すれば
// 現行ゲームループと同じ「イベント→大会」の順序になる。
const originalConditionalEventFor = DT.events.conditionalEventFor;
DT.events.conditionalEventFor = function conditionalEventForWithSignature(state) {
  if (state.gameMode === 'short' && state.turn === SIGNATURE_EVENT_TURN) {
    activateTechniqueCard(state);
    return null;
  }
  return originalConditionalEventFor(state);
};

const originalEventRoll = DT.events.roll;
DT.events.roll = function rollWithSignatureEventSlot(state, rng) {
  if (state.gameMode === 'short' && state.turn === SIGNATURE_EVENT_TURN) return null;
  return originalEventRoll(state, rng);
};

const originalApplyTraining = DT.engine.applyTraining;
DT.engine.applyTraining = function applyTrainingWithTechnique(state, slots, rng) {
  const result = originalApplyTraining(state, slots, rng);
  if (state.techniqueCardSelectedAt === null || state.techniqueCard !== activeCard.id) return result;
  activeTechniqueTrainingActions += 1;
  let positiveApplied = false;
  let negativeApplied = false;
  result.results.forEach(entry => {
    if (entry.gain <= 0) return;
    const rule = ruleForSlot(activeCard, entry.slot);
    if (!rule) return;
    if (rule.amount > 0 && positiveApplied) return;
    if (rule.amount < 0 && negativeApplied) return;
    if (rule.amount > 0) positiveApplied = true;
    if (rule.amount < 0) negativeApplied = true;
    if (entry.slot === 'routine') {
      const before = state.composition;
      state.composition = clamp(state.composition + rule.amount, 0, 100);
      activeTechniqueDelta += state.composition - before;
    } else {
      const cell = state.skills[entry.slot.genre];
      const before = cell[entry.slot.method];
      // マイナス効果は「伸びを減らす」ため、元の成功ゲインを超えて能力を下げない。
      const effectiveAmount = Math.max(-entry.gain, rule.amount);
      cell[entry.slot.method] = clamp(cell[entry.slot.method] + effectiveAmount, 0, 100);
      activeTechniqueDelta += cell[entry.slot.method] - before;
    }
  });
  return result;
};

function runOne(seed, background, candidate, card) {
  activeCard = card;
  activeTechniqueDelta = 0;
  activeTechniqueTrainingActions = 0;
  const row = sim.play(seed, 'short', background, candidate);
  row.techniqueDelta = activeTechniqueDelta;
  row.techniqueTrainingActions = activeTechniqueTrainingActions;
  return row;
}

function runBatch(count, seedBase, background, candidate, card) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(runOne(seedBase + i * 7919, background, candidate, card));
  }
  return rows;
}

function sd(rows, getter) {
  const avg = mean(rows, getter);
  return Math.sqrt(mean(rows, row => Math.pow(getter(row) - avg, 2)));
}

function quantile(rows, getter, p) {
  const values = rows.map(getter).sort((a, b) => a - b);
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)));
  return values[index];
}

function brief(rows, candidate) {
  return {
    candidate,
    meanPoints: mean(rows, row => row.points),
    meanAbility: mean(rows, row => row.ability),
    saRate: mean(rows, row => row.rank === 'S' || row.rank === 'A' ? 1 : 0)
  };
}

function evaluateCard(card, background, cohortIndex, selectionN, validationN, evaluationN) {
  // 既存の大規模探索で上位だった rest55・lean を固定し、カードごとに
  // 練習方針と大会方針だけを再選定する。カード比較は同一シードで行う。
  const allowedPolicies = background === 'college'
    ? ['safe', 'adaptive']
    : ['attack', 'adaptive'];
  const candidateList = sim.candidates().filter(candidate =>
    candidate.restLine === 55
      && candidate.academic === 'lean'
      && allowedPolicies.includes(candidate.contestPolicy));
  const seed = phase => (phase * 100000000 + cohortIndex * 10000000 + 104729) >>> 0;
  const screened = candidateList.map(candidate =>
    brief(runBatch(selectionN, seed(1), background, candidate, card), candidate));
  screened.sort((a, b) => b.meanPoints - a.meanPoints || b.meanAbility - a.meanAbility || b.saRate - a.saRate);
  const finalists = screened.slice(0, 3).map(item =>
    brief(runBatch(validationN, seed(2), background, item.candidate, card), item.candidate));
  finalists.sort((a, b) => b.meanPoints - a.meanPoints || b.meanAbility - a.meanAbility || b.saRate - a.saRate);
  const winner = finalists[0].candidate;
  const rows = runBatch(evaluationN, seed(3), background, winner, card);
  return {
    card: card.id,
    label: card.label,
    background,
    selectedPolicy: winner.id,
    trainingPlan: sim.TRAIN_PLANS[winner.trainPlan].label,
    meanPoints: mean(rows, row => row.points),
    pointsSd: sd(rows, row => row.points),
    pointsP10: quantile(rows, row => row.points, 0.10),
    pointsP90: quantile(rows, row => row.points, 0.90),
    meanAbility: mean(rows, row => row.ability),
    meanTechniqueDelta: mean(rows, row => row.techniqueDelta),
    meanTechniqueTrainingActions: mean(rows, row => row.techniqueTrainingActions),
    graduationRate: mean(rows, row => row.status === 'graduated' ? 1 : 0),
    sRate: mean(rows, row => row.rank === 'S' ? 1 : 0),
    saRate: mean(rows, row => row.rank === 'S' || row.rank === 'A' ? 1 : 0),
    meanWins: mean(rows, row => row.wins),
    meanPodiums: mean(rows, row => row.podiums),
    evaluationRows: rows
  };
}

const selectionN = Number.parseInt(process.argv[2], 10) || 60;
const validationN = Number.parseInt(process.argv[3], 10) || 250;
const evaluationN = Number.parseInt(process.argv[4], 10) || 2000;
const outputPath = process.argv[5] ? path.resolve(process.argv[5]) : null;
const backgroundFilter = process.argv[6] || null;
const backgrounds = ['college', 'highschool', 'juniorhigh']
  .filter(background => !backgroundFilter || background === backgroundFilter);
if (backgrounds.length === 0) throw new Error('未知のbackground: ' + backgroundFilter);
const results = [];

backgrounds.forEach((background, backgroundIndex) => {
  const backgroundResults = CARDS.map(card => {
    process.stderr.write('評価中: ' + background + ' / ' + card.label + '\n');
    return evaluateCard(
      card,
      background,
      backgroundIndex,
      selectionN,
      validationN,
      evaluationN
    );
  });
  const baseline = backgroundResults.find(row => row.card === 'none');
  const baselineEvaluationRows = baseline.evaluationRows;
  backgroundResults.forEach(row => {
    const pointDiffs = row.evaluationRows.map((item, index) =>
      item.points - baselineEvaluationRows[index].points);
    const abilityDiffs = row.evaluationRows.map((item, index) =>
      item.ability - baselineEvaluationRows[index].ability);
    row.pairedPointDelta = mean(pointDiffs, value => value);
    row.pairedPointDeltaSd = sd(pointDiffs, value => value);
    row.pairedPointDeltaSe = row.pairedPointDeltaSd / Math.sqrt(pointDiffs.length);
    row.pairedAbilityDelta = mean(abilityDiffs, value => value);
    delete row.evaluationRows;
    results.push(row);
  });
});

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'short',
  assumptions: {
    bonusTiming: 'ショート版の2倍処理後に加算',
    signatureEvent: '3年生5月（内部turn 26）の固定イベントで選択し、同月の通常イベント1件を置き換える',
    growthEffectStarts: '固定イベント後、次の練習月（3年生6月）から適用',
    contestEffectStarts: '固定イベント後、3年生5月以降の大会から適用',
    activation: '該当スロットの練習ゲインが1以上のときだけ適用',
    cap: 100,
    happening: '通常の審査員ぶれ±3を候補幅へ拡大。平均値は不変',
    candidateSelection: 'カードごと・難易度ごとにヒューリスティック方針を再選定'
  },
  sampleSizes: { selectionN, validationN, evaluationN },
  cards: CARDS,
  results
};

const json = JSON.stringify(report, null, 2) + '\n';
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
  console.log('保存: ' + outputPath);
} else {
  process.stdout.write(json);
}
