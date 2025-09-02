#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Define the tools
const DELTA_DOCS_TOOL = {
    name: 'delta-docs',
    description: 'Get information from the Delta documentation',
    inputSchema: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'The message to send to the Illinois Chat'
            }
        },
        additionalProperties: false
    }
};

const DELTA_AI_DOCS_TOOL = {
    name: 'delta-ai-docs',
    description: 'Get information from the Delta AI documentation',
    inputSchema: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'The message to send to the Delta AI Chat'
            }
        },
        additionalProperties: false
    }
};

class IllinoisChatMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'illinois-chat-mcp',
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
                tools: [DELTA_DOCS_TOOL, DELTA_AI_DOCS_TOOL],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            try {
                api_key = process.env.ILLINOIS_CHAT_API_KEY;
                switch (toolName) {
                    case 'delta-docs':
                        course_name="Delta-Documentation";
                        break;
                    case 'delta-ai-docs':
                        course_name="DeltaAI-Documentation";
                        break;
                    default:
                        throw new Error(`Unknown tool: ${toolName}`);
                }
                const response = await this.callIllinoisChat(course_name, message);
                return {
                    content: [
                        {
                            type: 'text',
                            text: response
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
    
    async callIllinoisChat(course_name, message) {
        const systemPrompt = "You are a helpful assistant that can answer questions about the Delta and Delta AI documentation. You are also able to answer questions about the Delta and Delta AI software.";
        const formattedMessages = [{ role: 'system', content: systemPrompt }, message]
        
        const request_data = {
            model: "deepseek-r1:14b-qwen-distill-fp16",
            messages: formattedMessages,
            api_key: process.env.ILLINOIS_CHAT_API_KEY,
            course_name: course_name,
            stream: false,
            temperature: 0.3,
            retrieval_only: false
        };

        fetch("https://uiuc.chat/api/chat-api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(request_data)
        }).then(response => response.json())
        .then(data => {
            return data.choices[0].message.content;
        })
        .catch(error => {
            console.error('[MCP] Error calling Illinois Chat:', error);
        });
        return response;
    }
    
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('[MCP] Illinois Chat MCP server running on stdio');
    }
}

// Start the server
const server = new IllinoisChatMCPServer();
server.run().catch((error) => {
    console.error('[MCP] Fatal error:', error);
    process.exit(1);
});