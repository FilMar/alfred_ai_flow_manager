import {
  AlfredDatabase,
  MemberStats,
  DebateStats,
  DebateSummary,
} from "./AlfredDatabase.js";

/**
 * Generate a Markdown report for a single debate (like the old thread.md).
 * Includes performance metrics for each contribution.
 */
export function generateDebateReport(
  db: AlfredDatabase,
  debateId: string,
  includePerformance = true,
): string {
  const metadata = db.getDebateMetadata(debateId);
  if (!metadata) {
    return `# Debate Not Found\n\nDebate '${debateId}' not found in database.`;
  }

  const entries = db.getDebateEntries(debateId);

  // Header
  let report = `# Debate: ${metadata.id}\n\n`;
  report += `**Team:** ${metadata.team} | **Sequence:** ${metadata.sequence}\n\n`;
  report += `**Request:** ${metadata.request_prompt}\n\n`;
  report += `**Created:** ${metadata.created_at}\n`;
  if (metadata.closed_at) {
    report += `**Closed:** ${metadata.closed_at}\n`;
  }
  report += `\n---\n\n`;

  // Thread entries
  for (const entry of entries) {
    const ts = entry.timestamp.slice(0, 16); // Truncate timestamp
    report += `## ${entry.author} — ${ts}\n\n`;
    report += entry.content + "\n\n";

    if (includePerformance && entry.duration_ms !== null) {
      report += `_Performance: ${entry.duration_ms}ms`;
      if (entry.error_message) {
        report += ` | Error: ${entry.error_message}`;
      }
      report += `_\n\n`;
    }

    report += `---\n\n`;
  }

  return report;
}

/**
 * Generate a performance summary for a debate.
 */
export function generatePerformanceReport(db: AlfredDatabase, debateId: string): string {
  const metadata = db.getDebateMetadata(debateId);
  if (!metadata) {
    return `# Performance Report Not Found\n\nDebate '${debateId}' not found.`;
  }

  const stats = db.getDebateStats(debateId);
  const memberStats = db.getMemberStats(debateId);

  let report = `# Performance Report: ${metadata.id}\n\n`;

  // Aggregate stats
  report += `## Aggregate Statistics\n\n`;
  report += `- **Total Entries:** ${stats.total_entries}\n`;
  report += `- **Total Duration:** ${stats.total_duration_ms ?? "N/A"}ms\n`;
  report += `- **Average Duration:** ${stats.avg_duration_ms ?? "N/A"}ms\n`;
  report += `- **Error Count:** ${stats.error_count}\n\n`;

  // Per-member stats
  report += `## Member Statistics\n\n`;
  report += `| Member | Turns | Avg Duration | Errors |\n`;
  report += `|--------|-------|--------------|--------|\n`;

  for (const member of memberStats) {
    report += `| ${member.author} | ${member.turns} | ${member.avg_duration_ms ?? "N/A"}ms | ${member.error_count} |\n`;
  }

  return report;
}

/**
 * Generate a team summary report listing all debates and their stats.
 */
export function generateTeamSummary(db: AlfredDatabase, teamName: string, limit = 50): string {
  const debates = db.getTeamDebates(teamName, limit);

  let report = `# Team Summary: ${teamName}\n\n`;
  report += `## Debates (${debates.length} total)\n\n`;

  if (debates.length === 0) {
    return report;
  }

  report += `| ID | Sequence | Entries | Duration | Created |\n`;
  report += `|---|----------|---------|----------|----------|\n`;

  for (const debate of debates) {
    const created = debate.created_at.slice(0, 10);
    report += `| ${debate.id} | ${debate.sequence} | ${debate.entry_count} | ${debate.total_duration_ms ?? "N/A"}ms | ${created} |\n`;
  }

  return report;
}

/**
 * Export a debate as JSON (like the old debate.json, but reconstructed from DB).
 */
export function exportDebateAsJSON(db: AlfredDatabase, debateId: string): object {
  const metadata = db.getDebateMetadata(debateId);
  if (!metadata) {
    throw new Error(`Debate '${debateId}' not found`);
  }

  const entries = db.getDebateEntries(debateId);
  const stats = db.getDebateStats(debateId);

  return {
    id: metadata.id,
    sequence: metadata.sequence,
    team: metadata.team,
    flow: JSON.parse(metadata.flow),
    request: {
      title: metadata.request_title,
      prompt: metadata.request_prompt,
    },
    createdAt: metadata.created_at,
    closedAt: metadata.closed_at,
    stats: {
      contributions: stats.total_entries,
      duration_ms: stats.total_duration_ms,
      avg_duration_ms: stats.avg_duration_ms,
      error_count: stats.error_count,
    },
    // Include entries (unlike old format which had them in thread.md)
    thread: entries.map((e) => ({
      author: e.author,
      timestamp: e.timestamp,
      content: e.content,
      performance: e.duration_ms !== null ? {
        duration_ms: e.duration_ms,
        exit_code: e.exit_code,
        error: e.error_message,
      } : null,
    })),
  };
}