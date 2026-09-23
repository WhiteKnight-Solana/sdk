// A sub-miner's SOL: the live rent rate and the withdrawal remainder rule.
//
// Every amount is integer lamports (bigint). Pure functions plus one strict reader; nothing
// here signs or sends. Trimmed from the parked self-funding work: no quotes, no batching.
import { address } from '@solana/kit';
import { Reader } from './borsh.js';

export const RENT_SYSVAR = 'SysvarRent111111111111111111111111111111111';

/** A non-negative whole number as a bigint, or a throw that names the field. */
function integer(value, field) {
  if (typeof value !== 'bigint' && !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a whole number`);
  }
  const v = BigInt(value);
  if (v < 0n) throw new Error(`${field} must not be negative`);
  return v;
}

/** Rent sysvar bytes: lamports_per_byte_year u64, exemption_threshold f64, burn_percent u8. */
export function decodeRent(data) {
  if (!(data instanceof Uint8Array) || data.length !== 17) throw new Error('Rent sysvar must be 17 bytes');
  const view = new DataView(data.buffer, data.byteOffset, 17);
  const rent = {
    lamportsPerByteYear: new Reader(data).u64(),
    exemptionThreshold: view.getFloat64(8, true),
    burnPercent: view.getUint8(16),
  };
  if (rent.lamportsPerByteYear === 0n || !(rent.exemptionThreshold > 0)) throw new Error('Rent sysvar is not usable');
  return rent;
}

/** The runtime's `Rent::minimum_balance`: (128 + bytes) x lamports/byte-year x threshold, truncated. */
export function rentExemptLamports(rent, bytes) {
  const yearly = (128n + integer(bytes, 'bytes')) * rent.lamportsPerByteYear;
  return BigInt(Math.trunc(Number(yearly) * rent.exemptionThreshold));
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Live rent plus the slot it was observed at. Never hardcode a rate; it has changed before. */
export async function readRent(client) {
  const res = await client.rpc.getAccountInfo(address(RENT_SYSVAR), { encoding: 'base64' }).send();
  if (!res?.value) throw new Error('Rent sysvar unreadable');
  return { rent: decodeRent(b64(res.value.data[0])), slot: BigInt(res.context.slot) };
}

/**
 * The remainder rule a live validator enforces on a 0-byte System account: after a withdrawal
 * it holds either nothing or at least the rent-exempt minimum. `keep` is what STAYS, so a typed
 * withdrawal X is `keep = balance - X`. A dust `keep` is raised to that minimum (`adjusted`); a
 * `keep` at or above the balance withdraws nothing. Note `amount: 0n` here means "nothing to
 * withdraw", while `ixWithdrawSol`'s amount 0 means "everything": pass the plan's `amount` on
 * only when it is above 0.
 */
export function planWithdrawal({ rent, balance, keep }) {
  const total = integer(balance, 'balance');
  const wanted = integer(keep, 'keep');
  const dustFloor = rentExemptLamports(rent, 0);
  if (wanted >= total) return { amount: 0n, remaining: total, adjusted: false, dustFloor };
  const remaining = wanted === 0n || wanted >= dustFloor ? wanted : dustFloor;
  if (remaining >= total) return { amount: 0n, remaining: total, adjusted: true, dustFloor };
  return { amount: total - remaining, remaining, adjusted: remaining !== wanted, dustFloor };
}
