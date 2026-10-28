# Rack Line Sorter

Paste a list of space-separated lines, pick a field to group by (for example `f09`), and walk the grouped list rack by rack, checking lines off as you go.

## Use

Open `index.html` in a browser. Nothing needs to be installed or built.

- Tap a field chip to group by it. Tap a second chip to sort lines inside each group.
- Type in the filter box to show only matching groups.
- Tap a line to check it off. Your list and checkmarks are kept in that browser's local storage.

## Privacy

Everything runs in the browser. The Content-Security-Policy in `index.html` blocks all network requests, so pasted data never leaves the device.

## Files

- `index.html`: page structure
- `style.css`: styling, including dark mode
- `app.js`: parsing, grouping, sorting and checkmarks
