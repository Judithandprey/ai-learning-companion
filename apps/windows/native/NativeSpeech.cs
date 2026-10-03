// Candidate child owned by a trusted Electron main process. No network, mic or capture APIs.
// Default/QA sink is memory. Device output requires the explicit trusted-host "device" argument.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security;
using System.Security.Cryptography;
using System.Speech.Synthesis;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Xml;

public static class NativeSpeech {
    const int MaxText = 220, MaxLine = 4096, DeadlineMs = 30000;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxLine, RecursionLimit = 8 };
    static readonly BlockingCollection<string> Lines = new BlockingCollection<string>(8);
    static readonly ConcurrentQueue<Tuple<Utterance, SpeakCompletedEventArgs>> Ends = new ConcurrentQueue<Tuple<Utterance, SpeakCompletedEventArgs>>();
    static volatile bool InputBad;
    static Utterance Current;
    static string Sink, Culture;

    sealed class LimitedMemory : MemoryStream {
        public override void Write(byte[] b, int o, int n) {
            if (Position + n > 8 * 1024 * 1024) throw new IOException("wave_limit");
            base.Write(b, o, n);
        }
    }
    sealed class Utterance {
        public string Id;
        public SpeechSynthesizer Synth;
        public LimitedMemory Wave;
        public volatile bool Completed;
        public bool Queued;
        public Stopwatch Clock = Stopwatch.StartNew();
    }
    static Dictionary<string, object> Row(params object[] pairs) {
        var r = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) r.Add((string)pairs[i], pairs[i + 1]);
        return r;
    }
    static void Send(object value) { Console.Out.WriteLine(Json.Serialize(value)); Console.Out.Flush(); }
    static void ReadInput() {
        try {
            var line = new StringBuilder();
            for (;;) {
                int ch = Console.In.Read();
                if (ch < 0) { if (line.Length != 0) InputBad = true; break; }
                if (ch == '\n') {
                    if (!Lines.TryAdd(line.ToString())) { InputBad = true; break; }
                    line.Clear();
                } else if (ch != '\r') {
                    if (line.Length >= MaxLine) { InputBad = true; break; }
                    line.Append((char)ch);
                }
            }
        } catch { InputBad = true; }
        finally { Lines.CompleteAdding(); }
    }
    static object WaveInfo(byte[] bytes) {
        using (var stream = new MemoryStream(bytes))
        using (var reader = new BinaryReader(stream))
        using (var hash = SHA256.Create()) {
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "RIFF") throw new InvalidDataException();
            reader.ReadUInt32();
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "WAVE") throw new InvalidDataException();
            int channels = 0, bits = 0, format = 0; uint hz = 0, bps = 0, audio = 0;
            while (stream.Position + 8 <= stream.Length) {
                string kind = Encoding.ASCII.GetString(reader.ReadBytes(4)); uint length = reader.ReadUInt32();
                long end = stream.Position + length;
                if (end > stream.Length) throw new InvalidDataException();
                if (kind == "fmt ") { format = reader.ReadUInt16(); channels = reader.ReadUInt16(); hz = reader.ReadUInt32(); bps = reader.ReadUInt32(); reader.ReadUInt16(); bits = reader.ReadUInt16(); }
                if (kind == "data") audio = length;
                stream.Position = end + (length % 2);
            }
            if (audio == 0 || bps == 0) throw new InvalidDataException();
            return Row("bytes", bytes.Length, "audio_bytes", audio, "format", format, "channels", channels,
                "sample_rate_hz", hz, "bits_per_sample", bits, "duration_ms", 1000.0 * audio / bps,
                "sha256", BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant());
        }
    }
    static void Finish(bool ok, string reason) {
        Utterance u = Current; Current = null; // late completion from this generation cannot publish success
        if (u == null) return;
        object wave = null;
        try {
            if (!ok) {
                u.Synth.SpeakAsyncCancelAll();
                // Cancellation is asynchronous. Do not change its output stream while speech is still active.
                var cancellation = Stopwatch.StartNew();
                while (u.Queued && !u.Completed && cancellation.ElapsedMilliseconds < 1000) Thread.Sleep(5);
                if (u.Queued && !u.Completed) reason = "cancel_timeout";
            }
            if (!u.Queued || u.Completed) u.Synth.SetOutputToNull();
            if (ok && u.Wave != null) wave = WaveInfo(u.Wave.ToArray());
        } catch { ok = false; reason = "native_failure"; }
        finally {
            try { u.Synth.Dispose(); } catch { ok = false; reason = "native_failure"; }
            if (u.Wave != null) u.Wave.Dispose();
        }
        Send(Row("type", "done", "id", u.Id, "ok", ok, "reason", reason, "sink", Sink,
            "elapsed_ms", u.Clock.ElapsedMilliseconds, "wave", wave));
    }
    static void Say(Dictionary<string, object> d) {
        string id = d.ContainsKey("id") ? d["id"] as string : null;
        string text = d.ContainsKey("text") ? d["text"] as string : null;
        double rate;
        if (id == null || !Regex.IsMatch(id, @"^[0-9]{1,10}$") || text == null || text.Trim().Length == 0 || text.Length > MaxText
            || !d.ContainsKey("rate") || !Double.TryParse(Convert.ToString(d["rate"], CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out rate)
            || Double.IsNaN(rate) || rate < 0.5 || rate > 2.0) throw new InvalidDataException();
        XmlConvert.VerifyXmlChars(text);
        Finish(false, "superseded");
        var u = new Utterance { Id = id };
        try {
            u.Synth = new SpeechSynthesizer();
            Current = u;
            var choices = u.Synth.GetInstalledVoices(new CultureInfo(Culture));
            string selected = null;
            foreach (var v in choices) if (v.Enabled) { selected = v.VoiceInfo.Name; break; }
            if (selected == null) { Finish(false, "voice_unavailable"); return; }
            u.Synth.SelectVoice(selected);
            if (Sink == "memory") { u.Wave = new LimitedMemory(); u.Synth.SetOutputToWaveStream(u.Wave); }
            else u.Synth.SetOutputToDefaultAudioDevice(); // NEVER used by candidate QA; trusted main must authorize
            u.Synth.SpeakCompleted += delegate(object sender, SpeakCompletedEventArgs e) { u.Completed = true; Ends.Enqueue(Tuple.Create(u, e)); };
            string ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + Culture
                + "'><prosody rate='" + Math.Round(rate * 100).ToString(CultureInfo.InvariantCulture) + "%'>"
                + SecurityElement.Escape(text) + "</prosody></speak>";
            u.Synth.SpeakSsmlAsync(ssml);
            u.Queued = true;
        } catch {
            if (Current == u) Finish(false, "native_failure");
            else Send(Row("type", "done", "id", id, "ok", false, "reason", "native_failure", "sink", Sink));
        }
    }
    public static int Main(string[] args) {
        Sink = args.Length > 0 ? args[0] : "memory";
        Culture = args.Length > 1 ? args[1] : "en-US";
        if (args.Length > 2 || (Sink != "memory" && Sink != "device") || (Culture != "en-US" && Culture != "zh-CN")) return 2;
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        new Thread(ReadInput) { IsBackground = true }.Start();
        var idle = Stopwatch.StartNew();
        try {
            Send(Row("type", "ready", "sink", Sink, "culture", Culture, "max_text", MaxText));
            for (;;) {
                if (InputBad) { Finish(false, "bad_input"); return 2; }
                if (Lines.IsAddingCompleted) { Finish(false, "eof"); return 0; }
                string line;
                if (Lines.TryTake(out line, 10)) {
                    idle.Restart();
                    var d = Json.Deserialize<Dictionary<string, object>>(line);
                    string op = d != null && d.ContainsKey("op") ? d["op"] as string : null;
                    if (op == "say") Say(d);
                    else if (op == "stop") Finish(false, "cancelled");
                    else if (op == "shutdown") { Finish(false, "shutdown"); return 0; }
                    else throw new InvalidDataException();
                }
                Tuple<Utterance, SpeakCompletedEventArgs> end;
                while (Ends.TryDequeue(out end)) {
                    if (Current != end.Item1) continue;
                    bool ok = !end.Item2.Cancelled && end.Item2.Error == null;
                    Finish(ok, ok ? "completed" : "cancelled_or_failed");
                }
                if (Current != null && Current.Clock.ElapsedMilliseconds > DeadlineMs) Finish(false, "timeout");
                if (Current == null && idle.ElapsedMilliseconds > 60000) return 0;
            }
        } catch { try { Finish(false, "protocol_or_native_failure"); } catch { } return 2; }
        finally { try { Finish(false, "shutdown"); } catch { } }
    }
}
