---
name: contextkeeper-handover
description: Preserve and restore development session context using the ContextKeeper Agentia CLI plugin. Use when starting or ending a coding session, switching tasks, or handing work to another developer.
---

# ContextKeeper Development Handover

## Purpose

Help developers stop and resume work without losing task context. Use ContextKeeper to save explicit human knowledge together with automatically captured Git metadata.

## Starting a session

1. Run `agentia contextkeeper list`.
2. If a relevant handover exists, ask the developer which handover to resume if the choice is ambiguous.
3. Run `agentia contextkeeper resume <ID>` for the selected handover.
4. Review its task, completed work, decisions, blockers, and next steps.
5. Run `agentia contextkeeper git-context` to inspect the current branch, working-tree changes, and recent commits.
6. Compare the saved handover with current Git state. Do not assume the repository has remained unchanged since the handover was created.

## Ending a session

1. Summarize what actually changed during the session.
2. Ask the developer to confirm important decisions, blockers, and next steps when they are not explicit.
3. Do not claim work is complete merely because a file was edited. Use test results or other available evidence.
4. Run `agentia contextkeeper capture` with:
   - `--title`: concise handover title
   - `--task`: current objective
   - `--completed`: work completed and verified
   - `--decisions`: important decisions and rationale
   - `--blockers`: unresolved issues, or "None"
   - `--next`: actionable next steps
5. Show the generated handover ID and Markdown export path to the developer.

Example:

`agentia contextkeeper capture --title "API integration" --task "Integrate customer API" --completed "Added request models; tests not run" --decisions "Reuse existing HTTP client" --blockers "Waiting for test credentials" --next "Add error handling and run integration tests"`

## Accuracy and safety

- Never invent completed work, decisions, test results, or blockers.
- Distinguish observed Git facts from developer-provided explanations.
- Never include passwords, tokens, credentials, or other secrets in a handover.
- Do not commit, push, deploy, promote, or delete files unless the developer explicitly asks.
- Do not overwrite or delete an existing handover as a routine cleanup step.
- If a command fails, report the actual error rather than claiming success.
- Remember that handovers are local to the working directory used by the current ContextKeeper implementation.
