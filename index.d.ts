// Type declarations for @whiteknight-solana/sdk.
//
// Addresses are typed as the branded `Address` from @solana/kit where the SDK produces them,
// and accepted as `Address | string` where the SDK consumes them — callers pasting a base58
// string should not need a cast to build an instruction.

import type { Address } from '@solana/kit';

export type Addr = Address | string;

/** An instruction in @solana/kit shape (structurally compatible with kit's Instruction). */
export interface WkInstruction {
  programAddress: Address;
  accounts: Array<{ address: Address; role: number }>;
  data: Uint8Array;
}

// ---------------------------------------------------------------- pins
export const ABI_COMMIT: string;
export const ABI_MANIFEST_SHA256: string;
export const ABI_IDL_SHA256: string;

// ---------------------------------------------------------------- constants
export const SATRUSH_PROGRAM: Address;
export const USDC_MINT: Address;
export const CBBTC_MINT: Address;
export const TOKEN_PROGRAM: Address;
export const ATA_PROGRAM: Address;
export const SYSTEM_PROGRAM: Address;
export const COMPUTE_BUDGET_PROGRAM: Address;
export const LOOKUP_TABLE_PROGRAM: Address;
export const WK_CONFIG_LEN: number;
export const MANAGER_LEN: number;
export const DEPLOYER_LEN: number;
export const DEPLOY_AUTHORITY_OFFSET: number;
export const PARAM_COUNT: number;
export const PARAM: Readonly<Record<string, number>>;
export const FLAG: Readonly<Record<string, bigint>>;
/**
 * `Deployer.user_flags` bits, as bigint masks — the switches a POSITION OWNER controls.
 * An operator can never write them.
 *
 *   PAUSE_MINING     stops deploys only; settles, claims, prizes and withdrawals continue.
 *   HOLD_VAULT_BUYS  stops both ticket legs so hashrate banks on the Miner; claim_sats
 *                    keeps running, because that is money owed to the user.
 *   HOLD_SATS        stops claim_sats, so shares stay in the SatsVault earning the 10% fee
 *                    other claimers pay. It also freezes the 35% locked hashrate, which only
 *                    claim_sats releases. Enforced only when the Deployer is passed as a fifth
 *                    remaining account — see `ixClaimSatsBatch`.
 */
export const USER_FLAG: Readonly<Record<string, bigint>>;
/** Every bit the program accepts. A mask touching anything else is refused (BadSetting). */
export const USER_FLAGS_KNOWN: bigint;
/** Byte offset of `Deployer.user_flags`, for readers that skip the full decode. */
export const USER_FLAGS_OFFSET: number;
export const MAX_SHARDS_HARD_CAP: number;
export const SIZES: Readonly<Record<string, number>>;
export const UNITS_PER_TICKET: bigint;
export const TILE_COUNT: number;
export const ROUND_STATE: readonly string[];
export const EPOCH_STATE: readonly string[];
export const ONE_BTC_STATE: readonly string[];

// ---------------------------------------------------------------- borsh
export class Reader {
  constructor(buf: Uint8Array, offset?: number);
  o: number;
  skip(n: number): this;
  seek(n: number): this;
  u8(): number;
  bool(): boolean;
  u16(): number;
  u32(): number;
  u64(): bigint;
  i64(): bigint;
  bytes(n: number): Uint8Array;
  pubkey(): Address;
  option<T>(fn: (r: Reader) => T): T | null;
  array<T>(n: number, fn: (r: Reader) => T): T[];
  vec<T>(fn: (r: Reader) => T): T[];
}
export class Writer {
  raw(bytes: ArrayLike<number>): this;
  u8(v: number): this;
  bool(v: boolean): this;
  u16(v: number): this;
  u32(v: number): this;
  u64(v: number | bigint): this;
  i64(v: number | bigint): this;
  pubkey(v: Addr): this;
  vec<T>(items: T[], fn: (w: Writer, item: T) => void): this;
  finish(): Uint8Array;
}
export function u16le(n: number): Uint8Array;
export function u32le(n: number): Uint8Array;
export function u64le(n: number | bigint): Uint8Array;

