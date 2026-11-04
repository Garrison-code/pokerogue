# pokedex-overlay-exit Specification

## Purpose

This capability defines how the Pokedex detail page hands control back to the screen that opened it as an overlay, such as the "party is full" capture prompt. It exists so that closing the page always returns the player to a usable screen instead of leaving the game waiting on a menu that was never rebuilt.

## Requirements

### Requirement: Closing the Pokedex page runs the opener's exit callback exactly once

When the Pokedex detail page is opened as an overlay with an exit callback and the player cancels out of it with no earlier species left to return to, the system SHALL restore the previous UI mode and then invoke the exit callback exactly once. The callback SHALL be invoked even though restoring the mode clears the page's own handler.

#### Scenario: Player cancels out of the page opened from the capture prompt

- **WHEN** the party is full, the player chooses the Pokedex option of the "release a Pokemon" prompt, and then presses cancel on the Pokedex detail page
- **THEN** the UI mode is restored and the exit callback runs once
- **AND** the "release a Pokemon" prompt and its option menu are shown again and accept input

#### Scenario: Player opens and closes the page repeatedly

- **WHEN** the player opens the Pokedex page from the same prompt and cancels out of it twice in a row
- **THEN** the exit callback runs once per closing, for a total of two calls
- **AND** exactly one option menu is shown after each closing


<!-- @trace
source: fix-pokedex-overlay-exit-softlock
updated: 2026-11-04
code:
  - src/data/mystery-encounters/utils/encounter-pokemon-utils.ts
  - src/phases/pokemon-anim-phase.ts
  - docs/mouse-ui-roadmap.md
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/mystery-encounter/catch-pokemon-pokedex-option.test.ts
  - test/tests/ui/pokedex-page-exit-callback.test.ts
-->

---
### Requirement: The exit callback does not run when the page did not actually close

The system SHALL NOT invoke the exit callback when the cancel input only moved within the page, or when there was no previous UI mode to restore.

#### Scenario: Player steps back to the previously viewed species

- **WHEN** the player navigated from one species to another inside the Pokedex page and presses cancel
- **THEN** the page shows the previous species
- **AND** the exit callback is not invoked

#### Scenario: There is no previous UI mode to restore

- **WHEN** the player presses cancel and the UI has no previous mode to return to
- **THEN** the exit callback is not invoked and is kept for a later closing of the page


<!-- @trace
source: fix-pokedex-overlay-exit-softlock
updated: 2026-11-04
code:
  - src/data/mystery-encounters/utils/encounter-pokemon-utils.ts
  - src/phases/pokemon-anim-phase.ts
  - docs/mouse-ui-roadmap.md
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/mystery-encounter/catch-pokemon-pokedex-option.test.ts
  - test/tests/ui/pokedex-page-exit-callback.test.ts
-->

---
### Requirement: A pending exit callback does not leak into a later opening

The system SHALL discard an exit callback that was never invoked when the page's handler is cleared, so that a later opening of the page without a callback does not run the old one.

#### Scenario: Page is cleared without being closed by the player

- **WHEN** the page was opened with an exit callback, its handler is cleared by something other than the player's cancel input, and the page is later opened again without a callback
- **THEN** cancelling out of the later opening does not invoke the old callback


<!-- @trace
source: fix-pokedex-overlay-exit-softlock
updated: 2026-11-04
code:
  - src/data/mystery-encounters/utils/encounter-pokemon-utils.ts
  - src/phases/pokemon-anim-phase.ts
  - docs/mouse-ui-roadmap.md
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/mystery-encounter/catch-pokemon-pokedex-option.test.ts
  - test/tests/ui/pokedex-page-exit-callback.test.ts
-->

---
### Requirement: Mystery encounter capture prompt opens the page for the caught Pokemon

When the player chooses the Pokedex option in the "release a Pokemon" prompt shown after a catch during a mystery encounter, the system SHALL open the Pokedex page for the caught Pokemon's species using the caught Pokemon's shiny, variant, form and gender as the page's starting preferences, with an exit callback that rebuilds the prompt. The page SHALL receive the same arguments as the equivalent option of the regular capture prompt.

#### Scenario: Pokedex option of the mystery encounter capture prompt

- **WHEN** the player chooses the Pokedex option after catching a Pokemon of form index 1 during a mystery encounter with a full party
- **THEN** the Pokedex page opens on that species with form 1 selected
- **AND** cancelling out of the page shows the "release a Pokemon" prompt and its option menu again

##### Example: arguments passed when opening the page

| Argument position | Regular capture prompt | Mystery encounter capture prompt (after fix) |
| ----------------- | ---------------------- | -------------------------------------------- |
| 1 | caught species | caught species |
| 2 | preferences `{ shiny, variant, form, female }` | preferences `{ shiny, variant, form, female }` |
| 3 | `null` (no filtered list) | `null` (no filtered list) |
| 4 | `null` | `null` |
| 5 | rebuild-prompt callback | rebuild-prompt callback |

<!-- @trace
source: fix-pokedex-overlay-exit-softlock
updated: 2026-11-04
code:
  - src/data/mystery-encounters/utils/encounter-pokemon-utils.ts
  - src/phases/pokemon-anim-phase.ts
  - docs/mouse-ui-roadmap.md
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/mystery-encounter/catch-pokemon-pokedex-option.test.ts
  - test/tests/ui/pokedex-page-exit-callback.test.ts
-->