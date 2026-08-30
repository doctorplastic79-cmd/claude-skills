# Claude runtime routing

Use this only to determine whether the skill can reach the gateway.

| Runtime | Result |
| --- | --- |
| Local Claude Code on a Tailscale-connected computer | Supported. Run the bundled client. |
| Claude Code Remote Control | Supported when commands still execute on the connected local computer. |
| claude.ai custom Skill | The Skill alone does not join the user's tailnet. Use a separately authenticated HTTPS/MCP connector; do not call the local client. |
| Claude API / cloud container | No direct tailnet access. The application must provide an external tool or connector. |

Never claim that installing the Skill itself grants network access or credentials.

