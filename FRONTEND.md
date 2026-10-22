# Aggie Front End Development

Aggie's codebase is built on pretty old legacy code (in 2024 terms). be careful when pulling from tutorials as they may not work for our stack. the best way is to directly read documentation for the versions we are using.

The primary limitation is that the React SPA is built using `react-scripts`, an old, abandoned project. this limits our react version to 17 and typescript to 4.5.

**i've included docs specific to our versions. make sure you are reading the right docs as the latest versions work quite different from ours**

- [React 17](https://17.reactjs.org/)
- [Tanstack Query v4](https://tanstack.com/query/v4/docs/framework/react/overview)
- [Typescript v4.5](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-5.html)
- [Tailwind v3](https://tailwindcss.com/docs/installation)
- [headless-ui v1.7](https://headlessui.com/v1)
- axios 1.77

### file structure

The general rule of thumb is that folders define _scope_. Place files as near as they can be to where those files are called.

eg. the file `useReportsMutations.ts` exists in `/pages/Reports/`, as it's only used within that folder even though its not a page component.

```
./
├── src/
│   ├── api/
│   │   └── api name/
│   │       ├── /index.ts -> axios endpoints to backend
│   │       └── /types.ts -> type definitions for endpoint responses
│   ├── components/
│   │   └── global components
│   ├── fonts/ -> here instead of /public due to annoying react-scripts limitation
│   ├── hooks/
│   ├── pages/ -> file structure should match router structure
│   ├── utils/ -> pure ts utility functions
│   ├── app.tsx -> router logic and session check logic
│   ├── index.tsx -> react entry file
│   ├── /objectTypes.d.ts -> [LEGACY] old type definition file.
│   └── /helpers.tsx -> [LEGACY] old helpers file.
├── /public -> static files
├── tailwind.config.js
├── package.json
└── .env
```

### notes

as this is legacy code, there are many outdated / unused / irrelevent code. To insure nothing breaks, make sure to keep a copy of the old code. if names conflict, rename the old file with `_old`, or `_untyped`. We will eventually do cleanup during downtime.

### API

We do things super old school. investigate the backend to figure out the expected query and response.

```typescript
//
interface SetPublicParams extends Selected {
  public: boolean;
}
export const setSelectedPublic = async (params: SetPublicParams) => {
  const { data } = await axios.patch("/api/group/_public", {
    ids: params.ids,
    public: params.public,
  });
  return data;
};
```
