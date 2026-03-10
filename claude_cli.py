#!/usr/bin/env python3
"""
Claude Terminal CLI - Call Claude directly from your terminal.
Usage: python claude_cli.py "Your message here"
"""

import sys
import os
from dotenv import load_dotenv

# Load API key from .env file if present
load_dotenv()

def call_claude(message: str, model: str = "claude-opus-4-5", max_tokens: int = 1024) -> str:
    """Send a message to Claude and return the response."""
    try:
        import anthropic
    except ImportError:
        print("Error: 'anthropic' package not installed. Run: pip install anthropic")
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        print("Set it with: $env:ANTHROPIC_API_KEY = 'your-key'  (PowerShell)")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": message}]
    )

    return response.content[0].text


def main():
    if len(sys.argv) < 2:
        print("Usage: python claude_cli.py \"Your message here\"")
        print('Example: python claude_cli.py "What is the capital of France?"')
        sys.exit(1)

    message = " ".join(sys.argv[1:])
    print(f"You: {message}\n")
    print("Claude: ", end="", flush=True)

    response = call_claude(message)
    print(response)


if __name__ == "__main__":
    main()
