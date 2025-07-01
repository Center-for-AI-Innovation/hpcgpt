import React from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import https from 'https';
import { URL } from 'url';
import { FC, useState, useEffect } from 'react';
import { ChatMessageT, TextBox } from '../index.js';
import { SlashCommand } from '../commands/SlashCommand.js';
import { EmailCommand } from '../commands/EmailCommand.js';
import { ClearCommand } from '../commands/ClearCommand.js';
import { env } from '../../env.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// API configuration
const PREHOSTED_API_URL = env.MODEL_URL;
const PREHOSTED_MODEL = 'Qwen/Qwen2.5-VL-72B-Instruct';

// Makes HTTP requests to the pre-hosted model API
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

// Searches UIUC documentation using their chat API
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
                    
                    // Clean up streaming response artifacts
                    let cleanResponse = fullResponse;
                    
                    cleanResponse = cleanResponse
                        .replace(/^data:\s*/gm, '')
                        .replace(/\[DONE\]/g, '')
                        .replace(/^\s*$/gm, '')
                        .trim();
                    
                    // Extract content from JSON streaming format
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

// Executes shell commands with automatic retry on failure
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
        
        // Attempt automatic command fix
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

// Uses LLM to generate a corrected version of a failed shell command
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

// Determines whether to route user input to docs, shell, or chat
const routeRequest = async (input: string): Promise<{ action: 'chat' | 'docs' | 'shell', data?: string }> => {
    try {
        const systemPrompt = `You are a smart routing assistant. Analyze the user's input and decide what action to take:

1. "docs" - If they're asking about SLURM, HPC, clusters, supercomputers, documentation, tutorials, or technical help
2. "shell" - If they want to execute commands, create/delete files/directories, check system status, or perform system operations
3. "chat" - For general conversation, greetings, or questions not related to docs or shell commands

Respond with ONLY one word: "docs", "shell", or "chat"

Examples:
- "How do I submit a SLURM job?" → docs
- "Create a directory called test" → shell  
- "Hello, how are you?" → chat
- "What's the weather like?" → chat
- "List all files in the current directory" → shell
- "How do I use sbatch?" → docs`;

        const response = await callPrehostedModel(
            [{ role: 'user', content: input }], 
            systemPrompt
        );
        
        const action = response.trim().toLowerCase();
        
        if (action === 'docs' || action === 'shell' || action === 'chat') {
            return { action: action as 'chat' | 'docs' | 'shell' };
        }
        
        return { action: 'chat' };
    } catch (error) {
        console.log('Routing failed, defaulting to chat:', error);
        return { action: 'chat' };
    }
};

// Converts natural language instructions into shell commands
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

// Checks if input matches direct shell command patterns (very strict)
const isDirectShellCommand = (input: string): boolean => {
    const trimmed = input.trim();
    
    // Only match commands that start exactly with known command words
    const exactCommandPatterns = [
        /^ls(\s|$)/, /^cd(\s|$)/, /^pwd$/, /^cat(\s|$)/, /^grep(\s|$)/, /^find(\s|$)/,
        /^ps(\s|$)/, /^kill(\s|$)/, /^mkdir(\s|$)/, /^rm(\s|$)/, /^cp(\s|$)/, /^mv(\s|$)/,
        /^chmod(\s|$)/, /^chown(\s|$)/, /^du(\s|$)/, /^df(\s|$)/, /^free(\s|$)/, /^top$/,
        /^htop$/, /^whoami$/, /^date$/, /^uptime$/, /^uname(\s|$)/,
        /^squeue(\s|$)/, /^sbatch(\s|$)/, /^scancel(\s|$)/, /^sinfo(\s|$)/, /^srun(\s|$)/,
        /^sacct(\s|$)/, /^scontrol(\s|$)/, /^module(\s|$)/, /^git(\s|$)/, /^python(\s|$)/,
        /^pip(\s|$)/, /^npm(\s|$)/, /^gcc(\s|$)/, /^make(\s|$)/, /^vim(\s|$)/, /^nano(\s|$)/,
        /^tar(\s|$)/, /^zip(\s|$)/, /^unzip(\s|$)/, /^ping(\s|$)/, /^wget(\s|$)/, /^curl(\s|$)/,
        /^ssh(\s|$)/, /^which(\s|$)/, /^echo(\s|$)/, /^head(\s|$)/, /^tail(\s|$)/, /^sort(\s|$)/
    ];
    
    // Check for exact command matches
    const hasExactCommand = exactCommandPatterns.some(pattern => pattern.test(trimmed));
    
    // Check for shell operators (these are definitely direct shell commands)
    const hasShellOperators = trimmed.includes(' | ') || trimmed.includes(' && ') || 
                             trimmed.includes(' || ') || trimmed.includes('; ') ||
                             trimmed.endsWith(' &') || trimmed.startsWith('sudo ') ||
                             trimmed.includes(' > ') || trimmed.includes(' >> ') ||
                             trimmed.includes(' < ') || trimmed.startsWith('./');
    
    return hasExactCommand || hasShellOperators;
};

