$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$buildManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'package.json') | ConvertFrom-Json
$expectedProductName = [string]$buildManifest.build.productName
if ([string]::IsNullOrWhiteSpace($expectedProductName)) { throw 'package.json build.productName is required.' }
$expectedProductExecutable = $expectedProductName + '.exe'

function Assert-WindowsProductMetadata {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string]$ExpectedProductName
    )
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        throw "Packaged executable is missing: $Executable"
    }
    $versionInfo = (Get-Item -LiteralPath $Executable).VersionInfo
    if ([string]$versionInfo.ProductName -ne $ExpectedProductName) {
        throw "Packaged ProductName must be $ExpectedProductName, found: $($versionInfo.ProductName)"
    }
    if ([string]$versionInfo.FileDescription -ne $ExpectedProductName) {
        throw "Packaged FileDescription must be $ExpectedProductName, found: $($versionInfo.FileDescription)"
    }
}

$node = $null
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
if ($nodeCommand) { $node = $nodeCommand.Source }

$nodeCandidates = @()
if ($env:ProgramFiles) { $nodeCandidates += Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if ($env:LOCALAPPDATA) { $nodeCandidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe' }
if ($env:USERPROFILE) {
    $managedVersions = Join-Path $env:USERPROFILE '.trae-cn\binaries\node\versions'
    if (Test-Path -LiteralPath $managedVersions) {
        $managedDirectories = Get-ChildItem -LiteralPath $managedVersions -Directory -ErrorAction SilentlyContinue | Sort-Object {
            try { [version]$_.Name } catch { [version]'0.0.0' }
        } -Descending
        foreach ($directory in $managedDirectories) { $nodeCandidates += Join-Path $directory.FullName 'node.exe' }
    }
}
if (-not $node) {
    foreach ($candidate in $nodeCandidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $node = $candidate; break }
    }
}
if (-not $node) { throw 'Node.js 22 or newer is required; Node.js 24 LTS is recommended.' }

$nodeDirectory = Split-Path -Parent $node
$npm = Join-Path $nodeDirectory 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
    if ($npmCommand) { $npm = $npmCommand.Source }
}
$pnpm = $null
if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) {
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpmCommand) { $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue }
    if ($pnpmCommand) { $pnpm = $pnpmCommand.Source }
}
if (-not $pnpm -and -not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'npm or pnpm is required on PATH.' }
$env:Path = $nodeDirectory + [IO.Path]::PathSeparator + $env:Path

$nodeMajor = [int]((& $node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) {
    throw 'Node.js 22 or newer is required; Node.js 24 LTS is recommended.'
}

function Ensure-ElectronRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $electronModulePath = Join-Path $PSScriptRoot 'node_modules\electron'
    $electronInstallScript = Join-Path $electronModulePath 'install.js'
    $electronDistPath = [System.IO.Path]::GetFullPath((Join-Path $electronModulePath 'dist'))
    $electronExecutable = Join-Path $electronDistPath 'electron.exe'
    $electronVersionFile = Join-Path $electronDistPath 'version'

    $runtimeReady = $false
    if ((Test-Path -LiteralPath $electronExecutable -PathType Leaf) -and (Test-Path -LiteralPath $electronVersionFile -PathType Leaf)) {
        $installedElectronVersion = (Get-Content -LiteralPath $electronVersionFile -Raw).Trim()
        $runtimeReady = $installedElectronVersion -eq $ExpectedVersion
    }

    if (-not $runtimeReady) {
        if (-not (Test-Path -LiteralPath $electronInstallScript -PathType Leaf)) {
            throw 'The Electron package is missing. Reinstall dependencies before building the EXE.'
        }

        Write-Host 'Restoring the locked Windows Electron runtime...' -ForegroundColor Cyan
        $savedSkipBinaryDownload = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
        $savedPlatform = $env:npm_config_platform
        $savedArch = $env:npm_config_arch
        try {
            Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
            $env:npm_config_platform = 'win32'
            $env:npm_config_arch = 'x64'
            & $node $electronInstallScript
            if ($LASTEXITCODE -ne 0) { throw 'Electron runtime restoration failed.' }
        } finally {
            if ($null -ne $savedSkipBinaryDownload) { $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $savedSkipBinaryDownload }
            else { Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue }
            if ($null -ne $savedPlatform) { $env:npm_config_platform = $savedPlatform }
            else { Remove-Item Env:npm_config_platform -ErrorAction SilentlyContinue }
            if ($null -ne $savedArch) { $env:npm_config_arch = $savedArch }
            else { Remove-Item Env:npm_config_arch -ErrorAction SilentlyContinue }
        }
    }

    if (-not (Test-Path -LiteralPath $electronExecutable -PathType Leaf) -or -not (Test-Path -LiteralPath $electronVersionFile -PathType Leaf)) {
        throw 'The locked Electron runtime is missing. Reinstall dependencies before building the EXE.'
    }
    $installedElectronVersion = (Get-Content -LiteralPath $electronVersionFile -Raw).Trim()
    if ($installedElectronVersion -ne $ExpectedVersion) {
        throw "The local Electron runtime version ($installedElectronVersion) does not match package.json ($ExpectedVersion)."
    }
    return $electronDistPath
}