// ---------------------------------------------------------------- idl encoder
export interface IndexedIdl {
  idl: unknown;
  ixs: Map<string, unknown>;
  types: Map<string, unknown>;
  programAddress: Address;
}
export function indexIdl(idl: unknown): IndexedIdl;
export function encodeIx(idl: IndexedIdl, name: string, args?: Record<string, unknown>): Uint8Array;
export function ixAccountNames(idl: IndexedIdl, name: string): string[];
export function buildIx(
  idl: IndexedIdl,
  name: string,
  accounts: Record<string, Addr | { address: Addr; role?: number }>,
  args?: Record<string, unknown>,
  extra?: Array<{ address: Addr; role: number }>,
): WkInstruction;
export const ROLE: { READONLY: 0; WRITABLE: 1; READONLY_SIGNER: 2; WRITABLE_SIGNER: 3 };
export function roleOf(writable: boolean, signer: boolean): number;
export function writable(address: Addr): { address: Addr; role: 1 };
export function readonly(address: Addr): { address: Addr; role: 0 };

// ---------------------------------------------------------------- pdas
export const wkPdas: {
  config(program: Addr): Promise<Address>;
  manager(program: Addr, authority: Addr, index?: number): Promise<Address>;
  deployer(program: Addr, manager: Addr): Promise<Address>;
  auth(program: Addr, manager: Addr, authId: number | bigint): Promise<Address>;
};
export const satrushPdas: {
  config(p?: Addr): Promise<Address>;
  board(p?: Addr): Promise<Address>;
  satsVault(p?: Addr): Promise<Address>;
  epochVault(p?: Addr): Promise<Address>;
  oneBtcVault(p?: Addr): Promise<Address>;
  treasury(p?: Addr): Promise<Address>;
  eventAuthority(p?: Addr): Promise<Address>;
  round(roundId: number, p?: Addr): Promise<Address>;
  miner(authority: Addr, p?: Addr): Promise<Address>;
  publicDeployment(authority: Addr, roundId: number, p?: Addr): Promise<Address>;
  publicAutomation(authority: Addr, p?: Addr): Promise<Address>;
  epochVaultIteration(id: number, p?: Addr): Promise<Address>;
  epochVaultPage(id: number, page: number, p?: Addr): Promise<Address>;
  epochVaultEntry(id: number, authority: Addr, p?: Addr): Promise<Address>;
  oneBtcVaultIteration(id: number, p?: Addr): Promise<Address>;
};
export function ataFor(owner: Addr, mint: Addr, tokenProgram?: Addr): Promise<Address>;

// ---------------------------------------------------------------- decoded shapes
export interface WkConfigState {
  admin: Address; pendingAdmin: Address; feeCollector: Address; deployAuthority: Address;
  satrushProgram: Address; usdMint: Address; btcMint: Address;
  flags: bigint; params: bigint[]; bump: number;
  param(i: number): bigint;
  hasFlag(f: bigint): boolean;
  deployAllowed(): boolean;
}
export interface ManagerState {
  authority: Address; seedAuthority: Address; index: number; bump: number;
}
export interface DeployerState {
  manager: Address; deployAuthority: Address;
  bpsFee: bigint; flatFee: bigint; shardCount: number;
  expectedBpsFee: bigint; expectedFlatFee: bigint; maxShards: number;
  perRoundAmount: bigint; tileCount: number; runRounds: number; whenFundsLow: number;
  maxPerTile: bigint; minBet: bigint; stopLevel: bigint; autoReload: boolean;
  minStrikePotUsd: bigint; maxStrikePotUsd: bigint;
  lastRound: number; stakedInRound: bigint; roundsPlayed: number; stakeAllowance: bigint;
  bump: number; btcShareBps: number; epochUnitsBought: bigint; btcUnitsBought: bigint;
  userFlags: bigint;
}
export interface MinerState {
  authority: Address; unclaimedUsd: bigint; unclaimedBtcShares: bigint; hashrate: bigint;
  streak: number; lastMinedRoundId: number; unclaimedHashrate: bigint;
}
export function decodeWkConfig(d: Uint8Array): WkConfigState;
export function decodeManager(d: Uint8Array): ManagerState;
export function decodeDeployer(d: Uint8Array): DeployerState;
/** Has the owner paused this position's mining? */
export function isMiningPaused(deployer: DeployerState): boolean;
/**
 * Has the owner held automatic ticket buying? Worth checking before building a ticket batch:
 * the program skips these shards, so including one buys a transaction that can only be refused.
 */
export function areVaultBuysHeld(deployer: DeployerState): boolean;
/**
 * Has the owner held the sats cash-back, keeping SatsVault shares instead of realising them?
 *
 * Unlike the other two switches this does NOT predict a refusal: a four-account claim batch
 * claims for a holder and succeeds, because the program never receives the account the flag
 * lives on. Read it to honour the switch yourself, or pass `withDeployer` and let the program
 * enforce it.
 */