// Simulates streaming response to reduce flickering and provide smooth display
const simulateStreamingResponse = async (fullResponse: string, setStreamingContent: (content: string) => void): Promise<string> => {
    return new Promise((resolve) => {
        let currentIndex = 0;
        const chunkSize = 15; // Characters to display at once to reduce flickering
        const delay = 50; // Milliseconds between chunks
        
        // Start with first chunk immediately to avoid empty box
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
                // Don't set final content here - let the caller handle it
                resolve(fullResponse);
            }
        }, delay);
    });
};

// Displays animated thinking indicator
const ThinkingAnimation = () => {
    const [frame, setFrame] = useState(0);
    const frames = ["( ●    )", "(  ●   )", "(   ●  )", "(    ● )", "(     ●)", "(    ● )", "(   ●  )", "(  ●   )", "( ●    )", "(●     )"];
    
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % frames.length);
        }, 80);
        return () => clearInterval(interval);
    }, []);

    return <Text color="blue">Thinking {frames[frame]}</Text>;
};

// Main application component
export const App: FC = () => {
    const [uiucModel, setUiucModel] = useState<string>('llama3.1:8b-instruct-fp16');
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    const [history, setHistory] = useState<ChatMessageT[]>([]);
    const [streamingContent, setStreamingContent] = useState<string | null>(null);
    const [selectingUiucModel, setSelectingUiucModel] = useState<boolean>(false);
    const [initialized, setInitialized] = useState<boolean>(false);
    const [showCommandSuggestions, setShowCommandSuggestions] = useState<boolean>(false);

    const uiucModelOptions: string[] = [
        'llama3.1:8b-instruct-fp16',
        'Qwen/Qwen2.5-VL-72B-Instruct',
        'qwen2.5:7b-instruct-fp16',
        'qwen2.5:14b-instruct-fp16',
        'deepseek-r1:14b-qwen-distill-fp16',
        'gpt-4o-mini',
    ];

    const { stdout } = useStdout();
    const terminalWidth = stdout.columns || 80;
    const commands: SlashCommand[] = [new EmailCommand(), new ClearCommand()];
    
    // Generates command suggestions for slash commands
    const getCommandSuggestions = () => {
        const allCommands = [
            { name: 'email', description: 'Send an email' },
            { name: 'rmodel', description: 'Change the UIUC.chat model' },
            { name: 'clear', description: 'Clear the chat history' },
            { name: 'help', description: 'Show available commands' }
        ];
        
        if (!input.startsWith('/')) return [];
        const query = input.slice(1).toLowerCase();
        if (query === '') return allCommands;
        return allCommands.filter(cmd => cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query));
    };
    
    const commandSuggestions = getCommandSuggestions();
    const dynamicMessage: ChatMessageT | null = waiting && streamingContent !== null ? { role: 'assistant', content: streamingContent } : null;

    // Handles input field changes
    const handleInputChange = (value: string) => {
        setInput(value);
        setShowCommandSuggestions(value.startsWith('/') && value.length >= 1);
    };

    // Initialize application state
    useEffect(() => {
        if (!initialized) {
            setHistory([{ 
                role: 'assistant', 
                content: 'Hello! I\'m Delta\'s smart AI agent. I can:\n\n• Search UIUC/SLURM documentation for technical questions\n• Execute terminal commands with automatic error recovery\n• Convert natural language to shell commands\n• Chat normally for general queries\n• Execute direct commands (like "ls", "mkdir test") immediately\n\nJust ask me anything!\n\nType "/help" for more options.' 
            }]);
            setInitialized(true);
        }
    }, []);

    // Handle escape key during model selection
    useInput((_, key) => {
        if (selectingUiucModel && key.escape) {
            setSelectingUiucModel(false);
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: 'Model selection cancelled.' }]);
        }
    });

    // Handles UIUC model selection from dropdown
    const handleUiucModelSelect = (item: { label: string; value: string }) => {
        setUiucModel(item.value);
        setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: `UIUC model set to ${item.value}` }]);
        setSelectingUiucModel(false);
    };

    // Processes user input and generates responses
    const onSubmit = async () => {
        const trimmed = input.trim();
        setShowCommandSuggestions(false);
        
        // Handle slash commands
        if (trimmed.startsWith('/')) {
            const parts = trimmed.slice(1).split(/\s+/);
            const name = parts[0];
            const args = parts.slice(1);
            
            if (name === 'rmodel') {
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'user', content: trimmed }]);
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: 'Select a UIUC model:' }]);
                setSelectingUiucModel(true);
                setInput('');
                return;
            }
            
            if (name === 'clear') {
                const cmd = commands.find(c => c.name === name);
                if (cmd) {
                    await cmd.execute({ args, history, setHistory, setInput, commands });
                    setStreamingContent(null);
                    setWaiting(false);
                    setSelectingUiucModel(false);
                    setShowCommandSuggestions(false);
                }
                return;
            }
            
            if (name === 'help') {
                let helpText = 'Available Commands:\n\n/email - Send an email\n/rmodel - Change the UIUC.chat model\n/clear - Clear the chat history\n/help - Show available commands\n\nFeatures:\n• Intelligent routing with shell commands and documentation\n• Direct terminal commands work immediately\n• Natural language commands converted to shell commands\n• UIUC documentation search for technical questions';
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
        const userMessage: ChatMessageT = { role: 'user', content: input };
        setHistory((prev: ChatMessageT[]) => [...prev, userMessage]);
        setInput('');

        try {
            let response: string;
            
            // Execute direct shell commands immediately
            if (isDirectShellCommand(trimmed)) {
                console.log('Direct shell command detected, executing immediately');
                response = await executeShellCommand(trimmed);
            } else {
                console.log('Using smart agent with intelligent routing');
                
                // Route request using pre-hosted LLM
                const routing = await routeRequest(trimmed);
                console.log('Routing decision:', routing.action);
                
                switch (routing.action) {
                    case 'docs':
                        console.log('Routing to documentation search');
                        const rawDocs = await searchUIUCDocs(trimmed, uiucModel);
                        
                        // Process documentation with pre-hosted LLM for concise response
                        console.log('Processing documentation with pre-hosted LLM for concise response');
                        const docResponse = await callPrehostedModel([
                            { role: 'user', content: `Based on this documentation, please provide a concise and focused answer to the question: "${trimmed}"\n\nDocumentation:\n${rawDocs}\n\nPlease give a clear, direct answer focusing only on what the user asked. Keep it under 200 words.` }
                        ]);
                        response = await simulateStreamingResponse(docResponse, setStreamingContent);
                        break;
                    case 'shell':
                        console.log('Routing to shell execution (natural language)');
                        const shellCommand = await naturalLanguageToShell(trimmed);
                        console.log('Converted to shell command:', shellCommand);
                        response = await executeShellCommand(shellCommand);
                        break;
                    default:
                        console.log('Routing to general chat');
                        const chatResponse = await callPrehostedModel([{ role: 'user', content: trimmed }]);
                        response = await simulateStreamingResponse(chatResponse, setStreamingContent);
                        break;
                }
            }
            
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: response }]);
            
        } catch (error: any) {
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
        }

        setStreamingContent(null);
        setWaiting(false);
    };

    // Renders input prompt and suggestions
    const Prompt = () => {
        if (waiting) {
            return (
                <Box width={terminalWidth} borderStyle="round" borderColor="green">
                    <ThinkingAnimation />
                </Box>
            );
        }
        return (
            <Box flexDirection="column">
                <TextBox width={terminalWidth} value={input} onChange={handleInputChange} onSubmit={onSubmit} />
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
                <Box width={terminalWidth} paddingTop={0}>
                    <Text dimColor>ctrl+c to exit | '/' to see commands | UIUC Model: {uiucModel}</Text>
                </Box>
            </Box>
        );
    };

    return (
        <Box flexDirection="column">
            <Box width={terminalWidth} marginBottom={1}>
                <Box width="100%" borderStyle="round" borderColor="green" padding={1}>
                    <Text bold color="green">Delta</Text>
                    <Text> | </Text>
                    <Text>UIUC.chat Model: {uiucModel}</Text>
                </Box>
            </Box>

            {history.map((msg, idx) => (
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
            ))}

            {selectingUiucModel ? (
                <Box width={terminalWidth} justifyContent="flex-start">
                    <Box flexDirection="column">
                        <Box marginBottom={1}><Text color="yellow">Select a UIUC model (ESC to cancel):</Text></Box>
                        <SelectInput items={uiucModelOptions.map(opt => ({ label: opt, value: opt }))} onSelect={handleUiucModelSelect} />
                    </Box>
                </Box>
            ) : (
                <>
                    {dynamicMessage && (
                        <Box width={terminalWidth} flexDirection="column" marginBottom={1}>
                            <Text color="blue" bold>Assistant:</Text>
                            <Box borderStyle="round" borderColor="blue" padding={1}>
                                <Text>{dynamicMessage.content}</Text>
                            </Box>
                        </Box>
                    )}
                    <Prompt />
                </>
            )}
        </Box>
    );
};