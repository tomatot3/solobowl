param([string] $NodePath = (Get-Command node -ErrorAction Stop).Source)

$ErrorActionPreference = 'Stop'
$node = (Resolve-Path -LiteralPath $NodePath).Path
$runner = Join-Path $PSScriptRoot 'windows.cjs'
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$runtime = Join-Path $env:LOCALAPPDATA 'ShiyoushuWeb'
$launcher = Join-Path $runtime 'start-web.vbs'
$command = ('"' + $node + '" "' + $runner + '" serve').Replace('"', '""')

if (-not (Test-Path -LiteralPath (Join-Path $runtime 'web.env'))) {
    throw 'Run windows.cjs prepare first.'
}

Set-Content -LiteralPath $launcher -Encoding Unicode -Value @(
    'Set shell = CreateObject("WScript.Shell")'
    ('WScript.Quit shell.Run("' + $command + '", 0, True)')
)

$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') `
    -Argument ('//B //NoLogo "' + $launcher + '"') -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 10 -RestartInterval ([TimeSpan]::FromMinutes(1))
Register-ScheduledTask -TaskName 'Shiyoushu Web' -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Force | Out-Null
Write-Output 'Registered Shiyoushu Web for this Windows account.'
