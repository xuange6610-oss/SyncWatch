param(
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = (Get-Command node -ErrorAction Stop).Source
if ($OutputDirectory) {
    $env:SYNCWATCH_MAC_OUTPUT = [IO.Path]::GetFullPath($OutputDirectory)
}
try {
    & $node (Join-Path $PSScriptRoot 'build-macos-portable.js')
    if ($LASTEXITCODE -ne 0) { throw 'macOS portable ZIP build failed.' }
} finally {
    Remove-Item Env:SYNCWATCH_MAC_OUTPUT -ErrorAction SilentlyContinue
}
