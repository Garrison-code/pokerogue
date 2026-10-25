<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Merge importing system data

Manage Data → Merge Import Data accepts multiple system exports (`.prsv`, JSON,
or text). It previews the selected sources and their combined effect before
saving. Session slots, run history and local preferences are separate from system
data and are not imported by this action.

Deploy the rogueserver `ImportHistory` field **before** releasing this frontend.
The existing system get/update and save-all APIs carry this optional field; JSON
(S3/API) and gob (database) retain it without a database schema migration. Older
saves omit the field. All participating clients must support it to retain lineage
through subsequent saves. Reverting to an older backend/client can discard it.

The feature’s English and Traditional Chinese resources are bundled under
`src/locales` in the `mergeImport` namespace, so this change does not depend on
a separate upstream locales submodule commit. Other languages fall back to English.

## Rules

- Union collection flags, abilities, natures, egg moves, ribbons and unlocks;
  maximize each IV, cost reduction, highest records and pity counter.
- Add candies, voucher counts, friendship, cumulative statistics and per-species
  counters. Convert full friendship increments into candies. Cap candies at
  9,999, show lost excess, and retain the existing friendship cap behavior.
- Keep existing passive enable/disable choices for already-unlocked passives;
  enable newly unlocked passives. Preserve selected moves, taking the first
  non-null source selection only when the current selection is null.
- Keep the earliest achievement/reward unlock timestamps without issuing rewards.
  Recompute `ribbonsOwned` as the number of starters with a classic victory, which
  is the existing statistic's definition; challenge ribbons remain a separate union.
- Deduplicate eggs by ID and timestamp, reject conflicting fixed properties, and
  take the minimum remaining hatch waves. Keep eggs above the normal 99 capacity;
  the existing gacha capacity checks still apply.
- Keep the destination trainer/secret IDs, gender and migration metadata. Migrate
  each source independently without scheduling compensation popups during preview.
  Source decoding and remote revision checks use the data-only migration mode, which skips destination-local
  migrations (and their markers), including starter preferences. Normal save loading
  still runs these migrations.

## Duplicate detection and persistence

`importHistory` is `{ version: 1, fingerprints: string[] }`. Fingerprints use SHA-256
of decrypted, expanded JSON with recursively sorted object keys, excluding the
export timestamp, lineage and migration timestamps. Positional arrays keep their
order. Encryption randomness does not affect the fingerprint.

The result records its pre-merge base, accepted source fingerprints and their
lineage. A file with any recorded shared source is excluded in full: overlapping
aggregate saves cannot be split into non-overlapping resources. Different legacy
snapshots without lineage can still double-count progress; the preview warns
about this. Source acceptance follows selection order.

The dialog pauses the game scene, snapshots the base, and checks local/remote
revisions again before saving. Changed data requires a rebuilt preview and another
confirmation. Logged-in saves write to the server before installing local data;
offline saves install result and lineage in the same localStorage value. Neither
preview nor cancellation writes the imported state.

## Validation

Run the merge, GameData and system-savedata API Vitest tests, `pnpm typecheck`,
`pnpm build`, and Go tests for `./defs` and `./api/savedata`. The merge tests cover
the 58-candy Pikachu example, masks, independent IV maxima, friendship, caps,
unsafe totals, egg conflicts/capacity, lineage, legacy parsing, confirmation and
failure handling. Backend tests cover JSON/gob and legacy compatibility.

For browser review, select multiple files on desktop and mobile, expand a Pokémon,
remove a corrupt source, add a duplicate, cancel, and confirm a valid preview.
Check keyboard focus and a narrow viewport. Chromium desktop/mobile emulation was
verified during implementation; physical iOS/Safari testing is still required.
