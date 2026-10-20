const fs = require('fs');
const path = require('path');

const backupDir = 'c:/Users/Banu/Downloads/women-in-ai-research-club-main/source_backup_20261019_225946';
const currentDir = 'c:/Users/Banu/Downloads/women-in-ai-research-club-main/women-in-ai-research-club-main';

function getFiles(dir, base = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const relPath = path.join(base, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getFiles(fullPath, relPath));
      }
    } else {
      results.push(relPath);
    }
  });
  return results;
}

const backupFiles = new Set(getFiles(backupDir));
const currentFiles = new Set(getFiles(currentDir));

const allFiles = new Set([...backupFiles, ...currentFiles]);
const modified = [];
const added = [];
const deleted = [];

for (const file of allFiles) {
  const inBackup = backupFiles.has(file);
  const inCurrent = currentFiles.has(file);
  if (inBackup && !inCurrent) {
    deleted.push(file);
  } else if (!inBackup && inCurrent) {
    added.push(file);
  } else {
    const bContent = fs.readFileSync(path.join(backupDir, file));
    const cContent = fs.readFileSync(path.join(currentDir, file));
    if (!bContent.equals(cContent)) {
      modified.push(file);
    }
  }
}

console.log(JSON.stringify({ modified, added, deleted }, null, 2));
