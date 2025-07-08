import React from 'react';
import { Box, Text, useStdout } from 'ink';
import https from 'https';
import { URL } from 'url';
import { ChatMessageT, TextBox } from '../index.js';
import { FC, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SlashCommand } from '../commands/SlashCommand.js';
import { EmailCommand } from '../commands/EmailCommand.js';
import { ClearCommand } from '../commands/ClearCommand.js';
import { env } from '../../env.js';
import { exec } from 'child_process';
import { promisify } from 'util';

// LangGraph.js imports
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

const execAsync = promisify(exec);

// API configuration
const PREHOSTED_API_URL = env.MODEL_URL;
const PREHOSTED_MODEL = 'Qwen/Qwen2.5-VL-72B-Instruct';

// State Definition
const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    originalQuery: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => '',
    }),
    taskCompleted: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false,
    }),
    iterationCount: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0,
    }),
    lastAction: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => '',
    }),
});

// existing helper functions
const callPrehostedModel = async (messages: any[], systemPrompt?: string): Promise<string> => {
    try {
        console.log('Calling pre-hosted model:', PREHOSTED_MODEL);
        
        const formattedMessages = systemPrompt 
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;

        const requestData = {
            model: PREHOSTED_MODEL,
            messages: formattedMessages,
            max_tokens: 1500,
            temperature: 0.3,
            stream: false,
        };

        const url = new URL(PREHOSTED_API_URL);
        const payload = JSON.stringify(requestData);

        const result = await new Promise<string>((resolve) => {
            const req = https.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }, (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.message?.content || 
                                      parsed.response || 
                                      parsed.content || 
                                      'No response from model';
                        resolve(content);
                    } catch (error) {
                        console.log('Failed to parse response, returning raw:', data.slice(0, 100));
                        resolve(data);
                    }
                });
            });
            req.on('error', (error) => {
                console.log('Model API error:', error.message);
                resolve(`Error calling model: ${error.message}`);
            });
            req.write(payload);
            req.end();
        });

        return result;
    } catch (error: any) {
        console.log('Model call failed:', error.message);
        return `Error calling model: ${error.message}`;
    }
};

const searchUIUCDocs = async (query: string, modelToUse: string): Promise<string> => {
    console.log('UIUC Search called with:', query);
    
    try {
        const endpoint = 'https://uiuc.chat/api/chat-api/chat';
        const requestData = {
            model: modelToUse,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that provides concise, focused answers about SLURM, HPC, and cluster computing. Keep responses under 500 words and focus on the specific question asked.' },
                { role: 'user', content: query }
            ],
            api_key: env.UIUC_API_KEY,
            course_name: env.UIUC_COURSE_NAME,
            stream: true,
            temperature: 0.1,
            retrieval_only: false, 
        };
        
        const url = new URL(endpoint);
        const payload = JSON.stringify(requestData);
        let fullResponse = '';
        
        const result = await new Promise<string>((resolve) => {
            const req = https.request({
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }, (response) => {
                response.on('data', (chunk) => {
                    const token = new TextDecoder().decode(chunk);
                    fullResponse += token;
                });
                response.on('end', () => {
                    console.log('UIUC API streamed', fullResponse.length, 'characters');
                    console.log('UIUC response sample:', fullResponse.slice(0, 200) + '...');
                    
                    let cleanResponse = fullResponse;
                    
                    cleanResponse = cleanResponse
                        .replace(/^data:\s*/gm, '')
                        .replace(/\[DONE\]/g, '')
                        .replace(/^\s*$/gm, '')
                        .trim();
                    
                    if (cleanResponse.includes('"delta"') || cleanResponse.includes('"content"')) {
                        let extractedContent = '';
                        const lines = cleanResponse.split('\n');
                        
                        for (const line of lines) {
                            try {
                                if (line.trim() && !line.includes('[DONE]')) {
                                    const parsed = JSON.parse(line);
                                    const content = parsed.choices?.[0]?.delta?.content || 
                                                  parsed.delta?.content || 
                                                  parsed.content ||
                                                  '';
                                    if (content) {
                                        extractedContent += content;
                                    }
                                }
                            } catch (e) {
                                if (line.trim() && !line.includes('data:') && !line.includes('[DONE]')) {
                                    extractedContent += line + '\n';
                                }
                            }
                        }
                        
                        if (extractedContent.trim()) {
                            resolve(extractedContent.trim());
                            return;
                        }
                    }
                    
                    resolve(cleanResponse || 'No response from UIUC documentation');
                });
            });
            req.on('error', (error) => {
                console.log('UIUC API error:', error.message);
                resolve(`Error searching documentation: ${error.message}`);
            });
            req.write(payload);
            req.end();
        });
        
        return result;
    } catch (error: any) {
        console.log('UIUC tool error:', error.message);
        return `Documentation search failed: ${error.message}`;
    }
};

