/**
 * Dev packaging: set dev version → run vsce package → restore original version.
 *
 * The restore always runs (even on vsce failure) to avoid leaving
 * package.json in a dirty state.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const backupPath = path.join(__dirname, '..', '.version-backup.json');

// --- Save & set dev version ---
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const originalVersion = pkg.version;
fs.writeFileSync(backupPath, JSON.stringify({ version: originalVersion }), 'utf-8');

const base = originalVersion.replace(/-.*$/, '');
const now = new Date();
const y = now.getFullYear();
const M = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
const h = String(now.getHours()).padStart(2, '0');
const m = String(now.getMinutes()).padStart(2, '0');
const s = String(now.getSeconds()).padStart(2, '0');
const dateStr = `${y}${M}${d}.${h}${m}${s}`;

let commitCount = '0';
try {
  commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
} catch { /* not a git repo */ }

const devVersion = `${base}-dev.${dateStr}.${commitCount}`;
pkg.version = devVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`Dev version set: ${devVersion}`);

// --- Run vsce package ---
let vsceOk = false;
try {
  execSync('vsce package', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  vsceOk = true;
} catch {
  console.error('\nvsce package failed.');
}

// --- Restore original version (always) ---
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
const current = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
current.version = backup.version;
fs.writeFileSync(pkgPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
fs.unlinkSync(backupPath);
console.log(`Version restored to: ${backup.version}`);

if (!vsceOk) {
  process.exit(1);
}
