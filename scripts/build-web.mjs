import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const output = new URL('../www/', import.meta.url);
const root = new URL('../', import.meta.url);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of ['index.html', 'short.html']) {
  cpSync(new URL(file, root), new URL(file, output));
}

for (const directory of ['css', 'js', 'assets/icons', 'assets/cards/web']) {
  cpSync(new URL(directory, root), new URL(directory, output), { recursive: true });
}

const titleAsset = 'assets/title/title-card-combo-trail-v4-people-3d.png';
mkdirSync(new URL('assets/title/', output), { recursive: true });
cpSync(new URL(titleAsset, root), new URL(titleAsset, output));

// 月切替のキャラ画像。未配置ならローダーがSVG装置へ戻るので、無くてもビルドは成功させる。
const loaderAssets = new URL('assets/loader/', root);
if (existsSync(loaderAssets)) {
  cpSync(loaderAssets, new URL('assets/loader/', output), { recursive: true });
} else {
  console.log('assets/loader/ は未配置のため同期をとばしました（切替演出はSVG装置で動きます）。');
}

// 主人公の表情・イベントの顔チップ。契約書だけで画像が未配置なら、絵文字・名前へ戻るので同期をとばす。
const charAssets = new URL('assets/chars/', root);
const heroCharAssets = new URL('assets/chars/hero/', root);
const portraitCharAssets = new URL('assets/chars/portrait/', root);
if (existsSync(charAssets) && (existsSync(heroCharAssets) || existsSync(portraitCharAssets))) {
  cpSync(charAssets, new URL('assets/chars/', output), { recursive: true });
} else {
  console.log('assets/chars/ は未配置のため同期をとばしました（絵文字表示のまま動きます）。');
}

console.log('iOS用Web資産を www/ に同期しました。');
