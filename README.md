# WhiteKnight SDK

The JS/TS client for the WhiteKnight program — an autominer for [Sat Rush](https://satrush.io).
Everything a **user** or an **operator** needs to talk to the program directly: PDA derivations,
account decoders, chain readers, and a builder for every public instruction, encoded from the
pinned ABI at runtime.

> **Status: live on mainnet since 2026-08-15.** `createClient({ cluster: 'mainnet' })`
> resolves **`WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS`** from the pinned ABI's address
> book. (The fail-loud rule still stands: if the ABI ever said `null` for a cluster, the
> client would throw rather than fall back — nothing here encodes against a program that is
> not there.)
>
> **Custody, stated plainly:** the program's upgrade authority is currently the single key
> `3B8wpWfD1T9oAhyDrAWEQU3Zxpog3nmrShr2XoEVXUML` (also platform admin and fee collector).
> It can replace the deployed code, including the withdraw path. Verify at any time with
> `solana program show WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS --url mainnet-beta`; a
> multisig is planned before meaningful TVL, and the on-chain authority is the truth, not
> this README.

## Install

**Always pin a commit hash.** Branches move; the hash you audited is the hash you run.

```jsonc
"dependencies": {
  "@whiteknight-solana/sdk": "github:WhiteKnight-Solana/sdk#<commit-sha>"
}
```

Two runtime dependencies, both pinned exact: `@solana/kit` and the
[`@whiteknight-solana/abi`](https://github.com/WhiteKnight-Solana/abi) package (by commit
hash). `npm install --ignore-scripts` works — nothing needs a lifecycle script.

## Shape of the thing

```js
import {
  createClient, derivePosition, deriveShard, resolveSatrushAccounts,
  readConfig, readManagers, readDeployer, readClaimable, readAtaBalances,
  ixCreateManager, ixCreateDeployer, ixDepositBalance, ixWithdrawBalance, ixWithdrawTokens,
  ixClaimUsdBatch, ixClaimSatsBatch,
  compileForWallet, ataFor,
} from '@whiteknight-solana/sdk';

const client = createClient({ rpcUrl: 'https://api.mainnet-beta.solana.com' });

// Positions are (wallet, index); shards within one are authId 0..shardCount-1.
const pos = await derivePosition(client, { authority: wallet, index: 0 });
const cfg = await readConfig(client);                       // mints, params, flags
const shard0 = await deriveShard(client, { manager: pos.manager, authId: 0 });

// USER: onboard + fund (signed by the position owner)
const ixs = [
  ixCreateManager(client, { authority: wallet, config: pos.config, manager: pos.manager, index: 0 }),
  ixCreateDeployer(client, { authority: wallet, ...pos, settings }),
  ixDepositBalance(client, {
    authority: wallet, ...pos,
    usdMint: cfg.usdMint,
    authorityUsdAta: await ataFor(wallet, cfg.usdMint),
    wkAuthUsdAta: shard0.usdAta,
  }, { authId: 0, amount: 25_000_000n }),
];
const { messageBase58 } = await compileForWallet(client, { feePayer: wallet, instructions: ixs });
// → hand messageBase58 to the wallet's signAndSendTransaction

// ANYONE: collect what a position is owed (permissionless by design — a vanished
// operator can never strand a user's winnings)
const sr = await resolveSatrushAccounts();
const owed = await readClaimable(client, [shard0]);
if (owed.unclaimedUsd > 0n) {
  const ix = ixClaimUsdBatch(client, sr, { payer: anySigner, config: pos.config }, owed.withMiner);
}
```

## The instruction surface

| Who signs | Builders |
| --- | --- |
| **User** (position owner) | `ixCreateManager` `ixCreateDeployer` `ixUpdateDeployer` `ixTransferManager` `ixDepositBalance` `ixWithdrawBalance` `ixWithdrawTokens` `ixCloseShard` |
| **Anyone** (permissionless, value flows to users) | `ixSettleBatch` `ixClaimUsdBatch` `ixClaimSatsBatch` `ixClaimEpochRewardsBatch` `ixClaimOneBtcRewardsBatch` `ixCloseOneBtcTicketsBatch` |
| **Operator** (per-user `deploy_authority`) | `ixDeployBatch` `ixBuyEpochTicketsBatch` `ixBuyOneBtcTicketsBatch` |

Admin instructions are deliberately not wrapped; `test/surface.test.mjs` pins the partition so
a new program instruction must be consciously placed.

Two withdraw verbs because winnings arrive in two tokens: `ixWithdrawBalance` sweeps USDC,
`ixWithdrawTokens` sweeps any mint — the sats cash-back, epoch prizes and the 1 BTC jackpot
all pay cbBTC. `amount: 0n` means "everything".

## What the SDK will never do

- **Hold or generate keys.** Every path takes your signer or returns bytes for your wallet to
  sign. 1 BTC tickets need fresh keypairs — you generate them, the SDK takes their addresses.
- **Guess an address.** Program ids come from the ABI's address book; a cluster without a
  published id throws instead of falling back to the dev key.
- **Read a shifted layout.** Every decoder length-checks against the ABI's published sizes and
  halts on mismatch — a wrong number is worse than no number.

## Staleness checks

- `test/abi-pin.test.mjs` — the dependency spec, the pin file, and the INSTALLED ABI bytes
  must all agree (commit + sha256). Bumping the ABI is a conscious two-file change, never a
  side effect of `npm install`.
- `test/encode.test.mjs` — every builder's discriminator recomputed from
  `sha256("global:<name>")`, account counts pinned against the IDL, argument bytes checked
  against hand-written borsh.
- `test/surface.test.mjs` — the IDL↔builder partition, pinned.
- `test/pdas.test.mjs` — every derivation cross-checked by interpreting the ABI's published
  seed recipes a second way.
- `test/decode.test.mjs` — decoders against full-size synthesized fixtures, including the
  Deployer's three reserve carves.

```
npm test
```

## Versioning

The SDK tracks the ABI, which tracks the program. When the program changes: ABI updates and
publishes a new commit → SDK bumps its pin (dependency spec + `src/abi-pin.js`) → consumers
bump their SDK hash. Every link in that chain is a reviewed commit, and every skipped link is
a failing test.
