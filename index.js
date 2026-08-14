// @whiteknight-solana/sdk — the public client for the WhiteKnight program.
//
// Built on the pinned @whiteknight-solana/abi (see src/abi-pin.js): every instruction is
// encoded from the IDL at runtime, every account decoded against published byte-exact sizes,
// and the tests re-verify the installed ABI's content hashes — this client cannot silently
// drift from the program it targets.

export { ABI_COMMIT, ABI_MANIFEST_SHA256, ABI_IDL_SHA256 } from './src/abi-pin.js';

export * from './src/constants.js';
export { Reader, Writer, u16le, u32le, u64le } from './src/borsh.js';
export { indexIdl, encodeIx, buildIx, ixAccountNames, ROLE, roleOf, writable, readonly } from './src/idl.js';
export { wkPdas, satrushPdas, ataFor } from './src/pdas.js';
export * from './src/decode.js';
export * from './src/math.js';
export { createClient, derivePosition, deriveShard, resolveSatrushAccounts } from './src/client.js';
export * from './src/instructions.js';
export * from './src/read.js';
export { ixComputeUnitLimit, ixComputeUnitPrice, compileForWallet, sendWithSigners } from './src/send.js';
