// Chain readers. Each takes the client (for its rpc and program address) and returns decoded
// state or null when the account does not exist. Reads that fan out stay SEQUENTIAL where one
// depends on the last and batch only what is genuinely one RPC call — public endpoints
// rate-limit, and a silent 429 mid-scan is worse than a slower loop.

import { getAddressDecoder } from '@solana/kit';
import {
  decodeWkConfig, decodeManager, decodeDeployer, decodeSatsVault, decodeMiner,
} from './decode.js';
import { wkPdas, satrushPdas } from './pdas.js';
import { MANAGER_LEN, SIZES, SATRUSH_PROGRAM } from './constants.js';

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function accountBytes(client, addr) {
  const res = await client.rpc.getAccountInfo(addr, { encoding: 'base64' }).send();
  return res?.value ? b64(res.value.data[0]) : null;
}

/** The live `WkConfig` — admin keys, mints, flags, all 32 params. Null until initialised. */
export async function readConfig(client, configPda) {
  const pda = configPda ?? (await wkPdas.config(client.programAddress));
  const d = await accountBytes(client, pda);
  return d ? decodeWkConfig(d) : null;
}

/**
 * Every position this wallet CONTROLS, sorted by index.
 *
 * Filtered on `authority` (offset 8), not `seed_authority` (offset 40): `transfer_manager`
 * moves the first and never the second, so `authority` is "who controls this today" — the
 * question a client is asking. One `getProgramAccounts` call rather than probing indexes,
 * because a transfer can leave gaps that probing would truncate at.
 */
