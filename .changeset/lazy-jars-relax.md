---
"@nike-release-checker/sdk": patch
---

Relax `CoverCardPropertiesSchema` to accept video-based cover cards in the Nike product feed. Nike serves cover cards as either image cards (with required `altText`/`landscape`/`portrait`/`squarish` fields) or video cards (with `videoId`, `manifestURL`, `portrait` as a video asset reference, etc). The schema previously required the image-only fields unconditionally, so video cover cards (observed for NL) failed validation with "Invalid key" errors for the missing image fields.