function Ensure-MediaTools {
    $ffmpegModulePath = Join-Path $PSScriptRoot 'node_modules\ffmpeg-static'
    $ffmpegInstallScript = Join-Path $ffmpegModulePath 'install.js'
    $ffmpegExecutable = Join-Path $ffmpegModulePath 'ffmpeg.exe'
    $ffprobeExecutable = Join-Path $PSScriptRoot 'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'

    if (-not (Test-Path -LiteralPath $ffmpegExecutable -PathType Leaf)) {
        if (-not (Test-Path -LiteralPath $ffmpegInstallScript -PathType Leaf)) {
            throw 'The ffmpeg-static package is missing its installer.'
        }

        Write-Host 'Restoring the locked Windows ffmpeg binary...' -ForegroundColor Cyan
        $savedPlatform = $env:npm_config_platform
        $savedArch = $env:npm_config_arch
        try {
            $env:npm_config_platform = 'win32'
            $env:npm_config_arch = 'x64'
            & $node $ffmpegInstallScript
            if ($LASTEXITCODE -ne 0) { throw 'ffmpeg runtime restoration failed.' }
        } finally {
            if ($null -ne $savedPlatform) { $env:npm_config_platform = $savedPlatform }
            else { Remove-Item Env:npm_config_platform -ErrorAction SilentlyContinue }
            if ($null -ne $savedArch) { $env:npm_config_arch = $savedArch }
            else { Remove-Item Env:npm_config_arch -ErrorAction SilentlyContinue }
        }
    }

    if (-not (Test-Path -LiteralPath $ffmpegExecutable -PathType Leaf)) {
        throw 'The locked ffmpeg binary is missing. Reinstall dependencies before building the EXE.'
    }
    if (-not (Test-Path -LiteralPath $ffprobeExecutable -PathType Leaf)) {
        throw 'The locked ffprobe binary is missing. Reinstall dependencies before building the EXE.'
    }
    return [PSCustomObject]@{
        Ffmpeg = $ffmpegExecutable
        Ffprobe = $ffprobeExecutable
    }
}

$androidBuildScript = Join-Path $PSScriptRoot 'mobile\build-apk.ps1'
$androidApk = Join-Path $PSScriptRoot 'mobile\SyncWatch同步观影-v2.1.7.apk'
$powerShellExecutable = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $androidBuildScript) -or -not (Test-Path -LiteralPath $powerShellExecutable)) {
    throw 'The Android build script or system PowerShell executable is missing.'
}

