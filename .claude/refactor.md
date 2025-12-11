Patterns
Directory Structure & File Naming


Directory & File Structure Rules
The most important part of structuring your directory, and naming files, is consistency. There is no "right way" to do either, but whatever way you choose to do it should be consistent and easy to understand. What I present below is my personal preferences, with the rationale on how I arrived to the conclusion that this is the optimal way to approach it.

├── app/
│   ├── _components/
│   │   ├── component-1.tsx
│   │   ├── component-n.tsx
│   │   └── __tests__/
│   │       └── ...
│   ├── (auth)/
│   │   ├── _schemas/
│   │   │   └── auth-schemas.ts
│   │   ├── signin/
│   │   │   ├── page.tsx
│   │   │   └── __tests__/
│   │   │       └── ...
│   │   └── signup/
│   │       ├── page.tsx
│   │       └── __tests__/
│   │           └── ...
│   ├── [feature]/
│   │   ├── _components/
│   │   │   ├── component-1.tsx
│   │   │   ├── component-n.tsx
│   │   │   └── __tests__/
│   │   │       └── ...
│   │   ├── _constants/
│   │   │   ├── feature-constants.ts
│   │   │   ├── feature-enums.ts
│   │   │   └── __tests__/
│   │   │       └── ...
│   │   ├── _utils/
│   │   │   ├── feature-utils.ts
│   │   │   └── __tests__/
│   │   │       └── ...
│   │   ├── page.tsx
│   │   └── __tests__/
│   │       └── ...
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── middleware.ts
│   ├── not-found.tsx
│   └── page.tsx
├── components/
│   └── ui/
│       ├── button.tsx
│       ├── input.tsx
│       └── __tests__/
│           └── ...
├── db/
│   ├── db.ts
│   ├── db-schema.ts
│   ├── enums.ts
│   ├── relations.ts
│   └── migrations/
│       └── (migration files)
├── docs/
│   └── ...
├── errors/
│   ├── api-error.ts
│   └── __tests__/
│       └── ...
├── hooks/
│   ├── use-something.ts
│   ├── use-another-thing.ts
│   ├── use-example.ts
│   └── __tests__/
│       └── ...
├── lib/
│   ├── supabase/
│   │   ├── admin.ts
│   │   ├── client.ts
│   │   ├── constants.ts
│   │   ├── middleware.ts
│   │   ├── server.ts
│   │   └── __tests__/
│   │       └── ...
│   ├── utils/
│   │   ├── text-formatting-utils.ts
│   │   ├── number-formatting-utils.ts
│   │   ├── date-formatting-utils.ts
│   │   └── __tests__/
│   │       └── ...
│   └── utils.ts
├── models/
│   └── [model]/
│       ├── model-actions.ts
│       ├── model-enums.ts
│       ├── model-schemas.ts
│       ├── model-service.ts
│       ├── model-types.ts
│       └── __tests__/
│           └── ...
├── public/
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   ├── videos/
│   └── docs/
├── scripts/
│   └── (one-off scripts)
├── components.json
├── .*rc
├── *.config.*
├── jest.setup.ts
├── next-env.d.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
└── tsconfig.json
Below are the rules I follow to create modular, maintainable, and predictable codebases.

1. Use kebab-case for all file and folder names
Predictability in naming speeds up navigation and reduces errors. It also just looks nice.

2. Group related code by feature or route
Every route or feature folder should contain everything it needs: _components, _utils, _constants, page.tsx, and __tests__. Encapsulation ensures each feature can be developed, tested, and maintained in isolation.

3. Keep global UI primitives in components/ui
Any component reused broadly across the app belongs here. Components in components/ui should have generic names and no dependencies on specific business logic.

4. Use _components for feature-scoped components
Components that only exist to serve a specific feature or route live in that feature’s _components folder. They should rarely be imported outside of their parent feature. This guarantees boundaries between modules and helps prevent accidental dependencies between unrelated features. If they're crossing over features it should likely be in the components/ folder.

5. Colocate tests in __tests__ folders
Every folder that contains logic should also contain a __tests__ folder. Colocation makes it obvious what is tested and keeps tests from drifting out of sync. It also reduces friction when adding or updating tests.

6. Use models/ for domain logic
Each model lives in its own folder named after the model with model-actions.ts, model-service.ts, model-enums.ts, model-schemas.ts, and model-types.ts. This is great for organization, and helps with the searchability of a file.

7. Use db/ exclusively for database schema and migrations
Your db/ directory should only contain schema definitions, enums, relations, and migration files. Avoid placing application logic or model services here. This is most compatible for Drizzle ORM with Supabase, so it may look completely different for you depending on your usage patterns.

8. Organize static assets under public/ subfolders
Separate assets by type: images, icons, fonts, videos, docs. Clear asset organization prevents the public folder from becoming an unstructured dumping ground, making it easier to locate and clean up files over time.

9. Keep generic utilities in lib/utils
Only utilities that are broadly reusable and not tied to a specific feature should live in lib/utils. Examples include text-formatting-utils.ts, number-formatting-utils.ts, and date-formatting-utils.ts. This keeps your feature folders focused, your helpers discoverable, and prevents having an monstrous general util.ts file.

10. Use _utils for feature-specific helpers
If a utility only applies to a single feature or route, it belongs in _utils within that feature folder. Avoid importing these helpers outside their module. This practice reinforces modular design and helps avoid circular dependencies.

11. Be consistent everywhere
Every feature folder should look the same. Every model folder should follow the same conventions. Consistency reduces cognitive load, makes code easier to read, and prevents subtle bugs from divergent patterns.

Consistent Code Is Good For AI (My Hypothesis)
We know that AI is largely a function of pattern recognition. If we provide bad or average patterns, AI will generate code with those patterns and your code will only degrade over time. If we provide good patterns, AI can generate higher quality code that can be more scalable over time.

Home
Repository
Simplexity
Home
Repository
Simplexity
the repository