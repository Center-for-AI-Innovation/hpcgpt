import React from 'react';

import { Box, Text, useStdout, Static } from 'ink';
import SelectInput from 'ink-select-input';
import https from 'https';
import { URL } from 'url';
import { FC, useState } from 'react';
import { ChatMessage, ChatMessageT, TextBox } from '../index.js';
import { SlashCommand } from './commands/SlashCommand.js';
import { HelpCommand } from './commands/HelpCommand.js';
import { EmailCommand } from './commands/EmailCommand.js';
import { env } from '../../env.js';




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

