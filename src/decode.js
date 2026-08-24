// Account decoders for both programs.
//
// Every decoder length-checks against the ABI's published sizes BEFORE reading a byte, and
// throws on mismatch. That is the contract for third-party programs especially: Sat Rush's
// upgrade authority can redeploy with no timelock, and a client that reads a shifted field
// reports a confidently wrong number — halting is strictly better.
//
// Field order mirrors the on-chain structs exactly. Header is discriminator[8] + version u16 +
// bump u8 = 11 bytes for Sat Rush PDAs (OneBtcVaultEntry has no bump: it is a client-generated
// keypair account), and discriminator[8] for WhiteKnight accounts.

import { Reader } from './borsh.js';
import {
  WK_CONFIG_LEN, MANAGER_LEN, DEPLOYER_LEN, PARAM_COUNT, FLAG, USER_FLAG, SIZES,
  ROUND_STATE, EPOCH_STATE, ONE_BTC_STATE, TILE_COUNT,
} from './constants.js';

// ---------------------------------------------------------------- whiteknight

export function decodeWkConfig(d) {
  if (d.length !== WK_CONFIG_LEN) {
    throw new Error(`wk: WkConfig is ${d.length} bytes, expected ${WK_CONFIG_LEN} — this SDK build may be stale`);
  }
  const r = new Reader(d).seek(8);
  const c = {
    admin: r.pubkey(),
    pendingAdmin: r.pubkey(),
    feeCollector: r.pubkey(),
    deployAuthority: r.pubkey(),
    satrushProgram: r.pubkey(),
    usdMint: r.pubkey(),
    btcMint: r.pubkey(),
    flags: r.u64(),
  };
  c.params = r.array(PARAM_COUNT, (rr) => rr.u64());
  c.bump = r.u8();
  c.param = (i) => c.params[i] ?? 0n;
  c.hasFlag = (f) => (c.flags & f) !== 0n;
  c.deployAllowed = () => !c.hasFlag(FLAG.PAUSED_ALL) && !c.hasFlag(FLAG.PAUSED_DEPLOY);
  return c;
}

export function decodeManager(d) {
  if (d.length !== MANAGER_LEN) {
    throw new Error(`wk: Manager is ${d.length} bytes, expected ${MANAGER_LEN}`);
  }
  const r = new Reader(d).seek(8);
  return {
    authority: r.pubkey(),
    // The wallet the PDA was derived from, fixed at creation. `authority` moves on a transfer;
    // this never does, and every re-derivation uses it.
    seedAuthority: r.pubkey(),
    index: r.u16(),
    bump: r.u8(),
  };
}

export function decodeDeployer(d) {
  if (d.length !== DEPLOYER_LEN) {
    throw new Error(`wk: Deployer is ${d.length} bytes, expected ${DEPLOYER_LEN}`);
  }
  const r = new Reader(d).seek(8);
  const out = {
    // ---- identity ----
    manager: r.pubkey(),
    deployAuthority: r.pubkey(),
    // ---- the operator's price, bounded by the ceilings below ----
    bpsFee: r.u64(),
    flatFee: r.u64(),
    shardCount: r.u16(),
    // ---- the user's consent ceilings. 0 = no ceiling. ----
    expectedBpsFee: r.u64(),
    expectedFlatFee: r.u64(),
    maxShards: r.u8(),
    // ---- the user's consent ceiling on spend (v2) ----
    // Same byte slot that held perRoundAmount, the exact bet the old program divided. v2
    // reinterprets it as the CEILING on the round's total stake across all the user's
    // shards, enforced by the last_round/stakedInRound meter, skip-never-clamp.
    maxPerRound: r.u64(),
    tileCount: r.u8(),
    // A COUNT of rounds to play, not a board round id.
    runRounds: r.u32(),
    whenFundsLow: r.u8(),
    maxPerTile: r.u64(),
    minBet: r.u64(),
    stopLevel: r.u64(),
    autoReload: r.bool(),
    // The Sat Strike range, in USDC micros. 0 at EITHER end means that end is unset.
    minStrikePotUsd: r.u64(),
    maxStrikePotUsd: r.u64(),
    // ---- program-maintained state ----
    lastRound: r.u32(),
    stakedInRound: r.u64(),
    roundsPlayed: r.u32(),
    stakeAllowance: r.u64(),
    bump: r.u8(),
    // The user's fixed jackpot share, in bps. 0 = the pure overflow default.
    btcShareBps: r.u16(),
    // The ratio's lifetime flow ledger: units ever spent on epoch and 1 BTC tickets.
    epochUnitsBought: r.u64(),
    btcUnitsBought: r.u64(),
    // The switches the USER owns — see USER_FLAG. Reads 0 on every position created before
    // they existed, which is exactly what "unset" means for both of them.
    userFlags: r.u64(),
  };
  // DEPRECATED alias, kept for exactly one pin cycle: readers written against v1 see the
  // same number under the old name. It is the CEILING now, not the exact bet — new code
  // must read maxPerRound and say what it means.
  out.perRoundAmount = out.maxPerRound;
  return out;
}

