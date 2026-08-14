// Instruction encoding driven by the IDL, at runtime.
//
// Nothing here hardcodes a discriminator or an argument layout: every encoder is derived from
// the pinned ABI's IDL. A program change cannot silently desync a client — either the IDL has
// the instruction with the right args, or `encodeIx` throws by name at build time, before a
// wallet is ever asked to sign.

import { Writer } from './borsh.js';

/** Index a parsed IDL for the encoder. */
export function indexIdl(idl) {
  const ixs = new Map(idl.instructions.map((i) => [i.name, i]));
  const types = new Map((idl.types ?? []).map((t) => [t.name, t]));
  return { idl, ixs, types, programAddress: idl.address };
}

/** Write one value of an IDL type. Throws on anything the program does not actually use. */
function writeValue(w, type, value, types) {
  if (typeof type === 'string') {
    switch (type) {
      case 'u8': return w.u8(value);
      case 'u16': return w.u16(value);
      case 'u32': return w.u32(value);
      case 'u64': return w.u64(value);
      case 'i64': return w.i64(value);
      case 'bool': return w.bool(value);
      case 'pubkey': return w.pubkey(value);
      default: throw new Error(`idl: unsupported scalar type "${type}"`);
    }
  }
  if (type.vec) {
    return w.vec(value, (ww, item) => writeValue(ww, type.vec, item, types));
  }
  if (type.array) {
    const [inner, len] = type.array;
    if (value.length !== len) {
      throw new Error(`idl: array expects ${len} items, got ${value.length}`);
    }
    for (const item of value) writeValue(w, inner, item, types);
    return w;
  }
  if (type.option) {
    if (value === null || value === undefined) return w.u8(0);
    w.u8(1);
    return writeValue(w, type.option, value, types);
  }
  if (type.defined) {
    const name = type.defined.name ?? type.defined;
    const def = types.get(name);
    if (!def) throw new Error(`idl: unknown defined type "${name}"`);
    if (def.type.kind === 'struct') {
      for (const f of def.type.fields) {
        if (!(f.name in value)) {
          throw new Error(`idl: ${name} is missing field "${f.name}"`);
        }
        writeValue(w, f.type, value[f.name], types);
      }
      return w;
    }
    if (def.type.kind === 'enum') {
      // Anchor encodes a fieldless enum as its 1-byte variant index. The program only uses
      // fieldless enums; a data-carrying one must fail loudly rather than encode wrong.
      const idx = typeof value === 'number'
        ? value
        : def.type.variants.findIndex((v) => v.name === value);
      if (idx < 0) throw new Error(`idl: ${name} has no variant "${value}"`);
      const variant = def.type.variants[idx];
      if (variant.fields?.length) {
        throw new Error(`idl: enum ${name}.${variant.name} carries fields; encoder not implemented`);
      }
      return w.u8(idx);
    }
    throw new Error(`idl: unsupported type kind "${def.type.kind}" for ${name}`);
  }
  throw new Error(`idl: unsupported type ${JSON.stringify(type)}`);
}

/**
 * Encode instruction data: the IDL's own 8-byte discriminator followed by the args, in the
 * IDL's declared order. `args` is an object keyed by argument name — positional ordering is
 * the IDL's job, not the caller's, so reordering a program argument cannot silently corrupt
 * a transaction.
 */
export function encodeIx(idl, name, args = {}) {
  const ix = idl.ixs.get(name);
  if (!ix) {
    throw new Error(
      `idl: no instruction "${name}". Available: ${[...idl.ixs.keys()].join(', ')}`,
    );
  }
  const w = new Writer().raw(ix.discriminator);
  for (const a of ix.args) {
    if (!(a.name in args)) {
      throw new Error(`idl: instruction "${name}" is missing argument "${a.name}"`);
    }
    writeValue(w, a.type, args[a.name], idl.types);
  }
  const extra = Object.keys(args).filter((k) => !ix.args.some((a) => a.name === k));
  if (extra.length) {
    throw new Error(`idl: instruction "${name}" got unknown arguments: ${extra.join(', ')}`);
  }
  return w.finish();
}

/** Account-name order for an instruction, straight from the IDL. */
export function ixAccountNames(idl, name) {
  const ix = idl.ixs.get(name);
  if (!ix) throw new Error(`idl: no instruction "${name}"`);
  return ix.accounts.map((a) => a.name);
}

/**
 * Build an instruction in @solana/kit shape. `accounts` maps IDL account name ->
 * address | { address, role }, and every name the IDL declares must be present — a missing
 * account is a thrown error at build time rather than a confusing on-chain failure.
 *
 * Accounts the IDL marks `writable`/`signer` get those roles automatically; `extra` is
 * appended verbatim for `remaining_accounts`.
 */
export function buildIx(idl, name, accounts, args = {}, extra = []) {
  const ix = idl.ixs.get(name);
  if (!ix) throw new Error(`idl: no instruction "${name}"`);
  const metas = ix.accounts.map((a) => {
    const given = accounts[a.name];
    if (given === undefined) {
      throw new Error(`idl: instruction "${name}" is missing account "${a.name}"`);
    }
    const addr = typeof given === 'string' ? given : given.address;
    const role = typeof given === 'object' && given.role !== undefined
      ? given.role
      : roleOf(!!a.writable, !!a.signer);
    return { address: addr, role };
  });
  return {
    programAddress: idl.programAddress,
    accounts: [...metas, ...extra],
    data: encodeIx(idl, name, args),
  };
}

/** kit's AccountRole enum values, spelled out so we do not depend on an import. */
export const ROLE = {
  READONLY: 0,
  WRITABLE: 1,
  READONLY_SIGNER: 2,
  WRITABLE_SIGNER: 3,
};

export function roleOf(writable, signer) {
  if (signer) return writable ? ROLE.WRITABLE_SIGNER : ROLE.READONLY_SIGNER;
  return writable ? ROLE.WRITABLE : ROLE.READONLY;
}

/** Shorthand account metas for `remaining_accounts` lists. */
export const writable = (address) => ({ address, role: ROLE.WRITABLE });
export const readonly = (address) => ({ address, role: ROLE.READONLY });
