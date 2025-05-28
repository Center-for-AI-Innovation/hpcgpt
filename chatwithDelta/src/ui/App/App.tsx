import React from 'react';

import { Box, Text, useStdout, Static } from 'ink';
import SelectInput from 'ink-select-input';
import https from 'https';
import nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import { URL } from 'url';
import { FC, useState } from 'react';
import { z } from 'zod';
import { ChatMessage, ChatMessageT, TextBox } from '../index.js';

const envSchema = z.object({
    SYSTEM_NAME: z.string(),
    UIUC_API_KEY: z.string(),
    UIUC_COURSE_NAME: z.string(),
});
process.env['SYSTEM_NAME'] = "Delta";
const env = envSchema.parse(process.env);

// Base class for slash commands
abstract class SlashCommand {
    name: string;
    description: string;
    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
    }
    abstract execute(ctx: {
        args: string[];
        history: ChatMessageT[];
        setHistory: React.Dispatch<React.SetStateAction<ChatMessageT[]>>;
        setInput: React.Dispatch<React.SetStateAction<string>>;
        commands: SlashCommand[];
    }): Promise<void>;
}

// /help command
class HelpCommand extends SlashCommand {
    constructor() {
        super('help', 'Show this help message');
    }
    async execute(ctx: {
        args: string[];
        history: ChatMessageT[];
        setHistory: React.Dispatch<React.SetStateAction<ChatMessageT[]>>;
        setInput: React.Dispatch<React.SetStateAction<string>>;
        commands: SlashCommand[];
    }) {
        const { args, setHistory, setInput, commands } = ctx;
        // record user command
        const userEntry: ChatMessageT = { role: 'user', content: '/' + this.name + (args.length ? ' ' + args.join(' ') : '') };
        setHistory(prev => [...prev, userEntry]);
        // build help text
        // Build help text, including /model command
        const helpLines = commands.map(c => `/${c.name} - ${c.description}`);
        helpLines.push('/model - Select chat model');
        const helpText = helpLines.join('\n');
        setHistory(prev => [...prev, { role: 'assistant', content: helpText }]);
        setInput('');
    }
}

// /email command
class EmailCommand extends SlashCommand {
    constructor() {
        super('email', 'Email conversation to abode@illinois.edu');
    }
    async execute(ctx: {
        args: string[];
        history: ChatMessageT[];
        setHistory: React.Dispatch<React.SetStateAction<ChatMessageT[]>>;
        setInput: React.Dispatch<React.SetStateAction<string>>;
        commands: SlashCommand[];
    }) {
        const { args, history, setHistory, setInput } = ctx;
        const userEntry: ChatMessageT = { role: 'user', content: '/' + this.name + (args.length ? ' ' + args.join(' ') : '') };
        const newHistory = [...history, userEntry];
        setHistory(newHistory);
        // prepare email content
        const plainText = newHistory.map(item => `${item.role}: ${item.content}`).join('\n');
        const htmlContent = await render(<ConversationEmail messages={newHistory} />);
        const transporter = nodemailer.createTransport({ sendmail: true, newline: 'unix', path: '/usr/sbin/sendmail' });
        try {
            await transporter.sendMail({
                from: 'abode@illinois.edu',
                to: 'abode@illinois.edu',
                subject: `ChatWith${env.SYSTEM_NAME} Conversation`,
                text: plainText,
                html: htmlContent,
            });
            setHistory(prev => [...prev, { role: 'assistant', content: 'Email sent to abode@illinois.edu' }]);
        } catch (err: any) {
            setHistory(prev => [...prev, { role: 'assistant', content: `Failed to send email: ${err.message}` }]);
        }
        setInput('');
    }
}

// React Email template for conversation HTML
type ConversationEmailProps = { messages: ChatMessageT[] };
const ConversationEmail = ({ messages }: ConversationEmailProps) => (
    <html>
        <head>
            <meta charSet="utf-8" />
            <title>ChatWith{env.SYSTEM_NAME} Conversation</title>
        </head>
        <body style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
            <h1>ChatWith Conversation</h1>
            {messages.map((msg, i) => (
                <p key={i}>
                    <strong>{msg.role}:</strong> {msg.content}
                </p>
            ))}
        </body>
    </html>
);


