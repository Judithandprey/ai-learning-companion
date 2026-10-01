# Static WinRT speech metadata only. Never constructs or starts a recognizer.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class SupportWinRTMetadataGuard {
    private static Timer deadline;
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetCurrentPackageFullName(ref uint length, IntPtr name);
    public static void Start() {
        // Terminates only this probe process if a static runtime call stalls.
        deadline = new Timer(_ => Environment.Exit(124), null, 20000, Timeout.Infinite);
    }
    public static int PackageIdentityResult() {
        uint length = 0;
        return GetCurrentPackageFullName(ref length, IntPtr.Zero);
    }
    public static void Finish() { deadline.Dispose(); }
}
'@
[SupportWinRTMetadataGuard]::Start()

function Failure($errorRecord) {
    $cause = $errorRecord.Exception
    while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
    return [ordered]@{
        status = 'unobserved_error'
        exception_type = $cause.GetType().FullName
        hresult = ('0x{0:X8}' -f $cause.HResult)
    }
}

function TypeMetadata($runtimeType) {
    $flags = [Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly'
    return [ordered]@{
        status = 'type_resolved'
        name = $runtimeType.FullName
        constructors = @($runtimeType.GetConstructors() | ForEach-Object { $_.ToString() } | Sort-Object)
        methods = @($runtimeType.GetMethods($flags) | ForEach-Object { $_.ToString() } | Sort-Object)
        properties = @($runtimeType.GetProperties($flags) | ForEach-Object { $_.ToString() } | Sort-Object)
    }
}

$receipt = [ordered]@{
    status = 'metadata_completed'
    observed_utc = [DateTime]::UtcNow.ToString('o')
    windows_version = [Environment]::OSVersion.Version.ToString()
    powershell_version = $PSVersionTable.PSVersion.ToString()
    process_64bit = [Environment]::Is64BitProcess
    scope = 'Static language lists, installed recognizer registration and reflected public API; not recognition acceptance.'
    recognizer_constructed = $false
    constraints_compiled = $false
    recognition_started = $false
    microphone_requested = $false
    audio_fixture_submitted = $false
    online_recognition_activated = $false
    settings_changed = $false
}
try {
    $code = [SupportWinRTMetadataGuard]::PackageIdentityResult()
    $receipt.package_identity = [ordered]@{
        api_result = $code
        interpretation = $(if ($code -eq 15700) { 'no_package_identity' }
                           elseif ($code -eq 122) { 'package_identity_present_name_not_read' }
                           else { 'unknown_result' })
    }
    try {
        $recognizer = [Windows.Media.SpeechRecognition.SpeechRecognizer,Windows.Media.SpeechRecognition,ContentType=WindowsRuntime]
        $receipt.recognizer_api = TypeMetadata $recognizer
    } catch { $receipt.recognizer_api = Failure $_ }
    try {
        $session = [Windows.Media.SpeechRecognition.SpeechContinuousRecognitionSession,Windows.Media.SpeechRecognition,ContentType=WindowsRuntime]
        $receipt.continuous_api = TypeMetadata $session
    } catch { $receipt.continuous_api = Failure $_ }
    foreach ($property in @('SupportedGrammarLanguages', 'SupportedTopicLanguages')) {
        try {
            if ($null -eq $recognizer) { throw [InvalidOperationException]::new('runtime_type_unavailable') }
            $value = $recognizer.GetProperty($property).GetValue($null)
            if ($null -eq $value) { throw [InvalidOperationException]::new('null_language_collection') }
            $tags = @($value | ForEach-Object {
                if ([string]::IsNullOrWhiteSpace($_.LanguageTag)) {
                    throw [InvalidOperationException]::new('missing_language_tag')
                }
                $_.LanguageTag
            } | Sort-Object -Unique)
            $receipt[$property] = [ordered]@{ status = 'observed'; language_tags = $tags }
        } catch { $receipt[$property] = Failure $_ }
    }
    # Registration is distinct from successful activation or recognition.
    # This is the recognizer registry, never TTS voices or display languages.
    $registry = 'HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Recognizers\Tokens'
    try {
        if (Test-Path -LiteralPath $registry) {
            $tokens = @(Get-ChildItem -LiteralPath $registry | ForEach-Object {
                $attributes = Get-ItemProperty -LiteralPath ($_.PSPath + '\Attributes')
                [ordered]@{ token_id = $_.PSChildName; language_lcid_hex = $attributes.Language }
            })
            $receipt.onecore_recognizer_registration = [ordered]@{ status = 'observed'; tokens = $tokens }
        } else {
            $receipt.onecore_recognizer_registration = [ordered]@{ status = 'registry_path_absent' }
        }
    } catch { $receipt.onecore_recognizer_registration = Failure $_ }
    $receipt | ConvertTo-Json -Depth 8 -Compress
} finally {
    [SupportWinRTMetadataGuard]::Finish()
}
