# hpcgpt
HPCGPT CLI

Delta Chatbot
https://uiuc.chat/Delta-Documentation

Delta AI Chatbot 
https://uiuc.chat/DeltaAI-Documentation

chatwithdelta is the typescript version of the cli tool, based on the ui provided by https://github.com/dustinlacewell/chatwith for an openai application. 

```bash
# First time only
npm install 
```

```bash
npm run start
```


Chatconnector.py is the WIP CLI tool for interacting with the chatbots. To use configure sample.ini with your uiuc chat API key and then simply call from the command line with:

```bash
python chatconnector.py "How many H200 nodes does Delta have?"
```

If you don't have an API key you can get one by creating an account at https://uiuc.chat and selecting the API tab were you can get your key. 