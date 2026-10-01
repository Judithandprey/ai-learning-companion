# Installed WinRT speech route: bounded result

Checked 2026-10-01 for lead card `handoff_c0c29265c5847247938fd5430c5ae5f6`.
Exact assigned main: `3f4580b058555b54922a876df0a7f05df1096ac3`.
Support worktree/branch: `wt-support` / `team/support`. PONYTAIL LITE applies;
model effort remains ultra. This continues AUDIO-06/11–15 and AVTEST-11/12
evidence work, preserving R60/A47–A49 and the complete live-audio requirement.
Current role/workflow/affected requirements were refreshed at the assigned
revision. No production connector, Windows app, profile, permission or Paperclip
change was made; no earlier managed-audio survey or account query was repeated.

**This installed WinRT route does not establish an available local English
recognizer.** Its actual on-device grammar-language list contains only
`zh-Hans-CN`; local OneCore recognition registration also contains only Chinese.
The public and locally reflected APIs expose no explicit audio buffer/stream
input. Consequently, no recognition instance or generated-audio trial was started.
This is a concrete route/host result, not a claim that every Windows speech API
or every installation lacks English recognition.

## Actual native observation

Ran once through the existing Windows PowerShell/.NET host:

```sh
python3 tests/probes/support/windows_winrt_speech_metadata.py --output /tmp/lc-support-winrt-speech-metadata-20261001.json
```

The [retained receipt](windows-winrt-speech-metadata-receipt.json) contains the
full public member inventory and sanitized observations. PowerShell script
SHA-256: `79dc108eb64a192c6fbbfea52f8a05aedaa6f037b1925280db2fe662c0ae267b`.
Native process exited **0**, observed by the foreground wrapper; execution took
about 0.887 seconds. `metadata_completed` means inspection completed, not speech
recognition passed.

| Observation | Actual result | Limit |
| --- | --- | --- |
| Host | Windows `10.0.26200.0`, PowerShell `5.1.26100.9444`, 64-bit | Identifies this host only. |
| Own process package identity | `GetCurrentPackageFullName` returned `15700`, no package identity | Not a measurement of the Windows product app's identity. |
| WinRT classes | `SpeechRecognizer` and `SpeechContinuousRecognitionSession` resolved | Type presence is not recognizer activation or device permission. |
| `SupportedGrammarLanguages` | Only `zh-Hans-CN` | No English on-device grammar language was reported. No grammar was compiled. |
| `SupportedTopicLanguages` | Only `zh-Hans-CN` | This host's observed list; not an offline-model inventory or proof of cloud consent/access. |
| OneCore recognizer registry | One token: `MS-2052-110-WINMO-DNN`, language LCID `804` hex | Registration is not successful recognition. Read-only `HKLM\SOFTWARE\Microsoft\Speech_OneCore\Recognizers\Tokens`. |

This is distinct from the earlier [System.Speech probe](windows-audio-offline-route.md),
which reported desktop token `MS-2052-80-DESK`. Neither Windows display-language
settings nor installed TTS voices were used to infer recognition capability.
The current probe did not rerun that recognizer or synthesize another fixture.

## Public input and language boundaries

The installed member inventory matches the relevant documented signatures:
`SpeechRecognizer()` or `(Language)` constructors; `RecognizeAsync()` and
`RecognizeWithUIAsync()` without audio arguments; continuous `StartAsync()` or
`StartAsync(SpeechContinuousRecognitionMode)`. Neither inspected class exposes a
PCM, stream, audio-file or input-source setter. This is a conclusion from the
complete documented/reflected public member lists, not a tested audio rejection.
[SpeechRecognizer reference](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognizer?view=winrt-26100),
[continuous session reference](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechcontinuousrecognitionsession?view=winrt-26100).

Microsoft distinguishes on-device list/SRGS grammar languages, requiring installed
speech language packs, from remote dictation/web-search topic languages. A topic
language list cannot establish an installed offline recognizer. The local list's
absence of English is the relevant measured dependency for this candidate.
[Language guidance](https://learn.microsoft.com/en-us/windows/apps/develop/input/specify-the-speech-recognizer-language).

A grammar file contains vocabulary/rules, not audio. Omitting constraints selects
predefined dictation; compiling an empty/default configuration is therefore not
a safe way to prove offline recognition. No oracle words were placed into any
grammar, hint or recognizer because no recognition test was run.
[Constraint guidance](https://learn.microsoft.com/en-us/windows/apps/develop/input/define-custom-recognition-constraints).

Current desktop guidance requires MSIX package identity, microphone capability
and permission. Dictation additionally needs Online speech recognition enabled.
The unpackaged PowerShell process could read static metadata; this does not
contradict or satisfy recognition's documented package/device prerequisites.
No recognizer construction was attempted: the reviewed pages do not guarantee
that construction avoids microphone acquisition or consent checks.
[Windows speech guidance](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition).
The package-identity return code is interpreted using the
[Win32 function reference](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getcurrentpackagefullname).

All links were checked 2026-10-01. The three Windows app guidance pages display
2026-07-11 updates; the class references supplied no update date. The Win32 page
displays 2024-02-22. Five speech pages plus the exact package-identity API reference
were sufficient; no general alternative-provider survey followed.

## Scope, verification and next owner

The probe resolves types, reflects members, reads two static language properties,
checks its own package identity and reads recognizer registration. It never
constructs a recognizer, compiles constraints, starts recognition, requests a
microphone, acquires a display/speaker, enables online recognition, changes a
setting, installs a pack/dependency or calls a model/account. A separate read-only
code review found no blocking issue before execution.

A 20-second native watchdog exits only its own process if a runtime call stalls.
It starts after `Add-Type`, so it does not cover compiler/startup stalls. The
35-second outer deadline conservatively reports native cleanup as unobserved on
timeout and never retries. The actual run exited normally; no watchdog/timeout
success is claimed. Four temporary, in-process mocked checks additionally verified
timeout uncertainty, sanitized nonzero errors, rejection of malformed/unsafe
receipts, and refusal to overwrite evidence before invoking Windows. Those checks
spawned no native process. Script/receipt hashes and relative report links were
also checked.

**Next owner: Lead / Windows owner.** Under this task's no-install/no-online/no-device
constraints, there is no verified local English input route to integrate from
these WinRT APIs. The concrete missing prerequisites are an English on-device
grammar language reported by this runtime, an eligible packaged desktop host,
and an authorized microphone path. They are dependencies, not requests to install,
repackage or acquire anything in this task. Even with them, a custom vocabulary
grammar is not open English dictation or a system-audio stream bridge. No supported
explicit stream entry was identified for the authorized generated-only experiment.

Actual English/Chinese recognition, stream acceptance, transcription quality,
microphone/system-audio concurrency, stop/late results, acoustic understanding
and joint screen/audio acceptance remain untested. No AUDIO/AVTEST/product gate
closes. Keep Web's TTS/live flow and Backend's completed evidence ownership intact;
Lead decides a later bounded alternative or an exclusive device lease.