export function areSatsHeld(deployer: DeployerState): boolean;
/**
 * Between rounds, `startSlot` and `endSlot` BOTH read `2n ** 64n - 1n`: Sat Rush advances
 * `roundId` about 1.5 seconds before writing the new window (measured 1.2-1.7s on mainnet).
 * Code that reacts to `roundId` changing will therefore see the sentinel almost every round.
 * Treat it as "not open yet" and re-read - never as a slot count, and never as corruption.
 */
export function decodeBoard(d: Uint8Array): {
  roundId: number; roundDuration: number; startSlot: bigint; endSlot: bigint;
  strikePendingUsd: bigint; strikeUsd: bigint; strikeBtc: bigint; strikeLastTriggerRoundId: number;
};
export function decodeMiner(d: Uint8Array): MinerState;
export function decodePublicDeployment(d: Uint8Array): {
  authority: Address; roundId: number; deployedUsd: bigint; totalStakeUsd: bigint;
  selectionMask: number; streakMultiplier: number;
};
export function decodeRound(d: Uint8Array): {
  id: number; state: string; winningTile: number | null;
  deployedPendingUsd: bigint; deployedUsd: bigint;
};
export function decodeSatsVault(d: Uint8Array): {
  btcAmount: bigint; btcShares: bigint; toSats(shares: bigint): bigint;
};
export function decodeEpochVault(d: Uint8Array): {
  iterationId: number; lastTriggerSlot: bigint; pendingUsd: bigint; poolUsd: bigint;
  poolBtc: bigint; reservedUsd: bigint; reservedBtc: bigint;
};
export function decodeEpochVaultIteration(d: Uint8Array): {
  iterationId: number; state: string; totalTickets: bigint; participants: number;
  pageCount: number; currentPageIndex: number; currentPageEntryCount: number;
  entropy: Uint8Array; claimableUsd: bigint; claimableBtc: bigint;
  totalTicketsRemaining: bigint; currentWinningTicket: bigint; sealedPagesCount: number;
  winnersSelected: number; winnersClaimed: number;
  winners: Array<{ authority: Address; pageIndex: number; tickets: bigint; claimed: boolean }>;
};
export function decodeEpochVaultEntry(d: Uint8Array): {
  iterationId: number; authority: Address; pageIndex: number; tickets: bigint;
};
export function decodeOneBtcVault(d: Uint8Array): {
  iterationId: number; pendingUsd: bigint; btcAmount: bigint; reservedBtc: bigint; lastTriggerSlot: bigint;
};
export function decodeOneBtcVaultIteration(d: Uint8Array): {
  iterationId: number; state: string; totalTickets: bigint; entropy: Uint8Array;
  winningTicket: bigint; prizeBtc: bigint;
};
export function decodeOneBtcVaultEntry(d: Uint8Array): {
  version: number; iterationId: number; authority: Address; startTicketId: bigint; ticketsCount: bigint;
};
export function decodeSatrushConfig(d: Uint8Array): {
  ownerAuthority: Address; adminAuthority: Address; gameAuthority: Address; feeRecipient: Address;
  usdMint: Address; btcMint: Address;
  strikeFeeBps: number; epochFeeBps: number; oneBtcFeeBps: number; satsVaultRoundFeeBps: number;
  satsVaultClaimFeeBps: number; protocolFeeBps: number; unclaimedHashrateBps: number;
  minDeployUsdAmount: bigint; epochVaultIterationDuration: bigint;
  deploymentSettleGraceDuration: bigint; strikeTriggerModulus: number;
};

// ---------------------------------------------------------------- math
export function maxLegalShards(perRound: number, minDeploy?: number, tileTotal?: number): number;
export function ticketsFromUnits(units: number | bigint): bigint;
export function hashrateFor(
  deployUsdMicros: number | bigint, streakMultiplier: number | bigint,
  tiles: number | bigint, tileCoeff?: bigint,
): bigint;
export function sharesToUnlock(
  unitsWanted: number | bigint, lockedUnits: number | bigint, totalShares: number | bigint,
): bigint;

