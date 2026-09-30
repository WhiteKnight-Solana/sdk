// The fee bucket's read side. The sdk decodes and reads the bucket; it never builds the four
// fee instructions (admin-only: test/surface.test.mjs keeps them out of the exports).

import test from 'node:test';
import assert from 'node:assert/strict';
import { address, getAddressEncoder } from '@solana/kit';
import { FEE_BUCKET_LEN, USDC_MINT, decodeFeeBucket, readFeeBucket, wkPdas, ataFor } from '../index.js';

const WK = address('WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS');
// The owner's wallet: the placeholder in all three slots and as the expenses wallet until the
// partners confirm the final addresses (fee-bucket plan, decision 5b).
const OWNER = '97ZYQHCorbKwQWh7wc3cpxrJRa2K2nMoZBNQBrghzPG2';
const enc = getAddressEncoder();

/** A FeeBucket laid out as the program writes it (fees.rs), 97Z in every slot. */
function bucketBytes() {
  const b = Buffer.alloc(FEE_BUCKET_LEN);
  let o = 8; // the discriminator: the decoder holds to the length, like every WK decoder
  for (let i = 0; i < 3; i++, o += 32) Buffer.from(enc.encode(OWNER)).copy(b, o);
  for (const bps of [1500, 3690, 4810]) { b.writeUInt16LE(bps, o); o += 2; }
  Buffer.from(enc.encode(OWNER)).copy(b, o);
  o += 32;
  for (const n of [11n, 22n, 33n]) { b.writeBigUInt64LE(n, o); o += 8; }
  b.writeBigUInt64LE(44n, o);
  b[o + 8] = 254; // bump; the 128-byte reserve follows
  return b;
}

const tokenAccount = (amount) => {
  const d = Buffer.alloc(165);
  d.writeBigUInt64LE(amount, 64);
  return d;
};
const acc = (bytes) => ({ data: [Buffer.from(bytes).toString('base64'), 'base64'] });
function clientReturning(value, { throws = false } = {}) {
  const calls = [];
  return {
    calls,
    programAddress: WK,
    rpc: {
      getMultipleAccounts: (keys) => ({
        send: async () => {
          calls.push(keys);
          if (throws) throw new Error('rpc down');
          return { value };
        },
      }),
    },
  };
}

test('a FeeBucket decodes field by field, the same wallet in all three slots', () => {
  assert.equal(FEE_BUCKET_LEN, 303);
  const s = decodeFeeBucket(bucketBytes());
  assert.deepEqual(s.recipients, [OWNER, OWNER, OWNER]);
  assert.deepEqual(s.splitBps, [1500, 3690, 4810]);
  assert.equal(s.expenseWallet, OWNER);
  assert.deepEqual(s.distributed, [11n, 22n, 33n]);
  assert.equal(s.expenses, 44n);
  assert.equal(s.bump, 254);
  assert.throws(() => decodeFeeBucket(Buffer.alloc(302)), /FeeBucket is 302 bytes, expected 303/);
});

test('readFeeBucket reads the settings and the USDC the bucket holds, in one call', async () => {
  const c = clientReturning([acc(bucketBytes()), acc(tokenAccount(1_234_567n))]);
  const r = await readFeeBucket(c);
  const bucket = await wkPdas.feeBucket(WK);
  assert.deepEqual(c.calls, [[bucket, await ataFor(bucket, USDC_MINT)]], 'the PDA and its USDC account');
  assert.equal(r.address, bucket);
  assert.equal(r.bucketUsdAta, await ataFor(bucket, USDC_MINT));
  assert.equal(r.balance, 1_234_567n);
  assert.deepEqual(r.splitBps, [1500, 3690, 4810]);
  assert.deepEqual(r.distributed, [11n, 22n, 33n]);
});

test('an unreadable bucket is null, never zeros', async () => {
  assert.equal(await readFeeBucket(clientReturning(null, { throws: true })), null, 'the RPC failed');
  assert.equal(await readFeeBucket(clientReturning([acc(bucketBytes())])), null, 'a short reply');
  assert.equal(await readFeeBucket(clientReturning([null, acc(tokenAccount(5n))])), null, 'no bucket yet');
  assert.equal(await readFeeBucket(clientReturning([acc(bucketBytes()), null])), null, 'no USDC account');
  assert.equal(
    await readFeeBucket(clientReturning([acc(Buffer.alloc(300)), acc(tokenAccount(5n))])),
    null,
    'a layout this build does not know',
  );
});
