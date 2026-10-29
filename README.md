# Rack Line Sorter

Paste a list of space-separated lines, pick the column to group by (for example the
one holding `f09`), then work through the grouped list rack by rack, ticking lines
off as you go.

## Use

Open `index.html` in a browser. Nothing to install, no build step, no server.

1. **Paste lines.** Each line is split into columns on runs of spaces or tabs.
   Blank lines are ignored, and leading and trailing spaces are trimmed.
2. **Group by column.** Tap a chip. Each chip shows the column number and the
   value that column holds on the first line, as a reminder of what it is.
   Optionally pick a second column in the dropdown to sort the lines inside
   each group.
3. **Filter groups.** Type part of a group name to show only those groups.
4. **Tick lines off.** Tap anywhere on a row, or focus it and press Space.

`Copy grouped` puts the currently shown groups on the clipboard, with original
spacing intact, and appends any note as `  # note`. `Uncheck all` and `Clear`
both ask first.

## Notes

Every row has a quiet note field at its right-hand end. It has no box around
it, so a list with no notes in it looks the same as it did before; an empty one
shows only a faint dotted guide line.

Tap it and it takes a line of its own at full width, so a whole short sentence
is readable while you write it, then shrinks back when you tap away. Notes are
capped at 120 characters. Enter or Escape leaves the field.

## Highlighter

`Highlight` in the toolbar opens a small palette: **red**, **green**,
**yellow** and **clear**. Pick one and the button turns that colour.

While a colour is picked, **tapping a row colours it instead of ticking it**,
and the tick boxes are dimmed on every row to show that. `Clear` erases the
colour from the rows you tap.

To go back to ticking, choose `Stop highlighting` at the bottom of the palette,
or press Escape. The palette itself closes on Escape, on a tap outside it, or
on a second tap of the button.

- A colour and a tick are independent: a line can be both.
- Colours are remembered like ticks are, but the *armed* colour is not: a
  reload always comes back in normal ticking mode, so you can never pick the
  page up and find that tapping does not tick.
- Colours are not included in `Copy grouped`, having no plain-text form.

## Behaviour worth knowing

- **Groups are sorted naturally**, so `f04`, `f09`, `f12` and `rack2`, `rack10`
  come out in the order you would expect rather than in plain text order.
- **Group names are matched exactly.** `c0` and `C0` are two different groups.
  That is deliberate: merging them could hide a typo in the source list.
- **A tick is remembered against the text of its line.** Two identical lines
  tick independently. Clearing the box and pasting the same list back restores
  the ticks; editing a line loses the tick on that line only.
- **Lines too short to have the chosen column** are collected under `(no value)`
  rather than dropped.
- **Notes and colours are keyed to lines exactly like ticks are**, so they
  survive a redraw, a reload, and clearing and re-pasting the same list.
- Everything is kept in this browser's local storage, under the single key
  `rack-sorter`. If storage is unavailable the app still works, and says so.

## Privacy

Everything runs in the browser. The Content-Security-Policy in `index.html` is
`default-src 'none'`, which blocks every network request the page could make, so
pasted data cannot leave the device. No fonts, scripts or styles are fetched
from anywhere.

## Files

- `index.html` — page structure
- `style.css` — styling, light and dark
- `app.js` — parsing, grouping, sorting, ticking
