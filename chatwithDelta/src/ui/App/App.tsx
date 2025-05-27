import React from 'react';

import { Box, Text, useStdout, Static } from 'ink';
import https from 'https';
import { URL } from 'url';
import { FC, useState } from 'react';
import { z } from 'zod';
import { ChatMessage, ChatMessageT, TextBox } from '../index.js';

const envSchema = z.object({
    UIUC_API_KEY: z.string(),
    UIUC_COURSE_NAME: z.string(),
});
const env = envSchema.parse(process.env);


export const App: FC = () => {
    const [input, setInput] = useState<string>('');
    const [waiting, setWaiting] = useState<boolean>(false);
    const [history, setHistory] = useState<ChatMessageT[]>([{
        role: 'assistant',
        content: 'Hello, I am a chatbot. What can I help you with?'
    }]);


    const { stdout } = useStdout();
    const terminalWidth = stdout.columns || 80;
    // Separate history into static (printed once) and dynamic (streaming) parts
    const staticHistory = waiting ? history.slice(0, history.length - 1) : history;
    const dynamicMessage = waiting ? history[history.length - 1] : null;
    const onSubmit = async () => {
        setWaiting(true);

        const userMessage: ChatMessageT = {
            role: "user",
            content: input,
        };

        // Call UIUC Chat API
        const endpoint = 'https://uiuc.chat/api/chat-api/chat';
        const requestData = {
            model: 'Qwen/Qwen2.5-VL-72B-Instruct',
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

    const Prompt = () => {
        if (waiting) {
            return (
                <Box width={terminalWidth} borderStyle="round" borderColor="green">
                    <Text>assistant is thinking...</Text>
                </Box>
            );
        }
        return <TextBox width={terminalWidth} value={input} onChange={setInput} onSubmit={onSubmit} />;
    };

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
    );
}

