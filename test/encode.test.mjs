// Instruction encoding, verified from first principles.
//
// For every covered instruction: the discriminator must equal sha256("global:<name>")[0..8]
// recomputed here (not read back from the IDL the encoder used), the account list must be the
// IDL's declared accounts plus exactly the per-shard extras, and argument bytes must match
// hand-written borsh. If the encoder, the IDL, or a builder's account assembly drifts, this is
// where it surfaces — before any wallet signs anything.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { idl as rawIdl } from '@whiteknight-solana/abi';
import {
  indexIdl, ROLE,
  ixCreateManager, ixCreateDeployer, ixUpdateDeployer, ixTransferManager,
  ixDepositBalance, ixWithdrawBalance, ixWithdrawTokens, ixCloseShard,
  ixSettleBatch, ixClaimUsdBatch, ixClaimSatsBatch,
  ixClaimEpochRewardsBatch, ixClaimOneBtcRewardsBatch, ixCloseOneBtcTicketsBatch,
  ixDeployBatch, ixBuyEpochTicketsBatch, ixBuyOneBtcTicketsBatch,
  SATRUSH_PROGRAM, USDC_MINT, CBBTC_MINT, TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM,
} from '../index.js';

const disc = (name) =>
  [...createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)];

// A fake client pointed at the dev declare_id — encoding needs no network and no deployment.
const client = { idl: indexIdl(rawIdl), programAddress: rawIdl.address };
client.idl.programAddress = rawIdl.address;

// Distinct, well-formed addresses; system-ish keys are fine as stand-ins.
const A = rawIdl.address;
const K = [
  SATRUSH_PROGRAM, USDC_MINT, CBBTC_MINT, TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM,
  'ComputeBudget111111111111111111111111111111', 'AddressLookupTab1e1111111111111111111111111',
  'SysvarRent111111111111111111111111111111111', 'SysvarC1ock11111111111111111111111111111111',
];

const settings = {
  deploy_authority: K[0],
  bps_fee: 200n,
  flat_fee: 0n,
  expected_bps_fee: 200n,
  expected_flat_fee: 1n,
  per_round_amount: 1_500_000n,
  shard_count: 3,
  max_shards: 3,
  tile_count: 21,
  run_rounds: 0,
  when_funds_low: 0,
  max_per_tile: 0n,
  min_bet: 1_000_000n,
  stop_level: 0n,
  auto_reload: true,
  min_strike_pot_usd: 0n,
  max_strike_pot_usd: 0n,
  btc_share_bps: 500,
};

const shard = (i) => ({
  manager: K[i % K.length], deployer: K[(i + 1) % K.length], wkAuth: K[(i + 2) % K.length],
  miner: K[(i + 3) % K.length], usdAta: K[(i + 4) % K.length], btcAta: K[(i + 5) % K.length],
  usdMint: USDC_MINT, ticket: K[(i + 6) % K.length], page: K[(i + 7) % K.length],
  entry: K[(i + 8) % K.length], pd: K[(i + 9) % K.length], automation: K[i % K.length],
  automationAta: K[(i + 1) % K.length], publicDeployment: K[(i + 2) % K.length],
  address: K[(i + 3) % K.length], authId: BigInt(i),
});

const sr = {
  satrushConfig: K[0], board: K[1], boardUsdAta: K[2], boardBtcAta: K[3],
  satsVault: K[4], satsVaultBtcAta: K[5], epochVault: K[6], epochVaultUsdAta: K[7],
  epochVaultBtcAta: K[8], oneBtcVault: K[9], oneBtcVaultBtcAta: K[0],
  eventAuthority: K[1], usdMint: USDC_MINT, btcMint: CBBTC_MINT, satrushProgram: SATRUSH_PROGRAM,
};

const idlAccountCount = (name) => rawIdl.instructions.find((i) => i.name === name).accounts.length;

function verify(ix, name, { extraPerShard = 0, shardCount = 0, args } = {}) {
  assert.deepEqual([...ix.data.subarray(0, 8)], disc(name), `${name}: discriminator`);
  assert.equal(
    ix.accounts.length,
    idlAccountCount(name) + extraPerShard * shardCount,
    `${name}: account count`,
  );
  assert.equal(String(ix.programAddress), String(A), `${name}: program address`);
  if (args) assert.deepEqual([...ix.data.subarray(8)], [...args], `${name}: arg bytes`);
}

