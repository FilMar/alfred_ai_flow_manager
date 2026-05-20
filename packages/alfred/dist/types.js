// ─── Hats ────────────────────────────────────────────────────────────────────
export const HAT_IDS = ["white-core", "red-core", "black-core", "yellow-core", "green-core", "blue-core"];
const VALID_TEAM_NAME_REGEX = /^[a-z0-9_.-]+$/;
export function validateTeamName(name) {
    if (typeof name !== "string" || !VALID_TEAM_NAME_REGEX.test(name)) {
        throw new Error(`Invalid team name: "${name}". Use lowercase letters, digits, underscore, dot, or dash.`);
    }
    return name;
}
// ─── Tools ───────────────────────────────────────────────────────────────────
export const TOOL_IDS = ["read", "write", "edit", "bash", "grep", "find", "web_search", "web_fetch"];
