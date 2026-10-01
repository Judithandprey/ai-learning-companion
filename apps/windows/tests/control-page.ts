// The control window's showLink and showSubscription (src/renderer/control.ts), run on their own with a fake page.
import vm from 'node:vm';
import { appSource } from './source.ts';

const source = appSource('src/renderer/control.ts');
const showLink = source.slice(source.indexOf('const AI_DEFAULT'), source.indexOf('lc.onLink(showLink);'));
export const HEADER = 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.';
export function controlPage() {
  type Node = { textContent: string; hidden: boolean; disabled: boolean; children: unknown[]; replaceChildren(...c: unknown[]): void };
  const node = (textContent = '', hidden = true): Node => ({ textContent, hidden, disabled: false, children: [], replaceChildren(...c) { this.children = c; } });
  const nodes: Record<string, Node> = { ai: node(HEADER, false), link: node() };
  const ctx = { $: (id: string) => (nodes[id] ??= node()), nodes, document: { createElement: () => ({}) } };
  vm.createContext(ctx);
  vm.runInContext(`${showLink}\nglobalThis.showLink = showLink; globalThis.showSubscription = showSubscription;`, ctx);
  return ctx as typeof ctx & { showLink: (l: unknown) => void; showSubscription: (s: unknown) => void };
}
