// Arithmetic that MIRRORS THE PROGRAMS. Nothing here is advice or UI policy — each function
// restates a rule the chain enforces, so a client can predict what a transaction will do
// before paying to find out.

import { UNITS_PER_TICKET, TILE_COUNT, MAX_SHARDS_HARD_CAP } from './constants.js';

/**
 * The most wallets a bet can legally be split across. Mirrors WhiteKnight's
 * `state::max_legal_shards`: every wallet must clear Sat Rush's minimum AFTER its slice is
 * rounded down to a whole number of tiles, so the tile-rounding headroom is part of the rule.
 *
 * `perRound` and `minDeploy` are in whole USDC (floats are fine at these magnitudes).
 */
export function maxLegalShards(perRound, minDeploy = 1.0, tileTotal = TILE_COUNT) {
  const perWalletNeeded = minDeploy + (tileTotal - 1) / 1e6;
  return Math.max(1, Math.min(MAX_SHARDS_HARD_CAP, Math.floor(perRound / perWalletNeeded)));
}

/** Vault tickets buyable from a spendable hashrate balance. 1 ticket = 100 units. */
export function ticketsFromUnits(units) {
  return BigInt(units) / UNITS_PER_TICKET;
}

/**
 * Hashrate a deploy will earn: `floor(deployUSD * streak + deployUSD * 21 / tiles)`.
 * Verified against live mainnet rounds. `deployUsdMicros` is in USDC base units.
 */
export function hashrateFor(deployUsdMicros, streakMultiplier, tiles, tileCoeff = 21n) {
  if (!tiles) return 0n;
  const d = BigInt(deployUsdMicros);
  const loyalty = d * BigInt(streakMultiplier);
  const skill = (d * BigInt(tileCoeff)) / BigInt(tiles);
  return (loyalty + skill) / 1_000_000n;
}

/** Sats-vault shares to burn so at least `unitsWanted` of locked hashrate is released. */
export function sharesToUnlock(unitsWanted, lockedUnits, totalShares) {
  const w = BigInt(unitsWanted);
  const l = BigInt(lockedUnits);
  const t = BigInt(totalShares);
  if (w === 0n || l === 0n || t === 0n) return 0n;
  if (w >= l) return t;
  return (w * t + l - 1n) / l; // ceil
}
