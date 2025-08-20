import { SlashCommand } from './SlashCommand.js';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageT } from '../types.js';

/**
 * `/help` command: lists available slash commands.
 */
export class HelpCommand extends SlashCommand {
  constructor() {
    super('help', 'Show this help message');
  }

  async execute(ctx: {
    args: string[];
    history: ChatMessageT[];
    setHistory: Dispatch<SetStateAction<ChatMessageT[]>>;
    setInput: Dispatch<SetStateAction<string>>;
    commands: SlashCommand[];
  }): Promise<void> {
    const { args, setHistory, setInput, commands } = ctx;

    // Record the user issuing the help command.
    const userEntry: ChatMessageT = {
      role: 'user',
      content: `/${this.name}${args.length ? ` ${args.join(' ')}` : ''}`,
    };
    setHistory((prev) => [...prev, userEntry]);

    // Build the help text, including the `/model` command.
    const helpLines = commands.map(
      (c) => `/${c.name} - ${c.description}`,
    );
    helpLines.push('/model - Select chat model');
    const helpText = helpLines.join('\n');

    setHistory((prev) => [
      ...prev,
      { role: 'assistant', content: helpText },
    ]);
    setInput('');
  }
}