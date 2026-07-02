---
"@nike-release-checker/sdk": patch
---

Allow `CoverCardSchema.properties` to match either the image-oriented `CoverCardPropertiesSchema` or `PublishedContentNodePropertiesSchema`, since Nike's product feed can return video-based cover cards (`subType: "video"`) whose properties shape differs from the standard image cover card, causing CI health checks to fail for the NL market
