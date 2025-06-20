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
import type { IncomingMessage } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Animated thinking indicator
const ThinkingAnimation = () => {
    const [frame, setFrame] = useState(0);
    const frames = [
        "( ●    )",
        "(  ●   )",
        "(   ●  )",
        "(    ● )",
        "(     ●)",
        "(    ● )",
        "(   ●  )",
        "(  ●   )",
        "( ●    )",
        "(●     )"
    ];
    
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % frames.length);
        }, 80);
        return () => clearInterval(interval);
    }, []);

    return <Text color="blue">Thinking {frames[frame]}</Text>;
};

// Determines if input is a shell command or question for AI
const classifyInput = (input: string): 'shell' | 'question' => {
    const shellPatterns = [
        // Standard Unix/Linux commands
        /^ls\b/, /^cd\b/, /^pwd$/, /^cat\b/, /^grep\b/, /^find\b/,
        /^ps\b/, /^kill\b/, /^mkdir\b/, /^rm\b/, /^cp\b/, /^mv\b/,
        /^chmod\b/, /^chown\b/, /^tar\b/, /^gzip\b/, /^gunzip\b/,
        /^wget\b/, /^curl\b/, /^ssh\b/, /^scp\b/, /^rsync\b/,
        /^vim\b/, /^nano\b/, /^less\b/, /^more\b/, /^head\b/, /^tail\b/,
        /^sort\b/, /^uniq\b/, /^awk\b/, /^sed\b/, /^cut\b/, /^tr\b/,
        /^which\b/, /^whereis\b/, /^whoami$/, /^id$/, /^groups$/,
        /^top$/, /^htop$/, /^free\b/, /^df\b/, /^du\b/, /^lscpu$/,
        /^uname\b/, /^uptime$/, /^date$/, /^cal$/, /^history$/,
        
        // SLURM commands
        /^squeue\b/, /^sbatch\b/, /^scancel\b/, /^sinfo\b/, /^srun\b/,
        /^sacct\b/, /^scontrol\b/, /^salloc\b/, /^sprio\b/, /^sstat\b/,
        /^sreport\b/, /^sshare\b/, /^smap$/, /^strigger\b/,
        
        // Module system (common in HPC)
        /^module\b/, /^ml\b/,
        
        // HPC/parallel computing tools
        /^mpirun\b/, /^mpiexec\b/, /^nvidia-smi\b/, /^ibstat\b/,
        /^ibhosts\b/, /^ibnodes\b/,
        
        // Development/compilation tools
        /^git\b/, /^python\b/, /^python3\b/, /^pip\b/, /^pip3\b/,
        /^gcc\b/, /^g\+\+\b/, /^make\b/, /^cmake\b/, /^gdb\b/,
        /^valgrind\b/, /^strace\b/, /^ldd\b/,
        /^node\b/, /^npm\b/, /^yarn\b/, /^conda\b/,
        
        // System monitoring
        /^iostat\b/, /^vmstat\b/, /^netstat\b/, /^ss\b/, /^lsof\b/,
        /^dmesg\b/, /^journalctl\b/, /^systemctl\b/,
    ];
    
    return shellPatterns.some(pattern => pattern.test(input.trim())) ? 'shell' : 'question';
};

// Executes shell commands with timeout and error handling
const executeShellCommand = async (command: string): Promise<string> => {
    try {
        const { stdout, stderr } = await execAsync(command, { 
            timeout: 30000,
            maxBuffer: 1024 * 1024
        });
        
        if (stderr && !stdout) {
            return `Error: ${stderr}`;
        }
        
        return stdout || stderr || 'Command executed successfully (no output)';
    } catch (error: any) {
        if (error.code === 'ETIMEDOUT') {
            return 'Error: Command timed out after 30 seconds';
        }
        return `Error: ${error.message}`;
    }
};

