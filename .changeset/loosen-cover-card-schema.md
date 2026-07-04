---
"@nike-release-checker/sdk": patch
---

Relax `CoverCardPropertiesSchema` to make image-specific fields (`altText`, `landscape`, `landscapeId`, `landscapeURL`, `portraitId`, `portraitURL`, `squarish`, `squarishId`, `squarishURL`) optional and allow `portrait` to match the video-card shape, fixing product feed validation failures for video-type cover cards (e.g. NL market)
