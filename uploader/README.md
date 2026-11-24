# Next.js template

This is a Next.js template with shadcn/ui.

## Node.js

Use Node.js 22.23.5 or a newer Node 22 patch release. Run `nvm install` and
`nvm use` from this directory to use the version in `.nvmrc`. The Docker build
uses the same patched Node.js version in every stage.

The scoped `minimatch` override fixes GHSA-g3hv-75wg-m249 in shadcn's
`@ts-morph/common` dependency. Remove it once shadcn's dependency tree requires
`minimatch` 11.0.1 or newer without an override.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