Write-Host 'Building and verifying the signed Android v2.1.7 APK...' -ForegroundColor Cyan
& $powerShellExecutable -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $androidBuildScript
if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed; EXE packaging stopped.' }
if (-not (Test-Path -LiteralPath $androidApk)) { throw 'Android build completed without mobile\SyncWatch同步观影-v2.1.7.apk.' }
$androidApkInfo = Get-Item -LiteralPath $androidApk
if ($androidApkInfo.Length -lt 10KB) { throw 'The Android APK is unexpectedly small; EXE packaging stopped.' }
$androidApkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $androidApk).Hash
Write-Host "Android APK ready: $($androidApkInfo.Length) bytes, SHA256 $androidApkHash" -ForegroundColor Green

Write-Host 'Installing locked dependencies...' -ForegroundColor Cyan
$requiredInstalledFiles = @(
    'node_modules\electron\install.js',
    'node_modules\electron-builder\package.json',
    'node_modules\app-builder-lib\package.json',
    'node_modules\ffmpeg-static\ffmpeg.exe',
    'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'
)
$installedDependenciesReady = -not ($requiredInstalledFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $_) -PathType Leaf) })
if ($installedDependenciesReady) {
    Write-Host 'Reusing the complete locked dependency tree already present in node_modules.' -ForegroundColor Green
} else {
    if ($pnpm) { & $pnpm install --frozen-lockfile --reporter append-only }
    else { & $npm ci --no-fund }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

$mediaTools = Ensure-MediaTools

$runtimePackage = $buildManifest
$electronDistPath = Ensure-ElectronRuntime -ExpectedVersion ([string]$runtimePackage.devDependencies.electron)

Write-Host 'Running the complete Node.js, browser, Electron, media and tunnel regression suite...' -ForegroundColor Cyan
if ($pnpm) { & $pnpm run test:all }
else { & $npm run test:all }
if ($LASTEXITCODE -ne 0) { throw 'The complete regression suite failed; packaging stopped.' }

Write-Host 'Running release-only upload policy and real browser UI smoke tests...' -ForegroundColor Cyan
& $node 'tests\backend-upload-policy.test.js'
if ($LASTEXITCODE -ne 0) { throw 'The backend upload policy regression failed; packaging stopped.' }
& $node 'tests\browser-ui-smoke.js'
if ($LASTEXITCODE -ne 0) { throw 'The real browser UI smoke test failed; packaging stopped.' }

Write-Host 'Auditing all dependencies...' -ForegroundColor Cyan
if ($pnpm) { & $pnpm audit }
else { & $npm audit }
if ($LASTEXITCODE -ne 0) { throw 'Full dependency audit failed; packaging stopped.' }

Write-Host 'Auditing production dependencies...' -ForegroundColor Cyan
if ($pnpm) { & $pnpm audit --prod }
else { & $npm audit --omit=dev }
if ($LASTEXITCODE -ne 0) { throw 'Production dependency audit failed; packaging stopped.' }

$package = $buildManifest
if ([string]$package.version -ne '2.1.7') { throw 'package.json version must be exactly 2.1.7.' }
$artifactName = [string]$package.build.portable.artifactName
if ([string]::IsNullOrWhiteSpace($artifactName) -or [System.IO.Path]::GetFileName($artifactName) -ne $artifactName) {
    throw 'The portable artifact name in package.json is invalid.'
}
$packagedFiles = @($package.build.files | ForEach-Object { [string]$_ })
$unpackedFiles = @($package.build.asarUnpack | ForEach-Object { [string]$_ })
if ($packagedFiles -notcontains 'electron-settings-preload.js') {
    throw 'package.json must include electron-settings-preload.js for the portable settings window.'
}
foreach ($entry in @($packagedFiles) + @($unpackedFiles) + @($package.build.extraResources | ForEach-Object { [string]$_.from })) {
    if ($entry -match '(^|[\\/])(?:mobile|mac)(?:[\\/]|$)|SyncWatch同步观影-Client-v2\.1\.7\.exe') {
        throw "The main Windows EXE must not embed separately released client, Android or macOS payloads: $entry"
    }
}

$releaseWindowsServer = Join-Path $PSScriptRoot 'release\windows-server'
$releaseWindowsClient = Join-Path $PSScriptRoot 'release\windows-client'
$releaseAndroid = Join-Path $PSScriptRoot 'release\android'
$releaseMac = Join-Path $PSScriptRoot 'release\macos'
$releaseServerDeployment = Join-Path $PSScriptRoot 'release\server-deployment'
foreach ($releaseDirectory in @($releaseWindowsServer, $releaseWindowsClient, $releaseAndroid, $releaseMac, $releaseServerDeployment)) {
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
}
Copy-Item -LiteralPath $androidApk -Destination (Join-Path $releaseAndroid $androidApkInfo.Name) -Force
if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $releaseAndroid $androidApkInfo.Name)).Hash -ne $androidApkHash) {
    throw 'The separately published Android APK failed hash verification.'
}

