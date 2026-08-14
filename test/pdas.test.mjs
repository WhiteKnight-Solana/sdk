// PDA derivations, cross-checked against the ABI's published seed RECIPES.
//
// pdas.js hand-codes each derivation for readability; the ABI publishes the same seeds as
// data. This suite interprets the recipes generically and derives every address a second way,
// so the implementation and the published spec cannot disagree — a seed typo in either place
// fails here by name.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getProgramDerivedAddress, getAddressEncoder, address } from '@solana/kit';
import { constants, idl } from '@whiteknight-solana/abi';
import { wkPdas, satrushPdas, ataFor, u16le, u32le, u64le, SATRUSH_PROGRAM, USDC_MINT, TOKEN_PROGRAM, ATA_PROGRAM } from '../index.js';

const enc = new TextEncoder();
const ADDR_ENC = getAddressEncoder();

/** Interpret one published recipe into seed bytes. */
function seedsFrom(recipe, params) {
  return recipe.map((s) => {
    if (s.kind === 'literal') return enc.encode(s.value);
    const v = params[s.name];
    assert.notEqual(v, undefined, `recipe needs param "${s.name}"`);
    if (s.kind === 'pubkey') return ADDR_ENC.encode(address(v));
    if (s.kind === 'u16le') return u16le(v);
    if (s.kind === 'u32le') return u32le(v);
    if (s.kind === 'u64le') return u64le(v);
    throw new Error(`unknown seed kind ${s.kind}`);
  });
}

async function fromRecipe(programAddress, recipe, params = {}) {
  const [a] = await getProgramDerivedAddress({
    programAddress: address(programAddress),
    seeds: seedsFrom(recipe, params),
  });
  return a;
}

const WK = idl.address; // any well-formed program id works for a derivation cross-check
const AUTH = USDC_MINT; // arbitrary real 32-byte addresses as inputs
const MGR = SATRUSH_PROGRAM;

test('whiteknight PDAs match their published recipes', async () => {
  const r = constants.whiteknight.seeds;
  assert.equal(await wkPdas.config(WK), await fromRecipe(WK, r.config));
  assert.equal(
    await wkPdas.manager(WK, AUTH, 3),
    await fromRecipe(WK, r.manager, { authority: AUTH, index: 3 }),
  );
  assert.equal(
    await wkPdas.deployer(WK, MGR),
    await fromRecipe(WK, r.deployer, { manager: MGR }),
  );
  assert.equal(
    await wkPdas.auth(WK, MGR, 7n),
    await fromRecipe(WK, r.auth, { manager: MGR, authId: 7n }),
  );
});

test('satrush PDAs match their published recipes', async () => {
  const r = constants.satrush.seeds;
  const cases = [
    [satrushPdas.config(), r.config, {}],
    [satrushPdas.board(), r.board, {}],
    [satrushPdas.satsVault(), r.satsVault, {}],
    [satrushPdas.epochVault(), r.epochVault, {}],
    [satrushPdas.oneBtcVault(), r.oneBtcVault, {}],
    [satrushPdas.treasury(), r.treasury, {}],
    [satrushPdas.eventAuthority(), r.eventAuthority, {}],
    [satrushPdas.round(10935), r.round, { roundId: 10935 }],
    [satrushPdas.miner(AUTH), r.miner, { authority: AUTH }],
    [satrushPdas.publicDeployment(AUTH, 42), r.publicDeployment, { authority: AUTH, roundId: 42 }],
    [satrushPdas.publicAutomation(AUTH), r.publicAutomation, { authority: AUTH }],
    [satrushPdas.epochVaultIteration(3), r.epochVaultIteration, { iterationId: 3 }],
    [satrushPdas.epochVaultPage(3, 2), r.epochVaultPage, { iterationId: 3, pageIndex: 2 }],
    [satrushPdas.epochVaultEntry(3, AUTH), r.epochVaultEntry, { iterationId: 3, authority: AUTH }],
    [satrushPdas.oneBtcVaultIteration(1), r.oneBtcVaultIteration, { iterationId: 1 }],
  ];
  for (const [got, recipe, params] of cases) {
    assert.equal(await got, await fromRecipe(SATRUSH_PROGRAM, recipe, params));
  }
});

test('every published recipe is exercised above — none forgotten', () => {
  // The two lists in this file must cover every recipe the ABI publishes, or a new recipe
  // could ship unverified. Counting is enough: names are checked by the derivations passing.
  const count = (seeds) => Object.keys(seeds).filter((k) => !k.startsWith('_')).length;
  assert.equal(count(constants.whiteknight.seeds), 4);
  assert.equal(count(constants.satrush.seeds), 15);
});

test('the associated token address derives under the ATA program', async () => {
  const ata = await ataFor(AUTH, USDC_MINT);
  const [expected] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM,
    seeds: [ADDR_ENC.encode(AUTH), ADDR_ENC.encode(TOKEN_PROGRAM), ADDR_ENC.encode(USDC_MINT)],
  });
  assert.equal(ata, expected);
});
