## What changed

<!-- Summarize the change. Link an issue if there is one. -->

## Why

<!-- What problem does this solve, or what does it enable? -->

## How was this tested

<!-- Commands you ran, manual steps, screenshots for UI changes, etc. -->

## Checklist

- [ ] `pnpm lint`, `pnpm test` and `pnpm check:architecture` pass locally
- [ ] `cargo fmt --all -- --check`, `cargo clippy --workspace -- -D warnings` and `cargo test --workspace` pass locally (if Rust code changed)
- [ ] No cross-package import or architecture rule was violated (see [`CONTRIBUTING.md`](../CONTRIBUTING.md))
- [ ] User-facing strings are localized in both `en` and `es` (if applicable)
- [ ] Docs updated if behavior or setup steps changed (if applicable)
