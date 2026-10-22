<!-- Agentia managed skill file: agentia setup skills -->

# CICD Notifications Reference

Use this reference for `agentia cicd notification configure` and `agentia cicd notification get`.

Prefer `agentia_notification_configure` and `agentia_notification_get` when Agentia MCP is available. Otherwise use the CLI commands and add `--json` when an agent will parse or reuse the result.

Notifications are Slack-only (`providers: ["slack"]`). **Configure** creates or updates one subscription for the **current Copado user** on a **pipeline** for a chosen **event**. **Get** reads the authenticated user's stored subscriptions for that pipeline (sanitized; no raw system-property metadata).

## Workflow

1. Confirm CICD auth with `agentia auth get --cicd --json` (or process overrides). Never log API keys.
2. Resolve the pipeline Salesforce Id with `agentia cicd pipeline list` and/or `agentia cicd pipeline get <pipeline-id> --json`. See [pipelines.md](pipelines.md).
3. **Read** existing subscriptions with `agentia_notification_get` (MCP) or `notification get -p <pipeline-id>` (CLI), optionally with `--json`.
4. **Write** one subscription with `agentia_notification_configure` (MCP) or `notification configure` (CLI) with all required fields/flags.
5. Report `result.pipelineId`, subscription fields, and `result.subscription` / table rows (no secrets in output).

## Commands

| Command | Use For | Notes |
| --- | --- | --- |
| `notification get` | List the current user's Slack subscriptions on a pipeline | Requires `--pipeline-id` / `-p` only. |
| `notification configure` | Subscribe the current user to a Slack destination for one pipeline event | All configure flags below are required. |

## `notification get` flags

| Flag | Values | Notes |
| --- | --- | --- |
| `--pipeline-id` / `-p` | 15- or 18-character Salesforce Id | Same validation as configure. |

JSON `result`: `{ pipelineId, subscriptions[] }` where each subscription has `event`, `providers`, `destinationType`, `destinationId`, and `subscription`. Empty subscriptions print a clear human message and exit 0.

## `notification configure` required flags

| Flag | Values | Notes |
| --- | --- | --- |
| `--pipeline-id` / `-p` | 15- or 18-character Salesforce Id | Letters, digits, underscores only. Read from `pipeline list` / `pipeline get`. |
| `--event` | See event list below | Quote values that contain spaces (e.g. `"Test_Not Started"`). |
| `--destination-type` | `user` \| `channel` | Slack destination kind. |
| `--destination-id` | Slack user or channel id or name | Examples: `U0123ABCD`, `C0123ABCD`, `@jane`, `#alerts`. Cannot be empty or whitespace-only. |
| `--subscription` | `user` \| `all` | Who receives this notification for the event on the pipeline. |

## Notification Events

`Promotion_Success`, `Promotion_Failed`, `Promotion_Conflict`, `Failed_Promotion_Creation`, `Deploy_Success`, `Deploy_Failed`, `Commit_Failed`, `Successful_Snapshot`, `Failed_Snapshot`, `ManualTask_Assigned`, `Test_Success`, `Test_Failed`, `Test_Cancelled`, `Test_Not Started`, `Quality_Gate_Success`, `Quality_Gate_Failed`, `Quality_Gate_Cancelled`, `Quality_Gate_Not Started`, `Create_Package_Success`, `Create_Package_Failure`, `Generate_Package_Version_Success`, `Generate_Package_Version_Failure`, `Import_Package_Success`, `Import_Package_Failure`, `Publish_Package_Success`, `Publish_Package_Failure`.

## Examples

```sh
agentia cicd pipeline get <pipeline-id> --json
agentia cicd notification get -p <pipeline-id> --json
# MCP: agentia_notification_get with pipelineId
agentia cicd notification configure --pipeline-id <pipeline-id> --event Promotion_Failed --destination-type user --destination-id U0123ABCD --subscription user --json
agentia cicd notification configure -p <pipeline-id> --event Commit_Failed --destination-type channel --destination-id C0123ABCD --subscription all --json
agentia cicd notification configure --pipeline-id <pipeline-id> --event "Test_Not Started" --destination-type user --destination-id @jane --subscription user --json
```

## JSON Result

With `--json`, stdout is structured data only (no spinner or human summary). Configure echoes the configured subscription in `result`, including `providers: ["slack"]`. Get returns `result.pipelineId` and `result.subscriptions`.

## Errors And Validation

| Situation | What to do |
| --- | --- |
| Invalid or empty `--pipeline-id` | Fix before the gateway runs; use a valid 15- or 18-character pipeline Id from Copado. |
| Current user ID unavailable (get) | Ensure CICD auth is configured; the command exits before querying system properties. |
| Empty `--destination-id` (configure) | Provide a non-empty Slack user or channel identifier. |
| `NTF-003` | Slack destination does not match `--destination-type`; recheck `destination-id` and `destination-type`. |
| `NTF-004` | Pipeline id rejected upstream; re-read `pipeline get` and retry with the correct Id. |
| Other gateway errors | Surface the message without inventing alternate APIs or leaking credentials. |

## Gotchas

- Pipeline notification setup is separate from `agentia auth set --cicd` (CLI API key) and from `cicd credential` (Salesforce org credentials on environments).
- `destination-type user` with `subscription user` is the usual personal alert pattern; `subscription all` widens audience for the event on that pipeline.
- Event names with spaces must be quoted in the shell.
- Get reads pipeline-scoped system properties for the authenticated user only; there is no cross-user list command.
