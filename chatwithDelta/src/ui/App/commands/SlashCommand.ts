import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageT } from '../../types.js';

/**
 * Base class for slash commands. Each command is identified by its name
 * (e.g., 'help') and has a description for the `/help` listing.
 */
export abstract class SlashCommand {
  name: string;
  description: string;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  /**
   * Executes the command with the provided context.
   */
  abstract execute(ctx: {
    args: string[];
    history: ChatMessageT[];
    setHistory: Dispatch<SetStateAction<ChatMessageT[]>>;
    setInput: Dispatch<SetStateAction<string>>;
    commands: SlashCommand[];
  }): Promise<void>;
}