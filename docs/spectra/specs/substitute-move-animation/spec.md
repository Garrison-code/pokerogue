# substitute-move-animation Specification

## Purpose

This capability defines how move animations treat a target protected by a Substitute doll. It exists so that hitting a doll never stops the battle, regardless of the animation setting.

## Requirements

### Requirement: Move animations complete when the target has a Substitute doll

The system SHALL finish a move animation aimed at a Substitute doll without raising an error, and SHALL continue the battle afterwards. This SHALL hold whether move animations are enabled or disabled, and in both single and double battles.

#### Scenario: Attack hits a Substitute doll with move animations disabled

- **WHEN** a move that does not bypass Substitute hits a target with a Substitute doll while move animations are disabled
- **THEN** the animation step completes without an error and the turn proceeds to the next phase

#### Scenario: Attack hits a Substitute doll with move animations enabled

- **WHEN** a move animation with target frames plays against a target with a Substitute doll while move animations are enabled
- **THEN** every animation frame and the final cleanup run without an error and the completion callback is called

#### Scenario: Battle outcome after hitting a Substitute doll

- **WHEN** a move that does not bypass Substitute hits a target with a Substitute doll
- **THEN** the doll absorbs the damage, or breaks and is removed, and the target's HP is unchanged by that hit

##### Example: reported and related triggers

| Battle | Move | Target | Expected |
| ------ | ---- | ------ | -------- |
| Double, other enemy already fainted | Heat Wave | Enemy Passimian with doll | No error, doll takes the hit |
| Double, both enemies alive | Heat Wave | Enemy with doll | No error, doll takes the hit |
| Single | Tackle | Enemy Snorlax with doll | No error, doll takes the hit |
| Single | Enemy Tackle | Player Pokemon with doll | No error, doll takes the hit |


<!-- @trace
source: fix-substitute-anim-softlock
updated: 2026-11-03
code:
  - test/mocks/mocks-container/mock-sprite.ts
  - src/data/battle-anims.ts
tests:
  - test/tests/moves/substitute.test.ts
-->

---
### Requirement: Substitute doll sprites receive no Pokemon sprite render data

The system SHALL NOT write `spriteSubmitter` render data to a Substitute doll sprite or to a temporary animation copy of one. The system SHALL continue to write and reset `tone` on Pokemon sprites during move animations.

#### Scenario: Doll sprite during and after an animation

- **WHEN** a move animation plays against a target with a Substitute doll
- **THEN** neither the doll sprite nor its temporary copies have `spriteSubmitter` render data after the animation

#### Scenario: Pokemon sprite without a Substitute doll

- **WHEN** a move animation finishes against a target without a Substitute doll
- **THEN** the target's Pokemon sprite has its `spriteSubmitter` `tone` reset to `[0, 0, 0, 0]`


<!-- @trace
source: fix-substitute-anim-softlock
updated: 2026-11-03
code:
  - test/mocks/mocks-container/mock-sprite.ts
  - src/data/battle-anims.ts
tests:
  - test/tests/moves/substitute.test.ts
-->

---
### Requirement: Test sprites reject render data writes the renderer rejects

The test sprite mock SHALL raise a TypeError when render node data is written for a render node the sprite has no data for, matching the Phaser renderer, so that automated tests detect this class of error.

#### Scenario: Write to a render node without data

- **WHEN** a test calls `setRenderNodeData` on a mock sprite for a render node the sprite was not assigned
- **THEN** the call raises a TypeError

#### Scenario: Write to an assigned render node

- **WHEN** a test calls `setRenderNodeData` on a mock sprite for a render node assigned through `setRenderNodeRole`
- **THEN** the value is stored under that render node

<!-- @trace
source: fix-substitute-anim-softlock
updated: 2026-11-03
code:
  - test/mocks/mocks-container/mock-sprite.ts
  - src/data/battle-anims.ts
tests:
  - test/tests/moves/substitute.test.ts
-->