$macCollector = Join-Path $PSScriptRoot 'scripts\collect-macos-distribution.ps1'
if (-not (Test-Path -LiteralPath $macCollector -PathType Leaf)) {
    throw 'The constrained macOS distribution collector is missing.'
}

# Collect only canonical, non-empty macOS release artifacts into their own
# delivery folder. They intentionally stay outside the Windows executable.
& $powerShellExecutable -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $macCollector `
    -SourceRoot $PSScriptRoot -Destination $releaseMac -Version ([string]$package.version)
if ($LASTEXITCODE -ne 0) { throw 'Collecting macOS server/client downloads failed.' }
$macDistributionPayloads = @(Get-ChildItem -LiteralPath $releaseMac -File | Where-Object {
    $_.Name -eq 'mac-distribution.json' -or $_.Extension -in @('.dmg', '.zip')
})
foreach ($payload in $macDistributionPayloads) {
    if ($payload.Length -le 0) { throw "macOS distribution payload is empty: $($payload.FullName)" }
}
if ($macDistributionPayloads.Count -eq 0) {
    Write-Warning 'No real macOS DMG/ZIP or HTTPS distribution manifest is available. release\macos will remain empty instead of publishing a fake installer.'
} else {
    Write-Host "Separate macOS distribution payloads ready: $($macDistributionPayloads.Count)" -ForegroundColor Green
}

$electronDistPath = Ensure-ElectronRuntime -ExpectedVersion ([string]$package.devDependencies.electron)

$clientConfigPath = Join-Path $PSScriptRoot 'electron-builder-client.json'
if (-not (Test-Path -LiteralPath $clientConfigPath -PathType Leaf)) {
    throw 'The SyncWatch同步观影 client packaging configuration is missing.'
}
$clientArtifactName = 'SyncWatch同步观影-Client-v2.1.7.exe'
$clientDelivery = Join-Path $releaseWindowsClient $clientArtifactName
$clientBuildRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('syncwatch-client-build-' + [Guid]::NewGuid().ToString('N'))
$clientStage = Join-Path $PSScriptRoot ('.syncwatch-client-' + [Guid]::NewGuid().ToString('N') + '.tmp')
$clientBackup = Join-Path $PSScriptRoot ('.syncwatch-client-' + [Guid]::NewGuid().ToString('N') + '.bak')
$clientReplaced = $false
Write-Host 'Building and atomically publishing the Windows x64 client EXE...' -ForegroundColor Cyan
try {
    & $node 'node_modules\electron-builder\out\cli\cli.js' --config $clientConfigPath --win portable --x64 "--config.directories.output=$clientBuildRoot"
    if ($LASTEXITCODE -ne 0) { throw 'Client EXE build failed; the existing client artifact was preserved.' }
    $clientCandidate = Join-Path $clientBuildRoot $clientArtifactName
    if (-not (Test-Path -LiteralPath $clientCandidate -PathType Leaf) -or (Get-Item -LiteralPath $clientCandidate).Length -lt 1MB) {
        throw 'The client build completed without a valid portable EXE.'
    }
    Assert-WindowsProductMetadata -Executable (Join-Path (Join-Path $clientBuildRoot 'win-unpacked') $expectedProductExecutable) `
        -ExpectedProductName $expectedProductName
    $clientCandidateHash = (Get-FileHash -LiteralPath $clientCandidate -Algorithm SHA256).Hash
    Copy-Item -LiteralPath $clientCandidate -Destination $clientStage
    if ((Get-FileHash -LiteralPath $clientStage -Algorithm SHA256).Hash -ne $clientCandidateHash) {
        throw 'Client EXE staging verification failed.'
    }
    if (Test-Path -LiteralPath $clientDelivery -PathType Leaf) {
        [System.IO.File]::Replace($clientStage, $clientDelivery, $clientBackup, $true)
        $clientReplaced = $true
    } else {
        [System.IO.File]::Move($clientStage, $clientDelivery)
    }
    if ((Get-FileHash -LiteralPath $clientDelivery -Algorithm SHA256).Hash -ne $clientCandidateHash) {
        throw 'Published client EXE hash verification failed.'
    }
    if (Test-Path -LiteralPath $clientBackup) { Remove-Item -LiteralPath $clientBackup -Force }
    $clientReplaced = $false
    Write-Host "Client EXE ready: $clientDelivery, SHA256 $clientCandidateHash" -ForegroundColor Green
} catch {
    $clientError = $_
    if ($clientReplaced -and (Test-Path -LiteralPath $clientBackup -PathType Leaf)) {
        [System.IO.File]::Replace($clientBackup, $clientDelivery, $null, $true)
        $clientReplaced = $false
    }
    throw $clientError
} finally {
    if (Test-Path -LiteralPath $clientStage) { Remove-Item -LiteralPath $clientStage -Force }
    if (-not $clientReplaced -and (Test-Path -LiteralPath $clientBackup)) { Remove-Item -LiteralPath $clientBackup -Force }
    if (Test-Path -LiteralPath $clientBuildRoot) { Remove-Item -LiteralPath $clientBuildRoot -Recurse -Force }
}

