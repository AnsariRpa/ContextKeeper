<!-- Agentia managed skill file: agentia setup skills -->

# CICD Functions Reference

Use this reference for Copado Function commands under `agentia cicd function ...`.

Prefer `agentia_function_*` MCP tools when available. Otherwise use the CLI and add `--json` when an agent will parse or reuse the result.

`cicd function` manages Copado Function definitions and remote runs through the CICD gateway. It is not the same as `cicd job` (JobExecution), CRT `testing job`, or Job Templates (`cicd template`).

## Operating Rules

- Confirm CICD auth before gateway-backed commands (`defaults`, `list`, `get`, `upsert`, `delete`, `run`, `result …`).
- Use Function API names returned by Copado. Do not invent API names for delete or run.
- Prefer reading `function get <api-name> --json` before upsert or delete.
- `function run` starts a remote run and returns a result Id; it does not wait for completion.
- `function run-local` runs a script in Docker on the local machine. It does not call the CICD gateway and does not persist a Copado Function.
- Never pass secrets as `--parameter` values for `run` or `run-local`. Parameter values can appear in command results and Docker argv.

## Choose A Workflow

| Intent | Workflow |
| --- | --- |
| Scaffold metadata/script without persisting | Defaults |
| Find or inspect a Function | List And Get |
| Create or update a Function | Upsert |
| Execute a persisted Function remotely | Remote Run And Results |
| Validate a script in Docker without Copado | Local Docker Run |
| Remove a Function | Delete |

## Defaults

1. Run `function defaults --name <display-name> --json`.
2. Optional: set `--runtime` (`bash` default) and `--image-name` (`copado-function-core:v1` default).
3. Use the returned scaffold as a starting point for upsert. Nothing is written to Salesforce.

```sh
agentia cicd function defaults --name MyFunction --runtime python --json
```

## List And Get

1. Discover candidates with `function list --json` (Custom only by default).
2. Use `--type all` when Standard Functions must be included.
3. Filter with `--name`, `--image-name`, and `--size` when needed.
4. Inspect one Function with `function get <api-name> --json`.
5. Use `function open <function-id>` only for browser navigation (CLI-only; not an MCP tool).

```sh
agentia cicd function list --json
agentia cicd function list --type all --name MyFunction --json
agentia cicd function get myFunction --json
```

## Upsert

1. Read the current Function when updating an existing API name.
2. Choose one payload source:
   - `--file <function.json>` for a full JSON payload (cannot combine with individual payload flags), or
   - individual flags with script from `--script` or `--script-file`.
3. Optional: `--parameters-file` for a parameters array; also description, Apex class, callback, flow handler, timeout, image, size, type, and version.
4. Run `function upsert <api-name> ... --json`.
5. Read the Function back with `function get <api-name> --json`.

Defaults when using individual flags: display name = API name, runtime `bash`, image `copado-function-core:v1`, size `S`, type `Custom`, version `1`.

```sh
agentia cicd function upsert myFunction --name "My Function" --script-file ./functions/my-function.sh --runtime bash --json
agentia cicd function upsert myFunction --file ./function.json --json
```

## Remote Run And Results

1. Confirm the Function exists with `function get <api-name> --json`.
2. Start a run with `function run <api-name> --json`.
3. Pass repeatable `--parameter key=value` values when needed.
4. Optional: `--context-id` and `--deploy-first` when the user requests pre-run deployment or an execution context.
5. Capture `result.resultId` from JSON output.
6. Poll `function result get <result-id> --json` until status is terminal.
7. Fetch logs with `function result log get <result-id> [--type <log-type>] --json` when diagnosis is needed.

```sh
agentia cicd function run myFunction --parameter env=qa --json
agentia cicd function result get <result-id> --json
agentia cicd function result log get <result-id> --type stdout --json
```

## Local Docker Run

1. Ensure Docker is installed, running, and on `PATH`.
2. Provide a readable `.sh`, `.js`, or `.py` script.
3. Run `function run-local <script-path> --json`.
4. Override `--image` when the default Copado image cannot be pulled.
5. Optional: `--cwd`, `--runtime`, `--platform`, and repeatable `--parameter key=value`.
6. In JSON mode, inspect `.result.exitCode` (do not assume CLI process exit reflects the container).

```sh
agentia cicd function run-local ./functions/my-function.sh --cwd . --parameter ENV=dev --json
agentia cicd function run-local ./functions/my-function.py --runtime python --platform linux/amd64 --image my-registry/function-core:v1 --json
```

Local execution validates the script in a container only. It does not upsert, deploy, or invoke a persisted remote Function.

## Delete

1. Confirm the exact API name with `function get` or `function list`.
2. Confirm destructive intent with the user.
3. Run `function delete <api-name> --json`.

Deletion is immediate and has no confirmation prompt.

## Commands

| Command | Use For | Notes |
| --- | --- | --- |
| `function defaults` | Scaffold defaults | Gateway call; not persisted. |
| `function list` | Find Functions | Default `--type custom`; filters for name, image, size. |
| `function get API_NAME` | Inspect one Function | Read before upsert/delete/run. |
| `function upsert API_NAME` | Create or update | `--file` or script flags; script required without `--file`. |
| `function delete API_NAME` | Delete a Function | Destructive; confirm API name. |
| `function run API_NAME` | Start remote run | Returns result Id; does not wait. |
| `function result get RESULT_ID` | Poll run status | Caller-controlled polling. |
| `function result log get RESULT_ID` | Read run logs | Optional `--type` filter. |
| `function run-local SCRIPT` | Docker local run | No gateway; no Salesforce write. |
| `function open ID` | Open in browser | CLI-only. |

## MCP Tools

| Tool | Maps To |
| --- | --- |
| `agentia_function_defaults` | `function defaults` |
| `agentia_function_list` | `function list` |
| `agentia_function_get` | `function get` |
| `agentia_function_upsert` | `function upsert` |
| `agentia_function_delete` | `function delete` |
| `agentia_function_run` | `function run` |
| `agentia_function_result_get` | `function result get` |
| `agentia_function_result_log_get` | `function result log get` |
| `agentia_function_run_local` | `function run-local` |

MCP uses structured fields (for example `apiName`, `parameters` object) instead of CLI flag names.

## Gotchas

- Function API name, Function Salesforce Id, and Function result Id are different values. Use the Id type each command documents.
- `AGENTIA_USE_LOCAL_GATEWAY=true` redirects gateway-backed Function commands to a contributor local gateway. That is not the same as `run-local`.
- `function open` is CLI-only; MCP covers Function operations but not browser navigation.
- Do not use Function commands for Job Templates (`cicd template`), Release Data Templates (`cicd data template`), or CRT jobs (`agentia testing …`).
