import React from 'react';
import { Box, Text } from 'ink';

type ChatMessageProps = {
  role: 'user' | 'assistant';
  content: string;
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color={role === 'user' ? 'red' : 'blue'} bold>
      {role === 'user' ? 'User' : 'Assistant'}:
    </Text>
    <Box borderStyle="round" borderColor={role === 'user' ? 'red' : 'blue'} padding={1}>
      <Text>{content}</Text>
    </Box>
  </Box>
);