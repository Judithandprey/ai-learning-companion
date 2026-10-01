#!/usr/bin/env python3
"""Generate one non-sensitive English fixture in memory; no mic or speaker.

Uses the already measured installed Microsoft Zira Desktop/System.Speech only.
The CLI retains metadata only. Importing this file generates nothing. This PCM
representation is independent of whether an upstream realtime route accepts it.
"""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


UTTERANCE = "The silver lantern is beside seven green triangles."
ORACLE_TERMS = ("silver lantern", "seven green triangles")
RATE = 24000
POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
SCRIPT = r'''
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.IO;
using System.Speech.AudioFormat;
using System.Speech.Synthesis;
using System.Threading;

public static class SupportRealtimeFixture {
    public static byte[] Generate() {
        using (var synth = new SpeechSynthesizer())
        using (var audio = new MemoryStream())
        using (var done = new ManualResetEvent(false)) {
            Exception failure = null;
            bool cancelled = false;
            synth.SelectVoice("Microsoft Zira Desktop");
            synth.SetOutputToAudioStream(audio,
                new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
            synth.SpeakCompleted += (sender, e) => {
                failure = e.Error; cancelled = e.Cancelled; done.Set();
            };
            try {
                synth.SpeakAsync("The silver lantern is beside seven green triangles.");
                if (!done.WaitOne(10000)) throw new TimeoutException("fixture synthesis deadline");
                if (failure != null) throw failure;
                if (cancelled) throw new OperationCanceledException();
                synth.SetOutputToNull();
                return audio.ToArray();
            } finally { synth.SpeakAsyncCancelAll(); }
        }
    }
}
'@
$pcm = [SupportRealtimeFixture]::Generate()
[ordered]@{ pcm_base64 = [Convert]::ToBase64String($pcm) } | ConvertTo-Json -Compress
'''


def generate():
    """Return generated PCM and metadata, retaining no plaintext/audio files."""
    encoded = base64.b64encode(SCRIPT.encode("utf-16-le")).decode("ascii")
    process = subprocess.run(
        [POWERSHELL, "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        capture_output=True, timeout=20, check=False,
    )
    if process.returncode:
        raise ValueError("native_fixture_failed")
    result = json.loads(process.stdout.decode("utf-8-sig"))
    pcm = base64.b64decode(result["pcm_base64"], validate=True)
    if not RATE <= len(pcm) <= RATE * 2 * 10 or len(pcm) % 2 or not any(pcm):
        raise ValueError("invalid_generated_fixture")
    metadata = {
        "status": "generated_in_memory",
        "voice": "Microsoft Zira Desktop",
        "utterance": UTTERANCE,
        "oracle_terms": list(ORACLE_TERMS),
        "format": "signed PCM16 little-endian, mono, 24000 Hz, no container header",
        "sample_rate_hz": RATE,
        "channels": 1,
        "bits_per_sample": 16,
        "pcm_bytes": len(pcm),
        "samples_per_channel": len(pcm) // 2,
        "duration_ms": len(pcm) * 1000 / (RATE * 2),
        "pcm_sha256": hashlib.sha256(pcm).hexdigest(),
        "script_sha256": hashlib.sha256(SCRIPT.encode()).hexdigest(),
        "generator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "native_process_exit_code": process.returncode,
        "microphone": False,
        "physical_playback": False,
        "audio_persisted": False,
        "account_calls": 0,
        "scope": "Synthetic bytes only; does not establish provider acceptance or transcript quality.",
    }
    return pcm, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="New metadata receipt; raw audio is never written")
    args = parser.parse_args()
    # Reserve output before invoking the native generator; never overwrite work.
    with args.output.open("x", encoding="utf-8") as receipt:
        try:
            _pcm, metadata = generate()
        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
            metadata = {"status": "fixture_failed", "failure_type": type(error).__name__,
                        "native_cleanup_observed": False, "automatic_retry": False}
        metadata["created_at"] = datetime.now(timezone.utc).isoformat()
        json.dump(metadata, receipt, indent=2)
        receipt.write("\n")
    print(json.dumps(metadata, indent=2))
    return 0 if metadata["status"] == "generated_in_memory" else 2


if __name__ == "__main__":
    raise SystemExit(main())
