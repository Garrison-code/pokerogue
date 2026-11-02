<!--
SPDX-FileCopyrightText: 2026 Garrison-code

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Type matchup panel

The **Type matchups** toolbar button opens a non-modal reference beside the game.
Choose one or two defending types to list incoming attack types at 4×, 2×, ½×,
¼× and 0×. Neutral damage and empty groups are omitted. This uses the game's
standard chart, excluding inverse battles, abilities, items and field effects.

At an available width of 960px or more, the panel receives 25% of the page width.
Below 960px it receives the top 40% of the page height. Its contents scroll
independently. The existing 16:9 game fits into the remaining region and keeps
running. Closing retains the query until the page reloads.

The panel and toolbar use the game's Emerald font (with Chinese/system fallbacks)
and existing pixel window artwork. Both DEFAULT and LEGACY themes and all five
window styles follow display settings, including on desktop with touch controls
disabled. Window style changes update immediately; theme changes retain the
game's existing reload behavior. The panel removes its settings listener on destroy.

Body text and choices are 20px, explanatory text is 18px, and headings are
28px/22px. The toolbar is 56px high; buttons have a minimum height of 44px.
Choices wrap into columns at least 88px wide with 8px gaps. Enlarged contents
scroll inside the existing panel allocation without changing the game/panel ratio.
Type choices and result badges are fully filled with the game's type colors,
with black or white text chosen for contrast. Selected choices retain their color
and show a check and double border; keyboard focus has a separate outline.
Unavailable choices have dashed borders without fading their color or text.

The panel supports mouse, touch, Tab, Enter and Space. Escape closes it while a
tool has focus. Tool keyboard events bypass Phaser's keyboard queue. Focus
changes release held game actions and repeat timers. Gamepad input continues to
control the game; it does not navigate the panel.

Touch control offsets are measured relative to the game viewport. Saved custom
positions are clamped to that viewport when resized without overwriting the
saved positions. Expanding the game restores their saved offsets. Existing
login/name fields remain in Phaser's DOM container and use its scaling.

No save schema, server change or external site is required. English and
Traditional Chinese tool strings are bundled in the frontend; type names reuse
the existing translations. Other tool languages fall back to English.

Validation covers all 324 single-type combinations, every defending type pair,
selection and focus behavior, and existing input/type-hint regressions. Browser
checks should include 960px/959px, desktop, phone portrait/landscape, pointer
coordinates, DOM field alignment, touch controls, and fullscreen. Chromium phone
emulation does not replace testing on physical iOS Safari.
