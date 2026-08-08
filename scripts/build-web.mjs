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

console.log('iOS用Web資産を www/ に同期しました。');
