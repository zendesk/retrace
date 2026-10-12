# retrace

`@zendesk/retrace` is a TypeScript library for defining and capturing Product Operation Traces with computed metrics. It provides a React beacon API (v3 `TraceManager`/`Tracer`/`useBeacon`) and a legacy React hooks API (v1 `generateTimingHooks`/`useTiming`). The primary use case is measuring Time-to-Interactive (TTI), Time-to-Render (TTR), and custom span-based metrics for frontend operations.

## Setup & Commands

```bash
# Install dependencies
yarn install --immutable

# Build (both CJS and ESM)
yarn build

# Run all checks (format + types + lint + code tests)
yarn test

# Run code tests only (vitest)
yarn test:code
# or:
yarn exec vitest

# Run a single test file
yarn exec vitest path/to/file.test.ts

# Typecheck only
yarn test:types

# Lint only
yarn test:lint

# Format check
yarn test:format

# Auto-format
yarn format

# Start Storybook dev server
yarn storybook
```

> Node version: see `.node-version`. Package manager: Yarn (see `.yarnrc.yml`).

## Code Conventions

### TypeScript
- Strict mode is enabled — never use `any`; use `unknown` for external/unverified inputs
- `verbatimModuleSyntax: true` — always use `import type` or `import { type X }` for type-only imports
- Prefer `satisfies` over type assertion (`as`) wherever possible
- Avoid casting; if a type exists, use it
- `noImplicitOverride`, `noImplicitReturns`, `noUncheckedIndexedAccess` are all enabled

### Style (Prettier)
- No semicolons
- Single quotes
- 2-space indent (no tabs)
- Trailing commas in multi-line structures
- Arrow function parens always

### General
- No default exports (except in config files like `webpack.config.ts`)
- Copyright header required in all source files (see any existing `.ts`/`.tsx` for the template)
- `sideEffects: false` — do not introduce side effects at module load time

## Testing

- Framework: Vitest (for `src/v3/` and `src/visualizer/`)
- V1 legacy tests use Jest patterns (see `jest.config.ts`)
- Test files: co-located in `src/`, named `*.test.ts` / `*.test.tsx`
- Type-level tests: `*.test-d.ts` (Vitest type-checking)
- Run only v3/visualizer tests: `yarn exec vitest` (matches `src/v3/**/*.test.ts` and `src/visualizer/**/*.test.ts`)
- Test utilities live in `src/v3/testUtility/`

## Do

- Use `import type` / `import { type X }` for every type-only import
- Use `satisfies` to validate shapes rather than casting with `as`
- Keep `src/main.ts` as the single public API surface — all exports must go through it
- Write co-located tests alongside source files
- Use the ASCII timeline serializer (`src/v3/testUtility/asciiTimelineSerializer.ts`) for trace snapshot tests
- Use RxJS `Subject` for event emission inside `TraceManager` — the pattern is established
- Mark new spans via `traceManager.processSpan(...)` or the beacon hooks — do not bypass `TraceManager`
- Prefer functional/procedural design; keep data and behavior separate

## Don't

- Don't use `any` — use `unknown` and narrow with type guards
- Don't use bare type assertions (`as Foo`) when `satisfies` or narrowing is possible
- Don't omit `import type` for type-only imports (breaks `verbatimModuleSyntax`)
- Don't add side effects at module level — the package is marked `"sideEffects": false`
- Don't export from `src/v3/` or `src/v1/` directly in consumer code — use the root `src/main.ts` exports
- Don't use tabs (ESLint `no-tabs` rule enforced)
- Don't hardcode span type strings inline — use the established constants and types in `src/v3/constants.ts` and `src/v3/spanTypes.ts`

## Architecture

See `ARCHITECTURE.md` for the system diagram, component map, v1 vs v3 API comparison, and design decisions.

## Security

See `SECURITY.md` for mandatory security requirements, prohibited patterns, and escalation triggers.

## Safety & Permissions

Allowed without approval:
- Read/list files
- Run single-file tests (`yarn exec vitest path/to/file.test.ts`)
- Run type checks and linters
- Run Storybook locally

Ask before:
- Installing or removing packages
- Running the full build or full test suite
- Modifying CI/CD workflows (`.github/workflows/`)
- Publishing or releasing

## PR & Commit Guidelines

- PR title format: `type: short description` (e.g., `feat: add draft trace support`, `fix: null guard in recursivelyRoundValues`, `chore: update dependencies`)
- Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`
- Uses semantic-release — commit messages drive versioning; follow [Conventional Commits](https://www.conventionalcommits.org/)
- `feat:` → minor bump, `fix:` → patch bump, `BREAKING CHANGE:` in footer → major bump
- Keep PRs focused; prefer small, reviewable changes

## References

- Architecture: `ARCHITECTURE.md`
- Security: `SECURITY.md`
- v3 model overview: `src/v3/docs/model-overview.md`
- v1 usage guide: `src/v1/README.md`
- v3 trace design notes: `src/v3/README.md`
- Storybook examples: `src/stories/`