export async function readManagers(client, authority) {
  const res = await client.rpc
    .getProgramAccounts(client.programAddress, {
      encoding: 'base64',
      filters: [
        { dataSize: BigInt(MANAGER_LEN) },
        { memcmp: { offset: 8n, bytes: String(authority), encoding: 'base58' } },
      ],
    })
    .send();
  const out = [];
  for (const { pubkey, account } of res) {
    try {
      const m = decodeManager(b64(account.data[0]));
      out.push({ address: pubkey, index: Number(m.index), seedAuthority: m.seedAuthority });
    } catch {
      // Right size, not a Manager. Skip rather than fail the whole list.
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** A position's full settings as the chain holds them, or null before `create_deployer`. */
export async function readDeployer(client, deployerPda) {
  const d = await accountBytes(client, deployerPda);
  if (!d) return null;
  try {
    return decodeDeployer(d);
  } catch {
    return null;
  }
}

/**
 * Token balances for a list of ATAs in one call. Missing accounts read as 0 — used before a
 * sweep so no wallet holding anything is ever missed.
 */
export async function readAtaBalances(client, atas) {
  if (!atas.length) return [];
  const res = await client.rpc.getMultipleAccounts(atas, { encoding: 'base64' }).send();
  return res.value.map((v) => {
    if (!v) return 0n;
    const d = b64(v.data[0]);
    if (d.length < 72) return 0n;
    // SPL token account: mint[32] owner[32] amount u64 LE @64
    return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(64, true);
  });
}

/**
 * What a set of shards is owed right now, read from their Sat Rush Miner accounts.
 * Returns totals plus `withMiner`: each shard that has a Miner, with its decoded state
 * attached — the shape the claim builders take.
 */
export async function readClaimable(client, shards) {
  const res = await client.rpc
    .getMultipleAccounts(shards.map((s) => s.miner), { encoding: 'base64' })
    .send();

  let unclaimedUsd = 0n;
  let lockedHashrate = 0n;
  let btcShares = 0n;
  const withMiner = [];
  res.value.forEach((v, i) => {
    if (!v) return;
    let m;
    try {
      m = decodeMiner(b64(v.data[0]));
    } catch {
      return; // layout changed upstream — say nothing rather than a shifted number
    }
    unclaimedUsd += m.unclaimedUsd;
    lockedHashrate += m.unclaimedHashrate;
    btcShares += m.unclaimedBtcShares;
    withMiner.push({ ...shards[i], minerState: m });
  });
  return { unclaimedUsd, lockedHashrate, btcShares, withMiner };
}

/** Satoshis-per-share view of the live `SatsVault`, or null. */
export async function readSatsVault(client) {
  const pda = await satrushPdas.satsVault();
  const d = await accountBytes(client, pda);
  if (!d || d.length !== SIZES.SatsVault) return null;
  return decodeSatsVault(d);
}

/**
 * The live BTC rate (USDC micros per whole BTC) EXACTLY as the program derives it: from Sat
 * Rush's own last swap, recorded on round N-1 — no oracle, no price API. Returns null whenever
 * the pot cannot be valued, which is exactly when the program refuses to act on strike gates.
 */
export async function readBtcRate(client) {
  const [board, config] = [await satrushPdas.board(), await satrushPdas.config()];
  const head = await client.rpc
    .getMultipleAccounts([board, config], { encoding: 'base64' })
    .send();
  const boardData = head.value[0] && b64(head.value[0].data[0]);
  const cfgData = head.value[1] && b64(head.value[1].data[0]);
  if (
    !boardData || boardData.length !== SIZES.Board ||
    !cfgData || cfgData.length !== SIZES.SatrushConfig
  ) {
    return null;
  }

  const bv = new DataView(boardData.buffer, boardData.byteOffset, boardData.byteLength);
  const roundId = bv.getUint32(11, true);

  const cv = new DataView(cfgData.buffer, cfgData.byteOffset, cfgData.byteLength);
  const feeAt = (i) => cv.getUint32(11 + 32 * 6 + i * 4, true);
  const satsBps = BigInt(feeAt(3));
  const potBps = BigInt(10_000 - (feeAt(0) + feeAt(1) + feeAt(2) + feeAt(3) + feeAt(5)));
  if (potBps <= 0n || satsBps <= 0n || roundId === 0) return null;

  const prevPda = await satrushPdas.round(roundId - 1);
  const rd = await accountBytes(client, prevPda);
  if (!rd || rd.length !== SIZES.Round) return null;
  // `winningTile` is an Option<u8>: one byte while None, two once Some — offsets shift.
  const off = rd[48] === 0 ? 49 : 50;
  const rv = new DataView(rd.buffer, rd.byteOffset, rd.byteLength);
  const refUsd = rv.getBigUint64(off + 8, true);
  const refBtc = rv.getBigUint64(off + 16, true);
  if (refUsd === 0n || refBtc < 1000n) return null;

  const rate = (refUsd * satsBps * 100_000_000n) / (potBps * refBtc);
  if (rate < 1_000_000_000n || rate > 1_000_000_000_000n) return null;

  return {
    rate,
    roundId,
    strikeUsd: bv.getBigUint64(43, true),
    strikeBtc: bv.getBigUint64(51, true),
    satsBps,
    potBps,
    refUsd,
    refBtc,
  };
}

/** The Sat Strike pot valued the way the program values it. Null when unvaluable. */
export async function readStrikePot(client) {
  const r = await readBtcRate(client);
  if (!r) return null;
  const btcLeg = (r.strikeBtc * r.refUsd * r.satsBps) / (r.potBps * r.refBtc);
  return { usd: r.strikeUsd, sats: r.strikeBtc, btcLeg, total: r.strikeUsd + btcLeg, rate: r.rate };
}

/**
 * Every 1 BTC ticket a set of shards owns. Tickets are keypair accounts — underivable — so
 * they are found by scanning for entry-sized accounts whose authority matches.
 */
export async function readOneBtcTickets(client, wkAuths, satrushProgram = SATRUSH_PROGRAM) {
  const owned = new Set(wkAuths.map(String));
  const res = await client.rpc
    .getProgramAccounts(satrushProgram, {
      encoding: 'base64',
      filters: [{ dataSize: BigInt(SIZES.OneBtcVaultEntry) }],
    })
    .send();
  const dec = getAddressDecoder();
  let tickets = 0n;
  for (const { account } of res) {
    const d = b64(account.data[0]);
    if (d.length !== SIZES.OneBtcVaultEntry) continue;
    if (!owned.has(String(dec.decode(d.subarray(14, 46))))) continue;
    tickets += new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(54, true);
  }
  return tickets;
}

/**
 * A wallet's deposits and withdrawals in USDC micros, reconstructed from its own signature
 * history. Bounded and honest about it: `complete` reports whether the whole story fit inside
 * one page — a figure that might be partial must be labelled, never shown as whole.
 */
export async function readFlows(client, wallet, { limit = 200, usdMint } = {}) {
  const sigs = await client.rpc
    .getSignaturesForAddress(wallet, { limit, commitment: 'confirmed' })
    .send();
  let deposited = 0n;
  let withdrawn = 0n;
  let seen = 0;

  for (const s of sigs) {
    if (s.err) continue;
    const tx = await client.rpc
      .getTransaction(s.signature, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      .send();
    const keys = tx?.transaction?.message?.accountKeys ?? [];
    const touchedUs = keys.some((k) => String(k.pubkey ?? k) === String(client.programAddress));
    if (!touchedUs) continue;
    seen += 1;

    // Net movement of the wallet's OWN usd balance in this transaction. Negative = money in.
    const mine = (rows) =>
      rows.filter((b) => b.owner === String(wallet) && b.mint === String(usdMint));
    const sum = (rows) => rows.reduce((n, b) => n + BigInt(b.uiTokenAmount?.amount ?? 0), 0n);
    const delta = sum(mine(tx.meta?.postTokenBalances ?? [])) - sum(mine(tx.meta?.preTokenBalances ?? []));
    if (delta < 0n) deposited += -delta;
    else if (delta > 0n) withdrawn += delta;
  }

  return { deposited, withdrawn, transactions: seen, complete: sigs.length < limit };
}

/** Whether the program exists (and is executable) on this cluster. */
export async function programIsLive(client) {
  const res = await client.rpc
    .getAccountInfo(client.programAddress, { encoding: 'base64' })
    .send();
  return Boolean(res.value?.executable);
}
