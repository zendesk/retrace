# Security

## For AI Agents

This section defines mandatory security principles and restrictions for all AI coding assistants operating in this repository.

**Authority:** Derived from [Zendesk Minimum Baseline Security Standard](https://docs.google.com/document/d/17GZ9TpjKCt6WCdw3yxL44Ra_YscbOBVnVkUVGgx5Hz0/) and internal security policies.

---

### Core Security Mandate

Security is a first-class requirement. Every code suggestion must be evaluated against these guidelines. If a request would result in insecure code:

1. **Stop** and flag the security concern
2. **Explain** why it's problematic
3. **Propose** a secure alternative

AI-generated code requires human review before merging.

---

### Absolute Prohibitions

AI agents must **NEVER** do the following:

#### Secrets & Credentials
- Hardcode secrets, credentials, API keys, tokens, or passwords in source code
- Store secrets in version control (`.env` files with real values, config with real credentials)
- Log, print, or expose secret values
- Expose credentials in URLs, logs, or error messages

#### Security Controls
- Disable or weaken security controls (`verify=False`, `ALLOW_ALL` CORS, disabled auth)
- Bypass authentication or authorization checks
- Disable certificate validation
- Weaken password policies or MFA requirements

#### Dangerous Code Patterns
- Use `eval()` or `exec()` with user-supplied input
- Implement custom cryptography
- Use deprecated algorithms (MD5, SHA-1, DES, RC4, ECB mode)

#### Data Exposure
- Log sensitive data (PII, credentials, tokens, customer data)
- Expose stack traces or internal paths to end users
- Transmit sensitive data over unencrypted channels

---

### Required Security Patterns

#### Secret Management

```typescript
// Correct: environment variable
const apiKey = process.env.MY_SERVICE_API_KEY

// NEVER: hardcoded secret
const apiKey = 'sk-abc123XYZ'
```

#### Dependency Security
- This project uses Dependabot and Renovate for automated dependency updates (see `.github/dependabot.yml` and `.github/renovate.json`)
- Do not pin dependencies to versions with known CVEs
- Do not downgrade a dependency past a security fix without explicit justification

#### Bundle Safety
- The library is `"sideEffects": false` — do not introduce module-level side effects that could execute code unexpectedly in host apps
- Do not introduce dependencies that perform network calls at import time

---

### Security Requirements by Domain

#### Data Protection
- This library processes timing/performance data — none of it should include PII
- Do not capture user-identifiable information in span attributes or trace metadata without explicit consumer opt-in
- `TraceRecording` JSON output is consumer-controlled — document clearly what data is captured when adding new span attributes

#### Cryptography

| Use Case | Approved | Forbidden |
|----------|----------|-----------|
| Integrity hashing | SHA-256, SHA-3 | MD5, SHA-1 |
| Symmetric encryption | AES-256-GCM | DES, 3DES, AES-ECB |
| TLS | TLS 1.2+ | SSLv2/3, TLS 1.0/1.1 |

#### Communication Security (release pipeline)
- NPM publish uses TOTP-based authentication (see `scripts/npm-release-with-totp.mjs`)
- `NPM_TOKEN` and `NPM_TOTP_DEVICE` secrets are managed in the GitHub `npm-publish` environment — never log or expose them
- Do not modify the publish script to bypass TOTP verification

#### CodeQL
- This repo runs CodeQL scanning on every push and PR (see `.github/workflows/codeql.yaml`)
- Do not suppress CodeQL findings without security team review

---

### When to Stop and Escalate

Stop, explain the concern, and recommend involving Security if a task requires:

- Bypassing or weakening security controls
- Exposing customer data or PII
- Circumventing the npm publish authentication
- Disabling CodeQL scanning or other security checks
- Using deprecated protocols or algorithms
- Adding dependencies with known unpatched CVEs

---

### Security Testing

When generating features, include:

- Negative test cases for invalid/unexpected inputs
- Boundary condition tests and error path coverage
- Checks that error boundaries do not leak sensitive error details to end users

---

### References

- [Minimum Baseline Security Standard](https://docs.google.com/document/d/17GZ9TpjKCt6WCdw3yxL44Ra_YscbOBVnVkUVGgx5Hz0/)
- [Cryptography Standards](https://techmenu.zende.sk/standards/cryptography-standards/)
- [Unified JWT Standard](https://techmenu.zende.sk/standards/unified-jwt/)

---

## Reporting a Vulnerability

Please report security vulnerabilities by e-mailing: security@zendesk.com

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |

---

**Questions?** Reach out to the Security team or file a ticket via the Security Engagement process.
