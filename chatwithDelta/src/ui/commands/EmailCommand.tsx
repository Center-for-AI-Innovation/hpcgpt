import { SlashCommand } from './SlashCommand.js';
import type { Dispatch, SetStateAction } from 'react';
import { env } from '../../env.js'; // ← Try this path instead
import nodemailer from 'nodemailer';
import React from 'react';
import { render } from '@react-email/render';
import type { ChatMessageT } from '../types.js';
import https from 'https';
import { URL } from 'url';

/**
 * Props for the HTML email conversation template.
 */
type ConversationEmailProps = {
  messages: ChatMessageT[];
  subject: string;
};

/**
 * React Email template for the conversation HTML.
 */
const ConversationEmail = ({ messages, subject }: ConversationEmailProps) => (
  <html>
    <head>
      <meta charSet='utf-8' />
      <title>{`ChatWith${env.SYSTEM_NAME} Conversation`}</title>
    </head>
    <h1>Report Details</h1>
    <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '20px', border: '1px solid #ddd' }}>
      <tbody>
        <tr>
          <td style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', fontWeight: 'bold', border: '1px solid #ddd', width: '25%' }}>
            Research System
          </td>
          <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
            {env.SYSTEM_NAME}
          </td>
        </tr>
        <tr>
          <td style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', fontWeight: 'bold', border: '1px solid #ddd' }}>
            Reporter
          </td>
          <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
            {process.env.USER || 'Unknown User'}
          </td>
        </tr>
        <tr>
          <td style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', fontWeight: 'bold', border: '1px solid #ddd' }}>
            Report Date
          </td>
          <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
            {new Date().toLocaleString()}
          </td>
        </tr>
        <tr>
          <td style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', fontWeight: 'bold', border: '1px solid #ddd' }}>
            Subject
          </td>
          <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
            {subject}
          </td>
        </tr>
        
      </tbody>
    </table>
    <body style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
      <details open>
        <summary style={{ fontSize: '1.2em', fontWeight: 'bold', cursor: 'pointer', marginBottom: '10px' }}>
          {`ChatWith${env.SYSTEM_NAME} Conversation History`}
        </summary>
        <div style={{ marginLeft: '20px', marginTop: '10px' }}>
          {messages.map((msg, i) => (
            <p key={i} style={{ marginBottom: '8px', padding: '5px', backgroundColor: msg.role === 'user' ? '#f0f8ff' : '#f8f8f8', borderRadius: '3px' }}>
              <strong style={{ color: msg.role === 'user' ? '#0066cc' : '#cc6600' }}>{msg.role}:</strong> {msg.content}
            </p>
          ))}
        </div>
      </details>
    </body>
  </html>
);

/**
 * Calls the AI model to generate summaries using Illinois chat endpoint
 */
const callAIModel = async (messages: any[], systemPrompt?: string): Promise<string> => {
  try {
    console.log('Calling AI model for email summary');
    
    const formattedMessages = systemPrompt 
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const requestData = {
      model: 'Qwen/Qwen2.5-VL-72B-Instruct',
      messages: formattedMessages,
      api_key: env.UIUC_API_KEY,
      course_name: env.UIUC_COURSE_NAME,
      stream: false,
      temperature: 0.1,
      retrieval_only: false
    };

    const url = new URL(env.MODEL_URL);
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
            // Use the correct response field for Illinois endpoint
            const content = parsed.message || 
                          parsed.choices?.[0]?.message?.content || 
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
    console.log('Error calling AI model:', error.message);
    return `Error generating summary: ${error.message}`;
  }
};

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

    // Show that we're generating the email summary
    setHistory((prev) => [
      ...prev,
      { role: 'assistant', content: 'Generating conversation summary and preparing email...' },
    ]);

    try {
      // Generate AI summary of the conversation
      const conversationText = newHistory
        .filter(msg => !msg.content.startsWith('/email')) // Exclude the email command itself
        .map((item) => `${item.role}: ${item.content}`)
        .join('\n');

      const systemPrompt = `You are an expert at summarizing technical conversations. Analyze this conversation between a user and an AI assistant about HPC/SLURM/cluster computing issues.

Create a concise summary (maximum 10 words) that captures:
1. The main problem or question being discussed
2. Key technical topics (SLURM, jobs, cluster, etc.)

Format: Brief description of the main issue/topic
Examples: 
- "SLURM job allocation memory issues"
- "Cluster queue management problems" 
- "Job efficiency optimization questions"
- "General HPC troubleshooting assistance"

Conversation to summarize:
${conversationText}

Summary:`;

      const aiSummary = await callAIModel(
        [{ role: 'user', content: conversationText }],
        systemPrompt
      );

      // Clean and truncate the summary for email subject
      const cleanSummary = aiSummary
        .replace(/^Summary:\s*/, '')
        .replace(/["\n\r]/g, '')
        .trim()
        .slice(0, 80); // Limit length for email subject

      const subject = `ChatWith${env.SYSTEM_NAME} Report : ${cleanSummary}`;

      // Prepare plain-text and HTML email content.
      const plainText = newHistory
        .map((item) => `${item.role}: ${item.content}`)
        .join('\n');
      const htmlContent = await render(
        <ConversationEmail messages={newHistory} subject={subject} />,
      );

      const transporter = nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail',
      });

      await transporter.sendMail({
        from: 'abode@illinois.edu',
        to: env.EMAIL_TARGET,
        subject: subject,
        text: plainText,
        html: htmlContent,
      });

      setHistory((prev) => [
        ...prev.slice(0, -1), // Remove the "generating" message
        { 
          role: 'assistant', 
          content: `Email sent successfully to ${env.EMAIL_TARGET}\nSubject: ${subject}` 
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setHistory((prev) => [
        ...prev.slice(0, -1), // Remove the "generating" message
        { role: 'assistant', content: `Failed to send email: ${message}` },
      ]);
    }

    setInput('');
  }
}