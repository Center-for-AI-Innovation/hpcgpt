# hpcgpt
HPCGPT CLI

Delta Chatbot
https://uiuc.chat/Delta-Documentation
Course Name : Delta-Documentation

Delta AI Chatbot 
https://uiuc.chat/DeltaAI-Documentation
Course Name : DeltaAI-Documentation

chatwithdelta is the typescript version of the cli tool, based on the ui provided by https://github.com/dustinlacewell/chatwith for an openai application. 

```bash
# First time only
bun install 
```

```bash
export EMAIL_TARGET="your_email"
export SYSTEM_NAME="Delta"
export UIUC_API_KEY="your_uiuc_api_key"
export UIUC_COURSE_NAME="Delta-Documentation"
export MODEL_URL="pre_hosted_uiuc.chat_llm_url"
bun run start
```

If you don't have an API key you can get one by creating an account at https://uiuc.chat and selecting the API tab were you can get your key. 