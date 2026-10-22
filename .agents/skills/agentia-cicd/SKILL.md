---
name: agentia-cicd
description: Use this skill when managing Copado CICD work with the Agentia CLI or Agentia MCP tools: user stories (including current/active story context), cloud commit/promote, work publish/submit/done, promotion runs and conflicts, job executions, Copado Functions, Job Templates, git-hosted CICD extensions, environments, credentials, pipelines, stages, Slack pipeline notification subscriptions, and release data templates. Use it whenever the user asks an agent to operate Copado CICD from a terminal, IDE, or headless workflow.
---

<!-- Agentia managed skill file: agentia setup skills -->

# Agentia CICD

Use this skill to operate Copado CICD through Agentia without guessing command order, IDs, or JSON fields.

Prefer Agentia MCP tools when they are available and match the task. Use CLI examples as the fallback, and add `--json` whenever the result will be parsed or reused.

## Start Here

1. Confirm `agentia auth get --cicd --json` is configured, or that the current process supplies `AGENTIA_CICD_API_KEY` and `AGENTIA_CICD_BASE_URL`.
2. Identify the domain below and read only the matching reference file.
3. Before mutating data, read the target record first with the matching `get`, `list`, or `status` command.
4. Never print credentials, PATs, OAuth signatures, or unmasked environment variables.

## References

- User stories, git commits, cloud commits, publish, submit, done, quality gates, and deployment steps: [references/work.md](references/work.md)
- Promotion lookup, run, resume, merge conflicts, and story-centric promotion: [references/promotions.md](references/promotions.md)
- Copado JobExecution lookup, actions, logs, and monitoring: [references/jobs.md](references/jobs.md)
- Copado Functions lifecycle, remote run/results, and local Docker run: [references/functions.md](references/functions.md)
- Git-hosted Copado CICD extensions (`cicd extension`, experimental): [references/extensions.md](references/extensions.md)
- Copado Job Templates (`cicd template`, not data templates): [references/templates.md](references/templates.md)
- Copado environments, environment credentials, and browser authentication: [references/environments-and-credentials.md](references/environments-and-credentials.md)
- Pipelines, environment connections, stages, and stage connections: [references/pipelines.md](references/pipelines.md)
- Slack notification subscriptions on a pipeline (`agentia_notification_configure` / CLI): [references/notifications.md](references/notifications.md)
- Release data templates, records, matching, sync, dataset files, and data commits: [references/data.md](references/data.md)

## General Rules

- When the user means the **current story**, **current user story**, **active story**, **story context**, or similar without giving an ID, resolve context first with `agentia cicd work get --json` (no positional story ID). Use the returned user story (`result`) for follow-up work—any fields the task needs (for example `id`, `name`, `title`, `status`, specs, pipeline or environment IDs), not only identifiers. If the command fails (for example no active work item from `work set`), report the CLI error to the user and stop; do not guess, list stories, or pick a substitute unless the user asks you to.
- Use Salesforce record IDs or generated names read from Copado. Do not invent story names, promotion IDs, job IDs, credential IDs, or pipeline IDs.
- Keep human output off stdout in JSON workflows. Prefer `--json`, then parse the result object.
- For local project work, keep the tracked working tree clean before commands that require it: `work set`, `work publish`, and `work submit`. If `work set` returns `status: "warning"`, show the message and do not assume a feature branch was created; branch keys are cleared and the work item id/name/title are still recorded in config.user.json.
- Treat `cicd job` as Copado CICD JobExecution. It is different from CRT `testing job`.
- Treat `cicd function` as Copado Function definitions and runs. It is different from JobExecution (`cicd job`) and Job Templates (`cicd template`).
- Treat `cicd extension` as experimental git-hosted packaging of Functions/Templates (plus optional `force-app`). It is different from per-asset `cicd function` / `cicd template` upserts.
- Treat `cicd template` as Copado Job Templates via `/release/jobs/templates`. It is different from Release Data Templates (`cicd data template`).
- Treat `cicd work test` as local quality gates (`--local` is the default). It is different from CRT `testing test run`.
- Treat `cicd work test apex` as the Apex test runner that local quality gates (`.agentia_quality_gates.*`) usually call. An empty `--apex-test-classes` list skips Salesforce CLI. It can also be invoked directly. It is different from CRT.
- Treat `auth` credentials as keychain/API credentials and `cicd credential` records as Copado environment credentials.

## Report Back

When you finish a CICD operation, report the command path used, target IDs or names, final status, whether JSON was used, and any remaining manual action. Do not include secrets.
