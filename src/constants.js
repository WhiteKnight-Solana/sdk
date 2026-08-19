// Every constant here is READ FROM THE ABI, not copied out of it. The ABI package is pinned by
// commit hash and content-hash-verified (test/abi-pin.test.mjs), so these are the reviewed
// values — and there is no second copy in this repo to drift from them.

import { address } from '@solana/kit';
import { addresses, constants as abi } from '@whiteknight-solana/abi';

const mainnet = addresses.clusters.mainnet;

// Third-party programs and mints. Cluster-independent facts (localnet clones mainnet).
export const SATRUSH_PROGRAM = address(mainnet.satrushProgram);
export const USDC_MINT = address(mainnet.usdcMint);
export const CBBTC_MINT = address(mainnet.cbbtcMint);
export const TOKEN_PROGRAM = address(mainnet.tokenProgram);
export const ATA_PROGRAM = address(mainnet.associatedTokenProgram);
export const SYSTEM_PROGRAM = address(mainnet.systemProgram);
export const COMPUTE_BUDGET_PROGRAM = address(mainnet.computeBudgetProgram);
export const LOOKUP_TABLE_PROGRAM = address(mainnet.addressLookupTableProgram);

// WhiteKnight account lengths. Byte-exact: they double as getProgramAccounts dataSize filters,
// so every decoder length-checks against these and halts on mismatch rather than reading a
// shifted layout.
export const WK_CONFIG_LEN = abi.whiteknight.accountLens.WkConfig;
export const MANAGER_LEN = abi.whiteknight.accountLens.Manager;
export const DEPLOYER_LEN = abi.whiteknight.accountLens.Deployer;

/** Byte offset of `Deployer.deploy_authority`, for memcmp filters. */
export const DEPLOY_AUTHORITY_OFFSET = abi.whiteknight.deployAuthorityOffset;

export const PARAM_COUNT = abi.whiteknight.paramCount;

/** Named indices into `WkConfig.params`. */
export const PARAM = Object.freeze({ ...abi.whiteknight.params });

/** `WkConfig.flags` bits, as testable bigint masks. */
export const FLAG = Object.freeze(
  Object.fromEntries(
    Object.entries(abi.whiteknight.flags)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, bit]) => [k, 1n << BigInt(bit)]),
  ),
);

/**
 * `Deployer.user_flags` bits, as testable bigint masks — the switches a USER owns.
 *
 * Moved only by `ixSetUserFlags`, signed by the position owner; an operator can never write
 * them. 0 is always the pre-existing behaviour, which is why the field could be carved into
 * live accounts without a migration.
 *
 *   PAUSE_MINING     stops deploys ONLY. Settles, both claims, prize collection and
 *                    withdrawals keep running — a pause is not a way to strand money the
 *                    protocol owes the user. It does cost the streak.
 *   HOLD_VAULT_BUYS  stops BOTH ticket legs, so earned hashrate banks on the Miner and the
 *                    user picks which iteration to release it into. Does not stop claim_sats.
 */
export const USER_FLAG = Object.freeze(
  Object.fromEntries(
    Object.entries(abi.whiteknight.userFlags)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, bit]) => [k, 1n << BigInt(bit)]),
  ),
);

/** Every bit the program understands. A mask touching anything else is refused (BadSetting). */
export const USER_FLAGS_KNOWN = Object.values(USER_FLAG).reduce((a, b) => a | b, 0n);

/** Byte offset of `Deployer.user_flags`, for callers that read the field without decoding. */
export const USER_FLAGS_OFFSET = abi.whiteknight.userFlagsOffset;

/** The most wallets a Manager can ever run — only 21 epoch prizes exist. */
export const MAX_SHARDS_HARD_CAP = abi.whiteknight.maxShardsHardCap;

// Sat Rush facts.
export const SIZES = Object.freeze({ ...abi.satrush.sizes });
export const UNITS_PER_TICKET = BigInt(abi.satrush.unitsPerTicket);
export const TILE_COUNT = abi.satrush.tileCount;
export const ROUND_STATE = Object.freeze([...abi.satrush.states.round]);
export const EPOCH_STATE = Object.freeze([...abi.satrush.states.epoch]);
export const ONE_BTC_STATE = Object.freeze([...abi.satrush.states.oneBtc]);
