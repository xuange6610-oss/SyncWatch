param(
    [switch]$SourceOnly,
    [string]$ApkPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testScript = Join-Path $PSScriptRoot 'android-package.test.js'
$buildScript = Join-Path $repositoryRoot 'mobile\build-apk.ps1'

$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($buildScript, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) {
    $messages = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
    throw "Android build script has PowerShell syntax errors: $messages"
}

$manifestPath = Join-Path $repositoryRoot 'mobile\app\src\main\AndroidManifest.xml'
try { [xml](Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8) | Out-Null } catch {
    throw "AndroidManifest.xml is not valid XML: $($_.Exception.Message)"
}

function ConvertTo-NativeArgument([string]$value) {
    if ($null -eq $value -or $value.Length -eq 0) { return '""' }
    if ($value -notmatch '[\s"]') { return $value }

    $quoted = '"'
    $backslashes = 0
    foreach ($character in $value.ToCharArray()) {
        if ($character -eq '\') {
            $backslashes++
            continue
        }
        if ($character -eq '"') {
            $quoted += (('\' * (($backslashes * 2) + 1)) -join '') + '"'
            $backslashes = 0
            continue
        }
        if ($backslashes -gt 0) {
            $quoted += (('\' * $backslashes) -join '')
            $backslashes = 0
        }
        $quoted += $character
    }
    if ($backslashes -gt 0) { $quoted += (('\' * ($backslashes * 2)) -join '') }
    return $quoted + '"'
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCommand) {
    $runtime = $nodeCommand.Source
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
} else {
    $runtime = Join-Path $repositoryRoot 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) {
        throw 'Neither node.exe nor the installed Electron Node-compatible runtime was found.'
    }
    $env:ELECTRON_RUN_AS_NODE = '1'
}

$arguments = @($testScript)
if ($SourceOnly) { $arguments += '--source-only' }
if ($ApkPath) { $arguments += [System.IO.Path]::GetFullPath($ApkPath) }

$argumentLine = (($arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
$process = Start-Process -FilePath $runtime -ArgumentList $argumentLine -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Android package verification failed with exit code $($process.ExitCode)." }
