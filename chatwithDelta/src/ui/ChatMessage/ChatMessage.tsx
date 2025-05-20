import React from "react";

import { Box, Text } from "ink";
import { ChatMessageT } from "../index.js";

export const ChatMessage = (props: ChatMessageT) => {
    return <Box width={60} borderStyle="round" flexDirection="column" alignItems={props.role === 'user' ? "flex-end" : "flex-start"}>
        <Text>{props.role}: {props.content}</Text>
    </Box>
}
