import React from "react";

import { Box, Text, useStdout } from "ink";
// Render markdown using marked + marked-terminal to avoid CJS require issues
import { parse, setOptions } from "marked";
import TerminalRenderer from "marked-terminal";

// Configure marked to use terminal renderer once per module
setOptions({ renderer: new TerminalRenderer() as any });
import { ChatMessageT } from "../index.js";

export const ChatMessage = (props: ChatMessageT) => {
    // Compute 75% of terminal width for message box
    const { stdout } = useStdout();
    const termWidth = stdout.columns || 80;
    const boxWidth = Math.floor(termWidth * 0.75);
    const alignItems = props.role === "user" ? "flex-end" : "flex-start";
    return (
        <Box width={boxWidth} borderStyle="round" flexDirection="column" alignItems={alignItems}>
            <Text>{props.role}:</Text>
            {props.role === "assistant" ? (
                <Text>{parse(props.content).trim()}</Text>
            ) : (
                <Text>{props.content}</Text>
            )}
        </Box>
    );
};