// ---------------------------------------------------------------- user

test('create_manager encodes its u16 index after the discriminator', () => {
  const ix = ixCreateManager(client, { authority: K[0], config: K[1], manager: K[2], index: 7 });
  verify(ix, 'create_manager', { args: [7, 0] });
  // The authority is the writable signer, per the IDL.
  assert.equal(ix.accounts[0].role, ROLE.WRITABLE_SIGNER);
});

test('create_deployer and update_deployer take the full settings struct', () => {
  const c = ixCreateDeployer(client, { authority: K[0], config: K[1], manager: K[2], deployer: K[3], settings });
  verify(c, 'create_deployer');
  const u = ixUpdateDeployer(client, { authority: K[0], config: K[1], manager: K[2], deployer: K[3], settings });
  verify(u, 'update_deployer');
  // Same args → identical payloads after their (different) discriminators.
  assert.deepEqual([...c.data.subarray(8)], [...u.data.subarray(8)]);
  // The settings tail is btc_share_bps as u16 — the newest field, easiest to forget.
  const tail = c.data.subarray(c.data.length - 2);
  assert.deepEqual([...tail], [244, 1]); // 500 LE
});

test('a settings object missing a field throws by name instead of encoding garbage', () => {
  const { btc_share_bps, ...partial } = settings;
  assert.throws(
    () => ixCreateDeployer(client, { authority: K[0], config: K[1], manager: K[2], deployer: K[3], settings: partial }),
    /btc_share_bps/,
  );
});

test('transfer_manager encodes the new authority pubkey', () => {
  const ix = ixTransferManager(client, { authority: K[0], manager: K[1], newAuthority: K[2] });
  verify(ix, 'transfer_manager');
  assert.equal(ix.data.length, 8 + 32);
});

test('deposit_balance encodes auth_id then amount as u64s', () => {
  const ix = ixDepositBalance(client, {
    authority: K[0], config: K[1], manager: K[2], deployer: K[3], wkAuth: K[4],
    usdMint: USDC_MINT, authorityUsdAta: K[5], wkAuthUsdAta: K[6],
  }, { authId: 2, amount: 25_000_000n });
  verify(ix, 'deposit_balance', {
    args: [2, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x78, 0x7d, 0x01, 0, 0, 0, 0], // 2 LE, 25e6 LE
  });
});

test('both withdraw verbs share a payload shape and amount 0 means sweep', () => {
  const a = {
    authority: K[0], config: K[1], manager: K[2], wkAuth: K[3],
    mint: USDC_MINT, wkAuthAta: K[4], authorityAta: K[5],
  };
  const w = ixWithdrawBalance(client, a, { authId: 0 });
  verify(w, 'withdraw_balance', { args: new Array(16).fill(0) });
  const t = ixWithdrawTokens(client, { ...a, mint: CBBTC_MINT }, { authId: 0 });
  verify(t, 'withdraw_tokens', { args: new Array(16).fill(0) });
});

test('close_shard carries the shard auth_id', () => {
  const s = shard(3);
  const ix = ixCloseShard(client, {
    authority: K[0], config: K[1], manager: K[2], usdMint: USDC_MINT, btcMint: CBBTC_MINT,
  }, s);
  verify(ix, 'close_shard', { args: [3, 0, 0, 0, 0, 0, 0, 0] });
});

// ---------------------------------------------------------------- permissionless batches