// ---------------------------------------------------------------- client
export interface WkClient {
  idl: IndexedIdl;
  rpc: any;
  programAddress: Address;
  cluster: string;
}
export function createClient(opts?: {
  rpcUrl?: string; rpc?: any; cluster?: string; programAddress?: Addr;
}): WkClient;
export function derivePosition(client: WkClient, args: {
  authority: Addr; index?: number; authId?: number | bigint;
}): Promise<{ config: Address; manager: Address; deployer: Address; wkAuth: Address }>;
export interface ShardAccounts {
  authId: bigint; manager: Addr; wkAuth: Address; usdAta: Address; btcAta: Address; miner: Address;
}
export function deriveShard(client: WkClient, args: {
  manager: Addr; authId: number | bigint; usdMint?: Addr; btcMint?: Addr;
}): Promise<ShardAccounts>;
export interface SatrushAccounts {
  satrushConfig: Address; board: Address; boardUsdAta: Address; boardBtcAta: Address;
  satsVault: Address; satsVaultBtcAta: Address;
  epochVault: Address; epochVaultUsdAta: Address; epochVaultBtcAta: Address;
  oneBtcVault: Address; oneBtcVaultBtcAta: Address;
  eventAuthority: Address; usdMint: Addr; btcMint: Addr; satrushProgram?: Addr;
}
export function resolveSatrushAccounts(args?: { usdMint?: Addr; btcMint?: Addr }): Promise<SatrushAccounts>;

// ---------------------------------------------------------------- instructions
export interface DeployerSettings {
  deploy_authority: Addr;
  bps_fee: bigint; flat_fee: bigint;
  expected_bps_fee: bigint; expected_flat_fee: bigint;
  per_round_amount: bigint; shard_count: number; max_shards: number; tile_count: number;
  run_rounds: number; when_funds_low: number;
  max_per_tile: bigint; min_bet: bigint; stop_level: bigint; auto_reload: boolean;
  min_strike_pot_usd: bigint; max_strike_pot_usd: bigint;
  btc_share_bps: number;
}
export function ixCreateManager(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; index: number;
}): WkInstruction;
export function ixCreateDeployer(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; deployer: Addr; settings: DeployerSettings;
}): WkInstruction;
/**
 * `set_user_flags(mask, value)` — move this position's own switches. See `USER_FLAG`.
 *
 * `mask` selects which bits the call may touch, `value` what to set them to, so two switches
 * move independently without a read-modify-write. Signed by the position owner only.
 */
export function ixSetUserFlags(client: WkClient, a: {
  authority: Address | string; manager: Address | string; deployer: Address | string;
  mask: bigint | number; value: bigint | number;
}): Instruction;
export function ixUpdateDeployer(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; deployer: Addr; settings: DeployerSettings;
}): WkInstruction;
export function ixTransferManager(client: WkClient, a: {
  authority: Addr; manager: Addr; newAuthority: Addr;
}): WkInstruction;
export function ixDepositBalance(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; deployer: Addr; wkAuth: Addr;
  usdMint: Addr; authorityUsdAta: Addr; wkAuthUsdAta: Addr;
}, args: { authId: number | bigint; amount: bigint }): WkInstruction;
export function ixWithdrawBalance(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; wkAuth: Addr;
  mint: Addr; wkAuthAta: Addr; authorityAta: Addr;
}, args: { authId: number | bigint; amount?: bigint }): WkInstruction;
export function ixWithdrawTokens(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; wkAuth: Addr;
  mint: Addr; wkAuthAta: Addr; authorityAta: Addr;
}, args: { authId: number | bigint; amount?: bigint }): WkInstruction;
export function ixCloseShard(client: WkClient, a: {
  authority: Addr; config: Addr; manager: Addr; usdMint: Addr; btcMint: Addr;
}, shard: { wkAuth: Addr; usdAta: Addr; btcAta: Addr; miner: Addr; authId: number | bigint }): WkInstruction;

export function ixSettleBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr; round: Addr; rentRecipient: Addr; roundId: number;
}, entries: Array<{
  manager: Addr; wkAuth: Addr; pd: Addr; miner: Addr; automation: Addr; automationAta: Addr;
  authId: number | bigint;
}>): WkInstruction;
export function ixClaimUsdBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr;
}, shards: Array<{ manager: Addr; wkAuth: Addr; miner: Addr; usdAta: Addr; authId: number | bigint }>): WkInstruction;
/**
 * Four or five accounts per user; `withDeployer` chooses. Five appends each position's
 * Deployer, the account carrying `user_flags`, and is the only way the program can see
 * `HOLD_SATS`. The default stays four: claim_usd and claim_sats share one measured batch
 * width, so a fifth account costs a whole user per transaction.
 *
 * With `withDeployer: true` every shard must carry `deployer` or the call throws.
 * When `payer` is the position's own authority the hold is ignored — that is the force-sweep.
 */
