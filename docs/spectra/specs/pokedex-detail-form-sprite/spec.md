# pokedex-detail-form-sprite Specification

## Purpose

This capability defines which sprite the Pokedex detail page shows for a species the player has seen but not caught. It exists so that the picture always matches the form the player selected, instead of silently falling back to the default form.

## Requirements

### Requirement: Detail page shows the selected form for seen but uncaught species

When the Pokedex detail page opens a species that is seen but not caught and a form has been selected, the system SHALL load and play the sprite of the selected form with the grey tint used for uncaught species. When no form has been selected, the system SHALL show the default form.

#### Scenario: Selecting a mega form from the evolutions menu

- **WHEN** the player picks a mega form in the evolutions menu of a seen but uncaught species
- **THEN** the detail page shows the mega form sprite with the grey tint

#### Scenario: Selecting a Gigantamax form from the evolutions menu

- **WHEN** the player picks a Gigantamax form in the evolutions menu of a seen but uncaught species
- **THEN** the detail page shows the Gigantamax form sprite with the grey tint

#### Scenario: No form selected

- **WHEN** the detail page opens a seen but uncaught species without a selected form
- **THEN** the default form sprite is shown with the grey tint

##### Example: Venusaur forms

| Selected form | Sprite shown | Tint |
| ------------- | ------------ | ---- |
| none | Venusaur (default form) | grey |
| Mega | Mega Venusaur | grey |
| Gigantamax | Gigantamax Venusaur | grey |


<!-- @trace
source: fix-pokedex-detail-uncaught-form-sprite
updated: 2026-11-05
code:
  - src/data/pokemon-species.ts
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/ui/pokedex-page-form-sprite.test.ts
  - test/tests/ui/pokedex-list-sprite.test.ts
  - test/tests/data/species-load-assets.test.ts
-->

---
### Requirement: Unseen species keep the silhouette

The system SHALL keep showing the default form as a black silhouette for a species that has not been seen, regardless of any saved form preference.

#### Scenario: Unseen species with a saved form

- **WHEN** the detail page opens an unseen species while a form preference is saved for it
- **THEN** the default form is shown as a black silhouette and the name stays hidden

<!-- @trace
source: fix-pokedex-detail-uncaught-form-sprite
updated: 2026-11-05
code:
  - src/data/pokemon-species.ts
  - src/ui/handlers/pokedex-page-ui-handler.ts
tests:
  - test/tests/ui/pokedex-page-form-sprite.test.ts
  - test/tests/ui/pokedex-list-sprite.test.ts
  - test/tests/data/species-load-assets.test.ts
-->