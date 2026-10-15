# Focused output regression

Run from the repository root with Node.js 18 or newer:

```sh
node --test kwin/tests/desktop-sources.test.cjs
```

The tests execute the real `updateFocus()` JavaScript body from
`BreezyDesktop.qml` with small screen and pose doubles. They cover filtered
physical outputs, reordered workspace outputs, invalid/removed selections and
re-resolving an unchanged gaze after topology changes. Additional checks retain
the existing physical-mirroring and cursor-source behavior.

This is an isolated logic test. It does not replace a live KWin or XR hardware
smoke test, and it does not start or restart a compositor.
