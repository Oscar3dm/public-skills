---
name: restyle-panel
description: Use when the user asks to restyle a UI panel, or to put forth style options for one they want to tune themselves, or hands back a restyle preset or restyle panel JSON file.
---

# Restyle panel

Instead of guessing one look, ship a better default AND a live tuner, so the user can flip between variants, tune values, delete the options they don't want, and send back the exact result as JSON.

## The loop

1. **Fix the obvious first.** Whatever the user called out (unstyled scrollbar, tags eating vertical space, overflow) gets fixed in the shipped default, not just offered as an option.
2. **Declare a spec** for the panel: a `RestyleSpec` with grouped options (`choice` = segmented chips, `range` = slider with readout; never number spinners), 3-5 `themes` (named presets that look good), and `defaults`. Every option carries `help`: one plain sentence on what it changes on the page, in the user's words (a group may carry one too).
3. **Make every variant plain CSS** keyed on `data-rs-<id>` attributes (choices) and `--rs-<id>` custom properties (ranges) on the panel root, each with a sensible base rule for when the attribute or property is absent. The panel always calls `applyRestyle(root, SPEC, SPEC.defaults)`; the tuner is only another writer of the same attributes. No variant may require JS beyond that.
4. **Mount the tuner** gated to dev / `?restyle` so end users never see it: `restyleEnabled() ? createRestyleTuner({ target: root, spec: SPEC }) : null`, and call `tuner?.sync()` whenever the panel shows, hides or resizes.
5. **Verify every theme** with screenshots (click the brush button, click each theme, screenshot), fix what looks off.
6. **Hand over** the localhost link plus `?restyle` for a non-dev build. The user clicks the brush button to open the tuner, tunes, hits **Save** or **Save panel**, and clicks the button again to close it.
7. **When a file comes back**, act on its `kind`:
   - `restyle-preset` (`restyle-<panel>-<timestamp>.json`, `{ kind, panel, basedOn, values }`): copy `values` into the spec's `defaults`, keep the themes, re-verify, and say what changed.
   - `restyle-panel` (`restyle-panel-<panel>-<timestamp>.json`, `{ kind, panel, basedOn, removed, spec }`): replace the source spec with `spec` (its groups, themes and defaults are already trimmed), delete the CSS rules for every id in `removed.options` and for every option in a removed group, keep the base rules, re-verify, and say what was removed and what the new defaults are.

## The tuner card

- The header always carries **Reset**, **Load**, **Save panel** and **Save**.
  - **Reset** returns every value to `defaults` and restores every deleted item.
  - **Load** opens a file picker for a saved preset or panel JSON, checks it is this panel's (`kind`, `panel`), and applies only values the spec allows (a known option, an offered choice, a range value in bounds), so the user can go back to a saved look or compare two saves. A panel file also restores its deletions.
  - **Save** downloads the current values as a preset.
  - **Save panel** downloads the trimmed panel: the spec as it now stands after deletions, with the current values as its defaults.
- Each control (and each section header with `help`) has a small i after its label. Hovering or focusing it floats the option's `help` sentence beside the card, level with the icon, so it never covers the controls.
- Each theme, section header and control has a small x to its left. It is invisible until that item is hovered, faint while hovered, and turns red only when the x itself is hovered. Clicking it deletes that item from the tuner: a deleted control stops being written to the panel root (its CSS falls back to the base rule), a deleted section takes its controls with it, and a deleted theme leaves the list. Deletions persist across reloads until Reset.

## Reference implementation (reuse it)

- `tuner/restyle-tuner.js` documents the spec shape in its header and exports `applyRestyle`, `createRestyleTuner`, `restyleEnabled`. Framework-free ES module; copy it into the project rather than forking its behaviour.
- `tuner/restyle-tuner.css` styles the button and card. Retheme it by overriding the `--rs-t-*` tokens from the project's own design tokens; add new colors to the project's tokens first.
- `tuner/demo.html` is a working example panel; serve the folder over http (ES modules do not load from `file://`) and open `demo.html`.
- Values and deletions persist per panel in `localStorage` key `restyle:<panel>` (a dev convenience only).
- If the project already has a port of this tuner, extend that port with any missing header buttons and delete icons instead of adding a second copy.

## Rules

- Load the project's own frontend or style-guide skill first, if it has one, and respect it.
- Copy: no filler text, 1-2 word labels, one-sentence descriptions only if needed.
- The tuner opens on a click of its button and closes on a second click of it. It never opens on hover, and it never closes on a click outside it.
- Never hover-open the tuner: no `mouseenter`/`mouseover` handlers and no `:hover` rule may show it. Hover may only reveal the delete icons inside the open card.
- The card's scroll position is persistent. A pick, a theme, a delete or a Load must never scroll it back to the top or visibly reset it, and closing and reopening it returns to the same place. If the card is rebuilt on a change, carry its scroll position across the rebuild.
- Stored values are checked against the spec on restore, exactly as Load checks them, so a value saved by an older spec is dropped instead of breaking the CSS.
- Every control gets an i with a `help` sentence. No option ships without one.
- Every option must render cleanly in every combination with the others; check the extremes of each range.
- The tuner never ships to production users; the defaults always do.
