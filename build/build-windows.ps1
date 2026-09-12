$ErrorActionPreference = 'Stop'
$version = (Get-Content packages/bot/package.json | ConvertFrom-Json).version
$dist = 'packages/bot/dist'

Push-Location packages/bot
node scripts/bundle.mjs
Pop-Location

node --experimental-sea-config packages/bot/sea-config.json

$nodeExe = (Get-Command node).Source
Copy-Item $nodeExe "$dist/nike-bot.exe"

npx postject "$dist/nike-bot.exe" NODE_SEA_BLOB "$dist/nike-bot.blob" `
	--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Inno Setup installer
& 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' build/windows/installer.iss `
	/DVERSION=$version /DDIST_PATH=$dist
