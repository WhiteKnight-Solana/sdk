// The exact ABI this SDK was built and tested against.
//
// The dependency in package.json points at this same commit, and test/abi-pin.test.mjs
// recomputes the installed package's hashes against these values on every test run. Bumping
// the ABI is therefore a three-line, deliberate change (dependency spec + this file), never
// something an install can do silently — a client that encodes instructions for one program
// version while believing it targets another is the exact failure this pin exists to prevent.

/** The abi repo commit the dependency is pinned to. */
export const ABI_COMMIT = '964378247d49196fdee041bf47aee4ac000cf41a';

/** sha256 of the pinned @whiteknight-solana/abi MANIFEST.json (which itself pins every artifact). */
export const ABI_MANIFEST_SHA256 = '072279e4a4bd1664dc3a643e627d35a5af64e7ee560bd62ccd55e7ca3e93d1cf';

/** sha256 of the pinned IDL bytes, for direct verification without trusting the manifest. */
export const ABI_IDL_SHA256 = 'e5b351585423bb945ddd0f7e25d8029b3c4d7a1d70c50adfd9e1542c605ceade';
