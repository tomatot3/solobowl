param([ValidateSet('start','status','stop')][string]$Action='status')
$ErrorActionPreference='Stop'
$runtimePath=[System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ShiyoushuDev/PostgreSQL18'))
$dataPath=Join-Path $runtimePath 'data'
$controlPath=Join-Path $runtimePath 'pgsql/bin/pg_ctl.exe'
if(-not (Test-Path -LiteralPath $controlPath) -or -not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))){throw 'Project PostgreSQL18 is not initialized; see docs/development.md'}
if((Get-Content -LiteralPath (Join-Path $dataPath 'PG_VERSION') -Raw).Trim() -ne '18'){throw 'Unexpected PostgreSQL cluster version'}
$oldLayer=$env:__COMPAT_LAYER
try {
 # Current-process compatibility only; preserves existing layers and never grants administrator privileges.
 $env:__COMPAT_LAYER=($oldLayer+' RunAsInvoker').Trim()
 if($Action -eq 'status'){& $controlPath -D $dataPath status;exit $LASTEXITCODE}
 if($Action -eq 'stop'){& $controlPath -D $dataPath -m fast -w stop;exit $LASTEXITCODE}
 & $controlPath -D $dataPath status 2>$null | Out-Null
 if($LASTEXITCODE -eq 0){Write-Output 'Project PostgreSQL is already running.';exit 0}
 $logPath=Join-Path $runtimePath 'postgres.log'
 $controlArguments=@('-D',('"'+$dataPath+'"'),'-l',('"'+$logPath+'"'),'-o','"-h127.0.0.1 -p55432"','-w','-t','30','start')
 $process=Start-Process -FilePath $controlPath -ArgumentList $controlArguments -WindowStyle Hidden -PassThru
 if(-not $process.WaitForExit(45000)){throw 'PostgreSQL control process timed out; inspect the local log'}
 if($process.ExitCode -ne 0){throw ('PostgreSQL start failed; inspect '+$logPath)}
 Write-Output 'Project PostgreSQL18 started on 127.0.0.1:55432; no Windows service registered.'
} finally {$env:__COMPAT_LAYER=$oldLayer}
