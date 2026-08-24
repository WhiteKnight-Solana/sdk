// Account decoders against synthesized fixtures.
//
// Each fixture is built field-by-field with the Writer in the SAME order the decoder reads,
// with distinct values per field — so a swapped pair, a wrong width, or a decoder that stops
// early cannot pass. Length checks are exercised in both directions: the exact published size
// decodes, one byte off throws.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Writer, decodeWkConfig, decodeManager, decodeDeployer, decodeMiner, decodeSatsVault,
  decodeEpochVaultIteration, decodeOneBtcVaultEntry,
  WK_CONFIG_LEN, MANAGER_LEN, DEPLOYER_LEN, SIZES, PARAM_COUNT, FLAG, TILE_COUNT,
  USER_FLAG, USER_FLAGS_KNOWN, USER_FLAGS_OFFSET, isMiningPaused, areVaultBuysHeld, areSatsHeld,
  SATRUSH_PROGRAM, USDC_MINT, CBBTC_MINT, TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM,
} from '../index.js';

const PK = [
  SATRUSH_PROGRAM, USDC_MINT, CBBTC_MINT, TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM,
  'ComputeBudget111111111111111111111111111111',
];

/**
 * Pad a fixture to its account's published total size. The Sat Rush layouts carry bytes past
 * the fields the decoders read (their own tails and reserves); decoders read contiguously from
 * the header and length-check the TOTAL, so fixtures must be full-size with a zero tail.
 */
function padded(w, size) {
  const head = w.finish();
  assert.ok(head.length <= size, `fixture head ${head.length} exceeds account size ${size}`);
  const out = new Uint8Array(size);
  out.set(head, 0);
  return out;
}

test('WkConfig round-trips with flags and params intact', () => {
  const w = new Writer().raw(new Uint8Array(8));
  for (let i = 0; i < 7; i++) w.pubkey(PK[i]);
  w.u64(FLAG.SETTLE_RENT_TO_US | FLAG.ALLOW_NEW_MANAGERS);
  for (let i = 0; i < PARAM_COUNT; i++) w.u64(1000 + i);
  w.u8(254);
  w.raw(new Uint8Array(256)); // launch reserve
  const bytes = w.finish();
  assert.equal(bytes.length, WK_CONFIG_LEN);

  const c = decodeWkConfig(bytes);
  assert.equal(c.admin, String(PK[0]));
  assert.equal(c.btcMint, String(PK[6]));
  assert.equal(c.params[13], 1013n);
  assert.equal(c.param(31), 1031n);
  assert.equal(c.bump, 254);
  assert.ok(c.hasFlag(FLAG.SETTLE_RENT_TO_US));
  assert.ok(!c.hasFlag(FLAG.PAUSED_ALL));
  assert.ok(c.deployAllowed());
  assert.throws(() => decodeWkConfig(bytes.subarray(0, WK_CONFIG_LEN - 1)), /expected 753/);
});

test('a paused flag flips deployAllowed', () => {
  const w = new Writer().raw(new Uint8Array(8));
  for (let i = 0; i < 7; i++) w.pubkey(PK[i]);
  w.u64(FLAG.PAUSED_DEPLOY);
  for (let i = 0; i < PARAM_COUNT; i++) w.u64(0);
  w.u8(1);
  w.raw(new Uint8Array(256));
  assert.equal(decodeWkConfig(w.finish()).deployAllowed(), false);
});

test('Manager round-trips and pins the reserve width', () => {
  const w = new Writer().raw(new Uint8Array(8))
    .pubkey(PK[1]).pubkey(PK[2]).u16(5).u8(253)
    .raw(new Uint8Array(256));
  const bytes = w.finish();
  assert.equal(bytes.length, MANAGER_LEN);
  const m = decodeManager(bytes);
  assert.equal(m.authority, String(PK[1]));
  assert.equal(m.seedAuthority, String(PK[2]));
  assert.equal(m.index, 5);
  assert.throws(() => decodeManager(new Uint8Array(MANAGER_LEN + 1)), /expected 331/);
});

