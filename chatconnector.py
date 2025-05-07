import logging
import requests
from rich.console import Console
from rich.markdown import Markdown
import configparser

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
console = Console(markup=True, soft_wrap=True)

def parse_args():
    import argparse
    parser = argparse.ArgumentParser(description="Chat with the model.")
    parser.add_argument('user_message', type=str, help='The message to send to the model.')
    return parser.parse_args()

def load_config():
    config = configparser.ConfigParser()
    config.read('config.ini')
    return config

def send_api_request(api_key, user_query, model="Qwen/Qwen2.5-VL-72B-Instruct"):
    """
    Args:
        api_key (str): The API key for authentication.
        user_query (str): The user input to send to the model as a prompt.
        model (str): The model to use for the request. Default is "Qwen/Qwen2.5-VL-72B-Instruct".
        Options are:
            - llama3.1:8b-instruct-fp16
            - Qwen/Qwen2.5-VL-72B-Instruct
            - qwen2.5:7b-instruct-fp16
            - qwen2.5:14b-instruct-fp16
            - deepseek-r1:14b-qwen-distill-fp16
    Returns:
        response (requests.Response): The response from the API.
    """
    url = "https://uiuc.chat/api/chat-api/chat"
    headers = {
      'Content-Type': 'application/json'
    }
    data = {
      "model": model,
      "messages": [
        {
          "role": "system",
          "content": "You are a helpful AI assistant. Follow instructions carefully. Respond using markdown."
        },
        {
          "role": "user",
          "content": user_query
        }
      ],
      "api_key": api_key,
      "course_name": "Delta-Documentation",
      "stream": True,
      "temperature": 0.1,
      "retrieval_only": False
    }

    logging.debug(f"Sending request to {url} with headers {headers} and data {data}")

    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 200:
        console.print(Markdown(f"Error: {response.status_code} - {response.text}"))
        return None
    return response

def display_response(response):
    for chunk in response.iter_lines():
        if chunk:
            console.print(Markdown(chunk.decode()))

def main(args, congig:configparser.ConfigParser):
    api_key = config.get('API', 'api_key')
    model = config.get('API', 'model', fallback="Qwen/Qwen2.5-VL-72B-Instruct")
    response = send_api_request(api_key, args.user_message, model)
    display_response(response)

if __name__ == "__main__":
    args = parse_args()
    config = load_config()
    main(args, config)
    