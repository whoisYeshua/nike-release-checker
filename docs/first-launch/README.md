# First Launch Screenshots

Placeholder folder for the screenshots referenced from [`../FIRST_LAUNCH.md`](../FIRST_LAUNCH.md).

Status: **TODO** — capture during a future VM test session (macOS + Windows 11 Sandbox). Until the images land, the Markdown references will render as broken image links, which is acceptable for the doc-only subset of Story 9-5.

## Screenshots to capture

| File | Platform | Description |
| --- | --- | --- |
| `macos-1-rightclick.png` | macOS | Finder window on `Applications`, context menu open on `nike-bot.app`, `Open` entry highlighted. |
| `macos-2-dialog.png` | macOS | Gatekeeper dialog "macOS cannot verify the developer of nike-bot.app", with the **Open** button visible. |
| `windows-1-warning.png` | Windows 11 | SmartScreen full dialog showing "Windows protected your PC" with publisher "Unknown". |
| `windows-2-moreinfo.png` | Windows 11 | Same SmartScreen dialog after clicking **More info**, with the app name and publisher now expanded. |
| `windows-3-runanyway.png` | Windows 11 | SmartScreen dialog with the **Run anyway** button revealed and highlighted. |

## Capture guidelines

- Resolution: native retina / 1x on the VM (no upscaling).
- Format: PNG, lossless, cropped to the relevant window (no full-desktop screenshots).
- No personal information visible (hostname, username, desktop wallpaper with identifying content).
- Use the actual release artifact filename pattern (`nike-bot-vX.Y.Z-*`) so the screenshots stay recognizable across versions.