const executeShellCommand = async (command: string, retryCount: number = 0): Promise<string> => {
    try {
        console.log('Executing shell command:', command);
        const { stdout, stderr } = await execAsync(command, { timeout: 30000, maxBuffer: 1024 * 1024 });
        const output = stdout || stderr || 'Command executed successfully (no output)';
        console.log('Command executed successfully');
        return `$ ${command}\n${output}`;
    } catch (error: any) {
        const errorMsg = error.code === 'ETIMEDOUT' 
            ? 'Command timed out after 30 seconds' 
            : error.message;
        
        console.log('Command failed:', errorMsg);
        
        if (retryCount === 0 && !errorMsg.includes('timeout')) {
            console.log('Attempting to fix command...');
            const fixedCommand = await fixShellCommand(command, errorMsg);
            
            if (fixedCommand && fixedCommand !== command) {
                console.log('Retrying with fixed command:', fixedCommand);
                const retryResult = await executeShellCommand(fixedCommand, 1);
                return `$ ${command}\nError: ${errorMsg}\n\nTrying fixed command:\n${retryResult}`;
            }
        }
        
        return `$ ${command}\nError: ${errorMsg}`;
    }
};

const fixShellCommand = async (command: string, errorMsg: string): Promise<string | null> => {
    try {
        const systemPrompt = `You are a shell command expert. Given a failed command and its error, provide ONLY a corrected command. If you can't fix it, respond with "CANNOT_FIX".

Examples:
- Command: "ls -la /nonexistent" Error: "No such file or directory" → "ls -la ."
- Command: "mkdir" Error: "missing operand" → "mkdir new_directory"

Only output the corrected command, nothing else.`;

        const userPrompt = `Command: ${command}\nError: ${errorMsg}`;
        
        const response = await callPrehostedModel(
            [{ role: 'user', content: userPrompt }], 
            systemPrompt
        );
        
        const fixedCommand = response.trim();
        
        if (fixedCommand === 'CANNOT_FIX' || fixedCommand === command) {
            return null;
        }
        
        return fixedCommand;
    } catch (error) {
        console.log('Failed to fix command:', error);
        return null;
    }
};

const naturalLanguageToShell = async (input: string): Promise<string> => {
    try {
        const systemPrompt = `You are a shell command translator. Convert natural language instructions into safe, correct shell commands. 

Rules:
- Only output the command, nothing else
- Use safe commands only
- For directory operations, use mkdir/rmdir/ls
- For file operations, use touch/rm/cp/mv/cat
- For system info, use df/free/ps/whoami/pwd
- If unsure, use echo with a helpful message

Examples:
- "Create a directory called test" → "mkdir test"
- "List all files" → "ls -la"
- "Show disk usage" → "df -h"
- "Check memory" → "free -h"`;

        const response = await callPrehostedModel(
            [{ role: 'user', content: input }], 
            systemPrompt
        );
        
        return response.trim();
    } catch (error) {
        console.log('Natural language conversion failed:', error);
        return `echo "Could not interpret command: ${input}"`;
    }
};

// ===== NODES =====

