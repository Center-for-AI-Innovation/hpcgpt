# Delta Slurm MCP Server

A Model Context Protocol (MCP) server that provides access to Slurm command line tools through a standardized interface.

## Features

- **Accounts Tool**: Executes the `accounts` command and returns Slurm account information
- **Sinfo Tool**: Executes the `sinfo` command to check node availability and partition information  
- **Squeue Tool**: Executes the `squeue` command to check what jobs the user is currently running
- **Scontrol Tool**: Executes the `scontrol` command to get detailed information about individual jobs
- **Error Handling**: Graceful error handling with timeout protection
- **TypeScript**: Written in TypeScript with proper type definitions

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Build the project:
   ```bash
   bun run build
   ```

3. Start the server:
   ```bash
   bun run start
   ```

## MCP Tools

### `accounts`

**Description**: Get Slurm account information for the currently active user

**Parameters**:
- `options` (optional, string): Optional command line options to pass to the accounts command

**Usage Example**:
```json
{
  "name": "accounts",
  "arguments": {
    "options": "--help"
  }
}
```

### `sinfo`

**Description**: Check Slurm node availability and partition information

**Parameters**:
- `options` (optional, string): Optional command line options to pass to the sinfo command (e.g., "-N" for node format, "-p partition_name" for specific partition)

**Usage Examples**:
```json
{
  "name": "sinfo",
  "arguments": {}
}
```

```json
{
  "name": "sinfo",
  "arguments": {
    "options": "-N"
  }
}
```

### `squeue`

**Description**: Check what Slurm jobs the user is currently running

**Parameters**:
- `options` (optional, string): Optional command line options to pass to the squeue command (e.g., "-u username" for specific user, "-l" for long format, "-t RUNNING" for specific job states)

**Usage Examples**:
```json
{
  "name": "squeue",
  "arguments": {}
}
```

```json
{
  "name": "squeue",
  "arguments": {
    "options": "-u $USER"
  }
}
```

```json
{
  "name": "squeue",
  "arguments": {
    "options": "-t RUNNING -l"
  }
}
```

### `scontrol`

**Description**: Get detailed information about individual Slurm jobs using scontrol

**Parameters**:
- `job_id` (optional, string): Job ID to get detailed information for
- `options` (optional, string): Optional additional command line options (e.g., "show partition" for partition info, "show node" for node info)

**Usage Examples**:
```json
{
  "name": "scontrol",
  "arguments": {
    "job_id": "12345"
  }
}
```

```json
{
  "name": "scontrol",
  "arguments": {
    "job_id": "12345",
    "options": "--details"
  }
}
```

```json
{
  "name": "scontrol",
  "arguments": {
    "options": "show partition"
  }
}
```

```json
{
  "name": "scontrol",
  "arguments": {
    "options": "show node gpu001"
  }
}
```

## Configuration

The server is configured in `opencode.jsonc`:

```json
{
  "mcp": {
    "delta-accounts-mcp": {
      "type": "local",
      "command": ["bun", "run", "start"],
      "enabled": true
    }
  }
}
```

## Architecture

- **src/index.ts**: Main MCP server implementation
- **dist/**: Compiled JavaScript output
- **package.json**: Project dependencies and scripts
- **tsconfig.json**: TypeScript configuration

## Error Handling

The server includes:
- 30-second timeout for command execution
- 1MB buffer limit for output
- Graceful error messages returned to clients
- Process cleanup on SIGINT
