# First Launch Guide

Your OS will warn you the first time you open Nike Bot. This is expected — the app is not signed with a paid certificate (budget decision, keeps the tool free and open-source). Here's how to get past the warning in under 30 seconds.

## Why do I see this warning?

Apple and Microsoft charge between $99 and $300 per year to sign apps. We don't pay that fee because our app is open-source and free. The warning does NOT mean the app is dangerous — it means the OS doesn't have our cryptographic fingerprint on file.

You can verify the app is safe by reading the source code on GitHub before running it. Code signing tells the OS "app X came from company Y"; it does NOT prove that "app X is safe". Transparent source code is a stronger trust signal than a paid signature.

---

## macOS — Gatekeeper Bypass

### Recommended: right-click then Open

1. Open the downloaded DMG and drag `nike-bot.app` into the `Applications` folder.
2. Open the `Applications` folder in Finder.
3. **Right-click** (or Control-click) on `nike-bot.app` and select **Open** from the context menu.
4. In the dialog "macOS cannot verify the developer of nike-bot.app", click **Open** again.
5. The app launches. Subsequent launches work normally via double-click.

![macOS right-click Open](first-launch/macos-1-rightclick.png)
![macOS Gatekeeper dialog](first-launch/macos-2-dialog.png)

### Alternative: command-line bypass

If the right-click menu does not show an **Open** option (some newer macOS versions hide it), strip the quarantine attribute from the terminal:

```bash
xattr -d com.apple.quarantine /Applications/nike-bot.app
```

Then double-click the app normally.

---

## Windows — SmartScreen Bypass

1. Run the installer `nike-bot-vX.Y.Z-windows-x64.exe` by double-clicking it.
2. SmartScreen displays **"Windows protected your PC"**.
3. Click **More info** (small blue text under the message).
4. Click the **Run anyway** button that appears below the publisher info.
5. The installer proceeds normally. Future launches of the installed app do not retrigger SmartScreen.

![SmartScreen warning](first-launch/windows-1-warning.png)
![More info clicked](first-launch/windows-2-moreinfo.png)
![Run anyway button](first-launch/windows-3-runanyway.png)

---

## FAQ

**Q: Can I trust this app?**

A: The source is fully open on our GitHub repository. You can read every line before running it, and you can even build the binary yourself from source if you prefer. Code signing is a statement of provenance, not of safety — an open-source build you can audit is a stronger guarantee than a signed black box.

**Q: Why don't you buy a certificate?**

A: The Apple Developer Program costs $99 per year and an EV Windows code-signing certificate is roughly $300 per year. We prefer to keep the tool free and invite you to trust our source code rather than our checkbook. If the project ever reaches sustainable funding, signing is on the roadmap.