// IMPROVED ROUTER NODE
const routerNode = async (state: typeof GraphState.State) => {
    console.log('Router Node');
    
    const lastMessage = state.messages[state.messages.length - 1];
    const query = lastMessage && lastMessage.content ? lastMessage.content as string : '';
    const originalQuery = state.originalQuery;
    
    // Check what has already been done
    const completedActions = state.messages
        .filter(msg => msg instanceof AIMessage)
        .map(msg => msg.content as string)
        .join(' ');
    
    const hasDocsInfo = completedActions.includes('DOCS:');
    const hasShellExecution = completedActions.includes('SHELL:');
    
    const systemPrompt = `You are a smart routing assistant that understands multi-step tasks. 

CONTEXT:
- Original query: "${originalQuery}"
- Already completed: ${hasDocsInfo ? 'DOCS' : 'None'} ${hasShellExecution ? 'SHELL' : ''}

ROUTING RULES:
1. "docs" - If user needs information/documentation AND docs haven't been searched yet
2. "shell" - If user wants to execute/check/run/create something OR if docs were already retrieved and now need execution
3. "chat" - For greetings, general conversation, or unclear requests

SMART ROUTING EXAMPLES:
- "check my slurm memory allocation" → FIRST: "docs" (to learn commands), THEN: "shell" (to execute)
- "create a directory" → "shell" (direct action, no docs needed)
- "what are slurm commands" → "docs" (information only)
- "show disk usage" → "shell" (direct system command)

ACTION REQUIRED: 
${hasDocsInfo && !hasShellExecution ? 
  'Docs already retrieved. If original query requires execution/checking/running something, route to "shell"' : 
  'Analyze if this needs docs first, direct shell execution, or just chat'}

Respond with ONLY one word: "docs", "shell", or "chat"`;

    const response = await callPrehostedModel(
        [{ role: 'user', content: query }], 
        systemPrompt
    );
    
    const action = response.trim().toLowerCase();
    console.log(`Router decision: ${action} (Has docs: ${hasDocsInfo}, Has shell: ${hasShellExecution})`);
    
    return {
        lastAction: action,
        iterationCount: state.iterationCount + 1,
    };
};

// IMPROVED COMPLETION NODE
const completionNode = async (state: typeof GraphState.State) => {
    console.log('Completion Validator Node');
    
    try {
        const originalQuery = state.originalQuery;
        const conversation = state.messages
            .filter(msg => msg instanceof AIMessage)
            .map(m => m.content)
            .join('\n');
            
        // Check what actions have been completed
        const hasDocsInfo = conversation.includes('DOCS:');
        const hasShellExecution = conversation.includes('SHELL:');
        const hasChatResponse = conversation.includes('CHAT:');
        
        const systemPrompt = `You are a task completion validator. Analyze if the user's original request has been COMPLETELY fulfilled.

ORIGINAL REQUEST: "${originalQuery}"

COMPLETED ACTIONS:
- Documentation searched: ${hasDocsInfo ? 'YES' : 'NO'}
- Commands executed: ${hasShellExecution ? 'YES' : 'NO'}  
- Chat response given: ${hasChatResponse ? 'YES' : 'NO'}

COMPLETION RULES:
1. INFORMATION-ONLY queries (what/how/explain) → Need docs OR chat response
   Examples: "what are slurm commands" → docs sufficient ✅
   
2. ACTION queries (check/show/create/run/execute) → Need BOTH docs + shell execution  
   Examples: "check my memory allocation" → need docs to learn command + shell to execute ✅
   
3. DIRECT COMMANDS → Need shell execution only
   Examples: "create directory test" → shell sufficient ✅

ANALYSIS:
- Does "${originalQuery}" require just information? → ${hasDocsInfo || hasChatResponse ? 'SATISFIED' : 'NEEDS_MORE'}
- Does "${originalQuery}" require action/execution? → ${hasShellExecution ? 'SATISFIED' : 'NEEDS_EXECUTION'}

Respond ONLY "YES" if completely finished or "NO" if more work needed.`;

        const userPrompt = `Based on the rules above, is the original query "${originalQuery}" COMPLETELY satisfied?

What was accomplished:
${conversation}

Answer: YES or NO only.`;
        
        const response = await callPrehostedModel(
            [{ role: 'user', content: userPrompt }], 
            systemPrompt
        );
        
        const isCompleted = response.trim().toLowerCase().includes('yes');
        console.log(`Completion check: ${isCompleted ? 'COMPLETED' : 'CONTINUE'}`);
        console.log(`Analysis: Docs=${hasDocsInfo}, Shell=${hasShellExecution}, Decision=${response.trim()}`);
        
        return {
            taskCompleted: isCompleted,
        };
    } catch (error: any) {
        console.log('Error in completion validator:', error.message);
        return {
            taskCompleted: true, // Fail safe
        };
    }
};

