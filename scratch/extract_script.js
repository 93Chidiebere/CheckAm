const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Match the script block
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);

if (scriptMatch && scriptMatch[1]) {
  const jsContent = scriptMatch[1];
  const tempJsPath = path.join(__dirname, 'temp_index_script.js');
  fs.writeFileSync(tempJsPath, jsContent, 'utf8');
  console.log('Script block extracted. Running syntax check...');
} else {
  console.error('No script block found in index.html');
}
