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

files.forEach(file => {
  console.log('================================================================');
  console.log('FILE:', file);
  console.log('================================================================');
  const bLines = fs.readFileSync(path.join(backupDir, file), 'utf8').split('\n');
  const cLines = fs.readFileSync(path.join(currentDir, file), 'utf8').split('\n');
  
  // simple diff summary
  console.log(`Original line count: ${bLines.length}, Current line count: ${cLines.length}`);
});
