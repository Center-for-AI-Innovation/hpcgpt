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

Our custom chatbots can be found at:

Delta Chatbot
https://uiuc.chat/Delta-Documentation
Course Name : Delta-Documentation

Delta AI Chatbot 
https://uiuc.chat/DeltaAI-Documentation
Course Name : DeltaAI-Documentation


To use the Illinois Chat mcp server you will need to provide a API key for the service by exporting this variable or using a .env file.

```bash
export ILLINOIS_CHAT_API_KEY="your_uiuc_api_key"
```

If you don't have an Illinois Chat API key you can get one by creating an account at https://uiuc.chat and selecting the API tab were you can get your key. 