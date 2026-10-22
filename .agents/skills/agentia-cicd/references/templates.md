<!-- Agentia managed skill file: agentia setup skills -->

# CICD Job Templates Reference

Use this reference for Copado Job Template commands under `agentia cicd template ...`.

Prefer `agentia_template_*` MCP tools when available. Otherwise use the CLI and add `--json` when an agent will parse or reuse the result.

`cicd template` manages Job Template definitions through the CICD Gateway `/release/jobs/templates` APIs. It is not the same as:

- Release Data Templates (`agentia cicd data template …` — see [data.md](data.md))
- Copado JobExecution records (`agentia cicd job …` — see [jobs.md](jobs.md))
- Copado Functions (`agentia cicd function …` — see [functions.md](functions.md))

There is no Job Template `run` command on the gateway. To execute jobs, use JobExecution commands after a template is already attached to a job flow elsewhere in Copado.

## Operating Rules

- Confirm CICD auth before any command.
- Use Job Template API names returned by Copado (`[A-Za-z0-9_-]` only). Do not invent API names for get, upsert, or delete.
- Prefer reading `template get <api-name> --json` before upsert or delete.
- Upsert requires an explicit `steps` array (use `[]` to clear all steps). Partial flag-only upsert without `--file`, `--steps-file`, or the default disk file is rejected.
- Optional CLI disk I/O uses `copado/templates/{apiName}.metadata.json` with lowercase keys for legacy migration. MCP tools do not write disk files; pass structured JSON payloads.
- After every mutation, read the template back or list it by name.

## Choose A Workflow

| Intent | Workflow |
| --- | --- |
| Scaffold metadata without persisting | Defaults |
| Find or inspect a Job Template | List And Get |
| Create or update a Job Template | Upsert |
| Persist retrieved JSON to disk | Get Or Defaults With Write |
| Remove a Job Template | Delete |

## Defaults

1. Run `template defaults --name <display-name> --json`.
2. Optional: `--api-name` to control the scaffolded API name.
3. Optional CLI disk write: `--write` (default path) or `--output <path>`.
4. Nothing is written to Salesforce until upsert.

```sh
agentia cicd template defaults --name MyTemplate --json
agentia cicd template defaults --name MyTemplate --api-name MyTemplate_1 --write
```

## List And Get

1. Discover candidates with `template list --json` (Custom only by default).
2. Use `--type all` when Standard templates must be included.
3. Filter with `--name`, pagination (`--cursor`, `--page-size`), or `--fetch-all` when needed (`--fetch-all` is incompatible with `--cursor` on the gateway).
4. Inspect one template with `template get <api-name> --json`.
5. Optional CLI disk write on get: `--write` or `--output <path>`.

```sh
agentia cicd template list --json
agentia cicd template list --type all --name Demo --fetch-all --json
agentia cicd template get MyTemplate_1 --json
agentia cicd template get MyTemplate_1 --write
```

## Upsert

1. Prepare steps and metadata:
   - default disk path `copado/templates/{apiName}.metadata.json`, or
   - `--file <path>`, or
   - `--steps-file` plus optional name/description flags.
2. Ensure the payload includes a `steps` array.
3. Run `template upsert <api-name> ... --json`.
4. Read back with `template get <api-name> --json`.

Wire format is camelCase (`apiName`, `customType`, `volumeOptions`). Disk files use lowercase keys (`apiname`, `customtype`, `volumeoptions`); reads accept either casing.

```sh
agentia cicd template upsert MyTemplate_1 --json
agentia cicd template upsert MyTemplate_1 --file ./copado/templates/MyTemplate_1.metadata.json --json
agentia cicd template upsert MyTemplate_1 --name "My Template" --steps-file ./steps.json --json
```

## Delete

1. Confirm the exact API name with `template get` or `template list`.
2. Confirm destructive intent with the user.
3. Run `template delete <api-name> --json`.

```sh
agentia cicd template delete MyTemplate_1 --json
```

## Commands

| Command | Use For | Notes |
| --- | --- | --- |
| `template defaults` | Scaffold defaults | Gateway GET; not persisted. Optional `--write` / `--output`. |
| `template list` | Find Job Templates | Default `--type custom`; name filter and pagination. |
| `template get API_NAME` | Inspect one template | Optional `--write` / `--output` for disk. |
| `template upsert API_NAME` | Create or update | Requires explicit `steps`; disk/`--file`/`--steps-file`. |
| `template delete API_NAME` | Delete a template | Destructive; confirm API name. |

## MCP Tools

| Tool | Maps To |
| --- | --- |
| `agentia_template_defaults` | `template defaults` |
| `agentia_template_list` | `template list` |
| `agentia_template_get` | `template get` |
| `agentia_template_upsert` | `template upsert` |
| `agentia_template_delete` | `template delete` |

MCP tools accept structured fields (for example `apiName`, `steps`) and do not perform legacy disk writes.

## Disk Format

Path: `copado/templates/{apiName}.metadata.json`

| Disk key | Gateway field |
| --- | --- |
| `apiname` | `apiName` |
| `customtype` (on steps) | `customType` |
| `volumeoptions` | `volumeOptions` |
| `name`, `type`, `version`, `description`, `steps` | same camelCase names |

Use disk files only when migrating from legacy `copado:beta:template:*` or when the user asks to keep local metadata in the repo.

## Gotchas

- Job Template API name and Job Template Salesforce Id are different. CLI/MCP identify templates by API name for get/upsert/delete.
- Do not confuse `cicd template` with `cicd data template`. Data templates use Salesforce template Ids and live under `/release/data-templates`.
- Upsert without `steps` fails validation before the gateway runs. Provide `[]` only when clearing all steps is intentional.
- `--fetch-all` cannot be combined with `--cursor`.
- Gateway dependency: `/release/jobs/templates` (nested under release jobs). Older `/templates` paths are obsolete.
