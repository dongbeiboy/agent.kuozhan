/**
 * Auto-increment _patch counter on each compile.
 *
 * - _patch lives in package.json, independent of the CI-managed `version`
 * - Each compile increments _patch by 1
 * - When MAJOR or MINOR in `version` changes, _patch resets to 1
 *
 * The previous MAJOR.MINOR is tracked via _baseVersion in package.json
 * to detect version resets.
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

const currentBase = `${major}.${minor}`;
const storedBase = pkg._baseVersion || '';

let patch = pkg._patch !== undefined ? pkg._patch : 0;

if (currentBase !== storedBase) {
  // MAJOR or MINOR changed → reset patch to 1
  patch = 1;
  pkg._baseVersion = currentBase;
  console.log(`Base version changed: ${storedBase || '(none)'} → ${currentBase}, _patch reset to 1`);
} else {
  // Increment patch
  patch++;
}

pkg._patch = patch;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`_patch bumped to: ${patch}`);
