import React from 'react';

import { Box, Text, useStdout, useInput } from 'ink';
import https from 'https';
import { URL } from 'url';
import { FC, useState } from 'react';
import { z } from 'zod';
import { ChatMessage, ChatMessageT, TextBox } from '../index.js';
// Custom model selector (ignores j/k navigation)

const envSchema = z.object({
    UIUC_API_KEY: z.string(),
    UIUC_COURSE_NAME: z.string(),
});
const env = envSchema.parse(process.env);

// Type for each model option
type ModelItem = {
    label: string;
    value: string;
};

// Props for the custom model selector (ignores j/k keys)
type ModelSelectorProps = {
    items: ModelItem[];
    selectedValue: string;
    onChange: (value: string) => void;
    width: number;
};

// Custom dropdown that only handles arrow keys (up/down)
const ModelSelector: FC<ModelSelectorProps> = ({ items, selectedValue, onChange, width }) => {
    const currentIndex = items.findIndex(item => item.value === selectedValue);
    useInput((_, key) => {
        if (key.upArrow) {
            const next = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
            onChange(items[next]!.value);
        } else if (key.downArrow) {
            const next = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
            onChange(items[next]!.value);
        }
    });
    return (
        <Box flexDirection="column" width={width}>
            {items.map((item, index) => {
                const isSelected = index === currentIndex;
                return isSelected ? (
                    <Text key={item.value} color="cyan">
                        {`> ${item.label}`}
                    </Text>
                ) : (
                    <Text key={item.value}>
                        {`  ${item.label}`}
                    </Text>
                );
            })}
        </Box>
    );
};

// Props for the prompt area (user text input + model selector)
type PromptProps = {
    waiting: boolean;
    input: string;
    setInput: (value: string) => void;
    onSubmit: () => Promise<void>;
    terminalWidth: number;
    models: ModelItem[];
    model: string;
    setModel: (value: string) => void;
};

// Combined prompt: text input and model-selection dropdown
const PromptComponent: FC<PromptProps> = ({
    waiting,
    input,
    setInput,
    onSubmit,
    terminalWidth,
    models,
    model,
    setModel
}) => {
    if (waiting) {
        return (
            <Box width={terminalWidth} borderStyle="round" borderColor="green">
                <Text>assistant is thinking...</Text>
            </Box>
        );
    }
    return (
        <Box flexDirection="row" width={terminalWidth}>
            <Box flexGrow={1}>
                <TextBox
                    width={Math.floor(terminalWidth * 0.7)}
                    value={input}
                    onChange={setInput}
                    onSubmit={onSubmit}
                />
            </Box>
            <Box marginLeft={1} width={Math.floor(terminalWidth * 0.3)}>
                <ModelSelector
                    items={models}
                    selectedValue={model}
                    onChange={setModel}
                    width={Math.floor(terminalWidth * 0.3)}
                />
            </Box>
        </Box>
    );
};


export const App: FC = () => {
    // Available LLM models for selection
    const models: ModelItem[] = [
        { label: 'Qwen2.5 (72B)', value: 'Qwen/Qwen2.5-VL-72B-Instruct' },
        { label: 'llama3.1-8B',    value: 'llama3.1:8b-instruct-fp16'      },
        { label: 'deepseek-14B',   value: 'deepseek-r1:14b-qwen-distill-fp16' },
    ];
    // Currently selected model
    // Initialize to first model in list (guaranteed non-empty)
    const [model, setModel] = useState<string>(models[0]!.value);
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    const [history, setHistory] = useState<ChatMessageT[]>([{
        role: 'assistant',
        content: 'Hello, I am a chatbot. What can I help you with?'
    }]);


    const {stdout} = useStdout();
    const terminalWidth = stdout.columns || 80;
    const onSubmit = async () => {
        setWaiting(true);

        const userMessage: ChatMessageT = {
            role: "user",
            content: input,
        };

        // Call UIUC Chat API
        const endpoint = 'https://uiuc.chat/api/chat-api/chat';
        const requestData = {
            model, // dynamic model selection
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
        // Add the user's message and a placeholder for the assistant
        setHistory(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);

        // Stream the response and update the last message chunk by chunk
        const url = new URL(endpoint);
        const payload = JSON.stringify(requestData);

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
                        setHistory(prevHistory => {
                            const newHistory = [...prevHistory];
                            const last = newHistory[newHistory.length - 1]!;
                            newHistory[newHistory.length - 1] = {
                                role: last.role,
                                content: last.content + token,
                            };
                            return newHistory;
                        });
                    });
                    response.on('end', () => resolve());
                }
            );
            req.on('error', () => resolve());
            req.write(payload);
            req.end();
        });

        setWaiting(false);
        setInput('');
    };


    return (
        <Box width={terminalWidth} flexDirection="column">
            {history.map((item, idx) => (
                <Box
                    key={idx}
                    width={terminalWidth}
                    justifyContent={item.role === 'user' ? 'flex-end' : 'flex-start'}
                >
                    <ChatMessage {...item} />
                </Box>
            ))}
            <PromptComponent
                waiting={waiting}
                input={input}
                setInput={setInput}
                onSubmit={onSubmit}
                terminalWidth={terminalWidth}
                models={models}
                model={model}
                setModel={setModel}
            />
        </Box>
    );
}

