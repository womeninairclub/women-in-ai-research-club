const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

console.log('Searching for any Top 50 teams or lists in all archives and directories...');

// 1. Check all files in current workspace
function searchDir(dir, query) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        searchDir(full, query);
      }
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (query.test(content)) {
          console.log(`[MATCH in file] ${full}`);
          const lines = content.split('\n');
          lines.forEach((l, idx) => {
            if (query.test(l)) {
              console.log(`  L${idx+1}: ${l.trim().substring(0, 120)}`);
            }
          });
        }
      } catch (e) {
        // binary or unreadable
      }
    }
  }
}

console.log('--- Searching workspace ---');
searchDir(path.resolve(__dirname, '..'), /top\s*50|shortlist.*50|50\s*teams/i);

console.log('--- Searching previous download directory ---');
try {
  searchDir('C:\\Users\\Banu\\Downloads\\women-in-ai-research-club-main', /top\s*50|shortlist.*50|50\s*teams/i);
} catch (e) {
  console.log('Error reading previous download dir:', e.message);
}
