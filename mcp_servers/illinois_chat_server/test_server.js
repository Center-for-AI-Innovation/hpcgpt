#!/usr/bin/env node

/**
 * Test script for Illinois Chat MCP Server
 * This helps debug connection and tool calling issues
 */

import { spawn } from 'child_process';

console.log('🧪 Testing Illinois Chat MCP Server\n');

// Test 1: Check if server starts
console.log('1. Testing server startup...');
const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
});

let serverOutput = '';
let serverError = '';

serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
});

serverProcess.stderr.on('data', (data) => {
    serverError += data.toString();
    console.log('Server stderr:', data.toString());
});

// Test 2: Send list_tools request
setTimeout(() => {
    console.log('\n2. Testing list_tools request...');
    
    const listToolsRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
    };
    
    serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 1000);

// Test 3: Send tool call request
setTimeout(() => {
    console.log('\n3. Testing delta-docs tool call...');
    
    const toolCallRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
            name: "delta-docs",
            arguments: {
                message: "What is SLURM?"
            }
        }
    };
    
    serverProcess.stdin.write(JSON.stringify(toolCallRequest) + '\n');
}, 2000);

// Clean up after 10 seconds
setTimeout(() => {
    console.log('\n4. Cleaning up...');
    serverProcess.kill();
    
    console.log('\n📊 Test Results:');
    console.log('Server Output:', serverOutput || 'No output');
    console.log('Server Error:', serverError || 'No errors');
    
    process.exit(0);
}, 10000);

// Handle server exit
serverProcess.on('exit', (code) => {
    console.log(`\nServer exited with code: ${code}`);
});

serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

console.log('Server process started, PID:', serverProcess.pid);
console.log('Waiting for responses...\n');
