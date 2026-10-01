# Offline, non-sensitive System.Speech probe. Never selects an audio device.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security;
using System.Security.Cryptography;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;

public static class SupportWindowsSpeechProbe {
    static Dictionary<string, object> Row(params object[] pairs) {
        var result = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]);
        return result;
    }

    static byte[] Synthesize(string voice, string culture, string text, string rate) {
        using (var synth = new SpeechSynthesizer())
        using (var wave = new MemoryStream())
        using (var done = new ManualResetEvent(false)) {
            Exception failure = null;
            synth.SelectVoice(voice);
            synth.SetOutputToWaveStream(wave);
            synth.SpeakCompleted += (sender, e) => { failure = e.Error; done.Set(); };
            string ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='"
                + culture + "'><prosody rate='" + rate + "'>" + SecurityElement.Escape(text) + "</prosody></speak>";
            try {
                synth.SpeakSsmlAsync(ssml);
                if (!done.WaitOne(10000)) throw new TimeoutException("synthetic TTS deadline");
                if (failure != null) throw failure;
                synth.SetOutputToNull();
                return wave.ToArray();
            } finally { synth.SpeakAsyncCancelAll(); }
        }
    }

    static Dictionary<string, object> WaveInfo(byte[] bytes) {
        using (var stream = new MemoryStream(bytes))
        using (var reader = new BinaryReader(stream))
        using (var hash = SHA256.Create()) {
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "RIFF") throw new InvalidDataException();
            reader.ReadUInt32();
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "WAVE") throw new InvalidDataException();
            int channels = 0, bits = 0, format = 0;
            uint hz = 0, bytesPerSecond = 0, audioBytes = 0;
            while (stream.Position + 8 <= stream.Length) {
                string kind = Encoding.ASCII.GetString(reader.ReadBytes(4));
                uint size = reader.ReadUInt32();
                long end = stream.Position + size;
                if (end > stream.Length) throw new InvalidDataException();
                if (kind == "fmt ") {
                    format = reader.ReadUInt16(); channels = reader.ReadUInt16();
                    hz = reader.ReadUInt32(); bytesPerSecond = reader.ReadUInt32();
                    reader.ReadUInt16(); bits = reader.ReadUInt16();
                } else if (kind == "data") { audioBytes = size; }
                stream.Position = end + (size % 2);
            }
            if (format != 1 || audioBytes == 0 || bytesPerSecond == 0) throw new InvalidDataException();
            return Row("bytes", bytes.Length, "sha256", BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(),
                "format", "PCM", "channels", channels, "sample_rate_hz", hz, "bits_per_sample", bits,
                "duration_ms", audioBytes * 1000.0 / bytesPerSecond);
        }
    }

    static Dictionary<string, object> Transcribe(RecognizerInfo info, byte[] wave, bool cancel) {
        using (var engine = new SpeechRecognitionEngine(info))
        using (var input = new MemoryStream(wave))
        using (var done = new ManualResetEvent(false)) {
            var captions = new List<object>();
            var gate = new object();
            bool accepting = true, cancelled = false;
            int suppressed = 0;
            Exception failure = null;
            engine.LoadGrammar(new DictationGrammar()); // Open dictation, not a phrase-choice grammar.
            engine.SetInputToWaveStream(input); // In-process engine never opens the default microphone.
            engine.SpeechRecognized += (sender, e) => {
                lock (gate) {
                    if (!accepting) { suppressed++; return; }
                    var words = new List<object>();
                    foreach (var word in e.Result.Words) words.Add(Row("text", word.Text,
                        "confidence", word.Confidence));
                    captions.Add(Row("source_kind", "synthetic_wav", "speaker", "unknown",
                        "text", e.Result.Text, "confidence", e.Result.Confidence, "words", words,
                        "audio_offset_ms", e.Result.Audio.AudioPosition.TotalMilliseconds,
                        "duration_ms", e.Result.Audio.Duration.TotalMilliseconds,
                        "received_utc", DateTime.UtcNow.ToString("o"), "screen_anchor", null,
                        "is_user_request", false, "revision", 0));
                }
            };
            engine.RecognizeCompleted += (sender, e) => {
                failure = e.Error; cancelled = e.Cancelled; done.Set();
            };
            var stopwatch = Stopwatch.StartNew();
            try {
                engine.RecognizeAsync(RecognizeMode.Multiple);
                if (cancel) {
                    lock (gate) { accepting = false; }
                    engine.RecognizeAsyncCancel();
                }
                if (!done.WaitOne(10000)) throw new TimeoutException("synthetic ASR deadline");
                if (failure != null) throw failure;
                engine.SetInputToNull();
                return Row("recognizer", info.Id, "grammar", "dictation", "captions", captions,
                    "cancel_requested", cancel, "cancelled", cancelled, "elapsed_ms", stopwatch.Elapsed.TotalMilliseconds,
                    "late_caption_publications_suppressed", suppressed, "input", "generated_memory_wav");
            } finally { engine.RecognizeAsyncCancel(); }
        }
    }

    static Dictionary<string, object> CancelSynthesis(string voice) {
        using (var synth = new SpeechSynthesizer())
        using (var wave = new MemoryStream())
        using (var started = new ManualResetEvent(false))
        using (var done = new ManualResetEvent(false)) {
            int completed = 0, cancelled = 0;
            synth.SelectVoice(voice);
            synth.SetOutputToWaveStream(wave);
            synth.SpeakStarted += (sender, e) => started.Set();
            synth.SpeakCompleted += (sender, e) => {
                if (e.Cancelled) Interlocked.Increment(ref cancelled);
                if (Interlocked.Increment(ref completed) == 2) done.Set();
            };
            var longText = new StringBuilder();
            for (int i = 0; i < 80; i++) longText.Append("This synthetic sentence must stop when interrupted. ");
            try {
                synth.SpeakAsync(longText.ToString());
                synth.SpeakAsync("This queued synthetic answer must also be cancelled.");
                if (!started.WaitOne(5000)) throw new TimeoutException("synthesis start deadline");
                var stopwatch = Stopwatch.StartNew();
                synth.SpeakAsyncCancelAll();
                if (!done.WaitOne(5000)) throw new TimeoutException("synthesis cancel deadline");
                synth.SetOutputToNull();
                return Row("queued_prompts", 2, "completed_events", completed, "cancelled_events", cancelled,
                    "cancel_elapsed_ms", stopwatch.Elapsed.TotalMilliseconds, "speaker_output", false,
                    "scope", "active in-memory synthesis and queued prompt, not physical playback");
            } finally { synth.SpeakAsyncCancelAll(); }
        }
    }

    public static object Run() {
        var voices = new List<object>();
        var recognizers = SpeechRecognitionEngine.InstalledRecognizers();
        var recognizerRows = new List<object>();
        foreach (var info in recognizers) recognizerRows.Add(Row("id", info.Id, "culture", info.Culture.Name));
        var trials = new List<object>();
        using (var inventory = new SpeechSynthesizer()) {
            foreach (var installed in inventory.GetInstalledVoices()) {
                var voice = installed.VoiceInfo;
                voices.Add(Row("name", voice.Name, "culture", voice.Culture.Name, "enabled", installed.Enabled));
                if (!installed.Enabled || (voice.Culture.Name != "en-US" && voice.Culture.Name != "zh-CN")) continue;
                string text = voice.Culture.Name == "en-US"
                    ? "The answer is not three, it is five. Please explain this step first."
                    : "\u7b54\u6848\u4e0d\u662f\u4e09\uff0c\u662f\u4e94\u3002\u8bf7\u5148\u89e3\u91ca\u8fd9\u4e2a\u6b65\u9aa4\u3002";
                var trial = Row("culture", voice.Culture.Name, "voice", voice.Name, "original_synthetic_text", text);
                try {
                    var normal = Synthesize(voice.Name, voice.Culture.Name, text, "100%");
                    var faster = Synthesize(voice.Name, voice.Culture.Name, text, "130%");
                    trial.Add("normal_wave", WaveInfo(normal));
                    trial.Add("requested_130_percent_wave", WaveInfo(faster));
                    RecognizerInfo match = null;
                    foreach (var candidate in recognizers) if (candidate.Culture.Equals(voice.Culture)) { match = candidate; break; }
                    if (match == null) trial.Add("asr_status", "no_installed_matching_recognizer");
                    else {
                        trial.Add("asr", Transcribe(match, normal, false));
                        trial.Add("asr_cancel", Transcribe(match, normal, true));
                    }
                    trial.Add("tts_cancel", CancelSynthesis(voice.Name));
                    trial.Add("probe_status", "completed");
                } catch (Exception e) {
                    trial.Add("probe_status", "failed");
                    trial.Add("failure_type", e.GetType().FullName);
                    trial.Add("failure_hresult", e.HResult);
                }
                trials.Add(trial);
            }
        }
        return Row("checked_at", DateTime.UtcNow.ToString("o"), "os_version", Environment.OSVersion.Version.ToString(),
            "framework", Environment.Version.ToString(), "process64", Environment.Is64BitProcess,
            "assembly", typeof(SpeechRecognitionEngine).Assembly.FullName,
            "scope", "synthetic in-memory audio only; no live-device or provider test",
            "microphone_opened", false, "speaker_output", false, "system_playback_captured", false,
            "voices", voices, "recognizers", recognizerRows, "trials", trials);
    }
}
'@
[SupportWindowsSpeechProbe]::Run() | ConvertTo-Json -Depth 12 -Compress