# electron-builder may run its dependency preparation step after the client
# build and remove optional postinstall binaries. Restore them before the
# candidate server smoke test, which generates a real media sample with ffmpeg.
$mediaTools = Ensure-MediaTools

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$buildName = 'syncwatch-build-' + [Guid]::NewGuid().ToString('N')
$distPath = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $buildName))
$tempPrefix = $tempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $distPath.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Temporary build directory validation failed.'
}

$transactionId = [Guid]::NewGuid().ToString('N')
$stagedDelivery = $null
$deliveryBackup = $null
$stagedGuide = $null
$guideBackup = $null
$delivery = $null
$guidePath = $null
$deliveryWasReplaced = $false
$deliveryWasCreated = $false
$guideWasReplaced = $false
$cleanupBackups = $false

$electronDistPath = Ensure-ElectronRuntime -ExpectedVersion ([string]$package.devDependencies.electron)
$hadElectronOverride = Test-Path Env:ELECTRON_OVERRIDE_DIST_PATH
$previousElectronOverride = $env:ELECTRON_OVERRIDE_DIST_PATH
$env:ELECTRON_OVERRIDE_DIST_PATH = $electronDistPath

Write-Host 'Building the Windows x64 portable EXE...' -ForegroundColor Cyan
try {
    & $node 'node_modules\electron-builder\out\cli\cli.js' --win portable --x64 "--config.directories.output=$distPath"
    if ($LASTEXITCODE -ne 0) { throw 'EXE build failed.' }

    $artifact = Join-Path $distPath $artifactName
    $delivery = Join-Path $releaseWindowsServer $artifactName
    if (-not (Test-Path -LiteralPath $artifact)) { throw 'The build completed without the expected EXE.' }

    $unpackedRoot = Join-Path $distPath 'win-unpacked'
    Assert-WindowsProductMetadata -Executable (Join-Path $unpackedRoot $expectedProductExecutable) `
        -ExpectedProductName $expectedProductName
    $resourcesRoot = Join-Path $unpackedRoot 'resources'
    foreach ($forbiddenResource in @('client', 'mac', 'mobile')) {
        if (Test-Path -LiteralPath (Join-Path $resourcesRoot $forbiddenResource)) {
            throw "The main Windows package contains a separately released resource directory: $forbiddenResource"
        }
    }
    $asarPath = Join-Path $resourcesRoot 'app.asar'
    $asarCli = Join-Path $PSScriptRoot 'node_modules\@electron\asar\bin\asar.js'
    if (-not (Test-Path -LiteralPath $asarPath -PathType Leaf) -or -not (Test-Path -LiteralPath $asarCli -PathType Leaf)) {
        throw 'The packaged app.asar or its locked inspection tool is missing.'
    }
    $asarEntries = @(& $node $asarCli list $asarPath)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the packaged app.asar.' }
    if (($asarEntries -join "`n") -match '(?im)(^|[\\/])(?:mobile|mac)(?:[\\/]|$)|SyncWatch同步观影-Client-v2\.1\.7\.exe') {
        throw 'The main app.asar embeds a separately released client, Android or macOS payload.'
    }

    $artifactInfo = Get-Item -LiteralPath $artifact
    if ($artifactInfo.Length -lt 1MB) { throw 'The candidate EXE is unexpectedly small; the existing artifact was preserved.' }

    # electron-builder may run its dependency preparation step after the
    # server build and remove optional postinstall binaries. Restore ffmpeg
    # immediately before the smoke test, which generates a real media sample.
    $mediaTools = Ensure-MediaTools

    Write-Host 'Running split candidate EXE HTTP and desktop payload smoke tests...' -ForegroundColor Cyan
    & $node 'tests\split-desktop-artifact-smoke.js' $artifact
    if ($LASTEXITCODE -ne 0) { throw 'Candidate EXE smoke tests failed; the existing artifact was preserved.' }

    $candidateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash
    $stagedDelivery = Join-Path $PSScriptRoot ('.syncwatch-delivery-' + $transactionId + '.tmp')
    $deliveryBackup = Join-Path $PSScriptRoot ('.syncwatch-delivery-' + $transactionId + '.bak')
    Copy-Item -LiteralPath $artifact -Destination $stagedDelivery
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $stagedDelivery).Hash -ne $candidateHash) {
        throw 'Candidate EXE copy verification failed; the existing artifact was preserved.'
    }

    $hashPattern = '(?m)^(.*EXE SHA256[^0-9A-Fa-f]*)([0-9A-Fa-f]{64})(.*)$'
    $guideCandidates = @()
    foreach ($candidate in Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Filter '*.md' |
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|release|dist|mobile[\\/]build)[\\/]' }) {
        $candidateText = [System.IO.File]::ReadAllText($candidate.FullName, [System.Text.Encoding]::UTF8)
        if ([regex]::Matches($candidateText, $hashPattern).Count -eq 1) { $guideCandidates += [PSCustomObject]@{ Path = $candidate.FullName; Text = $candidateText } }
    }
    if ($guideCandidates.Count -ne 1) {
        throw 'Expected exactly one Markdown guide containing the final EXE SHA256 marker.'
    }
    $guidePath = $guideCandidates[0].Path
    $guideText = $guideCandidates[0].Text
    $updatedGuide = [regex]::Replace($guideText, $hashPattern, { param($match) $match.Groups[1].Value + $candidateHash + $match.Groups[3].Value })
    $stagedGuide = Join-Path $PSScriptRoot ('.syncwatch-guide-' + $transactionId + '.tmp')
    $guideBackup = Join-Path $PSScriptRoot ('.syncwatch-guide-' + $transactionId + '.bak')
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($stagedGuide, $updatedGuide, $utf8WithoutBom)

    if (Test-Path -LiteralPath $delivery) {
        [System.IO.File]::Replace($stagedDelivery, $delivery, $deliveryBackup, $true)
        $deliveryWasReplaced = $true
    } else {
        [System.IO.File]::Move($stagedDelivery, $delivery)
        $deliveryWasCreated = $true
    }

    $deliveryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $delivery).Hash
    if ($deliveryHash -ne $candidateHash) { throw 'Final EXE hash verification failed.' }

    [System.IO.File]::Replace($stagedGuide, $guidePath, $guideBackup, $true)
    $guideWasReplaced = $true
    $finalGuideText = [System.IO.File]::ReadAllText($guidePath, [System.Text.Encoding]::UTF8)
    $finalGuideMatch = [regex]::Match($finalGuideText, $hashPattern)
    if (-not $finalGuideMatch.Success -or $finalGuideMatch.Groups[2].Value -ne $deliveryHash) {
        throw 'The guide hash verification failed after replacement.'
    }
    $cleanupBackups = $true
} catch {
    $originalError = $_
    $rollbackErrors = @()
    if ($guideWasReplaced -and (Test-Path -LiteralPath $guideBackup)) {
        try {
            [System.IO.File]::Replace($guideBackup, $guidePath, $null, $true)
            $guideWasReplaced = $false
        } catch {
            $rollbackErrors += $_.Exception.Message
        }
    }
    if ($deliveryWasReplaced -and (Test-Path -LiteralPath $deliveryBackup)) {
        try {
            [System.IO.File]::Replace($deliveryBackup, $delivery, $null, $true)
            $deliveryWasReplaced = $false
        } catch {
            $rollbackErrors += $_.Exception.Message
        }
    } elseif ($deliveryWasCreated -and (Test-Path -LiteralPath $delivery)) {
        try {
            Remove-Item -LiteralPath $delivery -Force
            $deliveryWasCreated = $false
        } catch {
            $rollbackErrors += $_.Exception.Message
        }
    }
    if ($rollbackErrors.Count -eq 0) {
        $cleanupBackups = $true
    } else {
        Write-Warning ('Automatic rollback was incomplete. Recovery backups were preserved: ' + ($rollbackErrors -join '; '))
    }
    throw $originalError
} finally {
    if ($hadElectronOverride) {
        $env:ELECTRON_OVERRIDE_DIST_PATH = $previousElectronOverride
    } else {
        Remove-Item Env:ELECTRON_OVERRIDE_DIST_PATH -ErrorAction SilentlyContinue
    }
    if ($stagedDelivery -and (Test-Path -LiteralPath $stagedDelivery)) { Remove-Item -LiteralPath $stagedDelivery -Force }
    if ($stagedGuide -and (Test-Path -LiteralPath $stagedGuide)) { Remove-Item -LiteralPath $stagedGuide -Force }
    if ($cleanupBackups -and $deliveryBackup -and (Test-Path -LiteralPath $deliveryBackup)) { Remove-Item -LiteralPath $deliveryBackup -Force }
    if ($cleanupBackups -and $guideBackup -and (Test-Path -LiteralPath $guideBackup)) { Remove-Item -LiteralPath $guideBackup -Force }
    if (Test-Path -LiteralPath $distPath) { Remove-Item -LiteralPath $distPath -Recurse -Force }
}

