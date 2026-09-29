// Page script of the synthetic course page (fixture/course.html): only what a course page itself
// would do, here playing a locally generated video. It installs no probe or companion.

const video = document.getElementById('lecture-video') as HTMLVideoElement | null;
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 180;
const ctx = canvas.getContext('2d');
let frame = 0;
const draw = (): void => {
  frame += 1;
  if (ctx) {
    ctx.fillStyle = '#10243a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Lecture video · frame ${frame}`, 16, 96);
  }
  requestAnimationFrame(draw);
};
draw();
if (video && typeof canvas.captureStream === 'function') {
  video.srcObject = canvas.captureStream(15);
  void video.play().catch(() => undefined);
}

// Page-owned web components, as course sites use them: a fixed-size host whose content (a block of
// colour) lives in a shadow root, open (green) or closed (orange). The host keeps its box when the
// content moves inside it.
class DemoCard extends HTMLElement {
  connectedCallback(): void {
    if (this.dataset['ready']) return;
    this.dataset['ready'] = 'yes';
    const closed = this.hasAttribute('data-closed');
    const root = this.attachShadow({ mode: closed ? 'closed' : 'open' });
    const block = document.createElement('div');
    block.id = 'block';
    block.style.cssText = `position: relative; top: 40px; left: 40px; width: 160px; height: 80px; background: ${closed ? '#ef6c00' : '#2e7d32'};`;
    root.append(block);
    // The page's own handle on its closed component (as a page script keeps one), for movement tests.
    if (closed) (window as Window & { lcMoveClosedBlock?: (top: string) => void }).lcMoveClosedBlock = (top) => void (block.style.top = top);
  }
}
customElements.define('lc-demo-card', DemoCard);
