/**
 * The command surface, as one table.
 *
 * Help output, the unknown-command error and the "not yet" message are all
 * derived from this — so a command cannot appear in help while the router
 * rejects it, or exist in the router while help stays silent about it.
 *
 * `planned` entries are listed deliberately. A CLI that says nothing about
 * `ragen plugin` invites the reader to conclude it works and did nothing;
 * one that names it, says it is not built and exits non-zero cannot be
 * misread, and scripts notice.
 */
export type CommandStatus = 'available' | 'planned';

export interface CommandSpec {
  name: string;
  /** One line, lower case, no full stop — rendered in a column in help. */
  summary: string;
  status: CommandStatus;
  /** Planned commands only: what has to exist before this can. */
  blockedBy?: string;
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'create',
    summary: 'scaffold a self-hosted Ragen installation',
    status: 'available',
  },
  {
    name: 'brain',
    summary: 'curated knowledge: next, doctor, graph, query, export',
    status: 'available',
  },
  {
    name: 'kb',
    summary: 'knowledge base files: ls, upload, status, rm',
    status: 'available',
  },
  {
    name: 'search',
    summary: 'the passages chat would answer from, without an answer',
    status: 'available',
  },
  {
    name: 'ask',
    summary: 'ask the knowledge base, as chat does, streamed',
    status: 'available',
  },
  {
    name: 'assistants',
    summary: 'list the assistants a key can see',
    status: 'available',
  },
  {
    name: 'login',
    summary: 'check an API key and save it with the API address',
    status: 'available',
  },
  {
    name: 'logout',
    summary: 'forget the saved API address and key',
    status: 'available',
  },
  {
    name: 'doctor',
    summary: 'check this terminal can reach an installation',
    status: 'available',
  },
  {
    name: 'help',
    summary: 'show this message',
    status: 'available',
  },
  {
    name: 'version',
    summary: 'print the version of this CLI',
    status: 'available',
  },
  {
    name: 'plugin',
    summary: 'manage custom MCP connectors',
    status: 'planned',
    // ADR-38 sanctions MCP as the extension API and records that none of it is
    // implemented. Naming the ADR here keeps the CLI honest about why.
    blockedBy:
      'custom MCP connectors (ADR-38 Tier 1), which are designed but not built',
  },
];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}
