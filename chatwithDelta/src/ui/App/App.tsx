import React from 'react';

import { Box, Static, Text } from 'ink';
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

    const extendHistory = (entries: ChatMessageT[]) => {
        setHistory([...history, ...entries]);
    }

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
        const url = new URL(endpoint);
        const payload = JSON.stringify(requestData);
        const res = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
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
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
                }
            );
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
        // Handle response as raw text (stream: false returns full text body)
        const content = res.body;
        const aiMessage: ChatMessageT = {
            role: 'assistant',
            content,
        };
        extendHistory([userMessage, aiMessage]);
        setWaiting(false);
        setInput('');
    };

    const Prompt = () => {
        if (waiting) {
            return <Box width={60} borderStyle="round" borderColor="green">
                <Text>"assistant is thinking..."</Text>
            </Box>
        };
        return <TextBox width={80} value={input} onChange={setInput} onSubmit={onSubmit} />
    }

    return <Box width={80}>
        <Static items={history}>
            {(item, idx) => {
                return <Box key={idx} width={80} justifyContent={item.role === 'user' ? 'flex-end' : 'flex-start'}>
                    <ChatMessage {...item} />
                </Box>
            }}
        </Static>
        <Prompt />
    </Box>
}

