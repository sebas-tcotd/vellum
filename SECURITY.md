# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use [GitHub Private Vulnerability Reporting](https://github.com/sebas-tcotd/vellum/security/advisories/new) on this repository. This sends the report directly to the maintainer without disclosing it publicly, and lets us collaborate on a fix before anything is published.

If you're unable to use that form, you can also open a normal issue asking to be contacted privately, without including any vulnerability details.

Include as much of the following as you can:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, ideally with a minimal `.cslmap` file or repro project.
- The affected version/commit and platform (Windows/macOS/Linux).

## Response

This is a single-maintainer project, so response times are best-effort — expect an initial reply within a few days. Confirmed vulnerabilities will be fixed and released as soon as practical, with credit given to the reporter unless anonymity is requested.

## Scope

Vellum is a native desktop app built with Tauri 2. Areas most relevant to security:

- **`.cslmap` parsing** (`packages/parser-cslmap`, Rust) — the parser reads untrusted, user-supplied XML files.
- **Tauri IPC boundary** (`apps/desktop/src-tauri`) — commands exposed to the frontend, and the Tauri `capabilities`/CSP configuration.
- **The updater** — Vellum checks for and installs application updates.

Issues in third-party dependencies should generally be reported upstream, but feel free to flag them here too if you're not sure where they belong.

## Supported versions

Only the latest released version is supported with security fixes. Vellum has not yet reached a stable 1.0 — there is no long-term support branch.