test('Deployer round-trips every field including the four reserve carves', () => {
  const w = new Writer().raw(new Uint8Array(8))
    .pubkey(PK[0]).pubkey(PK[1])          // manager, deployAuthority
    .u64(200).u64(0).u16(3)               // bpsFee, flatFee, shardCount
    .u64(200).u64(1).u8(3)                // expectedBpsFee, expectedFlatFee, maxShards
    .u64(1_500_000).u8(21).u32(0).u8(0)   // perRoundAmount, tileCount, runRounds, whenFundsLow
    .u64(0).u64(1_000_000).u64(0).bool(true) // maxPerTile, minBet, stopLevel, autoReload
    .u64(0).u64(0)                        // strike range
    .u32(10_935).u64(1_425_000).u32(88).u64(9_000_000) // lastRound, stakedInRound, roundsPlayed, stakeAllowance
    .u8(255)                              // bump
    .u16(5_000).u64(123_456).u64(78_900).u64(0) // btcShareBps, flow ledger, user_flags
    .raw(new Uint8Array(230));            // launch reserve (256 − 26 carved)
  const bytes = w.finish();
  assert.equal(bytes.length, DEPLOYER_LEN);

  const d = decodeDeployer(bytes);
  assert.equal(d.manager, String(PK[0]));
  assert.equal(d.shardCount, 3);
  assert.equal(d.maxPerRound, 1_500_000n, 'v2: the slot is the cross-shard ceiling');
  assert.equal(d.perRoundAmount, 1_500_000n, 'deprecated alias, same number, one pin cycle');
  assert.equal(d.autoReload, true);
  assert.equal(d.roundsPlayed, 88);
  assert.equal(d.stakeAllowance, 9_000_000n);
  assert.equal(d.btcShareBps, 5_000);
  assert.equal(d.epochUnitsBought, 123_456n);
  assert.equal(d.btcUnitsBought, 78_900n);
  assert.throws(() => decodeDeployer(new Uint8Array(DEPLOYER_LEN - 1)), /expected 443/);
});

test('Miner round-trips (the account every claim decision reads)', () => {
  const w = new Writer().raw(new Uint8Array(8)).u16(1).u8(255)
    .pubkey(PK[3])
    .u64(12_345).u64(67_890).u64(555_000).u32(42).u32(10_900).u64(31_400);
  const bytes = padded(w, SIZES.Miner);
  const m = decodeMiner(bytes);
  assert.equal(m.unclaimedUsd, 12_345n);
  assert.equal(m.unclaimedBtcShares, 67_890n);
  assert.equal(m.streak, 42);
  assert.equal(m.unclaimedHashrate, 31_400n);
  assert.throws(() => decodeMiner(new Uint8Array(SIZES.Miner + 3)), /may have changed a layout/);
});

test('SatsVault share pricing copies the virtual offset exactly', () => {
  const w = new Writer().raw(new Uint8Array(8)).u16(1).u8(255).u64(1_000_000).u64(2_000_000);
  const v = decodeSatsVault(padded(w, SIZES.SatsVault));
  // (shares * (btcAmount + 1)) / (btcShares + 1000)
  assert.equal(v.toSats(2_000_000n), (2_000_000n * 1_000_001n) / 2_001_000n);
});

test('EpochVaultIteration decodes the winners table', () => {
  const w = new Writer().raw(new Uint8Array(8)).u16(1).u8(255)
    .u32(3).u8(0).u64(301_180).u32(125).u16(6).u16(5).u8(20)
    .raw(new Uint8Array(32))
    .u64(1).u64(2).u64(3).u64(4).u16(6).u8(21).u8(4);
  for (let i = 0; i < TILE_COUNT; i++) {
    w.pubkey(PK[i % PK.length]).u16(i).u64(100 + i).bool(i % 2 === 0);
  }
  const bytes = padded(w, SIZES.EpochVaultIteration);
  const it = decodeEpochVaultIteration(bytes);
  assert.equal(it.state, 'Open');
  assert.equal(it.totalTickets, 301_180n);
  assert.equal(it.participants, 125);
  assert.equal(it.winners.length, 21);
  assert.equal(it.winners[20].tickets, 120n);
  assert.equal(it.winners[20].claimed, true);
});

test('OneBtcVaultEntry has no bump — the 8-byte header is the whole prefix', () => {
  const w = new Writer().raw(new Uint8Array(8)).u16(1)
    .u32(2).pubkey(PK[4]).u64(1_000).u64(50);
  const bytes = padded(w, SIZES.OneBtcVaultEntry);
  const e = decodeOneBtcVaultEntry(bytes);
  assert.equal(e.iterationId, 2);
  assert.equal(e.startTicketId, 1_000n);
  assert.equal(e.ticketsCount, 50n);
});

