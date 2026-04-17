# Agent Troubleshooting Notes

## Product feed health workflow failures

If `.github/workflows/product-feed-health.yml` fails in GitHub Actions:

1. Open the failed run and read logs from the `Run product feed check` step.
2. Extract the country/index context from the error.
3. Reproduce locally with the CI-equivalent checker by running:

```bash
npm run check-product-feed -- <index>
```

Example:

```bash
npm run check-product-feed -- 15
```

Notes:
- CI runs `npm run ci:check-product-feed`, which rotates countries using cached state.
- Local reproduction should use `npm run check-product-feed -- <index>` so the same country/index is validated and the error is represented correctly.