/** Is this position's mining paused by its owner? */
export function isMiningPaused(deployer) {
  return (deployer.userFlags & USER_FLAG.PAUSE_MINING) !== 0n;
}

/**
 * Has its owner held automatic ticket buying, so hashrate banks instead of being spent?
 *
 * Worth reading before building a ticket batch: the program skips these shards with
 * `SkipCause.HoldByUser`, so including them buys a transaction that can only be refused.
 */
export function areVaultBuysHeld(deployer) {
  return (deployer.userFlags & USER_FLAG.HOLD_VAULT_BUYS) !== 0n;
}

/**
 * Has its owner held the sats cash-back, keeping SatsVault shares instead of realising them?
 *
 * Worth reading before building a claim batch, but the consequence is the opposite of the other
 * two switches: a held position is skipped ONLY if you pass its Deployer as a fifth remaining
 * account. A four-account batch claims for a holder and succeeds, because the program never
 * receives the account the flag lives on. So this is the read that lets a caller honour the
 * switch itself — it is not a prediction that the transaction would fail.
 *
 * The owner is never held by their own switch: a claim signed by `deployer.authority` proceeds
 * whatever this returns, which is the force-sweep.
 */
export function areSatsHeld(deployer) {
  return (deployer.userFlags & USER_FLAG.HOLD_SATS) !== 0n;
}

// ---------------------------------------------------------------- satrush

function check(data, name) {
  if (data.length !== SIZES[name]) {
    throw new Error(
      `satrush: ${name} is ${data.length} bytes, expected ${SIZES[name]} — Sat Rush may have ` +
        'changed a layout. Halting rather than reading shifted fields.',
    );
  }
  return new Reader(data);
}

const stateName = (table, v) => table[v] ?? `Unknown(${v})`;

export function decodeBoard(d) {
  const r = check(d, 'Board').seek(11);
  return {
    roundId: r.u32(),
    roundDuration: r.u32(),
    startSlot: r.u64(),
    endSlot: r.u64(),
    strikePendingUsd: r.u64(),
    strikeUsd: r.u64(),
    strikeBtc: r.u64(),
    strikeLastTriggerRoundId: r.u32(),
  };
}

export function decodeMiner(d) {
  const r = check(d, 'Miner').seek(11);
  return {
    authority: r.pubkey(),
    unclaimedUsd: r.u64(),
    unclaimedBtcShares: r.u64(),
    hashrate: r.u64(),
    streak: r.u32(),
    lastMinedRoundId: r.u32(),
    unclaimedHashrate: r.u64(),
  };
}

export function decodePublicDeployment(d) {
  const r = check(d, 'PublicDeployment').seek(11);
  return {
    authority: r.pubkey(),
    roundId: r.u32(),
    deployedUsd: r.u64(),
    totalStakeUsd: r.u64(),
    selectionMask: r.u32(),
    streakMultiplier: r.u32(),
  };
}

/** `Round` — the fields clients act on. `winningTile` is an Option, so later offsets shift. */
export function decodeRound(d) {
  const r = check(d, 'Round').seek(11);
  const id = r.u32();
  const state = stateName(ROUND_STATE, r.u8());
  r.bytes(32); // blockhashEntropy
  const winningTile = r.option((rr) => rr.u8());
  const deployedPendingUsd = r.u64();
  const deployedUsd = r.u64();
  return { id, state, winningTile, deployedPendingUsd, deployedUsd };
}

