#!/usr/bin/env node

/**
 * VITE Manager MCP Server
 * 
 * This MCP server provides tools to manage VITE development servers without user interaction.
 * It can start/stop VITE servers, capture logs to files, and provide access to those logs.
 * 
 * Features:
 * - Start VITE server in background with log capture
 * - Stop VITE server
 * - Get server status
 * - Read log files
 * - Clear log files
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Type for tracking VITE server instances
 */
interface ViteInstance {
  process: ChildProcess;
  projectPath: string;
  logFile: string;
  startTime: Date;
  port?: number;
}

/**
 * Storage for active VITE instances
 */
const viteInstances: Map<string, ViteInstance> = new Map();

/**
 * Default log directory
 */
const LOG_DIR = process.env.VITE_LOGS_DIR || path.join(process.cwd(), 'vite-logs');

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Generate a unique instance ID for a project
 */
function generateInstanceId(projectPath: string): string {
  const normalizedPath = path.resolve(projectPath);
  return Buffer.from(normalizedPath).toString('base64').replace(/[/+=]/g, '');
}

/**
 * Get log file path for an instance
 */
function getLogFilePath(instanceId: string): string {
  return path.join(LOG_DIR, `vite-${instanceId}.log`);
}

/**
 * Create an MCP server with VITE management capabilities
 */
const server = new Server(
  {
    name: "vite-manager",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * Handler for listing available resources (log files)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  ensureLogDir();
  
  const resources = [];
  
  // Add active instances as resources
  for (const [instanceId, instance] of viteInstances) {
    resources.push({
      uri: `vite://logs/${instanceId}`,
      mimeType: "text/plain",
      name: `VITE Logs - ${path.basename(instance.projectPath)}`,
      description: `Live logs for VITE server running in ${instance.projectPath}`
    });
  }
  
  // Add log files as resources
  try {
    const logFiles = fs.readdirSync(LOG_DIR).filter(file => file.startsWith('vite-') && file.endsWith('.log'));
    for (const logFile of logFiles) {
      const instanceId = logFile.replace('vite-', '').replace('.log', '');
      if (!viteInstances.has(instanceId)) {
        resources.push({
          uri: `vite://logs/${instanceId}`,
          mimeType: "text/plain",
          name: `VITE Logs - ${logFile}`,
          description: `Historical logs from VITE server (${logFile})`
        });
      }
    }
  } catch (error) {
    // Log directory might not exist yet
  }
  
  return { resources };
});

