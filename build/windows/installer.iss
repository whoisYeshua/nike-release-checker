[Setup]
AppName=Nike Bot
AppVersion={#VERSION}
DefaultDirName={userappdata}\nike-bot
DefaultGroupName=Nike Bot
OutputDir={#DIST_PATH}
OutputBaseFilename=nike-bot-v{#VERSION}-windows-x64
Compression=lzma2
PrivilegesRequired=lowest

[Files]
Source: "{#DIST_PATH}\nike-bot.exe"; DestDir: "{app}"
Source: "docs\FIRST_LAUNCH.md"; DestDir: "{app}"

[Icons]
Name: "{group}\Nike Bot"; Filename: "{app}\nike-bot.exe"
