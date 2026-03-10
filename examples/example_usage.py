"""
Example usage of the Claude Terminal CLI as a Python module.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from claude_cli import call_claude

# Simple question
response = call_claude("What are three fun facts about space?")
print("Claude says:", response)

# You can also change the model or max tokens
# response = call_claude("Write a haiku about Python.", model="claude-haiku-4-5", max_tokens=256)
