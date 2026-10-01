// The control window's showLink (src/renderer/control.ts), run on its own with a fake page.
import vm from 'node:vm';
import { appSource } from './source.ts';

const source = appSource('src/renderer/control.ts');
const showLink = source.slice(source.indexOf('const AI_DEFAULT'), source.indexOf('lc.onLink(showLink);'));
export const HEADER = 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.';
export function controlPage() {
  const nodes: Record<string, { textContent: string; hidden: boolean }> = { ai: { textContent: HEADER, hidden: false }, link: { textContent: '', hidden: true } };
  const ctx = { $: (id: string) => nodes[id]!, nodes };
  vm.createContext(ctx);
  vm.runInContext(`${showLink}\nglobalThis.showLink = showLink;`, ctx);
  return ctx as typeof ctx & { showLink: (l: unknown) => void };
}
