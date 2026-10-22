---
name: agentia
description: Use when working with Agentia or Copado CICD, Robotic Testing, AI, pipelines, user stories, commits, promotions, deployments, jobs, environments, credentials, or data templates.
---

<!-- Agentia managed skill file: agentia setup skills -->

# Agentia CLI

Use Agentia to manage Copado work items. Prefer registered Agentia MCP tools; otherwise use the CLI with `--json`.

Authentication must be configured before operational commands. Never print credentials, tokens, or unmasked environment variables.

## Copado workflow

`list → get → set → (implement & git commit) → test → publish → submit [--done|--deploy]`

Read records before changing them and use IDs returned by Copado. Do not skip `work set` before coding; use one story per feature branch. Keep the working tree clean for lifecycle commands, and confirm promotion/deployment intent before `done`.

## Agent Skills

Use the applicable installed domain skill for detailed instructions:

- `agentia-cicd`: Copado stories, commits, publish, submit, done, promotions, jobs, Functions, Job Templates, environments, pipelines, Slack notification configure, and data.
- `agentia-testing`: Copado Robotic Testing operations.
- `agentia-ai`: Copado AI operations.
- `agentia-adv`: advanced pipeline workflows.

Project-specific instructions take precedence over managed Agentia skills. Refresh managed skills with `agentia setup skills update`; do not hand-edit managed files.
