---
"@nike-release-checker/sdk": minor
---

Add compiled JS output to published tarball

SDK release tarball now includes compiled JavaScript and TypeScript declaration files in `dist/` instead of raw TypeScript sources. The `publishConfig.exports` field redirects consumers to `./dist/*.js` entries, while local monorepo usage continues to resolve `.ts` files directly.
