// Turns src/page.html into src/page.js so the Worker can serve it with no asset setup.
// Run after editing page.html:  node scripts/build-page.js
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const html = readFileSync(join(src, 'page.html'), 'utf8');
writeFileSync(join(src, 'page.js'), `// GENERATED from page.html by scripts/build-page.js. Edit page.html, not this file.\nexport const PAGE_HTML = ${JSON.stringify(html)};\n`);
console.log('Built src/page.js');