// =====================================================================================
// user_flags — the fourth carve, and the two switches read off it.
// =====================================================================================

/** A Deployer whose carved fields carry sentinels, so a misread offset cannot look right. */
function deployerBytes({ btcShareBps = 5_000, epoch = 123_456n, btc = 78_900n, userFlags = 0n } = {}) {
  return new Writer().raw(new Uint8Array(8))
    .pubkey(PK[0]).pubkey(PK[1])
    .u64(200).u64(0).u16(3)
    .u64(200).u64(1).u8(3)
    .u64(1_500_000).u8(21).u32(0).u8(0)
    .u64(0).u64(1_000_000).u64(0).bool(true)
    .u64(0).u64(0)
    .u32(10_935).u64(1_425_000).u32(88).u64(9_000_000)
    .u8(255)
    .u16(btcShareBps).u64(epoch).u64(btc).u64(userFlags)
    .raw(new Uint8Array(230))
    .finish();
}

test('user_flags decodes at the published offset, ahead of what is left of the reserve', () => {
  const bytes = deployerBytes({ userFlags: 0x0123_4567_89ab_cdefn });
  assert.equal(bytes.length, DEPLOYER_LEN, 'the carve must not move the account length');

  const d = decodeDeployer(bytes);
  assert.equal(d.userFlags, 0x0123_4567_89ab_cdefn);
  // The neighbours either side must be untouched — a one-field slip would still decode.
  assert.equal(d.btcUnitsBought, 78_900n);
  assert.equal(d.epochUnitsBought, 123_456n);
  assert.equal(d.btcShareBps, 5_000);

  // And the offset this package publishes is where those bytes actually are.
  const raw = new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(USER_FLAGS_OFFSET, true);
  assert.equal(raw, d.userFlags, `user_flags is not at byte ${USER_FLAGS_OFFSET}`);
});

test('a position created before the switches existed decodes as unset', () => {
  // Every live Deployer at upgrade time had zeros across its whole reserve. That is the
  // property that made the carve a no-op for existing users, so it is pinned here too.
  const d = decodeDeployer(deployerBytes({ userFlags: 0n }));
  assert.equal(d.userFlags, 0n);
  assert.equal(isMiningPaused(d), false);
  assert.equal(areVaultBuysHeld(d), false);
});

test('every switch is read independently of every other', () => {
  // Swept rather than listed. The hand-written table this replaces named four combinations of
  // two switches; when a third arrived it kept passing while saying nothing about it, which is
  // the failure mode a table has and a sweep does not.
  const readers = [
    ['PAUSE_MINING', isMiningPaused],
    ['HOLD_VAULT_BUYS', areVaultBuysHeld],
    ['HOLD_SATS', areSatsHeld],
  ];
  assert.equal(
    readers.length,
    Object.keys(USER_FLAG).length,
    'every published switch needs a reader here, or this sweep silently skips one',
  );

  for (let combo = 0; combo < 1 << readers.length; combo++) {
    const flags = readers.reduce(
      (acc, [name], i) => (combo & (1 << i) ? acc | USER_FLAG[name] : acc),
      0n,
    );
    const d = decodeDeployer(deployerBytes({ userFlags: flags }));
    for (const [i, [name, read]] of readers.entries()) {
      assert.equal(read(d), Boolean(combo & (1 << i)), `${name} for flags ${flags}`);
    }
  }

  // Bits the program does not know must not be mistaken for any switch.
  const junk = decodeDeployer(deployerBytes({ userFlags: 1n << 40n }));
  for (const [name, read] of readers) assert.equal(read(junk), false, `${name} on an unknown bit`);
});

test('USER_FLAG values are the bit indices the ABI publishes, shifted', () => {
  assert.equal(USER_FLAG.PAUSE_MINING, 1n);
  assert.equal(USER_FLAG.HOLD_VAULT_BUYS, 2n);
  assert.equal(USER_FLAG.HOLD_SATS, 4n);
  assert.equal(USER_FLAGS_KNOWN, 7n, 'every bit, and nothing the program would refuse');
  for (const v of Object.values(USER_FLAG)) {
    assert.equal(typeof v, 'bigint');
    assert.equal(v & USER_FLAGS_KNOWN, v, 'every published switch must be inside the known mask');
  }
});
