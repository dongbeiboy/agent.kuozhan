/**
 * Auto-increment build number on each compile.
 *
 * Version format: MAJOR.MINOR.PATCH.BUILD
 * - Each build increments BUILD by 1 (i.e., +0.0.0.1)
 * - When MAJOR changes, BUILD resets to 0 (starts counting from 0.0.0.0 again)
 *
 * The previous base version (MAJOR.MINOR.PATCH) is tracked via _baseVersion
 * in package.json to detect major version changes.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const versionStr = pkg.version;

// Strip any -dev.xxx suffix if present (from dev-version.cjs)
const cleanVersion = versionStr.replace(/-.*$/, '');
const parts = cleanVersion.split('.').map(Number);

const major = parts[0];
const minor = parts[1] || 0;
const patch = parts[2] || 0;
let build = parts[3] !== undefined ? parts[3] : 0;

const currentBase = `${major}.${minor}.${patch}`;
const storedBase = pkg._baseVersion || '';

if (currentBase !== storedBase) {
  // Base version (particularly major) changed → reset build counter
  build = 0;
  pkg._baseVersion = currentBase;
  console.log(`Base version changed: ${storedBase || '(none)'} → ${currentBase}, build reset to 0`);
}

// Increment build number
build++;
pkg.version = `${currentBase}.${build}`;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`Version bumped to: ${pkg.version}`);
