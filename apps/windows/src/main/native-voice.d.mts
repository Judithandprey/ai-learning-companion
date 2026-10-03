import type { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

/** Trusted main-process choices; memory synthesis is not audible playback. */
export type NativeVoiceSink = 'memory' | 'device';
export type NativeVoiceCulture = 'en-US' | 'zh-CN';

/** Metadata emitted by the owned helper; the adapter never receives WAV samples. */
export interface NativeWaveMetadata {
  bytes: number;
  audio_bytes: number;
  format: number;
  channels: number;
  sample_rate_hz: number;
  bits_per_sample: number;
  duration_ms: number;
  sha256: string;
}

export type NativeVoiceFailureReason = 'stdin_failure' | 'child_error' | 'stderr_limit' | 'stdout_limit'
  | 'malformed_reply' | 'unexpected_reply' | 'timeout' | 'dispose_timeout';

export type NativeVoiceDiagnostic =
  | { reason: NativeVoiceFailureReason }
  | { event: 'ready'; sink: NativeVoiceSink; culture: NativeVoiceCulture }
  | { event: 'utterance_done'; sink: NativeVoiceSink; ok: boolean; reason: string; wave: NativeWaveMetadata | null }
  | { event: 'child_closed'; code: number | null; signal: NodeJS.Signals | null };

/** The existing child-process surface also accepts portable stream/EventEmitter doubles. */
export interface NativeVoiceChild extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill(): boolean;
}
export type NativeVoiceSpawnProcess = (
  helperPath: string,
  args: [NativeVoiceSink, NativeVoiceCulture],
  options: { windowsHide: true; shell: false; stdio: ['pipe', 'pipe', 'pipe'] },
) => NativeVoiceChild;

export interface NativeVoiceOptions {
  helperPath: string;
  sink: NativeVoiceSink;
  culture?: NativeVoiceCulture;
  timeoutMs?: number;
  onDiagnostic?: (value: NativeVoiceDiagnostic) => void;
  spawnProcess?: NativeVoiceSpawnProcess;
}

export interface NativeVoice {
  say(text: string, rate: number): Promise<boolean>;
  stop(): void;
  /** Resolves only after child close; rejects if its bounded shutdown/kill waits expire. */
  dispose(): Promise<void>;
}

export function createNativeVoice(options: NativeVoiceOptions): NativeVoice;
