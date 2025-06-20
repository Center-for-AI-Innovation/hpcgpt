import { SlashCommand } from './SlashCommand.js';
import type { Dispatch, SetStateAction } from 'react';
import { env } from '../../env.js'; // ← Fixed to use existing env.ts
import nodemailer from 'nodemailer';
import React from 'react';
import { render } from '@react-email/render';

// Define ChatMessageT locally since it's not exported from index.js
type ChatMessageT = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Props for the HTML email conversation template.
 */
type ConversationEmailProps = {
  messages: ChatMessageT[];
};

/**
 * React Email template for the conversation HTML.
 */
const ConversationEmail = ({ messages }: ConversationEmailProps) => (
  <html>
    <head>
      <meta charSet='utf-8' />
      <title>{`ChatWith${env.SYSTEM_NAME || 'Delta'} Conversation`}</title>
    </head>
    <body style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
      <h1>{`ChatWith${env.SYSTEM_NAME || 'Delta'} Conversation`}</h1>
      {messages.map((msg, i) => (
        <p key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </p>
      ))}
    </body>
  </html>
);

/**
 * `/email` command: emails the entire conversation via sendmail.
 */
export class EmailCommand extends SlashCommand {
  constructor() {
    super('email', 'Email conversation to abode@illinois.edu');
  }

  async execute(ctx: {
    args: string[];
    history: ChatMessageT[];
    setHistory: Dispatch<SetStateAction<ChatMessageT[]>>;
    setInput: Dispatch<SetStateAction<string>>;
    commands: SlashCommand[];
  }): Promise<void> {
    const { args, history, setHistory, setInput } = ctx;

    // Record the /email command.
    const userEntry: ChatMessageT = {
      role: 'user',
      content: `/${this.name}${args.length ? ` ${args.join(' ')}` : ''}`,
    };
    const newHistory = [...history, userEntry];
    setHistory(newHistory);

    // Prepare plain-text and HTML email content.
    const plainText = newHistory
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');
    const htmlContent = await render(
      <ConversationEmail messages={newHistory} />,
    );

    const transporter = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: '/usr/sbin/sendmail',
    });

    try {
      await transporter.sendMail({
        from: 'abode@illinois.edu',
        to: env.EMAIL_TARGET || 'abode@illinois.edu',
        subject: `ChatWith${env.SYSTEM_NAME || 'Delta'} Conversation`,
        text: plainText,
        html: htmlContent,
      });
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Email sent to abode@illinois.edu' },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: `Failed to send email: ${message}` },
      ]);
    }

    setInput('');
  }
}