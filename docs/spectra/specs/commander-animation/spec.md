# commander-animation Specification

## Purpose

This capability defines how the two Commander animations behave: a Tatsugiri with Commander jumping into an ally Dondozo's mouth, and the Dondozo spitting it out again. It exists so that these animations always finish and the battle continues after them.

## Requirements

### Requirement: Commander entry animation completes when Tatsugiri enters Dondozo

The system SHALL finish the animation of a Tatsugiri with Commander entering its active ally Dondozo's mouth without raising an error, and SHALL continue the battle afterwards. After the animation, the Dondozo SHALL have the `COMMANDED` battler tag and the Tatsugiri's sprite SHALL be hidden.

#### Scenario: Tatsugiri and Dondozo enter a double battle together

- **WHEN** a Tatsugiri with Commander and a Dondozo are both on the field at the start of a double battle and the entry animation plays
- **THEN** the animation phase completes without an error and the next phase starts
- **AND** the Dondozo has the `COMMANDED` battler tag and the Tatsugiri is hidden

#### Scenario: Dondozo switches in after Tatsugiri

- **WHEN** a Dondozo switches in next to a Tatsugiri with Commander and the entry animation plays
- **THEN** the animation phase completes without an error and the next phase starts
- **AND** the Dondozo has the `COMMANDED` battler tag and the Tatsugiri is hidden

#### Scenario: Entry animation does not apply without a Dondozo ally

- **WHEN** the entry animation is requested for a Pokemon whose ally is not a Dondozo, or in a single battle
- **THEN** the animation phase ends immediately without an error and plays no animation


<!-- @trace
source: fix-commander-apply-anim-softlock
updated: 2026-11-04
code:
  - test/mocks/mocks-container/mock-sprite.ts
  - src/phases/pokemon-anim-phase.ts
tests:
  - test/tests/phases/pokemon-anim-phase.test.ts
-->

---
### Requirement: Commander exit animation completes when Dondozo releases Tatsugiri

The system SHALL finish the animation of a Dondozo spitting out the Tatsugiri it commanded without raising an error, and SHALL continue the battle afterwards. After the animation, the Tatsugiri's sprite SHALL be visible again.

#### Scenario: Dondozo loses the COMMANDED tag while Tatsugiri is still on the field

- **WHEN** the `COMMANDED` battler tag is removed from a Dondozo whose source Tatsugiri is still active and the exit animation plays
- **THEN** the animation phase completes without an error and the next phase starts
- **AND** the Tatsugiri's sprite is visible again

##### Example: animations covered by the regression tests

| Situation | Animation | Expected |
| --------- | --------- | -------- |
| Tatsugiri and Dondozo start a double battle together | `COMMANDER_APPLY` | No error, Dondozo `COMMANDED`, Tatsugiri hidden |
| Dondozo switches in beside Tatsugiri | `COMMANDER_APPLY` | No error, Dondozo `COMMANDED`, Tatsugiri hidden |
| `COMMANDED` removed, Tatsugiri still active | `COMMANDER_REMOVE` | No error, Tatsugiri visible |

<!-- @trace
source: fix-commander-apply-anim-softlock
updated: 2026-11-04
code:
  - test/mocks/mocks-container/mock-sprite.ts
  - src/phases/pokemon-anim-phase.ts
tests:
  - test/tests/phases/pokemon-anim-phase.test.ts
-->