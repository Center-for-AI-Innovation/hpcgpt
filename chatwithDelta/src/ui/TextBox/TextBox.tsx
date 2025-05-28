import React from "react";

import { Box } from "ink";
import TextInput, { Props } from "ink-text-input";

export type TextBoxProps = Props & {
    width: number;
}

export const TextBox = (props: TextBoxProps) => {
    return <Box width={props.width} borderStyle="round" borderColor="green">
        <TextInput {...props} />
    </Box>
}
