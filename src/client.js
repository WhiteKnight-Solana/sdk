// The client object and the account-context resolvers everything else consumes.

import { createSolanaRpc, address } from '@solana/kit';
import { idl as IDL, addresses } from '@whiteknight-solana/abi';
import { indexIdl } from './idl.js';
import { wkPdas, satrushPdas, ataFor } from './pdas.js';
import { USDC_MINT, CBBTC_MINT } from './constants.js';

/**
 * Create a client: the indexed IDL, an RPC, and the program address for one cluster.
 *
 * The program address resolves from the ABI's address book for `cluster` (default `mainnet`).
 * While a cluster's entry is still the pre-deploy `null`, this THROWS rather than falling back
 * to the development declare_id — encoding transactions for a program that is not there, or
 * worse for the wrong one, is exactly the failure an address book exists to prevent. Pass
 * `programAddress` explicitly to target a custom deployment.
 */
export function createClient({ rpcUrl, rpc, cluster = 'mainnet', programAddress } = {}) {
  const book = addresses.clusters[cluster];
  const resolved = programAddress ?? book?.whiteknightProgram;
  if (!resolved) {
    throw new Error(
      `whiteknight has no published program address for cluster "${cluster}" yet ` +
        '(addresses.json lists it as pending). Pass { programAddress } explicitly to target ' +
        'a custom deployment.',
    );
  }
  if (!rpc && !rpcUrl) throw new Error('createClient needs an rpcUrl or an rpc instance');
  const idl = indexIdl(IDL);
  // The IDL carries the development declare_id; the address book is the deployment truth.
  idl.programAddress = address(resolved);
  return {
    idl,
    rpc: rpc ?? createSolanaRpc(rpcUrl),
    programAddress: idl.programAddress,
    cluster,
  };
}

/**
 * The four WhiteKnight PDAs of one position: `(authority, index)` names the position,
 * `authId` names the shard within it. Shard 0 is where deposits and withdrawals target.
 */
export async function derivePosition(client, { authority, index = 0, authId = 0 }) {
  const p = client.programAddress;
  const config = await wkPdas.config(p);
  const manager = await wkPdas.manager(p, authority, index);
  const deployer = await wkPdas.deployer(p, manager);
  const wkAuth = await wkPdas.auth(p, manager, authId);
  return { config, manager, deployer, wkAuth };
}

/**
 * Everything one shard's money paths need: the shard PDA, both of its token accounts, and the
 * Sat Rush Miner that holds what it is owed. Mints default to the live USDC/cbBTC pair; pass
 * the pair from `readConfig` when targeting a non-standard deployment.
 */
export async function deriveShard(client, { manager, authId, usdMint = USDC_MINT, btcMint = CBBTC_MINT }) {
  const wkAuth = await wkPdas.auth(client.programAddress, manager, authId);
  const usdAta = await ataFor(wkAuth, usdMint);
  const btcAta = await ataFor(wkAuth, btcMint);
  return {
    authId: BigInt(authId),
    manager,
    wkAuth,
    usdAta,
    btcAta,
    miner: await satrushPdas.miner(wkAuth),
  };
}

/**
 * The Sat Rush accounts the batch instructions need, derived once and reused. Pure derivation —
 * no RPC. Mints default to the live pair for the same reason as `deriveShard`.
 */
export async function resolveSatrushAccounts({ usdMint = USDC_MINT, btcMint = CBBTC_MINT } = {}) {
  const satrushConfig = await satrushPdas.config();
  const board = await satrushPdas.board();
  const satsVault = await satrushPdas.satsVault();
  const epochVault = await satrushPdas.epochVault();
  const oneBtcVault = await satrushPdas.oneBtcVault();
  const eventAuthority = await satrushPdas.eventAuthority();
  return {
    satrushConfig,
    board,
    boardUsdAta: await ataFor(board, usdMint),
    boardBtcAta: await ataFor(board, btcMint),
    satsVault,
    satsVaultBtcAta: await ataFor(satsVault, btcMint),
    epochVault,
    epochVaultUsdAta: await ataFor(epochVault, usdMint),
    epochVaultBtcAta: await ataFor(epochVault, btcMint),
    oneBtcVault,
    oneBtcVaultBtcAta: await ataFor(oneBtcVault, btcMint),
    eventAuthority,
    usdMint,
    btcMint,
  };
}
