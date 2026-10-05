export const PROGRESS_TOOL_DESCRIPTION = `Announce meaningful stages of multi-step work. This is presentation metadata only; it does not execute work or report evidence.

Use it when several substantive tool calls or distinct phases benefit from visible milestones, regardless of the user's technical level. Skip it for a single trivial lookup, a brief conversational answer, or a task with no tool calls.

- For qualifying work, call progress(label="…") before the first work tool.
- \`summary\` closes and re-titles the previous stage; \`label\` opens the next one. Subsequent tool calls belong to that stage until it closes.
- Open a new stage only when the work's purpose meaningfully changes. Do not create a stage per tool call or mirror every todo status change.
- Write short titles in the user's language, under 40 characters: \`label\` says what you are doing; \`summary\` says what was achieved. Describe the user's goal, not tool names; do not number stages or repeat titles.
- Do not repeat the same update in chat. Reserve prose updates for useful findings, blockers, or decisions the user needs to make.
- Before a tool produces a user-facing artifact or attachment, close the current stage with \`summary\` only so the deliverable remains visible. Open another stage only if more work remains.
- The final answer closes the last stage automatically. Do not add a trailing progress call.`;
