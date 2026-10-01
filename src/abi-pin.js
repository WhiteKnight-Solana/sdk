// The exact ABI this SDK was built and tested against.
//
// The dependency in package.json points at this same commit, and test/abi-pin.test.mjs
// recomputes the installed package's hashes against these values on every test run. Bumping
// the ABI is therefore a three-line, deliberate change (dependency spec + this file), never
// something an install can do silently — a client that encodes instructions for one program
// version while believing it targets another is the exact failure this pin exists to prevent.

/** The abi repo commit the dependency is pinned to. */
export const ABI_COMMIT = '6ccb55590d423b6459142edaf311c4b07778239b';

/** sha256 of the pinned @whiteknight-solana/abi MANIFEST.json (which itself pins every artifact). */
export const ABI_MANIFEST_SHA256 = '406679020b0f029d5de5214e7ceffe93f60c49103235bd62a1191d904f67936b';

/** sha256 of the pinned IDL bytes, for direct verification without trusting the manifest. */
export const ABI_IDL_SHA256 = 'e5b351585423bb945ddd0f7e25d8029b3c4d7a1d70c50adfd9e1542c605ceade';
