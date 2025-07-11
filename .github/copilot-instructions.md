## Test/Lint Commands

- Typecheck: `yarn test:types`
- Test: `yarn exec vitest`
- Run single test: `yarn exec vitest path/to/file.test.ts`

## Code Style

- TypeScript:
  - Strict mode
  - If a type exists, use it. Never use `any`, for external/unverified inputs use `unknown`.
  - `verbatimModuleSyntax: true`, use `import type` or `import { type X }` whenever possible
  - prefer `satisfies` if possible, avoid casting using `as`
