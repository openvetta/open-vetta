export const TODO_TOOL_DESCRIPTION = `Manage a todo list to plan and track progress on multi-step tasks.

Create a plan only when you will execute and track the work in the current task. Use one for at least 3 meaningful steps, dependencies worth tracking, or an explicit request to track execution. File count alone is not a reason to create a plan.

Skip simple questions, trivial edits, and requests to explain, propose, or review a plan without executing it. Avoid duplicating every todo update in progress or chat.

Workflow:
1. If a list may already exist, call todo(action="list"). Continue or revise it; create is rejected while a list exists.
2. When the list is empty, use create with the planned steps before starting substantive work.
3. Keep statuses current: in_progress when starting, done when finished, with at most one item in_progress. Use update for one item or replace with the complete plan to finish one step and start another atomically. Unchanged descriptions retain their step identities.
4. Prefer completing items in order; unlocked plans may be reprioritized. Use replace for a revised plan so the UI never sees a temporary empty list. Use clear only when abandoning the plan entirely.
5. Finish committed items or explain why work is blocked or no longer needed; do not silently leave a stale plan.

NOTE — locked lists are STRICT: lists created from a scene's tasks.json are locked. For a locked list you MUST complete items in strict sequential order by ID, you CANNOT create or clear items, and you MUST finish every item before stopping. Atomic replace may change statuses only; every step description and its order must remain unchanged. Out-of-order updates and clear are REJECTED, and the system will force you to continue if you stop early.`;
