// A sub-miner's SOL: live rent, the withdrawal remainder rule, and the strict SOL reader.
// No RPC: readers get a scripted rpc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAddressDecoder } from '@solana/kit';
import {
  decodeRent, rentExemptLamports, readRent, planWithdrawal, RENT_SYSVAR, readSubMinerLamports,
} from '../index.js';

const key = (n) => getAddressDecoder().decode(new Uint8Array(32).fill(n));

// The Rent sysvar as mainnet served it on 2026-09-14: 2,540 lamports per byte-year, 2 years.
function rentBytes(lamportsPerByteYear = 2540n, threshold = 2, burn = 50) {
  const data = new Uint8Array(17);
  const view = new DataView(data.buffer);
  view.setBigUint64(0, lamportsPerByteYear, true);
  view.setFloat64(8, threshold, true);
  view.setUint8(16, burn);
  return data;
}
const rent = decodeRent(rentBytes());

test('rent decodes from the sysvar and reproduces the dated live minimum balances', () => {
  assert.deepEqual(rent, { lamportsPerByteYear: 2540n, exemptionThreshold: 2, burnPercent: 50 });
  for (const [bytes, lamports] of [[94, 1_127_760n], [136, 1_341_120n], [165, 1_488_440n], [201, 1_671_320n], [89, 1_102_360n], [0, 650_240n]]) {
    assert.equal(rentExemptLamports(rent, bytes), lamports, `${bytes} bytes`);
  }
  assert.throws(() => decodeRent(rentBytes().subarray(0, 16)), /17 bytes/);
  assert.throws(() => decodeRent(rentBytes(0n)), /not usable/);
  assert.throws(() => decodeRent(rentBytes(2540n, 0)), /not usable/);
  assert.throws(() => rentExemptLamports(rent, -1), /bytes/);
  assert.throws(() => rentExemptLamports(rent, 1.5), /bytes/);
});

test('readRent returns the live rate with its observation slot and refuses an absent sysvar', async () => {
  const calls = [];
  const rpc = { getAccountInfo: (addr, opts) => ({ send: async () => {
    calls.push([String(addr), opts]);
    return { context: { slot: 447_076_460n }, value: { data: [Buffer.from(rentBytes()).toString('base64'), 'base64'], lamports: 1n } };
  } }) };
  assert.deepEqual(await readRent({ rpc }), { rent, slot: 447_076_460n });
  assert.deepEqual(calls, [[RENT_SYSVAR, { encoding: 'base64' }]]);
  const gone = { getAccountInfo: () => ({ send: async () => ({ context: { slot: 1n }, value: null }) }) };
  await assert.rejects(readRent({ rpc: gone }), /unreadable/);
});

test('withdrawal remainders are zero or rent-exempt: dust is lifted, and keeping the balance withdraws nothing', () => {
  const dustFloor = 650_240n;
  assert.deepEqual(planWithdrawal({ rent, balance: 30_000_000n, keep: 0n }), { amount: 30_000_000n, remaining: 0n, adjusted: false, dustFloor });
  assert.deepEqual(planWithdrawal({ rent, balance: 30_000_000n, keep: 20_000_000n }), { amount: 10_000_000n, remaining: 20_000_000n, adjusted: false, dustFloor });
  assert.deepEqual(planWithdrawal({ rent, balance: 30_000_000n, keep: 1n }), { amount: 30_000_000n - dustFloor, remaining: dustFloor, adjusted: true, dustFloor });
  assert.deepEqual(planWithdrawal({ rent, balance: 30_000_000n, keep: 30_000_000n }), { amount: 0n, remaining: 30_000_000n, adjusted: false, dustFloor });
  assert.deepEqual(planWithdrawal({ rent, balance: 600_000n, keep: 5n }), { amount: 0n, remaining: 600_000n, adjusted: true, dustFloor });
  assert.throws(() => planWithdrawal({ rent, balance: 1n, keep: -1n }), /keep/);
  assert.throws(() => planWithdrawal({ rent, balance: 1.5, keep: 0n }), /balance/);
});

/** A scripted getMultipleAccounts: `reply(chunk)` decides what each call returns. */
function scripted(reply) {
  const calls = [];
  const rpc = {
    getMultipleAccounts: (addrs, opts) => ({ send: async () => { calls.push([addrs.length, opts]); return reply(addrs); } }),
  };
  return { client: { rpc }, calls };
}

test('readSubMinerLamports reads in chunks of 100, absent accounts as 0n', async () => {
  const wk = Array.from({ length: 205 }, (_, i) => key((i % 250) + 1));
  const { client, calls } = scripted((chunk) => ({
    value: chunk.map((_, i) => (i % 2 ? null : { lamports: 20_000_000n, data: ['', 'base64'] })),
  }));
  const out = await readSubMinerLamports(client, wk);
  assert.equal(out.length, 205);
  assert.deepEqual(calls.map(([n]) => n), [100, 100, 5], 'one call per 100');
  assert.equal(calls[0][1].dataSlice.length, 0, 'lamports only: no account data is fetched');
  assert.deepEqual(out.slice(0, 3), [20_000_000n, 0n, 20_000_000n]);
});

test('readSubMinerLamports returns null, never zeros, on a short or failed read', async () => {
  const wk = [key(1), key(2), key(3)];
  const short = scripted((chunk) => ({ value: chunk.slice(0, 2).map(() => ({ lamports: 5n })) }));
  assert.equal(await readSubMinerLamports(short.client, wk), null, 'a short reply is not "absent"');
  const failing = { rpc: { getMultipleAccounts: () => ({ send: async () => { throw new Error('429'); } }) } };
  assert.equal(await readSubMinerLamports(failing, wk), null, 'a failed read is not zero');
  const empty = scripted(() => ({ value: [] }));
  assert.deepEqual(await readSubMinerLamports(empty.client, []), [], 'nothing asked, nothing read');
});
