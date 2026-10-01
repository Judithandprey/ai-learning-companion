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
  /** The presses this page made on the main process, and what its Start of the AI is answered. */
  const calls: unknown[][] = [];
  const answers = { liveStart: { ok: true } as { ok: boolean; reason?: string } };
  const lc = { liveStart: async (policy: unknown) => (calls.push(['liveStart', JSON.parse(JSON.stringify(policy))]), answers.liveStart), liveStop: () => void calls.push(['liveStop']) };
  const ctx = { $: (id: string) => (nodes[id] ??= node()), nodes, document: { createElement: () => ({}) }, lc, calls, answers, Date };
  vm.createContext(ctx);
  vm.runInContext(`${showLink}\nglobalThis.showLink = showLink; globalThis.showSubscription = showSubscription; globalThis.quotaText = quotaText; globalThis.liveLine = liveLine; globalThis.policyOf = policyOf; globalThis.startRequest = startRequest; globalThis.showLive = showLive; globalThis.startLiveAgain = startLiveAgain;`, ctx);
  return ctx as typeof ctx & { showLink: (l: unknown) => void; showSubscription: (s: unknown) => void; /** The quota as ChatGPT states it, as the control window says it. */ quotaText: (q: unknown, readAt?: string | null) => string; /** The AI's session as one line. */ liveLine: (l: unknown, nowMs: number) => string; /** The session's bounds as typed (requests, minutes, seconds), or what is wrong with them. */ policyOf: (requests: number, minutes: number, seconds: number) => unknown; /** What a press on Start asks for, from the page as it is. */ startRequest: () => unknown; showLive: (l: unknown) => void; startLiveAgain: () => Promise<void> };
}
