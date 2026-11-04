# species-sprite-loading Specification

## Purpose

This capability defines how species sprite assets are loaded and shown. It exists so that the loading promise always settles and the Pokedex list never leaves the big sprite blank for seen or unseen species.

## Requirements

### Requirement: Species asset loading always settles

`PokemonSpecies.loadAssets` SHALL return a promise that resolves once the loader round that it started (or joined) has completed, for every combination of arguments, including calls where `startLoad` is true and `variant` is undefined.

#### Scenario: Load without a variant

- **WHEN** `loadAssets` is called with `startLoad` true and `variant` undefined, and the loader completes
- **THEN** the returned promise resolves

#### Scenario: Load with a variant

- **WHEN** `loadAssets` is called with `startLoad` true and a defined `variant`, and the loader completes
- **THEN** the variant colors are loaded first and the returned promise resolves afterwards


<!-- @trace
source: fix-species-load-assets-hang
updated: 2026-11-04
code:
  - src/data/pokemon-species.ts
tests:
  - test/tests/ui/pokedex-list-sprite.test.ts
  - test/tests/data/species-load-assets.test.ts
-->

---
### Requirement: No empty animation for a missing texture

`PokemonSpecies.loadAssets` SHALL NOT create a sprite animation when the sprite texture does not exist or yields no frames, so that a later successful load is still able to create it. The returned promise SHALL still resolve and SHALL NOT throw.

#### Scenario: Texture failed to load

- **WHEN** the loader completes but the sprite texture for the requested key does not exist
- **THEN** no animation is created for that key and the returned promise resolves

#### Scenario: Texture loaded

- **WHEN** the loader completes and the sprite texture exists with at least one frame
- **THEN** an animation for that key exists at frame rate 10 and the returned promise resolves


<!-- @trace
source: fix-species-load-assets-hang
updated: 2026-11-04
code:
  - src/data/pokemon-species.ts
tests:
  - test/tests/ui/pokedex-list-sprite.test.ts
  - test/tests/data/species-load-assets.test.ts
-->

---
### Requirement: Pokedex list shows a sprite for seen and unseen species

When the pokedex list selects a species that is only seen or not yet seen, the system SHALL show its sprite after the assets finish loading, tinted grey for seen-only species and black for unseen species.

#### Scenario: Seen but not caught species

- **WHEN** the cursor moves to a species that is seen but not caught and its assets finish loading
- **THEN** the big sprite becomes visible and plays the species animation with a grey tint

#### Scenario: Unseen species

- **WHEN** the cursor moves to a species that is not seen and its assets finish loading
- **THEN** the big sprite becomes visible with a black tint

#### Scenario: Selection changes while loading

- **WHEN** the cursor moves to another species before the previous species' assets finish loading
- **THEN** the earlier load does not change the visible sprite

<!-- @trace
source: fix-species-load-assets-hang
updated: 2026-11-04
code:
  - src/data/pokemon-species.ts
tests:
  - test/tests/ui/pokedex-list-sprite.test.ts
  - test/tests/data/species-load-assets.test.ts
-->