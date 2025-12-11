#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")

$SeaConfig = Join-Path $ProjectRoot "sea-config.json"
$DistDir = Join-Path $ProjectRoot "dist"
$Bundle = Join-Path $DistDir "bundle.cjs"
$Blob = Join-Path $DistDir "sea-prep.blob"
$OutputBin = Join-Path $DistDir "nike-release-checker-win-x64.exe"

# Clean previous artifacts
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
Remove-Item -Force $Blob, $OutputBin -ErrorAction SilentlyContinue

Write-Host "Building bundle to $Bundle"
npm run build --prefix $ProjectRoot

if (-not (Test-Path $Bundle)) {
	Write-Error "Bundle not found at $Bundle"
}

Write-Host "Generating SEA blob using config file $SeaConfig"
node --experimental-sea-config $SeaConfig

$NodeBin = (Get-Command node).Source
Write-Host "Copying Node binary $NodeBin to $OutputBin"
Copy-Item $NodeBin $OutputBin -Force

Write-Host "Injecting SEA blob..."
npx postject $OutputBin NODE_SEA_BLOB $Blob `
	--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

Write-Host "SEA executable ready at $OutputBin"