Write-Host "Build complete: $delivery" -ForegroundColor Green
Write-Host "SHA256: $deliveryHash" -ForegroundColor Green

$serverPackageScript = Join-Path $PSScriptRoot 'build-server-package.ps1'
if (-not (Test-Path -LiteralPath $serverPackageScript)) { throw 'The standalone server package script is missing.' }
Write-Host 'Building the portable standalone server package...' -ForegroundColor Cyan
& $powerShellExecutable -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $serverPackageScript -OutputDirectory $releaseServerDeployment
if ($LASTEXITCODE -ne 0) { throw 'Standalone server package build failed.' }
$serverPackageDelivery = Join-Path $releaseServerDeployment "SyncWatch同步观影-Server-v$([string]$package.version).zip"
if (-not (Test-Path -LiteralPath $serverPackageDelivery -PathType Leaf)) {
    throw "The standalone server package was not published to the split release folder: $serverPackageDelivery"
}

Write-Host 'Split release layout ready:' -ForegroundColor Green
Write-Host "  Main Windows app: $delivery"
Write-Host "  Windows client: $clientDelivery"
Write-Host "  Android client: $(Join-Path $releaseAndroid $androidApkInfo.Name)"
Write-Host "  macOS artifacts: $releaseMac"
Write-Host "  Server deployment: $serverPackageDelivery"

