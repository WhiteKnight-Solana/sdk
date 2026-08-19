// Every public WhiteKnight instruction, grouped by WHO SIGNS IT.
//
//   USER          — the position owner's wallet. Onboarding, money in/out, settings, rent.
//   PERMISSIONLESS — any fee-paying signer. Every one of these only moves value TOWARD the
//                   user; the program allows any passer-by so a vanished operator can never
//                   strand someone's winnings.
//   OPERATOR      — the per-user `deploy_authority`. The money-SPENDING paths: deploys and
//                   both ticket buys. The program checks the signer against each user's
//                   Deployer, so building these without that key just produces a rejected
//                   transaction.
//
// Admin instructions (init_config, set_param, set_key, set_flags, transfer_admin,
// accept_admin) are deliberately NOT wrapped here — they are not public surface. The IDL in
// the ABI carries them for completeness, and test/surface.test.mjs pins this partition so a
// new program instruction must be consciously placed on one side or the other.
//
// Account objects come from client.js's resolvers (`derivePosition`, `deriveShard`,
// `resolveSatrushAccounts`); addresses can be passed as plain strings. Batch builders take a
// `shards` array and put the per-shard accounts in `remaining_accounts`, in exactly the order
// the program walks them — that order is load-bearing and mirrored from the reference crank.

import { buildIx, ROLE, writable, readonly } from './idl.js';
import { TOKEN_PROGRAM, ATA_PROGRAM, SYSTEM_PROGRAM, SATRUSH_PROGRAM } from './constants.js';

/** The Sat Rush program id: from the resolved context if present, else the published one. */
const srProgram = (sr) => sr.satrushProgram ?? SATRUSH_PROGRAM;

const signer = (address) => ({ address, role: ROLE.WRITABLE_SIGNER });

// ---------------------------------------------------------------- user

/** `create_manager(index)` — claims one position slot for this wallet. */
export function ixCreateManager(client, { authority, config, manager, index }) {
  return buildIx(
    client.idl,
    'create_manager',
    { authority, config, manager, system_program: SYSTEM_PROGRAM },
    { index },
  );
}

/**
 * `create_deployer(settings)` — the position's settings, including the fee ceilings the user
 * consents to. `init`: fails if the Deployer exists; use `ixUpdateDeployer` to change one.
 */
export function ixCreateDeployer(client, { authority, config, manager, deployer, settings }) {
  return buildIx(
    client.idl,
    'create_deployer',
    { authority, config, manager, deployer, system_program: SYSTEM_PROGRAM },
    { settings },
  );
}

/**
 * `update_deployer(settings)` — change an existing position's settings.
 *
 * The PROGRAM splits this by signer: signed by the user, every setting moves; signed by the
 * operator, only the operator's own fee and the wallet count do, and never past the user's
 * ceilings. Same instruction either way — the chain decides which half applies.
 */
export function ixUpdateDeployer(client, { authority, config, manager, deployer, settings }) {
  return buildIx(
    client.idl,
    'update_deployer',
    { authority, config, manager, deployer },
    { settings },
  );
}

/**
 * `set_user_flags(mask, value)` — move the position's own switches. See `USER_FLAG`.
 *
 * Deliberately NOT part of `DeployerSettings`: adding a field to that struct would change the
 * wire format of `create_deployer` and `update_deployer`, so every already-loaded client would
 * stop being able to save settings the moment the program upgraded. This is additive instead.
 *
 * `mask` says which bits this call may touch and `value` what to set them to, so two switches
 * on one page move independently — a user toggling the pause can never silently revert a hold
 * set from another tab. Bits outside `mask` are ignored; a mask touching a bit the program does
 * not know is refused with `BadSetting`.
 *
 *   pause:   { mask: USER_FLAG.PAUSE_MINING, value: USER_FLAG.PAUSE_MINING }
 *   unpause: { mask: USER_FLAG.PAUSE_MINING, value: 0n }
 *
 * Signed by the position OWNER only. An operator has no branch here, by design.
 */
export function ixSetUserFlags(client, { authority, manager, deployer, mask, value }) {
  return buildIx(
    client.idl,
    'set_user_flags',
    { authority, manager, deployer },
    { mask: BigInt(mask), value: BigInt(value) },
  );
}

