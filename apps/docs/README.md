# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Analytics

This site is the only surface in the monorepo that measures traffic, because it
is the only one nobody but the vendor deploys — `apps/web` deliberately carries
no analytics at all (see
[the lesson](../../docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md)).

Set **`DOCS_GTAG_ID`** to a GA4 measurement id (`G-…`) to enable it. Unset — the
default everywhere, including `npm run docs:dev` — the build loads no script.

It is a **build input**, not deploy configuration: a static site resolves
`process.env` while it builds. On Railway that means the variable has to reach
the Dockerfile build, which happens only through the `ARG DOCS_GTAG_ID` this
image declares, and a value changed in Railway takes effect on the next build,
not the next deploy.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

### Generating OpenAPI Definitions from Postman Collections

To convert a Postman collection to OpenAPI specification:

```
$ yarn postman-to-openapi <input-collection> -f <output-yaml>
```

Example:
```
$ yarn postman-to-openapi ./postman-collections/example-crud.json -f ./examples/ragen.yaml
```

This command converts a Postman collection JSON file into an OpenAPI specification YAML file that can be used with the API documentation.

***This operation will not generate the API documentation, it will only generate the OpenAPI definition.***

### Generating OpenAPI Docs

To generate the API documentation from the OpenAPI definition:

```
$ yarn gen-api-docs <api-id>
```

Example:
```
$ yarn gen-api-docs ragen
```

This command generates API documentation from the OpenAPI specification defined in `docusaurus.config.ts`. The `ragen` parameter refers to the API ID configured in the plugin options:

- Input: `examples/ragen.yaml` (specPath)
- Output: `docs/ragen` (outputDir)
- API Label: "Ragen API"

To clean the generated API documentation:
```
$ yarn clean-api-docs ragen
```

**Note:** Make sure to run `yarn gen-api-docs` after any changes to your OpenAPI specification file to update the documentation.
