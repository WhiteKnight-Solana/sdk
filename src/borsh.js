// Minimal Borsh reader/writer.
//
// Hand-rolled rather than pulled from a library on purpose: we need exactly the subset Anchor
// emits (fixed ints, bool, pubkey, vec, array, struct, Option) and we need the reader to be
// offset-addressable so account decoders can be written to match the Rust ones field for field.
// A general Borsh library would be more code to audit, not less.

import { address, getAddressDecoder, getAddressEncoder } from '@solana/kit';

const ADDR_DEC = getAddressDecoder();
const ADDR_ENC = getAddressEncoder();

export class Reader {
  constructor(buf, offset = 0) {
    this.b = buf;
    this.o = offset;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  skip(n) { this.o += n; return this; }
  seek(n) { this.o = n; return this; }
  u8() { return this.b[this.o++]; }
  bool() { return this.u8() === 1; }
  u16() { const v = this.view.getUint16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.view.getUint32(this.o, true); this.o += 4; return v; }
  // Composed from 32-bit halves, never getBigUint64 — see the note above `u64le` below.
  u64() {
    const lo = this.view.getUint32(this.o, true);
    const hi = this.view.getUint32(this.o + 4, true);
    this.o += 8;
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
  i64() {
    const lo = this.view.getUint32(this.o, true);
    const hi = this.view.getInt32(this.o + 4, true); // signed high half carries the sign
    this.o += 8;
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
  bytes(n) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  pubkey() { return ADDR_DEC.decode(this.bytes(32)); }
  /** Anchor's `Option<T>`: a 1-byte tag then the value. */
  option(fn) { return this.u8() === 1 ? fn(this) : null; }
  array(n, fn) { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = fn(this); return out; }
  vec(fn) { return this.array(this.u32(), fn); }
}

export class Writer {
  constructor() { this.parts = []; }
  raw(bytes) { this.parts.push(Uint8Array.from(bytes)); return this; }
  u8(v) { return this.raw([v & 0xff]); }
  bool(v) { return this.u8(v ? 1 : 0); }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return this.raw(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return this.raw(b); }
  u64(v) { return this.raw(u64le(v)); }
  i64(v) { return this.raw(u64le(BigInt.asUintN(64, BigInt(v)))); }
  pubkey(v) { return this.raw(ADDR_ENC.encode(address(v))); }
  vec(items, fn) { this.u32(items.length); for (const it of items) fn(this, it); return this; }
  finish() {
    const len = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/** u16 little-endian, for PDA seeds. */
export function u16le(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

/** u32 little-endian, for PDA seeds. */
export function u32le(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

/**
 * u64 little-endian, for PDA seeds and every 64-bit instruction argument.
 *
 * Written as two 32-bit halves rather than with `setBigUint64`, and read back the same way.
 * This is not premature caution: on one production host every u64 read out of an account
 * buffer came back as all-ones while every u32 beside it decoded correctly, so the 64-bit
 * DataView path cannot be assumed sound everywhere this code runs — and this library runs in
 * whatever browser a user brings.
 *
 * The stakes here are the highest in the file. This function builds PDA SEEDS, so a wrong
 * byte does not throw or look wrong: it derives a different, valid-looking address. A shard
 * whose auth_id encoded wrong is a different PDA, which is a wallet nobody can reach with the
 * seeds anyone else derives. Amounts have the same property one level down — a silently
 * mis-encoded u64 is a transaction the user signs, not an error they see.
 */
export function u64le(n) {
  const v = BigInt(n);
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, Number(v & 0xffffffffn), true);
  dv.setUint32(4, Number((v >> 32n) & 0xffffffffn), true);
  return b;
}
