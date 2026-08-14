// PDA derivations for both programs.
//
// Seeds mirror the recipes published in the ABI's constants.json; test/pdas.test.mjs derives
// every address a second time by INTERPRETING those recipes and asserts both paths agree, so
// this file cannot quietly diverge from the published spec.

import { getProgramDerivedAddress, address, getAddressEncoder } from '@solana/kit';
import { u16le, u32le, u64le } from './borsh.js';
import { SATRUSH_PROGRAM, TOKEN_PROGRAM, ATA_PROGRAM } from './constants.js';

const enc = new TextEncoder();
const ADDR_ENC = getAddressEncoder();
const seed = (s) => enc.encode(s);
const addrBytes = (a) => ADDR_ENC.encode(address(a));

async function pda(programAddress, seeds) {
  const [a] = await getProgramDerivedAddress({ programAddress, seeds });
  return a;
}

/**
 * WhiteKnight PDAs. Every derivation takes the program address explicitly — the mainnet id is
 * published in the ABI once deployed, and clients on other clusters pass their own.
 */
export const wkPdas = {
  config: (program) => pda(program, [seed('wk-config')]),
  /** One wallet holds many positions: the Manager is seeded with an index. */
  manager: (program, authority, index = 0) =>
    pda(program, [seed('wk-manager'), addrBytes(authority), u16le(index)]),
  deployer: (program, manager) => pda(program, [seed('wk-deployer'), addrBytes(manager)]),
  /** The shard PDA that owns the position's token accounts and signs Sat Rush CPIs. */
  auth: (program, manager, authId) =>
    pda(program, [seed('wk-auth'), addrBytes(manager), u64le(authId)]),
};

/** Sat Rush PDAs. */
export const satrushPdas = {
  config: (p = SATRUSH_PROGRAM) => pda(p, [seed('satrush_config')]),
  board: (p = SATRUSH_PROGRAM) => pda(p, [seed('board')]),
  satsVault: (p = SATRUSH_PROGRAM) => pda(p, [seed('sats_vault')]),
  epochVault: (p = SATRUSH_PROGRAM) => pda(p, [seed('epoch_vault')]),
  oneBtcVault: (p = SATRUSH_PROGRAM) => pda(p, [seed('one_btc_vault')]),
  treasury: (p = SATRUSH_PROGRAM) => pda(p, [seed('treasury')]),
  eventAuthority: (p = SATRUSH_PROGRAM) => pda(p, [seed('__event_authority')]),
  round: (roundId, p = SATRUSH_PROGRAM) => pda(p, [seed('round'), u32le(roundId)]),
  miner: (authority, p = SATRUSH_PROGRAM) => pda(p, [seed('miner'), addrBytes(authority)]),
  publicDeployment: (authority, roundId, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('public_deployment'), addrBytes(authority), u32le(roundId)]),
  publicAutomation: (authority, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('public_automation'), addrBytes(authority)]),
  epochVaultIteration: (id, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('epoch_vault_iteration'), u32le(id)]),
  epochVaultPage: (id, page, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('epoch_vault_page'), u32le(id), u16le(page)]),
  epochVaultEntry: (id, authority, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('epoch_vault_entry'), u32le(id), addrBytes(authority)]),
  oneBtcVaultIteration: (id, p = SATRUSH_PROGRAM) =>
    pda(p, [seed('one_btc_vault_iteration'), u32le(id)]),
};

/** The associated-token address — a PDA of the ATA program, not of either game program. */
export async function ataFor(owner, mint, tokenProgram = TOKEN_PROGRAM) {
  return pda(ATA_PROGRAM, [addrBytes(owner), addrBytes(tokenProgram), addrBytes(mint)]);
}