export function ixClaimSatsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr; withDeployer?: boolean;
}, shards: Array<{
  manager: Addr; wkAuth: Addr; miner: Addr; btcAta: Addr; deployer?: Addr;
  authId: number | bigint;
}>): WkInstruction;
export function ixClaimEpochRewardsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr; iterationId: number; iterationAddress: Addr;
}, shards: Array<{ manager: Addr; wkAuth: Addr; usdAta: Addr; btcAta: Addr; authId: number | bigint }>): WkInstruction;
export function ixClaimOneBtcRewardsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr; iterationId: number; iterationAddress: Addr;
}, shards: Array<{ manager: Addr; wkAuth: Addr; ticket: Addr; btcAta: Addr; authId: number | bigint }>): WkInstruction;
export function ixCloseOneBtcTicketsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  payer: Addr; config: Addr; iterationId: number; iterationAddress: Addr;
}, tickets: Array<{ manager: Addr; wkAuth: Addr; address: Addr; authId: number | bigint }>): WkInstruction;

export function ixDeployBatch(client: WkClient, sr: SatrushAccounts, opts: {
  operator: Addr; config: Addr; roundId: number; round: Addr; previousRound: Addr;
  operatorUsdAta: Addr; platformUsdAta: Addr;
}, shards: Array<{
  deployer: Addr; wkAuth: Addr; usdAta: Addr; publicDeployment: Addr; miner: Addr;
  authId: number | bigint;
}>): WkInstruction;
export function ixBuyEpochTicketsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  operator: Addr; config: Addr; iterationAddress: Addr;
}, shards: Array<{
  manager: Addr; deployer: Addr; wkAuth: Addr; miner: Addr; page: Addr; entry: Addr;
  authId: number | bigint;
}>): WkInstruction;
export function ixBuyOneBtcTicketsBatch(client: WkClient, sr: SatrushAccounts, opts: {
  operator: Addr; config: Addr; iterationAddress: Addr;
}, shards: Array<{
  manager: Addr; deployer: Addr; wkAuth: Addr; miner: Addr; ticket: Addr;
  authId: number | bigint;
}>): WkInstruction;

// ---------------------------------------------------------------- read
export function readConfig(client: WkClient, configPda?: Addr): Promise<WkConfigState | null>;
export function readManagers(client: WkClient, authority: Addr): Promise<Array<{
  address: Address; index: number; seedAuthority: Address;
}>>;
export function readDeployer(client: WkClient, deployerPda: Addr): Promise<DeployerState | null>;
export function readAtaBalances(client: WkClient, atas: Addr[]): Promise<bigint[]>;
export function readClaimable(client: WkClient, shards: ShardAccounts[]): Promise<{
  unclaimedUsd: bigint; lockedHashrate: bigint; btcShares: bigint;
  withMiner: Array<ShardAccounts & { minerState: MinerState }>;
}>;
export function readSatsVault(client: WkClient): Promise<ReturnType<typeof decodeSatsVault> | null>;
export function readBtcRate(client: WkClient): Promise<{
  rate: bigint; roundId: number; strikeUsd: bigint; strikeBtc: bigint;
  satsBps: bigint; potBps: bigint; refUsd: bigint; refBtc: bigint;
} | null>;
export function readStrikePot(client: WkClient): Promise<{
  usd: bigint; sats: bigint; btcLeg: bigint; total: bigint; rate: bigint;
} | null>;
export function readOneBtcTickets(client: WkClient, wkAuths: Addr[], satrushProgram?: Addr): Promise<bigint>;
export function readFlows(client: WkClient, wallet: Addr, opts?: {
  limit?: number; usdMint?: Addr;
}): Promise<{ deposited: bigint; withdrawn: bigint; transactions: number; complete: boolean }>;
export function programIsLive(client: WkClient): Promise<boolean>;

// ---------------------------------------------------------------- send
export function ixComputeUnitLimit(units: number): WkInstruction;
export function ixComputeUnitPrice(microLamports: number | bigint): WkInstruction;
export function compileForWallet(client: WkClient, args: {
  feePayer: Addr; instructions: WkInstruction[];
}): Promise<{ transaction: unknown; messageBase58: string; blockhash: unknown }>;
export function sendWithSigners(client: WkClient, args: {
  feePayerSigner: unknown; instructions: WkInstruction[];
  computeUnitLimit?: number; priorityFee?: number | bigint;
}): Promise<string>;
