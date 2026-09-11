// The exact ABI this SDK was built and tested against.
//
// The dependency in package.json points at this same commit, and test/abi-pin.test.mjs
// recomputes the installed package's hashes against these values on every test run. Bumping
// the ABI is therefore a three-line, deliberate change (dependency spec + this file), never
// something an install can do silently — a client that encodes instructions for one program
// version while believing it targets another is the exact failure this pin exists to prevent.

/** The abi repo commit the dependency is pinned to. */
export const ABI_COMMIT = '32a8e228dc6c62d3547da28a45431243898638e9';

/** sha256 of the pinned @whiteknight-solana/abi MANIFEST.json (which itself pins every artifact). */
export const ABI_MANIFEST_SHA256 = '06a83702df7f0a0968d04152955d9087ff1724b59fd39aa2fb8cbd8327d76a07';

/** sha256 of the pinned IDL bytes, for direct verification without trusting the manifest. */
export const ABI_IDL_SHA256 = 'bb392f11f862a2dbd20c76b4440bf6d4c7e90f4e005f9cc41eb8224f3c17f15e';
