# Illinois Chat Server MCP

A Model Context Protocol (MCP) server that provides access to the Illinois Chat API for querying Delta documentation and AI-related resources.

## Overview

This MCP server enables AI assistants to query Delta documentation through the Illinois Chat API, providing access to comprehensive HPC (High Performance Computing) documentation and AI resources.

## Features

### Available Tools

#### 1. `delta-docs`
Query the Delta documentation for general HPC information.

**Parameters:**
- `message` (string): The query message to send to the Illinois Chat API

**Example:**
```json
{
  "message": "How do I submit a SLURM job on Delta?"
}
```

#### 2. `delta-ai-docs`  
Query the Delta AI documentation for AI/ML specific information.

**Parameters:**
- `message` (string): The query message to send to the Illinois Chat API for AI documentation

**Example:**
```json
{
  "message": "What GPU resources are available for deep learning?"
}
```

## Installation

### Prerequisites
- Node.js >= 18
- Access to Illinois Chat API
- Environment variables configured

### Setup

1. **Install dependencies:**
   ```bash
   cd mcp_servers/illinois_chat_server
   bun install
   # or
   npm install
   ```

2. **Build the server:**
   ```bash
   bun run build
   # or
   npm run build
   ```

3. **Set up environment variables:**
   ```bash
   export ILLINOIS_CHAT_API_KEY="your_api_key_here"
   export ILLINOIS_CHAT_COURSE="Delta-Documentation"  # or "Delta-AI-Documentation"
   ```

## Configuration

### OpenCode Integration

Add this to your `opencode.jsonc` file:

```json
{
  "mcp": {
    "illinois-chat-server": {
      "type": "local",
      "command": ["bun", "run", "illinois-chat-server"],
      "enabled": true
    }
  }
}
```

### Environment Variables

The server requires the following environment variables:

| Variable | Description |
|----------|-------------|
| `ILLINOIS_CHAT_API_KEY` | Your Illinois Chat API key |

## Usage

### Running the Server

```bash
# Development mode
bun run dev

# Production mode
bun run start
```

### Tool Usage Examples

#### Querying Delta Documentation
```javascript
// Query general Delta documentation
{
  "tool": "delta-docs",
  "arguments": {
    "message": "How do I check my job status in SLURM?"
  }
}
```

#### Querying Delta AI Documentation
```javascript
// Query AI-specific documentation
{
  "tool": "delta-ai-docs", 
  "arguments": {
    "message": "What are the available PyTorch versions on Delta?"
  }
}
```

## API Integration

The server integrates with the Illinois Chat API at `https://uiuc.chat/api/chat-api/chat` using the following request format:

```javascript
{
  "model": "Qwen/Qwen2.5-VL-72B-Instruct",
  "messages": [
    {
      "role": "user", 
      "content": "your query here"
    }
  ],
  "api_key": "your_api_key",
  "course_name": "Delta-Documentation",
  "stream": false,
  "temperature": 0.1,
  "retrieval_only": false
}
```

## Error Handling

The server includes comprehensive error handling for:

- **API Connection Issues**: Network timeouts and connection failures
- **Authentication Errors**: Invalid API keys or access permissions
- **Malformed Requests**: Invalid parameters or missing required fields
- **Rate Limiting**: Automatic retry logic for rate-limited requests

## Development

### Project Structure
```
illinois_chat_server/
├── dist/           # Compiled JavaScript output
├── src/            # TypeScript source files (if using TypeScript)
├── package.json    # Package configuration
├── README.md       # This file
└── bun.lock       # Lock file for dependencies
```

### Scripts

- `bun run build` - Compile TypeScript to JavaScript
- `bun run dev` - Run in development mode with hot reload
- `bun run start` - Run the compiled server
- `bun run illinois-chat-server` - Run the server (used by MCP)

## Troubleshooting

### Common Issues

1. **"API key not found"**
   - Ensure `ILLINOIS_CHAT_API_KEY` environment variable is set
   - Verify the API key is valid and has proper permissions

2. **"Course not found"**
   - Check that `ILLINOIS_CHAT_COURSE` is set correctly
   - Verify access to the specified course documentation

3. **"Connection timeout"**
   - Check network connectivity to `https://uiuc.chat`
   - Verify firewall settings allow HTTPS connections

4. **"Server not responding"**
   - Ensure the server is built: `bun run build`
   - Check that Node.js version >= 18 is installed
   - Verify all dependencies are installed: `bun install`

### Debug Mode

Enable debug logging by setting:
```bash
export DEBUG=illinois-chat-server
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add new feature'`
5. Push to the branch: `git push origin feature/new-feature`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Check the [Delta documentation](https://docs.delta.ncsa.illinois.edu/)
- Contact the Delta support team
- File issues in the project repository

---

**Note**: This MCP server is designed specifically for use with the Delta HPC system at NCSA/University of Illinois. Ensure you have proper access credentials before attempting to use this server.
