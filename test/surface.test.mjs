// The instruction surface, partitioned and pinned.
//
// Every instruction in the IDL must be either wrapped by a public builder or on the explicit
// admin exclusion list. A new program instruction therefore fails this test until someone
// consciously places it — the alternative is a public SDK that silently lacks part of the
// program, or silently ships an admin path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { idl } from '@whiteknight-solana/abi';
import { readFileSync } from 'node:fs';
import * as sdk from '../index.js';

const COVERED = {
  // user-signed
  create_manager: 'ixCreateManager',
  create_deployer: 'ixCreateDeployer',
  update_deployer: 'ixUpdateDeployer',
  set_user_flags: 'ixSetUserFlags',
  transfer_manager: 'ixTransferManager',
  deposit_balance: 'ixDepositBalance',
  withdraw_balance: 'ixWithdrawBalance',
  withdraw_tokens: 'ixWithdrawTokens',
  close_shard: 'ixCloseShard',
  // permissionless
  wk_settle_batch: 'ixSettleBatch',
  wk_claim_usd_batch: 'ixClaimUsdBatch',
  wk_claim_sats_batch: 'ixClaimSatsBatch',
  wk_claim_epoch_rewards_batch: 'ixClaimEpochRewardsBatch',
  wk_claim_one_btc_rewards_batch: 'ixClaimOneBtcRewardsBatch',
  wk_close_one_btc_tickets_batch: 'ixCloseOneBtcTicketsBatch',
  // operator-signed
  wk_deploy_batch: 'ixDeployBatch',
  wk_buy_epoch_tickets_batch: 'ixBuyEpochTicketsBatch',
  wk_buy_one_btc_tickets_batch: 'ixBuyOneBtcTicketsBatch',
};

// Admin surface, deliberately not wrapped: these change the protocol, not a position.
const ADMIN_EXCLUDED = [
  'init_config',
  'set_param',
  'set_key',
  'set_flags',
  'transfer_admin',
  'accept_admin',
];

test('every IDL instruction is either covered or explicitly admin-excluded', () => {
  const inIdl = idl.instructions.map((i) => i.name).sort();
  const partition = [...Object.keys(COVERED), ...ADMIN_EXCLUDED].sort();
  assert.deepEqual(inIdl, partition);
});

test('every covered instruction has its builder exported', () => {
  for (const [ixName, fnName] of Object.entries(COVERED)) {
    assert.equal(typeof sdk[fnName], 'function', `${fnName} (for ${ixName}) is not exported`);
  }
});

test('no admin instruction has a builder that snuck in', () => {
  const names = Object.keys(sdk).map((n) => n.toLowerCase());
  for (const admin of ['setparam', 'setkey', 'setflags', 'initconfig', 'transferadmin', 'acceptadmin']) {
    assert.ok(!names.some((n) => n.includes(admin)), `admin builder for ${admin} found in exports`);
  }
});

// =====================================================================================
// The shipped types must describe the shipped code.
//
// index.d.ts is hand-written and nothing generated it, so an export added to the runtime
// arrives untyped: TypeScript consumers get an implicit-any or a "has no exported member"
// depending on their settings, and neither failure happens in this repo's tests. That is the
// exact drift that let `areSatsHeld` nearly ship without a declaration.
// =====================================================================================

test('every runtime export is declared in index.d.ts', () => {
  const dts = readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8');
  // Declarations only — a name that appears solely inside a doc comment is not a declaration,
  // and matching prose would make this test pass on a mention.
  const declared = new Set(
    [...dts.matchAll(/^export (?:declare )?(?:function|const|class|type|interface|enum)\s+(\w+)/gm)]
      .map((m) => m[1]),
  );
  const missing = Object.keys(sdk).filter((name) => !declared.has(name));
  assert.deepEqual(missing, [], `exported at runtime but not declared in index.d.ts: ${missing.join(', ')}`);
});

test('index.d.ts does not declare things the runtime does not export', () => {
  // The other direction: a declaration for a function that was renamed or removed is a promise
  // the package cannot keep, and it type-checks fine right up until someone calls it.
  const dts = readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8');
  const declared = [...dts.matchAll(/^export (?:declare )?(?:function|const|class)\s+(\w+)/gm)].map((m) => m[1]);
  const runtime = new Set(Object.keys(sdk));
  const phantom = declared.filter((name) => !runtime.has(name));
  assert.deepEqual(phantom, [], `declared in index.d.ts but not exported at runtime: ${phantom.join(', ')}`);
});
