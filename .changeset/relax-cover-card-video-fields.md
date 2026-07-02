---
"@nike-release-checker/sdk": patch
---

Relax `CoverCardPropertiesSchema` to accept video-type cover cards (e.g. NL product feed), making `altText`, `landscape`, `landscapeId`, `landscapeURL`, `portrait`, `portraitId`, `portraitURL`, `squarish`, `squarishId`, and `squarishURL` optional, allowing `portrait` to match the video portrait shape, and adding the video-specific fields (`videoId`, `manifestURL`, `providerId`, `autoPlay`, `loop`, `aspectRatio`, `startImageURL`, `startImage`)
