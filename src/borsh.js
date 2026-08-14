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
  u64() { const v = this.view.getBigUint64(this.o, true); this.o += 8; return v; }
  i64() { const v = this.view.getBigInt64(this.o, true); this.o += 8; return v; }
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
  u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return this.raw(b); }
  i64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); return this.raw(b); }
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

/** u64 little-endian, for PDA seeds. */
export function u64le(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
