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