/**
 * Handler for reading log file contents
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const instanceId = url.pathname.replace(/^\/logs\//, '');
  
  const logFile = getLogFilePath(instanceId);
  
  if (!fs.existsSync(logFile)) {
    throw new Error(`Log file for instance ${instanceId} not found`);
  }
  
  const content = fs.readFileSync(logFile, 'utf-8');
  
  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: content
    }]
  };
});

/**
 * Handler that lists available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "start_vite",
        description: "Start a VITE development server in the background with log capture",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: {
              type: "string",
              description: "Path to the project directory containing package.json"
            },
            port: {
              type: "number",
              description: "Port to run VITE on (optional, defaults to VITE's default)"
            },
            host: {
              type: "string",
              description: "Host to bind to (optional, defaults to localhost)"
            }
          },
          required: ["projectPath"]
        }
      },
      {
        name: "stop_vite",
        description: "Stop a running VITE server",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: {
              type: "string",
              description: "Path to the project directory (or instance ID)"
            }
          },
          required: ["projectPath"]
        }
      },
      {
        name: "get_vite_status",
        description: "Get status of all running VITE servers",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "clear_logs",
        description: "Clear log files for a specific instance or all instances",
        inputSchema: {
          type: "object",
          properties: {
            instanceId: {
              type: "string",
              description: "Instance ID to clear logs for (optional, clears all if not specified)"
            }
          },
          required: []
        }
      },
      {
        name: "tail_logs",
        description: "Get the last N lines from a VITE server log",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: {
              type: "string",
              description: "Path to the project directory (or instance ID)"
            },
            lines: {
              type: "number",
              description: "Number of lines to return (default: 50)"
            }
          },
          required: ["projectPath"]
        }
      }
    ]
  };
});

/**
 * Handler for tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "start_vite": {
      const projectPath = String(request.params.arguments?.projectPath);
      const port = request.params.arguments?.port ? Number(request.params.arguments.port) : undefined;
      const host = request.params.arguments?.host ? String(request.params.arguments.host) : undefined;
      
      if (!projectPath) {
        throw new Error("Project path is required");
      }
      
      const resolvedPath = path.resolve(projectPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Project path does not exist: ${resolvedPath}`);
      }
      
      const packageJsonPath = path.join(resolvedPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`No package.json found in: ${resolvedPath}`);
      }
      
      const instanceId = generateInstanceId(resolvedPath);
      
      // Check if already running
      if (viteInstances.has(instanceId)) {
        throw new Error(`VITE server already running for project: ${resolvedPath}`);
      }
      
      ensureLogDir();
      const logFile = getLogFilePath(instanceId);
      
      // Build VITE command
      const args = ['run', 'dev'];
      if (port) args.push('--port', String(port));
      if (host) args.push('--host', host);
      
      // Start VITE process with better cleanup handling
      const viteProcess = spawn('npm', args, {
        cwd: resolvedPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false,
        // On Windows, ensure child processes are killed when parent dies
        windowsHide: true
      });
      
      // Store the process PID for better tracking
      if (viteProcess.pid) {
        console.error(`Started VITE process with PID: ${viteProcess.pid} for project: ${resolvedPath}`);
      }
      
      // Create log file stream
      const logStream = fs.createWriteStream(logFile, { flags: 'w' });
      
      // Pipe stdout and stderr to log file
      viteProcess.stdout?.pipe(logStream);
      viteProcess.stderr?.pipe(logStream);
      
      // Also capture output to detect port
      let detectedPort = port;
      viteProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        const portMatch = output.match(/Local:\s+http:\/\/[^:]+:(\d+)/);
        if (portMatch) {
          detectedPort = parseInt(portMatch[1]);
        }
      });
      
      // Store instance
      const instance: ViteInstance = {
        process: viteProcess,
        projectPath: resolvedPath,
        logFile,
        startTime: new Date(),
        port: detectedPort
      };
      
      viteInstances.set(instanceId, instance);
      
      // Handle process exit
      viteProcess.on('exit', (code) => {
        logStream.write(`\n[${new Date().toISOString()}] VITE process exited with code: ${code}\n`);
        logStream.end();
        viteInstances.delete(instanceId);
      });
      
      // Write initial log entry
      logStream.write(`[${new Date().toISOString()}] Starting VITE server for project: ${resolvedPath}\n`);
      logStream.write(`[${new Date().toISOString()}] Command: npm ${args.join(' ')}\n`);
      logStream.write(`[${new Date().toISOString()}] Instance ID: ${instanceId}\n\n`);
      
      return {
        content: [{
          type: "text",
          text: `VITE server started successfully!\n\nProject: ${resolvedPath}\nInstance ID: ${instanceId}\nLog file: ${logFile}\nPort: ${detectedPort || 'auto-detected'}\n\nUse the tail_logs tool to monitor output or access logs via the vite://logs/${instanceId} resource.`
        }]
      };
    }
    
    case "stop_vite": {
      const projectPath = String(request.params.arguments?.projectPath);
      
      if (!projectPath) {
        throw new Error("Project path is required");
      }
      
      // Try to find by path or instance ID
      let instanceId = projectPath;
      let instance = viteInstances.get(instanceId);
      
      if (!instance) {
        // Try to find by project path
        const resolvedPath = path.resolve(projectPath);
        instanceId = generateInstanceId(resolvedPath);
        instance = viteInstances.get(instanceId);
      }
      
      if (!instance) {
        throw new Error(`No running VITE server found for: ${projectPath}`);
      }
      
      // Kill the process using platform-appropriate method
      const pid = instance.process.pid;
      console.error(`Stopping VITE process for instance: ${instanceId} (PID: ${pid})`);
      
      if (process.platform === 'win32' && pid) {
        try {
          // Use taskkill to terminate the process tree on Windows
          const killProcess = spawn('taskkill', ['/pid', pid.toString(), '/t', '/f'], {
            stdio: 'ignore'
          });
          
          killProcess.on('exit', (code: number | null) => {
            console.error(`taskkill for PID ${pid} exited with code: ${code}`);
          });
          
        } catch (winError) {
          console.error(`Error using taskkill for PID ${pid}:`, winError);
          // Fallback to regular kill
          instance.process.kill('SIGTERM');
        }
      } else {
        // Kill the process on non-Windows platforms
        instance.process.kill('SIGTERM');
        
        // Wait a bit, then force kill if needed
        setTimeout(() => {
          if (!instance.process.killed) {
            instance.process.kill('SIGKILL');
          }
        }, 5000);
      }
      
      return {
        content: [{
          type: "text",
          text: `VITE server stopped for project: ${instance.projectPath}\nInstance ID: ${instanceId}`
        }]
      };
    }
    
    case "get_vite_status": {
      if (viteInstances.size === 0) {
        return {
          content: [{
            type: "text",
            text: "No VITE servers are currently running."
          }]
        };
      }
      
      const statusLines = [];
      for (const [instanceId, instance] of viteInstances) {
        const uptime = Math.floor((Date.now() - instance.startTime.getTime()) / 1000);
        statusLines.push(
          `Instance ID: ${instanceId}`,
          `Project: ${instance.projectPath}`,
          `Port: ${instance.port || 'unknown'}`,
          `Uptime: ${uptime}s`,
          `Log file: ${instance.logFile}`,
          `---`
        );
      }
      
      return {
        content: [{
          type: "text",
          text: `Running VITE servers (${viteInstances.size}):\n\n${statusLines.join('\n')}`
        }]
      };
    }
    
    case "clear_logs": {
      const instanceId = request.params.arguments?.instanceId ? String(request.params.arguments.instanceId) : undefined;
      
      ensureLogDir();
      
      if (instanceId) {
        const logFile = getLogFilePath(instanceId);
        if (fs.existsSync(logFile)) {
          fs.unlinkSync(logFile);
          return {
            content: [{
              type: "text",
              text: `Cleared logs for instance: ${instanceId}`
            }]
          };
        } else {
          throw new Error(`Log file not found for instance: ${instanceId}`);
        }
      } else {
        // Clear all log files
        const logFiles = fs.readdirSync(LOG_DIR).filter(file => file.startsWith('vite-') && file.endsWith('.log'));
        for (const logFile of logFiles) {
          fs.unlinkSync(path.join(LOG_DIR, logFile));
        }
        return {
          content: [{
            type: "text",
            text: `Cleared ${logFiles.length} log files`
          }]
        };
      }
    }
    
    case "tail_logs": {
      const projectPath = String(request.params.arguments?.projectPath);
      const lines = request.params.arguments?.lines ? Number(request.params.arguments.lines) : 50;
      
      if (!projectPath) {
        throw new Error("Project path is required");
      }
      
      // Try to find by path or instance ID
      let instanceId = projectPath;
      let logFile = getLogFilePath(instanceId);
      
      if (!fs.existsSync(logFile)) {
        // Try to find by project path
        const resolvedPath = path.resolve(projectPath);
        instanceId = generateInstanceId(resolvedPath);
        logFile = getLogFilePath(instanceId);
      }
      
      if (!fs.existsSync(logFile)) {
        throw new Error(`No log file found for: ${projectPath}`);
      }
      
      // Read last N lines
      const content = fs.readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines).join('\n');
      
      return {
        content: [{
          type: "text",
          text: `Last ${lines} lines from ${logFile}:\n\n${lastLines}`
        }]
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

/**
 * Cleanup function to terminate all running VITE processes
 */
