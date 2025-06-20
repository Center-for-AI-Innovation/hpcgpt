import { SlashCommand } from './SlashCommand.js';
import { ChatMessageT } from '../../index.js';

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
        setInput('');
        setHistory([{ 
            role: 'assistant', 
            content: 'Hello, I am Delta\'s chatbot. I can answer questions or execute shell/SLURM commands. What can I help you with?' 
        }]);
    }
}