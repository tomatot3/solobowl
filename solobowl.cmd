@echo off
setlocal
set "SOLOBOWL_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined SOLOBOWL_NODE set "SOLOBOWL_NODE=%%N"
if not defined SOLOBOWL_NODE set "SOLOBOWL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%SOLOBOWL_NODE%" (
  echo Node.js 22 or newer is required.
  exit /b 1
)
"%SOLOBOWL_NODE%" "%~dp0scripts\run.cjs" %*
exit /b %errorlevel%