export const App: FC = () => {
    const [model, setModel] = useState<string>('llama3.1:8b-instruct-fp16');
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    const [history, setHistory] = useState<ChatMessageT[]>([]);
    const [streamingContent, setStreamingContent] = useState<string | null>(null);
    const [selectingModel, setSelectingModel] = useState<boolean>(false);
    const [initialized, setInitialized] = useState<boolean>(false);
    const [showCommandSuggestions, setShowCommandSuggestions] = useState<boolean>(false);
    
    const modelOptions: string[] = [
        'llama3.1:8b-instruct-fp16',
        'Qwen/Qwen2.5-VL-72B-Instruct',
        'qwen2.5:7b-instruct-fp16',
        'qwen2.5:14b-instruct-fp16',
        'deepseek-r1:14b-qwen-distill-fp16',
        'gpt-4.1-mini',
    ];

    const { stdout } = useStdout();
    const terminalWidth = stdout.columns || 80;
    const commands: SlashCommand[] = [new EmailCommand(), new ClearCommand()];
    
    // Gets slash command suggestions based on user input
    const getCommandSuggestions = () => {
        const allCommands = [
            { name: 'email', description: 'Send an email' },
            { name: 'model', description: 'Change the current model' },
            { name: 'clear', description: 'Clear the chat history' },
            { name: 'help', description: 'Show available commands' }
        ];
        
        if (!input.startsWith('/')) return [];
        
        const query = input.slice(1).toLowerCase();
        if (query === '') return allCommands;
        
        return allCommands.filter(cmd => 
            cmd.name.toLowerCase().includes(query) || 
            cmd.description.toLowerCase().includes(query)
        );
    };
    
    const commandSuggestions = getCommandSuggestions();
    
    const dynamicMessage: ChatMessageT | null = waiting && streamingContent !== null
        ? { role: 'assistant', content: streamingContent }
        : null;

    // Handles input changes and shows command suggestions
    const handleInputChange = (value: string) => {
        setInput(value);
        
        if (value.startsWith('/') && value.length >= 1) {
            setShowCommandSuggestions(true);
        } else {
            setShowCommandSuggestions(false);
        }
    };

    // Initialize welcome message once
    useEffect(() => {
        if (!initialized) {
            setHistory([{ role: 'assistant', content: 'Hello, I am Delta\'s chatbot. I can answer questions or execute shell/SLURM commands. What can I help you with?' }]);
            setInitialized(true);
        }
    }, []);

    // Handle ESC key to exit model selection
    useInput((_, key) => {
        if (selectingModel && key.escape) {
            setSelectingModel(false);
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: 'Model selection cancelled.' }]);
        }
    });

    // Handles model selection
    const handleModelSelect = (item: { label: string; value: string }) => {
        setModel(item.value);
        setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: `Model set to ${item.value}` }]);
        setSelectingModel(false);
    };

    // Calls uiuc.chat API with streaming support
    const callUIUCChatAPI = async (userMessage: ChatMessageT) => {
        const endpoint = 'https://uiuc.chat/api/chat-api/chat';
        const requestData = {
            model: model,
            messages: [...history, userMessage],
            api_key: env.UIUC_API_KEY,
            course_name: env.UIUC_COURSE_NAME,
            stream: true,
            temperature: 0.1,
            retrieval_only: false,
        };

        const url = new URL(endpoint);
        const payload = JSON.stringify(requestData);

        let fullResponse = '';
        let lastContentLength = 0;
        
        await new Promise<void>((resolve) => {
            const req = https.request(
                {
                    hostname: url.hostname,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': new TextEncoder().encode(payload).length,
                    },
                },
                (response: IncomingMessage) => {
                    response.on('data', (chunk: Uint8Array) => {
                        const token = new TextDecoder().decode(chunk);
                        fullResponse += token;
                        
                        // Length-based debouncing to reduce flickering
                        if (fullResponse.length - lastContentLength > 20) {
                            setStreamingContent(fullResponse);
                            lastContentLength = fullResponse.length;
                        }
                    });
                    response.on('end', () => {
                        setStreamingContent(fullResponse);
                        resolve();
                    });
                }
            );
            req.on('error', () => resolve());
            req.write(payload);
            req.end();
        });

        return fullResponse;
    };

    // Main submission handler - routes to slash commands, shell execution, or AI chat
    const onSubmit = async () => {
        const trimmed = input.trim();
        setShowCommandSuggestions(false);
        
        // Handle slash commands
        if (trimmed.startsWith('/')) {
            const parts = trimmed.slice(1).split(/\s+/);
            const name = parts[0];
            const args = parts.slice(1);
            
            if (name === 'model') {
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'user', content: trimmed }]);
                setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: 'Select a model:' }]);
                setSelectingModel(true);
                setInput('');
                return;
            }
            
            if (name === 'clear') {
                const cmd = commands.find(c => c.name === name);
                if (cmd) {
                    await cmd.execute({ args, history, setHistory, setInput, commands });
                    
                    // Reset additional state after clear command executes
                    setStreamingContent(null);
                    setWaiting(false);
                    setSelectingModel(false);
                    setShowCommandSuggestions(false);
                }
                return;
            }
            
            if (name === 'help') {
                let helpText = 'Available Commands:\n\n';
                helpText += '/email - Send an email\n';
                helpText += '/model - Change the current model\n';
                helpText += '/clear - Clear the chat history\n';
                helpText += '/help - Show available commands\n';
                helpText += '\nYou can also:\n';
                helpText += '• Ask questions (sent to AI)\n';
                helpText += '• Run shell/SLURM commands directly\n';
                helpText += '\nType any command with "/" prefix to use it.';
                
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
                setHistory((prev: ChatMessageT[]) => [
                    ...prev,
                    { role: 'assistant', content: `Unknown command: ${name}. Type /help for list.` },
                ]);
                setInput('');
            }
            return;
        }

        // Agent workflow: classify input and route to appropriate handler
        setWaiting(true);
        const userMessage: ChatMessageT = { role: 'user', content: input };
        setHistory((prev: ChatMessageT[]) => [...prev, userMessage]);
        setInput('');

        const inputType = classifyInput(trimmed);
        
        try {
            let response: string;
            
            if (inputType === 'shell') {
                response = await executeShellCommand(trimmed);
                response = `$ ${trimmed}\n${response}`;
            } else {
                setStreamingContent('');
                response = await callUIUCChatAPI(userMessage);
            }
            
            setHistory((prev: ChatMessageT[]) => [...prev, { role: 'assistant', content: response }]);
            
        } catch (error: any) {
            setHistory((prev: ChatMessageT[]) => [...prev, { 
                role: 'assistant', 
                content: `Error: ${error.message}` 
            }]);
        }

        setStreamingContent(null);
        setWaiting(false);
    };

    // Input prompt with thinking animation or text input
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
                <TextBox 
                    width={terminalWidth} 
                    value={input} 
                    onChange={handleInputChange} 
                    onSubmit={onSubmit}
                />
                
                {/* Command suggestions popup */}
                {showCommandSuggestions && commandSuggestions.length > 0 && (
                    <Box 
                        width={terminalWidth} 
                        borderStyle="round" 
                        borderColor="yellow" 
                        padding={1}
                        marginTop={1}
                    >
                        <Box flexDirection="column">
                            <Text bold color="yellow">Available Commands:</Text>
                            {commandSuggestions.map((cmd, idx) => (
                                <Box key={cmd.name} marginTop={idx === 0 ? 1 : 0}>
                                    <Text color="white">
                                        /{cmd.name} - {cmd.description}
                                    </Text>
                                </Box>
                            ))}
                            <Box marginTop={1}>
                                <Text dimColor>
                                    Continue typing or press Enter to execute
                                </Text>
                            </Box>
                        </Box>
                    </Box>
                )}
                
                <Box width={terminalWidth} paddingTop={0}>
                    <Text dimColor>ctrl+c to exit | '/' to see commands</Text>
                </Box>
            </Box>
        );
    };

    return (
        <Box flexDirection="column">
            {/* Header bar */}
            <Box width={terminalWidth} marginBottom={1}>
                <Box width="100%" borderStyle="round" borderColor="green" padding={1}>
                    <Text bold color="green">Delta</Text>
                    <Text> | </Text>
                    <Text>Current model: {model}</Text>
                    <Text> | </Text>
                    <Text>AI Chat + Shell/SLURM Commands</Text>
                </Box>
            </Box>

            {/* Chat history */}
            {history.map((msg, idx) => (
                <Box
                    key={`message-${idx}`}
                    width={terminalWidth}
                    flexDirection="column"
                    marginBottom={1}
                >
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
            
            {/* Model selection or main interface */}
            {selectingModel ? (
                <Box width={terminalWidth} justifyContent="flex-start">
                    <Box flexDirection="column">
                        <Box marginBottom={1}>
                            <Text color="yellow">Select a model (ESC to cancel):</Text>
                        </Box>
                        <SelectInput
                            items={modelOptions.map(opt => ({ label: opt, value: opt }))}
                            onSelect={handleModelSelect}
                        />
                    </Box>
                </Box>
            ) : (
                <>
                    {/* Streaming response display */}
                    {dynamicMessage && (
                        <Box
                            width={terminalWidth}
                            flexDirection="column"
                            marginBottom={1}
                        >
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