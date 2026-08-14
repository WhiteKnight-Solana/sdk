// The exact ABI this SDK was built and tested against.
//
// The dependency in package.json points at this same commit, and test/abi-pin.test.mjs
// recomputes the installed package's hashes against these values on every test run. Bumping
// the ABI is therefore a three-line, deliberate change (dependency spec + this file), never
// something an install can do silently — a client that encodes instructions for one program
// version while believing it targets another is the exact failure this pin exists to prevent.

/** The abi repo commit the dependency is pinned to. */
export const ABI_COMMIT = '2da140575eeff699972ef6a422c63ced61cc2ff6';

/** sha256 of the pinned @whiteknight-solana/abi MANIFEST.json (which itself pins every artifact). */
export const ABI_MANIFEST_SHA256 = 'b623bd6d89a181a416fb9ab221fa2ce941e392351af98c57274146bcae9a6928';

/** sha256 of the pinned IDL bytes, for direct verification without trusting the manifest. */
export const ABI_IDL_SHA256 = '4ad29bdf25c8c6593d16451acce12661b09a9ecafe23c7909600fd289086472e';
