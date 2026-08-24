// The exact ABI this SDK was built and tested against.
//
// The dependency in package.json points at this same commit, and test/abi-pin.test.mjs
// recomputes the installed package's hashes against these values on every test run. Bumping
// the ABI is therefore a three-line, deliberate change (dependency spec + this file), never
// something an install can do silently — a client that encodes instructions for one program
// version while believing it targets another is the exact failure this pin exists to prevent.

/** The abi repo commit the dependency is pinned to. */
export const ABI_COMMIT = '7a0ad6a6e322f6d7278b82c50d58bb35c7eb0164';

/** sha256 of the pinned @whiteknight-solana/abi MANIFEST.json (which itself pins every artifact). */
export const ABI_MANIFEST_SHA256 = '587a4a4b957e1227fd7d900df5ab0d93111a3fd01d52719a51897a79e62539ef';

/** sha256 of the pinned IDL bytes, for direct verification without trusting the manifest. */
export const ABI_IDL_SHA256 = '9136fd83d790ed3e5d4d34fd00c4394a2a14c9e163aa8d6d2e52cc34c599d46e';
