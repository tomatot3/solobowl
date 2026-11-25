$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction Stop
$nodeDirectory = Split-Path -Parent $nodeCommand.Source
$npmCli = Join-Path $nodeDirectory 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'npm CLI not found beside Node.js; install the pinned Node.js distribution.' }
$projectShell = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $projectShell)) { $projectShell = Join-Path $PSHOME 'powershell.exe' }
$forwardedArgs=@($args)
# PowerShell can consume an unquoted -- before native forwarding; run-script tails belong to the script.
if($forwardedArgs.Count -gt 2 -and $forwardedArgs[0] -in @('run','run-script') -and $forwardedArgs[2] -ne '--') {
 $forwardedArgs=@($forwardedArgs[0],$forwardedArgs[1],'--')+$forwardedArgs[2..($forwardedArgs.Count-1)]
}
& $nodeCommand.Source $npmCli "--script-shell=$projectShell" @forwardedArgs
exit $LASTEXITCODE
