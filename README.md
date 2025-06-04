# VITE Manager MCP Server

A Model Context Protocol (MCP) server that provides tools to manage VITE development servers without user interaction. This server allows you to start, stop, and monitor VITE servers programmatically while capturing all output to log files for later review.

## Features

- **Start VITE Server**: Launch VITE development servers in the background with automatic log capture
- **Stop VITE Server**: Gracefully terminate running VITE servers
- **Server Status**: Get status of all running VITE instances
- **Log Management**: Access, tail, and clear log files
- **Resource Access**: Access logs via MCP resources for easy integration

## Tools

### `start_vite`
Start a VITE development server in the background with log capture.

**Parameters:**
- `projectPath` (required): Path to the project directory containing package.json
- `port` (optional): Port to run VITE on (defaults to VITE's default)
- `host` (optional): Host to bind to (defaults to localhost)

**Example:**
```json
{
  "projectPath": "c:/source/my-react-app",
  "port": 3000,
  "host": "0.0.0.0"
}
```

### `stop_vite`
Stop a running VITE server.

**Parameters:**
- `projectPath` (required): Path to the project directory or instance ID

**Example:**
```json
{
  "projectPath": "c:/source/my-react-app"
}
```

### `get_vite_status`
Get status of all running VITE servers.

**Parameters:** None

### `clear_logs`
Clear log files for a specific instance or all instances.

**Parameters:**
- `instanceId` (optional): Instance ID to clear logs for (clears all if not specified)

### `tail_logs`
Get the last N lines from a VITE server log.

**Parameters:**
- `projectPath` (required): Path to the project directory or instance ID
- `lines` (optional): Number of lines to return (default: 50)

## Resources

The server exposes log files as MCP resources with URIs in the format:
- `vite://logs/{instanceId}` - Access log files for specific VITE instances

## Log Files

Log files are stored in the `vite-logs` directory (configurable via `VITE_LOGS_DIR` environment variable). Each VITE instance gets its own log file named `vite-{instanceId}.log`.

Log files contain:
- Startup information and configuration
- All VITE stdout and stderr output
- Process exit information
- Timestamps for all entries

## Installation

1. Build the server:
   ```bash
   npm install
   npm run build
   ```

2. Add to MCP settings (`mcp_settings.json`):
   ```json
   {
     "mcpServers": {
       "vite-manager": {
         "command": "node",
         "args": ["c:/source/mcp-servers/vite-manager/build/index.js"],
         "disabled": false,
         "alwaysAllow": []
       }
     }
   }
   ```

## Usage Examples

### Starting a VITE Server
```bash
# Use the MCP tool to start VITE
use_mcp_tool vite-manager start_vite {
  "projectPath": "c:/source/my-project",
  "port": 3000
}
```

### Monitoring Logs
```bash
# Get recent log output
use_mcp_tool vite-manager tail_logs {
  "projectPath": "c:/source/my-project",
  "lines": 100
}

# Or access logs as a resource
access_mcp_resource vite-manager vite://logs/{instanceId}
```

### Checking Status
```bash
# See all running servers
use_mcp_tool vite-manager get_vite_status {}
```

### Stopping a Server
```bash
# Stop the server
use_mcp_tool vite-manager stop_vite {
  "projectPath": "c:/source/my-project"
}
```

## Environment Variables

- `VITE_LOGS_DIR`: Directory to store log files (default: `./vite-logs`)

## Error Handling

The server includes comprehensive error handling for:
- Missing project directories
- Invalid package.json files
- Process management failures
- Log file access issues

## Security Considerations

- The server only manages VITE processes and log files
- No network access or external API calls
- All operations are local to the file system
- Process management is limited to VITE servers only

## Development

To modify or extend the server:

1. Edit `src/index.ts`
2. Run `npm run build` to compile
3. Restart any MCP clients using the server

## License

This MCP server is part of the BeatBlendr project.
