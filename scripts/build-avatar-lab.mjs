// アバター関連の検証ページを「単体で開けるHTML」に書き出す。
// design/*.html は ../js/avatar.js を読むので、開発サーバー越しでないと開けない。
// この書き出し版はavatar.jsを埋め込むため、ダブルクリックでも別端末でも開ける。
//
//   node scripts/build-avatar-lab.mjs
//
// 出力は生成物なので、絵柄を直したら作り直すこと（正は js/avatar.js と design/*.html）。
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const js = readFileSync(new URL('js/avatar.js', root), 'utf8');
const tag = '<script src="../js/avatar.js"></script>';

const PAGES = [
  ['design/avatar-lab.html', 'design/avatar-lab-standalone.html'],
  ['design/avatar-styles.html', 'design/avatar-styles-standalone.html'],
];

for (const [src, dst] of PAGES) {
  const html = readFileSync(new URL(src, root), 'utf8');
  if (!html.includes(tag)) {
    console.error(src + ' に読み込みタグが見つかりません: ' + tag);
    process.exit(1);
  }
  const out = html
    .replace('<title>', '<!-- 生成物: scripts/build-avatar-lab.mjs が作成。直接編集しない（正は ' + src + '） -->\n<title>')
    .replace(tag, '<script>\n' + js + '\n</script>');
  writeFileSync(new URL(dst, root), out);
  console.log('書き出しました: ' + dst + ' （' + Math.round(out.length / 1024) + 'KB）');
}
