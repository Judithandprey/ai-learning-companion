// Windows, played as text, for signin_launcher.test.mjs only. The test runs the launcher's own `check` with this file in
// place of `node:child_process` and `./sub_copy.mjs`: no program is started here, and nothing of Windows is asked.
//   QA_PLAYED_TEMP   the folder that stands for %TEMP%
//   QA_PLAYED_LOOKS  JSON: the electron.exe rows of each look in turn (the last one stays); `{port}` is the check's port
let looks = 0;
const played = JSON.parse(process.env.QA_PLAYED_LOOKS);

export function execFileSync(program, args) {
  if (program === 'cmd.exe') return 'C:\\T\r\n';
  if (program === 'wslpath') return `${process.env.QA_PLAYED_TEMP}\n`;
  if (program !== 'powershell.exe') throw new Error(`not played: ${program}`);
  const port = /-LocalPort (\d+) /.exec(args.at(-1));
  if (!port) { console.error('PLAYED: a signal command was run'); return 'signalled\r\n'; }
  const rows = JSON.stringify(played[Math.min(looks, played.length - 1)]).replaceAll('{port}', port[1]);
  looks += 1;
  return `${Buffer.from(JSON.stringify({ now: '1500', processes: JSON.parse(rows), listen: [] })).toString('base64')}\r\n`;
}
// The checker's one result line, as if the app had answered "Not signed in".
export const spawnSync = () => ({ stdout: '{"check":{"after":{"state":"signed_out"}}}\n', status: 0 });
export const compareCopy = () => ({ equal: true, files: 1, missing: [], differing: [], extra: [] });
export const askPathCheck = () => ({ ok: true });
export const makeCopy = () => { throw new Error('not played: the check makes no copy'); };
