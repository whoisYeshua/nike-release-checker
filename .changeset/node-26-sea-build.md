---
"@nike-release-checker/cli": minor
---

Migrate SEA build pipeline to Node.js 26

- Upgrade Node.js baseline from 24.x to 26.1.0
- Replace manual `postject` injection pipeline with built-in `node --build-sea`; removes the `postject` devDependency, the intermediate blob file, and the Node binary copy step
- Add `mainFormat: "commonjs"` to SEA config to make CJS mode explicit and resilient to future Node defaults changes
- Drop `--experimental-webstorage` flag from all scripts — Web Storage is enabled by default since Node 25.0.0
- Add `engines.node: ">=26.1"` to package