// IMPROVED SHELL NODE WITH DOCS CONTEXT
const shellNode = async (state: typeof GraphState.State) => {
    console.log('Shell Node');
    
    const originalQuery = state.originalQuery;
    
    // Get any docs information that was previously retrieved
    const docsContext = state.messages
        .filter(msg => msg instanceof AIMessage && typeof msg.content === 'string' && msg.content.includes('DOCS:'))
        .map(msg => (typeof msg.content === 'string' ? msg.content.replace('DOCS:', '').trim() : ''))
        .join('\n');
    
    // Enhanced natural language to shell with docs context
    const shellCommand = await naturalLanguageToShellWithContext(originalQuery, docsContext);
    const result = await executeShellCommand(shellCommand);
    
    return {
        messages: [new AIMessage(`SHELL: ${result}`)],
        lastAction: 'shell',
    };
};

// NEW HELPER FUNCTION
const naturalLanguageToShellWithContext = async (input: string, docsContext: string): Promise<string> => {
    try {
        const systemPrompt = `You are an expert shell command translator. Convert natural language to shell commands using documentation context.

DOCUMENTATION CONTEXT:
${docsContext || 'No documentation context available'}

RULES:
- Use SLURM commands (squeue, sinfo, sacct, etc.) when dealing with cluster/job queries
- For "check memory allocation": use "squeue -u $USER -o %j,%P,%T,%M,%l" or "sacct" commands
- For "show jobs": use "squeue -u $USER"  
- For "cluster status": use "sinfo"
- For file operations: mkdir/ls/cat/etc.
- For system info: df/free/ps/etc.

EXAMPLES:
- "check my slurm memory allocation" → "squeue -u $USER -o '%j,%P,%T,%M,%l'"
- "show my running jobs" → "squeue -u $USER" 
- "check cluster nodes" → "sinfo"
- "create directory test" → "mkdir test"

Only output the shell command, nothing else.`;

        const response = await callPrehostedModel(
            [{ role: 'user', content: input }], 
            systemPrompt
        );
        
        return response.trim();
    } catch (error) {
        console.log('Enhanced natural language conversion failed:', error);
        return `echo "Could not interpret command: ${input}"`;
    }
};

// Documentation Node
const docsNode = async (state: typeof GraphState.State) => {
    console.log('Docs Node');
    
    try {
        // Get the original user query
        const originalQuery = state.originalQuery;
        
        // Get response from UIUC (already processed)
        const uiucResponse = await searchUIUCDocs(originalQuery, 'Qwen/Qwen2.5-VL-72B-Instruct');
        
        // Optional: Further processing with your model if needed
        const docResponse = await callPrehostedModel([
            { role: 'user', content: `Based on this SLURM documentation, provide a clear and concise answer to: "${originalQuery}"

Documentation:
${uiucResponse}

Please provide a focused answer under 200 words.` }
        ]);
        
        console.log('Docs node response length:', docResponse.length);
        
        return {
            messages: [new AIMessage(`DOCS: ${docResponse}`)],
            lastAction: 'docs',
        };
    } catch (error: any) {
        console.log('Error in docs node:', error.message);
        return {
            messages: [new AIMessage(`DOCS: Error retrieving documentation: ${error.message}`)],
            lastAction: 'docs',
        };
    }
};

// Chat Node
const chatNode = async (state: typeof GraphState.State) => {
    console.log('Chat Node');
    
    // Use original query for chat too
    const originalQuery = state.originalQuery;
    
    const response = await callPrehostedModel([{ role: 'user', content: originalQuery }]);
    
    return {
        messages: [new AIMessage(`CHAT: ${response}`)],
        lastAction: 'chat',
    };
};

// ===== CONDITIONAL EDGES =====

const shouldContinue = (state: typeof GraphState.State): "completion" | "__end__" => {
    if (state.iterationCount >= 5) {
        console.log('Max iterations reached');
        return "__end__";
    }
    return "completion";
};

const afterCompletion = (state: typeof GraphState.State): "router" | "__end__" => {
    if (state.taskCompleted) {
        console.log('Task completed, ending workflow');
        return "__end__";
    }
    if (state.iterationCount >= 5) {
        console.log('Max iterations reached, ending workflow');
        return "__end__";
    }
    console.log('Task not completed, continuing workflow');
    return "router";
};

const routeToTool = (state: typeof GraphState.State): "docs" | "shell" | "chat" => {
    const action = state.lastAction;
    console.log(`Routing to: ${action}`);
    return action as "docs" | "shell" | "chat";
};

// ===== WORKFLOW CREATION =====

