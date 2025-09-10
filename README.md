# hpcgpt
HPCGPT CLI

HPCCode is a customized CLI tool, based on the Opencode[https://opencode.ai] CLI providing custom integrations to slurm based HPC enviroments. 

Right now we are just using a custom configuration file for Opencode so you will need to install opencode itself with:

```bash
curl -fsSL https://opencode.ai/install | bash
```

Once opencode is installed you can set the configuration file and launch opencode.

```bash
export OPENCODE_CONFIG=/path/this/repo/opencode.jsonc
opencode
```

## Environment Configuration

The `example.env` file is a template showing the environment variables that can be set to enable full functionality. You can either export the variables directly or create a `.env` file in the project root.

### Environment Variables

1. **ILLINOIS_CHAT_API_KEY** - API key for Illinois Chat MCP server
   - Get one by creating an account at https://uiuc.chat and selecting the API tab

2. **NCSA_LLM_URL** - URL endpoint for NCSA LLM service
   - Enables using NCSA hosted models 

3. **NCSA_OLLAMA_URL** - URL endpoint for NCSA Ollama service
   - Enables using NCSA hosted models


Additonally our custom chatbots can be found at:

Delta Chatbot
https://uiuc.chat/Delta-Documentation
Course Name : Delta-Documentation

Delta AI Chatbot 
https://uiuc.chat/DeltaAI-Documentation
Course Name : DeltaAI-Documentation