export const App: FC = () => {
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    // Completed chat history (static messages)
    const [history, setHistory] = useState<ChatMessageT[]>([{ role: 'assistant', content: 'Hello, I am a chatbot. What can I help you with?' }]);
    // Streaming assistant content (dynamic)
    const [streamingContent, setStreamingContent] = useState<string | null>(null);
    // Model selection state
    const [selectingModel, setSelectingModel] = useState<boolean>(false);
    const modelOptions: string[] = [
        'llama3.1:8b-instruct-fp16',
        'Qwen/Qwen2.5-VL-72B-Instruct',
        'qwen2.5:7b-instruct-fp16',
        'qwen2.5:14b-instruct-fp16',
        'deepseek-r1:14b-qwen-distill-fp16',
        'gpt-4.1-mini',
    ];
    const [model, setModel] = useState<string>(modelOptions[0]!);


    const { stdout } = useStdout();
    const terminalWidth = stdout.columns || 80;
    // Initialize slash commands
    const commands: SlashCommand[] = [new HelpCommand(), new EmailCommand()];
    // Separate history into static and dynamic parts for rendering
    // Static history is all completed messages
    const staticHistory = history;
    // Dynamic message shown only while streaming
    const dynamicMessage: ChatMessageT | null = waiting && streamingContent !== null
        ? { role: 'assistant', content: streamingContent }
        : null;
    // Handler for SelectInput selection
    const handleModelSelect = (item: { label: string; value: string }) => {
        setModel(item.value);
        setHistory(prev => [...prev, { role: 'assistant', content: `Model set to ${item.value}` }]);
        setSelectingModel(false);
    };
    const onSubmit = async () => {
        const trimmed = input.trim();
        // Slash commands
        if (trimmed.startsWith('/')) {
            const parts = trimmed.slice(1).split(/\s+/);
            const name = parts[0];
            const args = parts.slice(1);
            // /model: enter selection mode
            if (name === 'model') {
                setHistory(prev => [...prev, { role: 'user', content: trimmed }]);
                setHistory(prev => [...prev, { role: 'assistant', content: 'Select a model:' }]);
                setSelectingModel(true);
                setInput('');
                return;
            }
            // other slash commands
            const cmd = commands.find(c => c.name === name);
            if (cmd) {
                await cmd.execute({ args, history, setHistory, setInput, commands });
            } else {
                setHistory(prev => [
                    ...prev,
                    { role: 'user', content: trimmed },
                    { role: 'assistant', content: `Unknown command: ${name}. Type /help for list.` },
                ]);
                setInput('');
            }
            return;
        }
        // Begin streaming request
        setWaiting(true);
        const userMessage: ChatMessageT = { role: 'user', content: input };
        // Add user message to history
        setHistory(prev => [...prev, userMessage]);
        // Reset streaming content
        setStreamingContent('');
        // Prepare API request data
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

        // fetch(endpoint, {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify(requestData),
        // })
        // .then(response => response.json())
        // .then(data => {
        // // Print just the message
        // const aiMessage: ChatMessageT = {
        //     role: 'assistant',
        //     content: data.message,
        // };
        // extendHistory([userMessage, aiMessage]);
        // })
        // .catch(error => {
        // console.error('Error:', error);
        // });
        // Stream the response and update the dynamic streamingContent
        const url = new URL(endpoint);
        const payload = JSON.stringify(requestData);

        // Accumulate full response text
        let fullResponse = '';
        await new Promise<void>((resolve) => {
            const req = https.request(
                {
                    hostname: url.hostname,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    },
                },
                (response) => {
                    response.on('data', (chunk) => {
                        const token = chunk.toString('utf8');
                        fullResponse += token;
                        setStreamingContent(fullResponse);
                    });
                    response.on('end', () => resolve());
                }
            );
            req.on('error', () => resolve());
            req.write(payload);
            req.end();
        });

        // Streaming complete: finalize assistant message
        setHistory(prev => [...prev, { role: 'assistant', content: fullResponse }]);
        setStreamingContent(null);
        setWaiting(false);
        setInput('');
    };

    const Prompt = () => {
        if (waiting) {
            return (
                <Box width={terminalWidth} borderStyle="round" borderColor="green">
                    <Text>assistant is thinking...</Text>
                </Box>
            );
        }
        // User input with helper hint below
        return (
            <Box flexDirection="column">
                <TextBox width={terminalWidth} value={input} onChange={setInput} onSubmit={onSubmit} />
                <Box width={terminalWidth} paddingTop={0}>
                    <Text dimColor>ctrl+c to exit | /help to see commands | enter to send</Text>
                </Box>
            </Box>
        );
    };

    // Render completed messages
    // Then either the model selector or live chat UI
    return (
        <>
            <Static items={staticHistory}>
                {(item, idx) => (
                    <Box
                        key={idx}
                        width={terminalWidth}
                        justifyContent={item.role === 'user' ? 'flex-end' : 'flex-start'}
                    >
                        <ChatMessage {...item} />
                    </Box>
                )}
            </Static>
            {selectingModel ? (
                // Interactive model selection
                <>
                    <Box width={terminalWidth} justifyContent="flex-start">
                        <SelectInput
                            items={modelOptions.map(opt => ({ label: opt, value: opt }))}
                            onSelect={handleModelSelect}
                        />
                    </Box>
                </>
            ) : (
                // Live streaming or prompt
                <>
                    {dynamicMessage && (
                        <Box
                            width={terminalWidth}
                            justifyContent={dynamicMessage.role === 'user' ? 'flex-end' : 'flex-start'}
                        >
                            <ChatMessage {...dynamicMessage} />
                        </Box>
                    )}
                    <Prompt />
                </>
            )}
        </>
    );
}

