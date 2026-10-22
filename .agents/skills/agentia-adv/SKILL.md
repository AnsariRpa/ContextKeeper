---
name: agentia-adv
description: Use this skill when working with Copado Pipelines Advanced through the Agentia CLI or MCP, including PAT auth via auth set --adv, organizations, deployments, components, and deployment jobs. Use it for experimental ADV workflows separate from standard CICD pipeline commands.
---

<!-- Agentia managed skill file: agentia setup skills -->

# Agentia Pipelines Advanced Skill

Use this skill when working with Copado Pipelines Advanced through the Agentia CLI.

## Commands

- Configure global authentication with `agentia auth set --adv <PAT>`, or add `--local` for current-project/current-user scope. Both store the PAT in the keychain and auto-discover the Pipelines Advanced endpoint unless `--adv-base-url` is supplied.
- Use `agentia adv organization list|get|validate` to inspect accessible organizations and verify connectivity.
- Use `agentia adv deployment list|get|create|options|validate|deploy|quick-deploy|cancel` to define deployments, update options, and run or stop deployments.
- Use `agentia adv component types|list|refresh|selected|add|remove` to discover metadata types and manage selected deployment components.
- Use `agentia adv job get|list|wait` to inspect and poll deployment runs.

## Safety

- Never pass PATs to `agentia adv ...` commands. Use `agentia auth set --adv` or project-scoped auth.
- Prefer `--json` for automation and agents.
- For component JSON files, use `--json-file`; `--json` remains the standard Agentia output flag.
- In JSON or non-interactive CLI runs, deploy, quick deploy, cancel, and auth removal require `--yes`. The matching MCP deployment mutations require `confirm: true`; validation does not.
- Treat a nonzero exit from a waited run as failure. JSON errors retain the command transaction ID and failed waited runs include `error.result.job`.

See [references/pipelines-advanced.md](references/pipelines-advanced.md) for command flows and examples.