// Create workflow outside of component to prevent recreating on every render
let workflowInstance: any = null;

const createWorkflow = () => {
    if (workflowInstance) {
        return workflowInstance;
    }
    
    const workflow = new StateGraph(GraphState)
        .addNode("router", routerNode)
        .addNode("docs", docsNode)
        .addNode("shell", shellNode)
        .addNode("chat", chatNode)
        .addNode("completion", completionNode)
        .addEdge(START, "router")
        .addConditionalEdges("router", routeToTool, {
            docs: "docs",
            shell: "shell",
            chat: "chat",
        })
        .addConditionalEdges("docs", shouldContinue, {
            completion: "completion",
            __end__: END,
        })
        .addConditionalEdges("shell", shouldContinue, {
            completion: "completion", 
            __end__: END,
        })
        .addConditionalEdges("chat", shouldContinue, {
            completion: "completion",
            __end__: END,
        })
        .addConditionalEdges("completion", afterCompletion, {
            router: "router",
            __end__: END,
        });

    workflowInstance = workflow.compile();
    return workflowInstance;
};

// ===== DEBOUNCED STREAMING TO REDUCE FLICKERING =====

const simulateStreamingResponse = async (fullResponse: string, setStreamingContent: (content: string) => void): Promise<string> => {
    return new Promise((resolve) => {
        let currentIndex = 0;
        const chunkSize = 30; // Larger chunks = fewer updates = less flickering
        const delay = 120; // Slower delay = smoother animation
        
        if (fullResponse.length > 0) {
            const firstChunk = fullResponse.slice(0, chunkSize);
            setStreamingContent(firstChunk);
            currentIndex = chunkSize;
        }
        
        const streamInterval = setInterval(() => {
            if (currentIndex < fullResponse.length) {
                const nextChunk = fullResponse.slice(0, currentIndex + chunkSize);
                setStreamingContent(nextChunk);
                currentIndex += chunkSize;
            } else {
                clearInterval(streamInterval);
                resolve(fullResponse);
            }
        }, delay);
    });
};

// FASTER THINKING ANIMATION
const ThinkingAnimation = React.memo(({ action }: { action?: string }) => {
    const [frame, setFrame] = useState(0);
    const frames = ["( ●    )", "(  ●   )", "(   ●  )", "(    ● )", "(     ●)", "(    ● )", "(   ●  )", "(  ●   )", "( ●    )", "(●     )"];
    
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % frames.length);
        }, 80); // Much faster animation (was 150ms, now 80ms)
        return () => clearInterval(interval);
    }, []);

    const getActionText = () => {
        switch (action) {
            case 'docs':
                return 'Searching docs';
            case 'shell':
                return 'Executing command';
            case 'chat':
                return 'Thinking';
            default:
                return 'Processing';
        }
    };

    return <Text color="blue">{getActionText()} {frames[frame]}</Text>;
});

// MEMOIZED MESSAGE COMPONENT TO PREVENT UNNECESSARY RERENDERS
const MessageBox = React.memo(({ msg, terminalWidth, idx }: { msg: ChatMessageT, terminalWidth: number, idx: number }) => {
    return (
        <Box key={`message-${idx}`} width={terminalWidth} flexDirection="column" marginBottom={1}>
            {msg.role === 'assistant' ? (
                <>
                    <Text color="blue" bold>Assistant:</Text>
                    <Box borderStyle="round" borderColor="blue" padding={1}>
                        <Text>{msg.content}</Text>
                    </Box>
                </>
            ) : (
                <>
                    <Text color="red" bold>User:</Text>
                    <Box borderStyle="round" borderColor="red" padding={1}>
                        <Text>{msg.content}</Text>
                    </Box>
                </>
            )}
        </Box>
    );
});

const cleanAndDetectShellCommand = (input: string): { isShellCommand: boolean; cleanedCommand: string } => {
    let trimmed = input.trim();
    if (trimmed.startsWith('$')) {
        let cleanedCommand = trimmed.substring(1).trim();
        return { isShellCommand: true, cleanedCommand };
    }
    return { isShellCommand: false, cleanedCommand: trimmed };
};