/** `transfer_manager(new_authority)` — hand the whole position to another wallet. */
export function ixTransferManager(client, { authority, manager, newAuthority }) {
  return buildIx(
    client.idl,
    'transfer_manager',
    { authority, manager },
    { new_authority: newAuthority },
  );
}

/** `deposit_balance(auth_id, amount)` — fund one shard. Also raises the stake allowance. */
export function ixDepositBalance(client, a, { authId, amount }) {
  return buildIx(
    client.idl,
    'deposit_balance',
    {
      authority: a.authority,
      config: a.config,
      manager: a.manager,
      deployer: a.deployer,
      wk_auth: a.wkAuth,
      usd_mint: a.usdMint,
      authority_usd_ata: a.authorityUsdAta,
      wk_auth_usd_ata: a.wkAuthUsdAta,
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { auth_id: BigInt(authId), amount },
  );
}

/** `withdraw_balance(auth_id, amount)` — the USDC leg. `amount: 0` sweeps everything. */
export function ixWithdrawBalance(client, a, { authId, amount = 0n }) {
  return withdrawIx(client, 'withdraw_balance', a, { authId, amount });
}

/**
 * `withdraw_tokens(auth_id, amount)` — the mint-agnostic leg, which is how cbBTC winnings come
 * home: the sats cash-back, every epoch prize and the 1 BTC vault all pay cbBTC into the same
 * shard. `a.mint`/`a.wkAuthAta`/`a.authorityAta` name the token being swept.
 */
export function ixWithdrawTokens(client, a, { authId, amount = 0n }) {
  return withdrawIx(client, 'withdraw_tokens', a, { authId, amount });
}

// Both withdraw verbs share one account struct, so they share one builder.
function withdrawIx(client, name, a, { authId, amount }) {
  return buildIx(
    client.idl,
    name,
    {
      authority: a.authority,
      config: a.config,
      manager: a.manager,
      wk_auth: a.wkAuth,
      mint: a.mint,
      wk_auth_ata: a.wkAuthAta,
      authority_ata: a.authorityAta,
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { auth_id: BigInt(authId), amount },
  );
}

/**
 * `close_shard(auth_id)` — hand back the rent of an emptied shard's accounts.
 *
 * User-signed, unlike the claims: it destroys accounts, so it is the owner's call and no
 * operator can do it for you. The program refuses while the shard still holds anything —
 * tokens, unclaimed winnings, sats shares or hashrate.
 */
export function ixCloseShard(client, a, shard) {
  return buildIx(
    client.idl,
    'close_shard',
    {
      authority: a.authority,
      config: a.config,
      manager: a.manager,
      wk_auth: shard.wkAuth,
      wk_auth_usd_ata: shard.usdAta,
      wk_auth_btc_ata: shard.btcAta,
      usd_mint: a.usdMint,
      btc_mint: a.btcMint,
      miner: shard.miner,
      token_program: TOKEN_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { auth_id: BigInt(shard.authId) },
  );
}

// ---------------------------------------------------------------- permissionless

/**
 * `wk_settle_batch(round_id, auth_ids)` — credit the hashrate a settled round earned.
 * Round must be in state Settled. Entries: `{ manager, wkAuth, pd, miner, automation,
 * automationAta, authId }` (pd = the round's publicDeployment; automation = publicAutomation).
 */
export function ixSettleBatch(client, sr, { payer, config, round, rentRecipient, roundId }, entries) {
  const extra = entries.flatMap((s) => [
    readonly(s.manager),
    writable(s.wkAuth),
    writable(s.pd),
    writable(s.miner),
    writable(s.automation),
    writable(s.automationAta),
  ]);
  return buildIx(
    client.idl,
    'wk_settle_batch',
    {
      crank: signer(payer),
      config,
      usd_mint: sr.usdMint,
      btc_mint: sr.btcMint,
      rent_recipient: { address: rentRecipient, role: ROLE.WRITABLE },
      satrush_config: sr.satrushConfig,
      round: { address: round, role: ROLE.WRITABLE },
      board: sr.board,
      sats_vault: { address: sr.satsVault, role: ROLE.WRITABLE },
      board_usd_ata: { address: sr.boardUsdAta, role: ROLE.WRITABLE },
      board_btc_ata: { address: sr.boardBtcAta, role: ROLE.WRITABLE },
      sats_vault_btc_ata: { address: sr.satsVaultBtcAta, role: ROLE.WRITABLE },
      event_authority: sr.eventAuthority,
      satrush_program: sr.satrushProgram ?? srProgram(sr),
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { round_id: roundId, auth_ids: entries.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/** `wk_claim_usd_batch(auth_ids)` — round winnings, into each shard's USDC account. */
export function ixClaimUsdBatch(client, sr, { payer, config }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.wkAuth),
    writable(s.miner),
    writable(s.usdAta),
  ]);
  return buildIx(
    client.idl,
    'wk_claim_usd_batch',
    {
      crank: signer(payer),
      config,
      usd_mint: sr.usdMint,
      satrush_config: sr.satrushConfig,
      board: sr.board,
      board_usd_ata: sr.boardUsdAta,
      satrush_program: srProgram(sr),
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/**
 * `wk_claim_sats_batch(auth_ids)` — the 12% cash-back, paid in cbBTC. How much locked
 * hashrate one pass releases is `param::CLAIM_SATS_TICKETS` on the config (0 = everything),
 * read by the program — no caller-supplied size exists. Claiming burns shares at a 10% fee.
 */
export function ixClaimSatsBatch(client, sr, { payer, config }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.wkAuth),
    writable(s.miner),
    writable(s.btcAta),
  ]);
  return buildIx(
    client.idl,
    'wk_claim_sats_batch',
    {
      crank: signer(payer),
      config,
      btc_mint: sr.btcMint,
      satrush_config: sr.satrushConfig,
      sats_vault: sr.satsVault,
      sats_vault_btc_ata: sr.satsVaultBtcAta,
      event_authority: sr.eventAuthority,
      satrush_program: srProgram(sr),
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/** `wk_claim_epoch_rewards_batch(iteration_id, auth_ids)` — epoch prizes, USDC and cbBTC. */
export function ixClaimEpochRewardsBatch(client, sr, { payer, config, iterationId, iterationAddress }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.wkAuth),
    writable(s.usdAta),
    writable(s.btcAta),
  ]);
  return buildIx(
    client.idl,
    'wk_claim_epoch_rewards_batch',
    {
      crank: signer(payer),
      config,
      usd_mint: sr.usdMint,
      btc_mint: sr.btcMint,
      epoch_vault: sr.epochVault,
      // Must match `iteration_id` — the program re-derives this PDA from the argument.
      epoch_vault_iteration: iterationAddress,
      epoch_vault_usd_ata: sr.epochVaultUsdAta,
      epoch_vault_btc_ata: sr.epochVaultBtcAta,
      satrush_program: srProgram(sr),
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { iteration_id: iterationId, auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/** `wk_claim_one_btc_rewards_batch(iteration_id, auth_ids)` — the whole bitcoin. Each shard carries its winning `ticket` account. */
export function ixClaimOneBtcRewardsBatch(client, sr, { payer, config, iterationId, iterationAddress }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.wkAuth),
    readonly(s.ticket),
    writable(s.btcAta),
  ]);
  return buildIx(
    client.idl,
    'wk_claim_one_btc_rewards_batch',
    {
      crank: signer(payer),
      config,
      btc_mint: sr.btcMint,
      one_btc_vault: sr.oneBtcVault,
      one_btc_vault_iteration: iterationAddress,
      one_btc_vault_btc_ata: sr.oneBtcVaultBtcAta,
      satrush_program: srProgram(sr),
      satrush_config: sr.satrushConfig,
      token_program: TOKEN_PROGRAM,
      associated_token_program: ATA_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { iteration_id: iterationId, auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/**
 * `wk_close_one_btc_tickets_batch(iteration_id, auth_ids)` — reclaim spent ticket rent once an
 * iteration has settled. Tickets: `{ manager, wkAuth, address, authId }`. Rent flows back to
 * the shard that paid it.
 */
export function ixCloseOneBtcTicketsBatch(client, sr, { payer, config, iterationId, iterationAddress }, tickets) {
  const extra = tickets.flatMap((t) => [
    readonly(t.manager),
    writable(t.wkAuth),
    writable(t.address),
  ]);
  return buildIx(
    client.idl,
    'wk_close_one_btc_tickets_batch',
    {
      crank: signer(payer),
      config,
      one_btc_vault_iteration: iterationAddress,
      satrush_program: srProgram(sr),
      satrush_config: sr.satrushConfig,
    },
    { iteration_id: iterationId, auth_ids: tickets.map((t) => BigInt(t.authId)) },
    extra,
  );
}

// ---------------------------------------------------------------- operator

/**
 * `wk_deploy_batch(round_id, auth_ids)` — stake every listed shard into a round. Signed by the
 * operator each user hired; the program verifies the signer against every Deployer in the
 * batch and prices fees inside the user's ceilings.
 *
 * Shards: `{ deployer, wkAuth, usdAta, publicDeployment, miner, authId }`.
 * `operatorUsdAta` must be owned by the signing operator, `platformUsdAta` by the config's
 * fee collector — the program checks both, so neither fee can be redirected.
 */
export function ixDeployBatch(
  client,
  sr,
  { operator, config, roundId, round, previousRound, operatorUsdAta, platformUsdAta },
  shards,
) {
  const extra = shards.flatMap((s) => [
    writable(s.deployer),
    writable(s.wkAuth),
    writable(s.usdAta),
    writable(s.publicDeployment),
    writable(s.miner),
  ]);
  return buildIx(
    client.idl,
    'wk_deploy_batch',
    {
      crank: signer(operator),
      config,
      usd_mint: sr.usdMint,
      operator_usd_ata: operatorUsdAta,
      platform_usd_ata: platformUsdAta,
      satrush_config: sr.satrushConfig,
      board: sr.board,
      round,
      // Round N-1: where the strike gate reads its BTC rate from. The program re-derives it.
      previous_round: previousRound,
      board_usd_ata: sr.boardUsdAta,
      event_authority: sr.eventAuthority,
      satrush_program: srProgram(sr),
      token_program: TOKEN_PROGRAM,
      system_program: SYSTEM_PROGRAM,
    },
    { round_id: roundId, auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/**
 * `wk_buy_epoch_tickets_batch(auth_ids)` — spend earned hashrate on epoch raffle entries. The
 * PROGRAM computes each user's buy from their settings (knee cap, floor, jackpot ratio) — the
 * auth_ids only nominate who is considered.
 *
 * Shards: `{ manager, deployer, wkAuth, miner, page, entry, authId }` — `page` is the
 * iteration's page PDA for that user's entry, `entry` their epochVaultEntry PDA. Deployer is
 * writable: the jackpot-ratio flow ledger lives there.
 */
export function ixBuyEpochTicketsBatch(client, sr, { operator, config, iterationAddress }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.deployer),
    writable(s.wkAuth),
    writable(s.miner),
    writable(s.page),
    writable(s.entry),
  ]);
  return buildIx(
    client.idl,
    'wk_buy_epoch_tickets_batch',
    {
      crank: signer(operator),
      config,
      satrush_config: sr.satrushConfig,
      epoch_vault: sr.epochVault,
      epoch_vault_iteration: iterationAddress,
      event_authority: sr.eventAuthority,
      satrush_program: srProgram(sr),
      system_program: SYSTEM_PROGRAM,
    },
    { auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}

/**
 * `wk_buy_one_btc_tickets_batch(auth_ids)` — 1 BTC jackpot entries. Each shard's `ticket` is a
 * FRESH KEYPAIR the caller generated and must co-sign the transaction with (Sat Rush tickets
 * are keypair accounts, not PDAs). This SDK never generates or holds keys — pass the public
 * addresses here and sign with the keypairs yourself.
 *
 * Shards: `{ manager, deployer, wkAuth, miner, ticket, authId }`.
 */
export function ixBuyOneBtcTicketsBatch(client, sr, { operator, config, iterationAddress }, shards) {
  const extra = shards.flatMap((s) => [
    readonly(s.manager),
    writable(s.deployer),
    writable(s.wkAuth),
    writable(s.miner),
    { address: s.ticket, role: ROLE.WRITABLE_SIGNER },
  ]);
  return buildIx(
    client.idl,
    'wk_buy_one_btc_tickets_batch',
    {
      crank: signer(operator),
      config,
      one_btc_vault: sr.oneBtcVault,
      one_btc_vault_iteration: iterationAddress,
      event_authority: sr.eventAuthority,
      satrush_program: srProgram(sr),
      system_program: SYSTEM_PROGRAM,
    },
    { auth_ids: shards.map((s) => BigInt(s.authId)) },
    extra,
  );
}
