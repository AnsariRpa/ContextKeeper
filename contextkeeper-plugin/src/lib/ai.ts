import type { Handover } from "./storage.js";

/** Default Ollama endpoint. Hard-coded so no environment value is ever sent. */
export const OLLAMA_BASE_URL = "http://localhost:11434";

/** Default model requested by the product requirements. */
export const DEFAULT_AI_MODEL = "qwen2.5:3b";

/** Provider name recorded in provenance. */
export const DEFAULT_AI_PROVIDER = "ollama";

/** Abort Ollama requests that take longer than this. */
export const DEFAULT_AI_TIMEOUT_MS = 10000;

export type HandoverSummaryInput = {
  title?: string;
  task: string;
  completed?: string;
  decisions?: string;
  blockers?: string;
  nextSteps?: string;
  gitContext?: string;
};

export type AiSummaryResult = {
  summary: string;
  provider: string;
  model: string;
  timestamp: string;
};

export type GenerateSummaryOptions = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

function buildPrompt(input: HandoverSummaryInput): string {
  const lines = [
    "You are helping a developer resume work from a structured handover.",
    "Write a concise, actionable summary (no more than 120 words) covering:",
    "1. Current state",
    "2. Key decisions",
    "3. Blockers and risks",
    "4. Next actions",
    "",
    `Title: ${input.title ?? "(untitled)"}`,
    `Task: ${input.task ?? ""}`,
    `Completed work: ${input.completed ?? "Not specified"}`,
    `Decisions: ${input.decisions ?? "None recorded"}`,
    `Blockers: ${input.blockers ?? "None recorded"}`,
    `Next steps: ${input.nextSteps ?? "Not specified"}`,
  ];

  if (input.gitContext && input.gitContext.trim() !== "") {
    lines.push("", "Git context:", input.gitContext.trim());
  }

  lines.push(
    "",
    "Return only the summary text. Do not include secrets or environment variables.",
  );

  return lines.join("\n");
}

function extractSummary(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.response === "string") return record.response.trim();
    if (record.message && typeof record.message === "object") {
      const message = record.message as Record<string, unknown>;
      if (typeof message.content === "string") return message.content.trim();
    }
    if (typeof record.content === "string") return record.content.trim();
    if (typeof record.summary === "string") return record.summary.trim();
    if (typeof record.text === "string") return record.text.trim();
  }
  return "";
}

export async function generateHandoverSummary(
  input: HandoverSummaryInput & Record<string, unknown>,
  options: GenerateSummaryOptions = {},
): Promise<AiSummaryResult> {
  const normalized: HandoverSummaryInput = {
    title:
      typeof input.title === "string" ? input.title : undefined,
    task: String(
      input.task ?? input.currentTask ?? input.objective ?? input.currentTaskDescription ?? "",
    ),
    completed: (input.completed ??
      input.completedWork ??
      input.completedWorkSoFar) as string | undefined,
    decisions: (input.decisions ?? input.keyDecisions) as string | undefined,
    blockers: (input.blockers ?? input.risks) as string | undefined,
    nextSteps: (input.nextSteps ?? input.next ?? input.nextActions) as
      | string
      | undefined,
    gitContext: (input.gitContext ?? input.git ?? input.gitDevelopmentContext) as
      | string
      | undefined,
  };

  const baseUrl = options.baseUrl ?? OLLAMA_BASE_URL;
  const model = options.model ?? DEFAULT_AI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch is not available in this runtime");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(normalized),
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Ollama is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Ollama request failed with HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      `Ollama returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const summary = extractSummary(data);
  if (summary === "") {
    throw new Error("Ollama returned an invalid or empty summary");
  }

  return {
    summary,
    provider: DEFAULT_AI_PROVIDER,
    model,
    timestamp: new Date().toISOString(),
  };
}


export default generateHandoverSummary;

export type { Handover };
