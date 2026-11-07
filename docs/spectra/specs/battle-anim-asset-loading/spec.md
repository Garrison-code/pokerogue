# battle-anim-asset-loading Specification

## Purpose

This capability defines how battle animation graphics, backgrounds and sounds are queued for loading. It exists so that each texture key is queued only once and the console stays free of duplicate-key warnings.

## Requirements

### Requirement: Animation texture keys are queued once

When loading a batch of battle animations, the system SHALL queue each texture key at most once. A background resource whose name equals the graphic of any animation in the same batch SHALL NOT be queued as a separate image.

#### Scenario: Background shares its name with the graphic

- **WHEN** assets are loaded for an animation whose graphic and background resource have the same name, such as Psychic or Lick
- **THEN** that name is queued once as a spritesheet and is not queued as an image

##### Example: known animations with a shared name

| Move | Shared name | Expected queued loads |
| ---- | ----------- | --------------------- |
| Psychic | PRAS- Psychic BG | 1 spritesheet, 0 images |
| Lick | PRAS- Sketch + Lick | 1 spritesheet, 0 images |

#### Scenario: Background differs from the graphic

- **WHEN** assets are loaded for an animation whose background resource name differs from every graphic in the batch
- **THEN** the background is still queued as an image

<!-- @trace
source: fix-anim-duplicate-texture-key-warning
updated: 2026-11-05
code:
  - src/data/battle-anims.ts
tests:
  - test/tests/data/battle-anim-asset-loading.test.ts
-->
