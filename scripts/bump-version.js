import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const type = process.argv[2] || 'patch'; // 'patch', 'minor', 'major'

// Read package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const currentVersion = pkg.version || '2.7.0';
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newMajor = major;
let newMinor = minor;
let newPatch = patch;

if (type === 'major') {
  newMajor += 1;
  newMinor = 0;
  newPatch = 0;
} else if (type === 'minor') {
  newMinor += 1;
  newPatch = 0;
} else {
  // default patch
  newPatch += 1;
}

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;
const newVersionCode = newMajor * 100 + newMinor * 10 + newPatch;

// Update package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ package.json versiyasi yangilandi: ${currentVersion} -> ${newVersion}`);

// Update src/version.ts
const versionTsPath = path.join(rootDir, 'src', 'version.ts');
if (fs.existsSync(versionTsPath)) {
  let content = fs.readFileSync(versionTsPath, 'utf-8');
  
  // Replace version string
  content = content.replace(/version:\s*"[^"]+"/, `version: "${newVersion}"`);
  content = content.replace(/versionCode:\s*\d+/, `versionCode: ${newVersionCode}`);
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  content = content.replace(/releaseDate:\s*"[^"]+"/, `releaseDate: "${dateStr}"`);
  content = content.replace(/releaseTime:\s*"[^"]+"/, `releaseTime: "${timeStr}"`);

  fs.writeFileSync(versionTsPath, content);
  console.log(`✅ src/version.ts versiyasi yangilandi: ${newVersion} (Code: ${newVersionCode})`);
}
