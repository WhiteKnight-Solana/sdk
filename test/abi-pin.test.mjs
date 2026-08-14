// The ABI pin, verified end to end.
//
// Three links make the chain: the dependency SPEC names a commit, the pin file names the same
// commit plus the content hashes, and the INSTALLED bytes must hash to those values. If any
// link breaks — someone bumps the dependency without touching the pin, or the installed
// package's content differs from what was reviewed — this suite is the thing that says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ABI_COMMIT, ABI_MANIFEST_SHA256, ABI_IDL_SHA256 } from '../src/abi-pin.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Locate the installed ABI package on disk (its package.json is not exported, so resolve a
// known exported file and walk up).
const abiIndex = require.resolve('@whiteknight-solana/abi');
const abiRoot = dirname(abiIndex);

test('package.json pins the ABI dependency to exactly the audited commit', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const spec = pkg.dependencies['@whiteknight-solana/abi'];
  assert.equal(spec, `github:WhiteKnight-Solana/abi#${ABI_COMMIT}`);
  assert.match(ABI_COMMIT, /^[0-9a-f]{40}$/, 'pin must be a full commit hash, never a branch');
});

test('the installed ABI manifest hashes to the pinned value', () => {
  const bytes = readFileSync(join(abiRoot, 'MANIFEST.json'));
  assert.equal(
    sha256(bytes),
    ABI_MANIFEST_SHA256,
    'installed @whiteknight-solana/abi content differs from the audited pin — ' +
      'reinstall, or update src/abi-pin.js deliberately alongside the dependency bump',
  );
});

test('the installed IDL hashes to the pinned value and to its manifest entry', () => {
  const idlBytes = readFileSync(join(abiRoot, 'idl', 'whiteknight.json'));
  assert.equal(sha256(idlBytes), ABI_IDL_SHA256);
  const manifest = JSON.parse(readFileSync(join(abiRoot, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.artifacts['idl/whiteknight.json'], ABI_IDL_SHA256);
});

test('the exact @solana/kit version is pinned, not a range', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(
    pkg.dependencies['@solana/kit'],
    /^\d+\.\d+\.\d+$/,
    'kit must be an exact version — ranges are how a compromised patch release walks in',
  );
});