export const App: FC = () => {
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    const [currentAction, setCurrentAction] = useState<string>('');
    
    const [history, setHistory] = useState<ChatMessageT[]>([
        { 
            role: 'assistant', 
            content: 'Hello! I\'m Delta\'s smart AI agent. I can:\n\n• Search UIUC/SLURM documentation\n• Execute terminal commands with automatic retry\n• Chain multiple tools together until tasks are complete\n• Validate task completion automatically\n• Direct shell commands (prefix with $)\n\nJust ask me anything!\n\nType "/help" for more options.' 
        }
    ]);
    
    const [streamingContent, setStreamingContent] = useState<string | null>(null);
    const [showCommandSuggestions, setShowCommandSuggestions] = useState<boolean>(false);

    const { stdout } = useStdout();
    const terminalWidth = stdout.columns || 80;
    const commands: SlashCommand[] = [new EmailCommand(), new ClearCommand()];
    
    // MEMOIZED COMMAND SUGGESTIONS TO REDUCE RECALCULATIONS
    const commandSuggestions = useMemo(() => {
        const allCommands = [
            { name: 'email', description: 'Send an email' },
            { name: 'clear', description: 'Clear the chat history' },
            { name: 'help', description: 'Show available commands' }
        ];
        
        if (!input.startsWith('/')) return [];
        const query = input.slice(1).toLowerCase();
        if (query === '') return allCommands;
        return allCommands.filter(cmd => cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query));
    }, [input]);
    
    // MEMOIZED DYNAMIC MESSAGE TO PREVENT FLICKERING
    const dynamicMessage = useMemo((): ChatMessageT | null => {
        return waiting && streamingContent !== null ? { role: 'assistant', content: streamingContent } : null;
    }, [waiting, streamingContent]);

    // MEMOIZED RENDERED MESSAGES TO PREVENT UNNECESSARY RERENDERS
    const renderedMessages = useMemo(() => {
        return history.map((msg, idx) => (
            <MessageBox key={`message-${idx}`} msg={msg} terminalWidth={terminalWidth} idx={idx} />
        ));
    }, [history, terminalWidth]);

    const handleInputChange = useCallback((value: string) => {
        setInput(value);
        setShowCommandSuggestions(value.startsWith('/') && value.length >= 1);
    }, []);

    const onSubmit = useCallback(async () => {
        const trimmed = input.trim();
        setShowCommandSuggestions(false);
        
        // Handle slash commands (unchanged)
        if (trimmed.startsWith('/')) {
            const parts = trimmed.slice(1).split(/\s+/);
            const name = parts[0];
            const args = parts.slice(1);
            
            if (name === 'clear') {
                const cmd = commands.find(c => c.name === name);
                if (cmd) {
                    await cmd.execute({ args, history, setHistory, setInput, commands });
                    setStreamingContent(null);
                    setWaiting(false);
                    setShowCommandSuggestions(false);
                }
                return;
            }
            
            if (name === 'help') {
                let helpText = 'Available Commands:\n\n/email - Send an email\n/clear - Clear the chat history\n/help - Show available commands\n\nFeatures:\n• Smart agent workflow with automatic task completion\n• Multi-tool chaining (docs → shell → validation)\n• Direct terminal commands (prefix with $ like "$ls -la")\n• UIUC documentation search\n• Intelligent routing and error recovery';
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'user', content: trimmed }]);
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: helpText }]);
                setInput('');
                return;
            }
            
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'user', content: trimmed }]);
            const cmd = commands.find(c => c.name === name);
            if (cmd) {
                await cmd.execute({ args, history, setHistory, setInput, commands });
            } else {
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: `Unknown command: ${name}. Type /help for list.` }]);
                setInput('');
            }
            return;
        }

        setWaiting(true);
        setCurrentAction('');
        const userMessage: ChatMessageT = { role: 'user', content: input };
        setHistory((prev: ChatMessageT[]) => [...prev, userMessage]);
        setInput('');

        try {
            let response: string;
            
            // Check for direct shell commands
            const { isShellCommand, cleanedCommand } = cleanAndDetectShellCommand(trimmed);
            if (isShellCommand) {
                console.log('Direct shell command detected, executing immediately');
                setCurrentAction('shell');
                response = await executeShellCommand(cleanedCommand);
            } else {
                console.log('Running workflow');
                
                // Get the workflow instance
                const workflow = createWorkflow();
                
                // Enhanced workflow with action tracking
                const result = await new Promise<any>((resolve) => {
                    let currentStep = '';
                    
                    workflow.invoke({
                        messages: [new HumanMessage(trimmed)],
                        originalQuery: trimmed,
                    }).then((result: any) => {
                        resolve(result);
                    });
                    
                    // Simple action detection based on common patterns
                    if (trimmed.toLowerCase().includes('docs') || 
                        trimmed.toLowerCase().includes('what') ||
                        trimmed.toLowerCase().includes('how') ||
                        trimmed.toLowerCase().includes('explain')) {
                        setCurrentAction('docs');
                    } else if (trimmed.toLowerCase().includes('execute') ||
                               trimmed.toLowerCase().includes('run') ||
                               trimmed.toLowerCase().includes('check') ||
                               trimmed.toLowerCase().includes('show') ||
                               trimmed.toLowerCase().includes('create')) {
                        setCurrentAction('shell');
                    } else {
                        setCurrentAction('chat');
                    }
                });
                
                // Get all AI messages from the workflow (for multi-step tasks)
                const allAIMessages = result.messages
                    .filter((msg: BaseMessage) => msg instanceof AIMessage)
                    .map((msg: BaseMessage) => msg.content as string)
                    .filter((content: string) => !content.startsWith('DOCS:') && !content.startsWith('SHELL:') && !content.startsWith('CHAT:'))
                    .join('\n\n');
                
                // If no clean messages, get the last one and clean it
                response = allAIMessages || result.messages
                    .filter((msg: BaseMessage) => msg instanceof AIMessage)
                    .pop()?.content?.toString().replace(/^(DOCS|SHELL|CHAT):\s*/, '') || 'No response generated';
                
                // Apply debounced streaming
                response = await simulateStreamingResponse(response, setStreamingContent);
            }
            
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: response }]);
            
        } catch (error: any) {
            console.error('Error in onSubmit:', error);
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
        }

        setStreamingContent(null);
        setWaiting(false);
        setCurrentAction('');
    }, [input, history, commands]);

    // FIXED PROMPT COMPONENT TO PREVENT UI BREAKING
    const Prompt = useMemo(() => {
        if (waiting) {
            return (
                <Box width={terminalWidth} flexDirection="column">
                    <Box width={terminalWidth} borderStyle="round" borderColor="green" padding={1}>
                        <ThinkingAnimation action={currentAction} />
                    </Box>
                </Box>
            );
        }
        return (
            <Box flexDirection="column" width={terminalWidth}>
                <Box width={terminalWidth}>
                    <TextBox width={terminalWidth} value={input} onChange={handleInputChange} onSubmit={onSubmit} />
                </Box>
                {showCommandSuggestions && commandSuggestions.length > 0 && (
                    <Box width={terminalWidth} borderStyle="round" borderColor="yellow" padding={1} marginTop={1}>
                        <Box flexDirection="column">
                            <Text bold color="yellow">Available Commands:</Text>
                            {commandSuggestions.map((cmd, idx) => (
                                <Box key={cmd.name} marginTop={idx === 0 ? 1 : 0}>
                                    <Text color="white">/{cmd.name} - {cmd.description}</Text>
                                </Box>
                            ))}
                            <Box marginTop={1}><Text dimColor>Continue typing or press Enter to execute</Text></Box>
                        </Box>
                    </Box>
                )}
                <Box width={terminalWidth} paddingTop={1}>
                    <Text dimColor>ctrl+c to exit | '/' to see commands | Delta AI Assistant</Text>
                </Box>
            </Box>
        );
    }, [waiting, terminalWidth, input, handleInputChange, onSubmit, showCommandSuggestions, commandSuggestions, currentAction]);

    return (
        <Box flexDirection="column" width={terminalWidth}>
            <Box width={terminalWidth} marginBottom={1}>
                <Box width="100%" borderStyle="round" borderColor="green" padding={1}>
                    <Text bold color="green">Delta - Smart AI Assistant</Text>
                </Box>
            </Box>

            <Box flexDirection="column" width={terminalWidth}>
                {renderedMessages}

                {dynamicMessage && (
                    <Box width={terminalWidth} flexDirection="column" marginBottom={1}>
                        <Text color="blue" bold>Assistant:</Text>
                        <Box borderStyle="round" borderColor="blue" padding={1}>
                            <Text>{dynamicMessage.content}</Text>
                        </Box>
                    </Box>
                )}
            </Box>
            
            {Prompt}
        </Box>
    );
};