function cleanup() {
  console.error("Shutting down MCP server, terminating all VITE processes...");
  
  for (const [instanceId, instance] of viteInstances) {
    try {
      const pid = instance.process.pid;
      console.error(`Terminating VITE process for instance: ${instanceId} (PID: ${pid})`);
      
      // On Windows, we need to kill the entire process tree
      if (process.platform === 'win32' && pid) {
        try {
          // Use taskkill to terminate the process tree on Windows
          const { spawn } = require('child_process');
          const killProcess = spawn('taskkill', ['/pid', pid.toString(), '/t', '/f'], {
            stdio: 'ignore'
          });
          
          killProcess.on('exit', (code: number | null) => {
            console.error(`taskkill for PID ${pid} exited with code: ${code}`);
          });
          
        } catch (winError) {
          console.error(`Error using taskkill for PID ${pid}:`, winError);
          // Fallback to regular kill
          instance.process.kill('SIGTERM');
        }
      } else {
        // Try graceful shutdown first on non-Windows platforms
        instance.process.kill('SIGTERM');
        
        // Force kill after a short delay if process is still running
        setTimeout(() => {
          if (!instance.process.killed) {
            console.error(`Force killing VITE process for instance: ${instanceId}`);
            instance.process.kill('SIGKILL');
          }
        }, 2000);
      }
      
    } catch (error) {
      console.error(`Error terminating VITE process ${instanceId}:`, error);
    }
  }
  
  // Clear the instances map
  viteInstances.clear();
}

/**
 * Start the server using stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  
  // Setup cleanup handlers for various exit scenarios
  process.on('SIGINT', () => {
    console.error('Received SIGINT, cleaning up...');
    cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, cleaning up...');
    cleanup();
    process.exit(0);
  });
  
  process.on('exit', () => {
    cleanup();
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup();
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    cleanup();
    process.exit(1);
  });
  
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  cleanup();
  process.exit(1);
});