test('claim_usd batch: vec of auth_ids plus 4 extra accounts per shard', () => {
  const shards = [shard(0), shard(1), shard(2)];
  const ix = ixClaimUsdBatch(client, sr, { payer: K[0], config: K[1] }, shards);
  verify(ix, 'wk_claim_usd_batch', {
    extraPerShard: 4, shardCount: 3,
    args: [3, 0, 0, 0, /* vec len */ 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
  });
  // The payer signs and pays; nothing else in the batch may.
  assert.equal(ix.accounts[0].role, ROLE.WRITABLE_SIGNER);
  assert.ok(ix.accounts.slice(1).every((a) => a.role !== ROLE.WRITABLE_SIGNER));
});

test('claim_sats batch: 4 extras per shard, btc side', () => {
  const shards = [shard(0), shard(1)];
  const ix = ixClaimSatsBatch(client, sr, { payer: K[0], config: K[1] }, shards);
  verify(ix, 'wk_claim_sats_batch', { extraPerShard: 4, shardCount: 2 });
});

test('epoch rewards batch: iteration_id u32 leads the args', () => {
  const shards = [shard(0)];
  const ix = ixClaimEpochRewardsBatch(
    client, sr,
    { payer: K[0], config: K[1], iterationId: 9, iterationAddress: K[2] },
    shards,
  );
  verify(ix, 'wk_claim_epoch_rewards_batch', {
    extraPerShard: 4, shardCount: 1,
    args: [9, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
});

test('one btc rewards batch: the winning ticket rides readonly per shard', () => {
  const shards = [shard(0)];
  const ix = ixClaimOneBtcRewardsBatch(
    client, sr,
    { payer: K[0], config: K[1], iterationId: 1, iterationAddress: K[2] },
    shards,
  );
  verify(ix, 'wk_claim_one_btc_rewards_batch', { extraPerShard: 4, shardCount: 1 });
  const ticketMeta = ix.accounts[ix.accounts.length - 2];
  assert.equal(String(ticketMeta.address), String(shards[0].ticket));
  assert.equal(ticketMeta.role, ROLE.READONLY);
});

test('close tickets batch: 3 extras per ticket, rent flows back writable', () => {
  const tickets = [shard(0), shard(1)];
  const ix = ixCloseOneBtcTicketsBatch(
    client, sr,
    { payer: K[0], config: K[1], iterationId: 2, iterationAddress: K[2] },
    tickets,
  );
  verify(ix, 'wk_close_one_btc_tickets_batch', { extraPerShard: 3, shardCount: 2 });
});

test('settle batch: 6 extras per entry in the program walk order', () => {
  const entries = [shard(0)];
  const ix = ixSettleBatch(
    client, sr,
    { payer: K[0], config: K[1], round: K[2], rentRecipient: K[3], roundId: 10_935 },
    entries,
  );
  verify(ix, 'wk_settle_batch', { extraPerShard: 6, shardCount: 1 });
  const base = idlAccountCount('wk_settle_batch');
  const tail = ix.accounts.slice(base).map((a) => String(a.address));
  assert.deepEqual(tail, [
    String(entries[0].manager), String(entries[0].wkAuth), String(entries[0].pd),
    String(entries[0].miner), String(entries[0].automation), String(entries[0].automationAta),
  ]);
});

// ---------------------------------------------------------------- operator batches

test('deploy batch: 5 extras per shard, round_id u32 then vec', () => {
  const shards = [shard(0), shard(1)];
  const ix = ixDeployBatch(
    client, sr,
    {
      operator: K[0], config: K[1], roundId: 4, round: K[2], previousRound: K[3],
      operatorUsdAta: K[4], platformUsdAta: K[5],
    },
    shards,
  );
  verify(ix, 'wk_deploy_batch', {
    extraPerShard: 5, shardCount: 2,
    args: [4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  });
});

test('epoch buy batch: deployer rides writable — the ratio flow ledger lives there', () => {
  const shards = [shard(0)];
  const ix = ixBuyEpochTicketsBatch(
    client, sr, { operator: K[0], config: K[1], iterationAddress: K[2] }, shards,
  );
  verify(ix, 'wk_buy_epoch_tickets_batch', { extraPerShard: 6, shardCount: 1 });
  const base = idlAccountCount('wk_buy_epoch_tickets_batch');
  assert.equal(String(ix.accounts[base + 1].address), String(shards[0].deployer));
  assert.equal(ix.accounts[base + 1].role, ROLE.WRITABLE);
});

test('one btc buy batch: each ticket is a WRITABLE SIGNER the caller must co-sign with', () => {
  const shards = [shard(0)];
  const ix = ixBuyOneBtcTicketsBatch(
    client, sr, { operator: K[0], config: K[1], iterationAddress: K[2] }, shards,
  );
  verify(ix, 'wk_buy_one_btc_tickets_batch', { extraPerShard: 5, shardCount: 1 });
  const last = ix.accounts[ix.accounts.length - 1];
  assert.equal(String(last.address), String(shards[0].ticket));
  assert.equal(last.role, ROLE.WRITABLE_SIGNER);
});
