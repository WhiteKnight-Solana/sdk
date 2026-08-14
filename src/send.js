// Transaction assembly and sending.
//
// Two paths, because operators and users hold their keys differently:
//
//   compileForWallet — build + compile a message and hand back bytes for a BROWSER WALLET to
//     sign and send (`signAndSendTransaction`). The transaction is compiled locally, so what
//     the wallet shows is exactly what was built here.
//
//   sendWithSigners — for backends holding @solana/kit signers (operators, crank-style
//     services). Signs with whatever signers are attached to the message and submits.
//
// This SDK never creates, loads, or stores a private key. Callers bring their own signers.

import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  signTransactionMessageWithSigners,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  address,
} from '@solana/kit';
import { COMPUTE_BUDGET_PROGRAM } from './constants.js';

/** `SetComputeUnitLimit`. */
export function ixComputeUnitLimit(units) {
  const data = new Uint8Array(5);
  data[0] = 0x02;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}

/** `SetComputeUnitPrice`, in micro-lamports per CU. */
export function ixComputeUnitPrice(microLamports) {
  const data = new Uint8Array(9);
  data[0] = 0x03;
  new DataView(data.buffer).setBigUint64(1, BigInt(microLamports), true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}

/**
 * Compile a v0 transaction for a browser wallet.
 *
 * Returns `{ transaction, messageBase58, blockhash }` — most injected wallets take the
 * base58 message via `request({ method: 'signAndSendTransaction', params: { message } })`.
 */
export async function compileForWallet(client, { feePayer, instructions }) {
  const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
  const transaction = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) => compileTransaction(m),
  );
  return {
    transaction,
    messageBase58: getBase58Decoder().decode(transaction.messageBytes),
    blockhash,
  };
}

/**
 * Sign with kit signers and submit. `feePayerSigner` is a `TransactionSigner`; per-account
 * signers (e.g. fresh 1 BTC ticket keypairs) ride on the instructions' account metas.
 * Returns the signature string. Confirmation strategy is the caller's business.
 */
export async function sendWithSigners(client, { feePayerSigner, instructions, computeUnitLimit, priorityFee }) {
  const budget = [];
  if (computeUnitLimit) budget.push(ixComputeUnitLimit(computeUnitLimit));
  if (priorityFee) budget.push(ixComputeUnitPrice(priorityFee));

  const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayerSigner, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([...budget, ...instructions], m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signed);
  await client.rpc.sendTransaction(wire, { encoding: 'base64' }).send();
  return getSignatureFromTransaction(signed);
}