export function decodeSatsVault(d) {
  const r = check(d, 'SatsVault').seek(11);
  const btcAmount = r.u64();
  const btcShares = r.u64();
  // The virtual offset is Sat Rush's own — copied exactly, or a share is misvalued.
  return { btcAmount, btcShares, toSats: (sh) => (sh * (btcAmount + 1n)) / (btcShares + 1000n) };
}

export function decodeEpochVault(d) {
  const r = check(d, 'EpochVault').seek(11);
  return {
    iterationId: r.u32(),
    lastTriggerSlot: r.u64(),
    pendingUsd: r.u64(),
    poolUsd: r.u64(),
    poolBtc: r.u64(),
    reservedUsd: r.u64(),
    reservedBtc: r.u64(),
  };
}

export function decodeEpochVaultIteration(d) {
  const r = check(d, 'EpochVaultIteration').seek(11);
  const head = {
    iterationId: r.u32(),
    state: stateName(EPOCH_STATE, r.u8()),
    totalTickets: r.u64(),
    participants: r.u32(),
    pageCount: r.u16(),
    currentPageIndex: r.u16(),
    currentPageEntryCount: r.u8(),
    entropy: r.bytes(32),
    claimableUsd: r.u64(),
    claimableBtc: r.u64(),
    totalTicketsRemaining: r.u64(),
    currentWinningTicket: r.u64(),
    sealedPagesCount: r.u16(),
    winnersSelected: r.u8(),
    winnersClaimed: r.u8(),
  };
  head.winners = r.array(TILE_COUNT, (rr) => ({
    authority: rr.pubkey(),
    pageIndex: rr.u16(),
    tickets: rr.u64(),
    claimed: rr.bool(),
  }));
  return head;
}

export function decodeEpochVaultEntry(d) {
  const r = check(d, 'EpochVaultEntry').seek(11);
  return {
    iterationId: r.u32(),
    authority: r.pubkey(),
    pageIndex: r.u16(),
    tickets: r.u64(),
  };
}

export function decodeOneBtcVault(d) {
  const r = check(d, 'OneBtcVault').seek(11);
  return {
    iterationId: r.u32(),
    pendingUsd: r.u64(),
    btcAmount: r.u64(),
    reservedBtc: r.u64(),
    lastTriggerSlot: r.u64(),
  };
}

export function decodeOneBtcVaultIteration(d) {
  const r = check(d, 'OneBtcVaultIteration').seek(11);
  return {
    iterationId: r.u32(),
    state: stateName(ONE_BTC_STATE, r.u8()),
    totalTickets: r.u64(),
    entropy: r.bytes(32),
    winningTicket: r.u64(),
    prizeBtc: r.u64(),
  };
}

/** NOTE: no bump — a client-generated keypair account, not a PDA. */
export function decodeOneBtcVaultEntry(d) {
  const r = check(d, 'OneBtcVaultEntry').seek(8);
  return {
    version: r.u16(),
    iterationId: r.u32(),
    authority: r.pubkey(),
    startTicketId: r.u64(),
    ticketsCount: r.u64(),
  };
}

export function decodeSatrushConfig(d) {
  const r = check(d, 'SatrushConfig').seek(11);
  return {
    ownerAuthority: r.pubkey(),
    adminAuthority: r.pubkey(),
    gameAuthority: r.pubkey(),
    feeRecipient: r.pubkey(),
    usdMint: r.pubkey(),
    btcMint: r.pubkey(),
    strikeFeeBps: r.u32(),
    epochFeeBps: r.u32(),
    oneBtcFeeBps: r.u32(),
    satsVaultRoundFeeBps: r.u32(),
    satsVaultClaimFeeBps: r.u32(),
    protocolFeeBps: r.u32(),
    unclaimedHashrateBps: r.u32(),
    minDeployUsdAmount: r.u64(),
    epochVaultIterationDuration: r.u64(),
    deploymentSettleGraceDuration: r.u64(),
    strikeTriggerModulus: r.u16(),
  };
}
