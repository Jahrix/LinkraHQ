const fs = require('fs');

const path = 'apps/web/src/pages/DashboardPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replacements
content = content.replace(/text-white\/50/g, 'text-muted');
content = content.replace(/text-white\/60/g, 'text-muted');
content = content.replace(/text-white\/45/g, 'text-muted');
content = content.replace(/text-white\/20/g, 'text-subtle');
content = content.replace(/text-white\/90/g, 'text-strong');
content = content.replace(/text-white /g, 'text-strong ');
content = content.replace(/text-white"/g, 'text-strong"');
content = content.replace(/border-white\/5/g, 'border-subtle');
content = content.replace(/border-white\/10/g, 'border-muted');
content = content.replace(/border-white\/20/g, 'border-strong');
content = content.replace(/bg-white\/5/g, 'bg-subtle');
content = content.replace(/bg-white\/10/g, 'bg-muted');
content = content.replace(/bg-white\/\[0\.03\]/g, 'bg-subtle');
content = content.replace(/bg-white\/\[0\.055\]/g, 'bg-subtle');

fs.writeFileSync(path, content, 'utf8');
console.log('Replacements complete');
