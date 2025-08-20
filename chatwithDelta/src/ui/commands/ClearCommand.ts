import { SlashCommand } from './SlashCommand.js';
import type { ChatMessageT } from '../types.js';

export class ClearCommand implements SlashCommand {
    name = 'clear';
    description = 'Clear the chat history';

    async execute({ setHistory, setInput }: { 
        args: string[]; 
        history: ChatMessageT[]; 
        setHistory: (history: ChatMessageT[]) => void;
        setInput: (input: string) => void;
        commands: SlashCommand[];
    }): Promise<void> {
        // Clear input first
        setInput('');
        // Reset history to empty array - no welcome message duplication
        setHistory([]);
        // Or if you want to keep one welcome message:
        // setHistory([{ role: 'assistant', content: 'Chat cleared. What can I help you with?' }]);
    }
}