# Claude Terminal CLI

A project for interacting with Claude (Anthropic's AI) directly from the terminal using the Anthropic API.

## Features

- Call Claude from the command line
- Support for REST API via `curl`
- Python script interface
- Easy API key configuration

## Prerequisites

- Python 3.8+
- An [Anthropic API key](https://console.anthropic.com/)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-terminal-cli.git
   cd claude-terminal-cli
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set your API key:
   ```bash
   # Windows (PowerShell)
   $env:ANTHROPIC_API_KEY = "your-api-key-here"

   # Or add it to a .env file
   echo ANTHROPIC_API_KEY=your-api-key-here > .env
   ```

## Usage

### Python Script
```bash
python claude_cli.py "Your message here"
```

### curl (REST API)
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-opus-4-5", "max_tokens": 1024, "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Project Structure

```
claude-terminal-cli/
├── README.md
├── .gitignore
├── requirements.txt
├── claude_cli.py        # Main CLI script
└── examples/
    └── example_usage.py
```

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
