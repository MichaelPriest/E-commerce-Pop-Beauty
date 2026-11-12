import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('logo atual é fonte única; as versões HD não redesenham nem substituem a arte',()=>{
 const script=read('scripts/enhance-brand-logo.mjs');
 assert.match(script,/public\/logo\.webp/);
 assert.match(script,/public\/logo-hd-512\.webp/);
 assert.match(script,/public\/logo-hd\.webp/);
 assert.match(script,/kernel:'lanczos3'/);
 assert.match(script,/\.sharpen\(/);
 assert.match(script,/\.webp\(/);
 assert.doesNotMatch(script,/https?:\/\//);
 assert.doesNotMatch(script,/unlink|writeFile\(original|toFile\(original/);
});
test('brand mantém tamanho de layout e usa versões HD responsivas',()=>{
 const brand=read('src/components/brand.tsx');
 assert.match(brand,/src="\/logo-hd-512\.webp"/);
 assert.match(brand,/srcSet="\/logo-hd-512\.webp 512w, \/logo-hd\.webp 1024w"/);
 assert.match(brand,/sizes="\(max-width:760px\) 66px, 99px"/);
 assert.match(brand,/alt="Popê Beauty"/);
 const css=read('src/app/globals.css');
 assert.match(css,/\.brand-image\{width:99px;height:99px/);
 assert.match(css,/\.brand-image\{width:66px;height:66px/);
});
test('scripts criam os arquivos antes do build e em desenvolvimento',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.predev,'node scripts/enhance-brand-logo.mjs');
 assert.equal(pkg.scripts.build,
  'npm run test && node scripts/enhance-brand-logo.mjs && next build');
 const lock=JSON.parse(read('package-lock.json'));
 assert.ok(lock.packages['node_modules/sharp'],'Processador Sharp está no lockfile.');
});
