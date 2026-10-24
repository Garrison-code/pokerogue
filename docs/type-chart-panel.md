# Type matchup panel

The **Type matchups** toolbar button opens a non-modal reference beside the game.
Choose one or two defending types to list incoming attack types at 4×, 2×, ½×,
¼× and 0×. Neutral damage and empty groups are omitted. This uses the game's
standard chart, excluding inverse battles, abilities, items and field effects.

At an available width of 960px or more, the panel receives 25% of the page width.
Below 960px it receives the top 40% of the page height. Its contents scroll
independently. The existing 16:9 game fits into the remaining region and keeps
running. Closing retains the query until the page reloads.

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
