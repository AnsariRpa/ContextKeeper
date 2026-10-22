# ContextKeeper
### AI-Powered Development Handover Assistant for Copado Agentia CLI

ContextKeeper helps developers preserve development context between work sessions. It combines manually recorded task knowledge with automatically captured Git metadata, saves a structured handover locally, and exports it as Markdown.

## The Problem

When developers stop work and return later, they often have to reconstruct:
- What they were working on
- What they completed
- Why they made particular decisions
- What remains blocked
- What they should do next

Git history provides code activity, but it does not capture the developer's reasoning or next steps.

## The Solution

ContextKeeper provides a repeatable handover workflow through the Copado Agentia CLI.

A developer records the task, completed work, decisions, blockers, and next steps. ContextKeeper captures the current Git branch, working-tree status, and recent commits, then stores the combined handover locally and generates a Markdown report.

## Current Features

- **Capture:** Save a structured handover and capture Git metadata in one command.
- **List:** Display saved handovers and their IDs.
- **Resume:** Read a saved handover before continuing work.
- **Export:** Generate a Markdown report from a saved handover.
- **Git context:** Inspect the current branch, working-tree status, and recent commits.
- **Local storage:** Store handovers in `.contextkeeper/handovers.json`.

## Technology Stack

- TypeScript
- Node.js
- Copado Agentia CLI
- Copado Agentia Plugin SDK
- oclif command framework
- Git
- JSON and Markdown

## Prerequisites

- Node.js 22.12 or later
- npm
- Git
- Copado Agentia CLI installed and configured sufficiently to run local plugins

## Installation and Development

Clone the repository and enter the plugin directory:

```powershell
git clone https://github.com/AnsariRpa/ContextKeeper.git
cd ContextKeeper/contextkeeper-plugin
```

Install dependencies and build:

```powershell
npm install
npm run build
agentia plugins link .
```

The plugin is linked into the local Agentia CLI. Run the commands from your Git project directory so the Git context and `.contextkeeper` data correspond to that project.

## Usage

### 1. Capture a handover

```powershell
agentia contextkeeper capture --title "API integration" --task "Integrate the customer API" --completed "Created request and response models" --decisions "Use the existing HTTP client" --blockers "Waiting for test credentials" --next "Add error handling and integration tests"
```

The command prints the generated handover ID and Markdown export path.

### 2. List handovers

```powershell
agentia contextkeeper list
```

### 3. Resume a session

Replace `YOUR_ID` with the ID printed by the capture command:

```powershell
agentia contextkeeper resume YOUR_ID
```

### 4. Export a handover

```powershell
agentia contextkeeper export YOUR_ID
```

### 5. Inspect Git context separately

```powershell
agentia contextkeeper git-context
```

## Generated Files

Runtime data is stored in the current working directory:

```text
.contextkeeper/
├── handovers.json
└── exports/
    └── <handover-id>.md
```

This directory is local runtime data and should not be committed to version control.

## Architecture

```text
Developer
   |
   v
Agentia CLI
   |
   v
ContextKeeper commands
   |
   +---- Git metadata collection
   |
   +---- Structured handover creation
   |
   +---- Local JSON storage
   |
   +---- Markdown export
```

## Current Limitations

- Task details, decisions, blockers, and next steps are entered by the developer.
- Git context is collected automatically, but code changes are not semantically summarized by an AI model.
- Data is stored locally; cross-device synchronization is not implemented.
- The current workflow assumes commands are run from the intended project directory.
- Agentia integration currently uses the CLI plugin and command framework; this version does not claim a live Salesforce or Copado org integration.

## Roadmap

- Improve project-root discovery and runtime data handling.
- Add validation and automated tests.
- Improve error handling and handover search.
- Explore an Agentia-powered summarization workflow supported by available integrations.
- Prepare a reproducible end-to-end hackathon demonstration.

## Hackathon Project

Built for the Copado Agentia Headless Virtual Hackathon.

**Repository:** https://github.com/AnsariRpa/ContextKeeper

## License

MIT
