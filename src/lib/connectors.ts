/**
 * Curated remote MCP connector presets. Adding one writes a `type: "remote"`
 * MCP server named `preset.name`; services that need auth take a request
 * header (e.g. Authorization) on that server config.
 */
export interface ConnectorPreset {
  name: string;
  title: string;
  description: string;
  url: string;
}

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  {
    name: "github",
    title: "GitHub",
    description: "Repositories, issues, and pull requests",
    url: "https://api.githubcopilot.com/mcp/",
  },
  {
    name: "linear",
    title: "Linear",
    description: "Issues and project tracking",
    url: "https://mcp.linear.app/mcp",
  },
  {
    name: "notion",
    title: "Notion",
    description: "Pages and databases",
    url: "https://mcp.notion.com/mcp",
  },
  {
    name: "sentry",
    title: "Sentry",
    description: "Errors and performance issues",
    url: "https://mcp.sentry.dev/mcp",
  },
  {
    name: "context7",
    title: "Context7",
    description: "Up-to-date library documentation",
    url: "https://mcp.context7.com/mcp",
  },
  {
    name: "stripe",
    title: "Stripe",
    description: "Payments data and API docs",
    url: "https://mcp.stripe.com",
  },
];
