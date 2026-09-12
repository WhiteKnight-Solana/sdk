import test from 'node:test';
import assert from 'node:assert/strict';

import { readFlows } from '../src/read.js';

test('readFlows bounds transaction fan-out while preserving exact wallet deltas', async () => {
  const wallet = '97ZYQHCorbKwQWh7wc3cpxrJRa2K2nMoZBNQBrghzPG2';
  const usdMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const programAddress = 'WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS';
  const signatures = Array.from({ length: 12 }, (_, i) => ({ signature: `sig-${i}`, err: null }));
  let active = 0;
  let peak = 0;

  const client = {
    programAddress,
    rpc: {
      getSignaturesForAddress: () => ({ send: async () => signatures }),
      getTransaction: (signature) => ({
        send: async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;
          const index = Number(signature.slice(4));
          const deposit = index % 2 === 0;
          return {
            transaction: { message: { accountKeys: [{ pubkey: programAddress }] } },
            meta: {
              preTokenBalances: [{
                owner: wallet,
                mint: usdMint,
                uiTokenAmount: { amount: deposit ? '1000000' : '1000000' },
              }],
              postTokenBalances: [{
                owner: wallet,
                mint: usdMint,
                uiTokenAmount: { amount: deposit ? '750000' : '1500000' },
              }],
            },
          };
        },
      }),
    },
  };

  const result = await readFlows(client, wallet, { limit: 12, usdMint });
  assert.equal(peak, 4, 'the walk is concurrent but never an unbounded Promise.all');
  assert.deepEqual(result, {
    deposited: 1_500_000n,
    withdrawn: 3_000_000n,
    transactions: 12,
    complete: false,
  });
});
