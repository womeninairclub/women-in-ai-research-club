const fs = require('fs');
const path = require('path');

const backupDir = 'c:/Users/Banu/Downloads/women-in-ai-research-club-main/source_backup_20261019_225946';
const currentDir = 'c:/Users/Banu/Downloads/women-in-ai-research-club-main/women-in-ai-research-club-main';

const files = [
  'extract_prompt.txt',
  'google-apps-script/code.gs',
  'google-apps-script/screening-emails.gs',
  'js/hackathon.js'
];

function diffFiles(relPath) {
  const bPath = path.join(backupDir, relPath);
  const cPath = path.join(currentDir, relPath);
  const bContent = fs.readFileSync(bPath, 'utf8').split('\n');
  const cContent = fs.readFileSync(cPath, 'utf8').split('\n');

  console.log(`\n================================================================`);
  console.log(`DIFF FOR: ${relPath}`);
  console.log(`================================================================`);

  // Simple hunk finder
  let i = 0, j = 0;
  while (i < bContent.length || j < cContent.length) {
    if (i < bContent.length && j < cContent.length && bContent[i] === cContent[j]) {
      i++;
      j++;
    } else {
      let bStart = i;
      let cStart = j;
      while (i < bContent.length && (j >= cContent.length || bContent[i] !== cContent[j])) {
        i++;
        // find resync
        let found = false;
        for (let lookJ = cStart; lookJ < Math.min(cStart + 50, cContent.length); lookJ++) {
          if (bContent[i] === cContent[lookJ]) {
            j = lookJ;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (i === bStart && j === cStart) {
        // advance both
        i++;
        j++;
      }
      console.log(`--- Backup lines ${bStart+1}-${i} ---`);
      for (let k = bStart; k < i; k++) {
        console.log(`- ${bContent[k]}`);
      }
      console.log(`+++ Current lines ${cStart+1}-${j} +++`);
      for (let k = cStart; k < j; k++) {
        console.log(`+ ${cContent[k]}`);
      }
    }
  }
}

files.forEach(diffFiles);
