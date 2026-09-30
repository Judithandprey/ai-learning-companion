// Self-test probe (only in the author self-test): a known green checker whose counter changes, so the
// captured display has something that visibly changes, and a known colour under test strokes.
const counter = document.getElementById('counter')!;
let n = 0;
setInterval(() => (counter.textContent = String(++n)), 200);
