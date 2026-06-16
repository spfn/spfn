# Security Policy

## Supported versions

SPFN is pre-1.0 software published as beta/alpha releases. Security fixes are applied
to the **latest published version of each `@spfn/*` package** only. Pin and upgrade
accordingly.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of the following private channels:

- **GitHub Security Advisories** — preferred. Open a private report via the repository's
  **Security → Report a vulnerability** tab.
- **Email** — `hello@fxy.global`.

Please include enough detail to reproduce: affected package and version, a description
of the issue and its impact, and a proof of concept or steps to reproduce if possible.

## What to expect

- We aim to acknowledge a report within **3 business days**.
- We will confirm the issue, determine its severity, and keep you updated on remediation.
- Once a fix is released, we are happy to credit you in the advisory unless you prefer
  to remain anonymous.

Please give us a reasonable window to release a fix before any public disclosure.
Because SPFN handles authentication and OAuth, we take reports against the
`@spfn/auth` package particularly seriously.
