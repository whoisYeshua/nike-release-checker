---
"@nike-release-checker/sdk": patch
---

Make `altText`, `landscape`/`landscapeId`/`landscapeURL`, `portrait`/`portraitId`/`portraitURL`, and `squarish`/`squarishId`/`squarishURL` optional on `CoverCardPropertiesSchema`, and allow `portrait` to also match `PortraitSchema`, to handle Nike product feed responses where the thread cover card is a video (no image assets) — fixing NL product feed validation failures
