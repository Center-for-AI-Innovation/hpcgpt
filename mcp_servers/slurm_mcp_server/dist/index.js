#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
// Define the accounts tool
const ACCOUNTS_TOOL = {
    name: 'accounts',
    description: 'Get Slurm account information for the currently active user',
    inputSchema: {
        type: 'object',
        properties: {
            options: {
                type: 'string',
                description: 'Optional command line options to pass to the accounts command',
                default: ''
            }
        },
        additionalProperties: false
    }
};
// Define the sinfo tool
const SINFO_TOOL = {
    name: 'sinfo',
    description: 'Check Slurm node availability and partition information',
    inputSchema: {
        type: 'object',
        properties: {
            options: {
                type: 'string',
                description: 'Optional command line options to pass to the sinfo command (e.g., "-N" for node format, "-p partition_name" for specific partition)',
                default: ''
            }
        },
        additionalProperties: false
    }
};
// Define the squeue tool
const SQUEUE_TOOL = {
    name: 'squeue',
    description: 'Check what Slurm jobs the user is currently running',
    inputSchema: {
        type: 'object',
        properties: {
            options: {
                type: 'string',
                description: 'Optional command line options to pass to the squeue command (e.g., "-u username" for specific user, "-l" for long format, "-t RUNNING" for specific job states)',
                default: ''
            }
        },
        additionalProperties: false
    }
};
// Define the scontrol tool
const SCONTROL_TOOL = {
    name: 'scontrol',
    description: 'Get detailed information about individual Slurm jobs using scontrol',
    inputSchema: {
        type: 'object',
        properties: {
            job_id: {
                type: 'string',
                description: 'Job ID to get detailed information for'
            },
            options: {
                type: 'string',
                description: 'Optional additional command line options (e.g., "show partition" for partition info, "show node" for node info)',
                default: ''
            }
        },
        additionalProperties: false
    }
};
class SlurmMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'delta-slurm-mcp',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [ACCOUNTS_TOOL, SINFO_TOOL, SQUEUE_TOOL, SCONTROL_TOOL],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            if (toolName !== 'accounts' && toolName !== 'sinfo' && toolName !== 'squeue' && toolName !== 'scontrol') {
                throw new Error(`Unknown tool: ${toolName}`);
            }
            try {
                let command;
                if (toolName === 'scontrol') {
                    const jobId = request.params.arguments?.job_id;
                    const options = request.params.arguments?.options || '';
                    if (jobId) {
                        // If job_id is provided, use "scontrol show job <job_id>"
                        command = options ? `scontrol show job ${jobId} ${options}` : `scontrol show job ${jobId}`;
                    }
                    else if (options) {
                        // If no job_id but options provided, use options directly (e.g., "show partition")
                        command = `scontrol ${options}`;
                    }
                    else {
                        throw new Error('scontrol requires either a job_id or options parameter');
                    }
                }
                else {
                    // For other tools, use the original logic
                    const options = request.params.arguments?.options || '';
                    command = options ? `${toolName} ${options}` : toolName;
                }
                console.error(`[MCP] Executing command: ${command}`);
                const { stdout, stderr } = await execAsync(command, {
                    timeout: 30000, // 30 second timeout
                    maxBuffer: 1024 * 1024 // 1MB buffer
                });
                if (stderr && stderr.trim()) {
                    console.error(`[MCP] Command stderr: ${stderr}`);
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: stdout || `No output from ${toolName} command`
                        }
                    ]
                };
            }
            catch (error) {
                console.error(`[MCP] Error executing ${toolName} command:`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing ${toolName} command: ${errorMessage}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('[MCP] Delta Slurm MCP server running on stdio');
    }
}
// Start the server
const server = new SlurmMCPServer();
server.run().catch((error) => {
    console.error('[MCP] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map