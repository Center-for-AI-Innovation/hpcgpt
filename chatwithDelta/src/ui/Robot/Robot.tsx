import React from 'react';

import { Box, Text, useApp, useInput } from 'ink';
import { useState } from 'react';

export function Robot() {
    const { exit } = useApp();
    const [x, setX] = useState(0);
    const [y, setY] = useState(0);

    useInput((input, key) => {
        if (input === 'q') {
            exit();
        }

        if (key.leftArrow) {
            setX(Math.max(1, x - 1));
        }

        if (key.rightArrow) {
            setX(Math.min(20, x + 1));
        }

        if (key.upArrow) {
            setY(Math.max(0, y - 1));
        }

        if (key.downArrow) {
            setY(Math.min(9, y + 1));
        }
    });

    return (
        <Box flexDirection="column">
            <Text>Use arrow keys to move the face. Press “q” to exit.</Text>
            <Box height={12} width={25} paddingLeft={x} paddingTop={y} borderStyle="round">
                <Text>^_^</Text>
            </Box>
        </Box>
    );
}
