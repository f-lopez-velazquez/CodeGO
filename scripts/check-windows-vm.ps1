# Run inside Windows, with Python and Node 22 installed and the project copied locally.
# Writes evidence without enabling kiosk or changing Wi-Fi/audio.
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$Executable = '',
  [string]$OutputDirectory = ''
)
$ErrorActionPreference = 'Stop'
if (!$Executable) { $Executable = Join-Path $ProjectRoot 'dist\win-unpacked\CodeGO ExamGuard.exe' }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot 'reports\windows-vm' }
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$OutputDirectory = (Resolve-Path $OutputDirectory).Path
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:DEBUG = ''
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture | ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'windows.json') -Encoding UTF8
Push-Location $ProjectRoot
try {
  & node.exe --test tests/ipc.test.js tests/production.test.js tests/runtime.test.js 2>&1 | Tee-Object (Join-Path $OutputDirectory 'unit-tests.txt')
  $unitExit = $LASTEXITCODE
  $reportPath = Join-Path $OutputDirectory 'packaged-win32-x64.json'
  Remove-Item $reportPath -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $Executable -ArgumentList "`"--self-test-report=$reportPath`"",'--disable-gpu' -PassThru
  if (!$process.WaitForExit(90000)) { $process.Kill(); throw 'La comprobación excedió 90 segundos.' }
  $process.Refresh()
  $packageExit = $process.ExitCode
  $report = Get-Content -Raw $reportPath | ConvertFrom-Json
  @{unitExit=$unitExit;packagedExit=$packageExit;success=($unitExit -eq 0 -and $packageExit -eq 0 -and $report.success);date=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8
  if ($unitExit -ne 0 -or $packageExit -ne 0 -or !$report.success) { throw 'La validación Windows no pasó.' }
} finally { Pop-Location }
