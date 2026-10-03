// The installed Windows speech provider behind the existing main-owned Voice boundary.
// No child starts at construction. Only an authorized piece passed by main.ts can start it.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeVoice, type NativeVoice, type NativeVoiceOptions, type NativeVoiceSpawnProcess } from './native-voice.mjs';
import type { Voice } from './main.ts';
import type { Culture } from '../shared/voice.ts';

export const NATIVE_SOURCE_SHA256 = 'c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd';

/** One direct child at a time. A language change waits for the old child to exit before creating another. */
export function createSystemVoice(options: {
  helperPath: string;
  sink: 'memory' | 'device';
  make?: (options: NativeVoiceOptions) => NativeVoice;
}): Voice {
  const make = options.make ?? createNativeVoice;
  let active: { culture: Culture; voice: NativeVoice } | null = null;
  let epoch = 0;
  let failed = false;
  let reaping: Promise<void> = Promise.resolve();
  const release = (): Promise<void> => {
    const old = active;
    active = null;
    if (old) {
      reaping = Promise.all([reaping, Promise.resolve().then(() => old.voice.dispose())]).then(
        () => undefined,
        (error: unknown) => { failed = true; throw error; },
      );
      // A lifecycle caller may not await this. Keep the failure for the next say/dispose without an unhandled rejection.
      void reaping.catch(() => undefined);
    }
    return reaping;
  };
  const stop = (): void => {
    epoch += 1; // also fences a piece waiting for a different language's child to exit
    try { active?.voice.stop(); }
    catch { failed = true; void release().catch(() => undefined); }
  };
  return {
    audible: options.sink === 'device', // configured output, not evidence that a device played or anyone heard it
    stop,
    // Ends/reaps the current child. The provider remains reusable for an explicitly started later session;
    // a new child is created lazily, after observed disposal. A disposal failure permanently fails closed.
    dispose: () => { stop(); return release(); },
    async say(text, rate, culture) {
      const mine = epoch;
      try {
        if (active && active.culture !== culture) {
          active.voice.stop();
          await release();
        }
        await reaping;
        if (mine !== epoch || failed) return false;
        const child = active ?? (active = { culture, voice: make({ helperPath: options.helperPath, sink: options.sink, culture }) });
        const said = await child.voice.say(text, rate);
        if (mine !== epoch || active !== child) return false;
        if (!said) await release();
        return said === true;
      } catch {
        failed = true;
        await release().catch(() => undefined);
        return false;
      }
    },
  };
}

/** The fixed app bundle, never a renderer-selected executable, sink, language or provider. */
export function bundledSystemVoice(nativeDir = fileURLToPath(new URL('../../native/', import.meta.url)), platform: string = process.platform, spawnProcess: NativeVoiceSpawnProcess = spawn): Voice | null {
  if (platform !== 'win32') return null;
  try {
    const build: unknown = JSON.parse(readFileSync(join(nativeDir, 'build.json'), 'utf8'));
    if (!build || typeof build !== 'object' || Array.isArray(build)) return null;
    const b = build as Record<string, unknown>;
    if (b['schema'] !== 'lc-native-speech-build/1' || b['mode'] !== 'local-compilation' || b['status'] !== 0 || b['error'] !== null || b['source_sha256'] !== NATIVE_SOURCE_SHA256 || typeof b['executable_sha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(b['executable_sha256'])) return null;
    const row = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isHash = (v: unknown): boolean => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
    const framework = String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319`;
    const compiler = b['compiler'];
    const references = b['references'];
    if (!row(compiler) || compiler['path'] !== `${framework}\\csc.exe` || !isHash(compiler['sha256']) || !Array.isArray(references) || references.length !== 2 || [`${framework}\\WPF\\System.Speech.dll`, `${framework}\\System.Web.Extensions.dll`].some((path, at) => !row(references[at]) || references[at]['path'] !== path || !isHash(references[at]['sha256']))) return null;
    const hash = (name: string): string => createHash('sha256').update(readFileSync(join(nativeDir, name))).digest('hex');
    const matches = (): boolean => hash('NativeSpeech.cs') === NATIVE_SOURCE_SHA256 && hash('NativeSpeech.exe') === b['executable_sha256'];
    if (!matches()) return null;
    const helperPath = join(nativeDir, 'NativeSpeech.exe');
    return createSystemVoice({ helperPath, sink: 'device', make: (options) => createNativeVoice({ ...options,
      spawnProcess: (path, args, settings) => {
        // Includes a same-language adapter restarting after its native child's idle exit.
        if (path !== helperPath || !matches()) throw new Error('Compiled speech bundle changed before child launch');
        return spawnProcess(path, args, settings);
      },
    }) });
  } catch { return null; } // no compiled bundle (or inconsistent bytes): the existing UI truthfully reports no voice
}
