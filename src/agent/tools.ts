export function getTools() {
  return [
    {
      name: "bash",
      description: "Execute a bash command. Use for file operations, git, running scripts, etc. Always explain what you're about to do.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute"
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds (default: 30)",
            default: 30
          }
        },
        required: ["command"]
      }
    },
    {
      name: "applescript",
      description: "Run AppleScript on macOS via osascript. Requires explicit user permission (/grant_access).",
      input_schema: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "AppleScript code to execute"
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds (default: 20)",
            default: 20
          }
        },
        required: ["script"]
      }
    },
    {
      name: "browser_navigate",
      description: "Navigate to a URL in a headless browser. Returns the page title.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to navigate to (must include http:// or https://)"
          }
        },
        required: ["url"]
      }
    },
    {
      name: "browser_screenshot",
      description: "Take a screenshot of the current page. Returns base64 encoded image.",
      input_schema: {
        type: "object",
        properties: {
          fullPage: {
            type: "boolean",
            description: "Capture full page or just viewport (default: false)"
          }
        }
      }
    },
    {
      name: "browser_click",
      description: "Click an element on the page using a CSS selector.",
      input_schema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the element to click"
          }
        },
        required: ["selector"]
      }
    },
    {
      name: "browser_type",
      description: "Type text into an input field using a CSS selector.",
      input_schema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the input field"
          },
          text: {
            type: "string",
            description: "Text to type"
          }
        },
        required: ["selector", "text"]
      }
    },
    {
      name: "browser_content",
      description: "Get the text content of the current page.",
      input_schema: {
        type: "object",
        properties: {
          maxChars: {
            type: "number",
            description: "Maximum number of characters to return (default: 6000)"
          }
        }
      }
    },
    {
      name: "browser_evaluate",
      description: "Execute JavaScript in the browser context and return the result.",
      input_schema: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "JavaScript code to execute"
          }
        },
        required: ["script"]
      }
    },
    {
      name: "browser_fill",
      description: "Fill multiple form fields in one call.",
      input_schema: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "Map of CSS selector -> text value, or an array of {selector, text}"
          }
        },
        required: ["fields"]
      }
    },
    {
      name: "browser_select",
      description: "Select a value in a dropdown/select element.",
      input_schema: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector for the select element"
          },
          value: {
            type: "string",
            description: "Option value to select"
          }
        },
        required: ["selector", "value"]
      }
    },
    {
      name: "browser_scroll",
      description: "Scroll the current page up or down.",
      input_schema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            description: "Scroll direction: up or down"
          },
          amount: {
            type: "number",
            description: "Scroll distance in pixels (default: 800)"
          }
        }
      }
    },
    {
      name: "browser_back",
      description: "Navigate back in browser history.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "browser_forward",
      description: "Navigate forward in browser history.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "browser_snapshot",
      description: "Capture structured page snapshot with headings, links, and controls.",
      input_schema: {
        type: "object",
        properties: {
          maxChars: {
            type: "number",
            description: "Maximum snapshot output length (default: 5000)"
          }
        }
      }
    },
    {
      name: "read_file",
      description: "Read the contents of a file from the filesystem (workspace-scoped). Use this to view code, configs, or any text files.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the file to read"
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to read (default: 100)",
            default: 100
          },
          offset: {
            type: "number",
            description: "Line number to start reading from (default: 1)",
            default: 1
          }
        },
        required: ["path"]
      }
    },
    {
      name: "write_file",
      description: "Write content to a file (workspace-scoped). Creates new file or overwrites existing.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the file to write"
          },
          content: {
            type: "string",
            description: "The content to write to the file"
          }
        },
        required: ["path", "content"]
      }
    },
    {
      name: "list_directory",
      description: "List files and directories in a folder (workspace-scoped).",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The directory path to list (default: current directory)"
          }
        }
      }
    },
    {
      name: "glob",
      description: "Find files matching a pattern in the filesystem using glob patterns (workspace-scoped).",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.js', '*.json')"
          },
          path: {
            type: "string",
            description: "Base directory to search from (default: current directory)"
          }
        },
        required: ["pattern"]
      }
    },
    {
      name: "grep",
      description: "Search for text patterns within files (workspace-scoped). Useful for finding code or configuration.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The text pattern or regex to search for"
          },
          path: {
            type: "string",
            description: "Directory to search in (default: current directory)"
          },
          caseSensitive: {
            type: "boolean",
            description: "Whether the search is case sensitive (default: true)",
            default: true
          }
        },
        required: ["pattern"]
      }
    },
    {
      name: "search",
      description: "Search the web for current information, news, or facts.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "git",
      description: "Execute git commands. Useful for version control operations.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Git command to execute (e.g., 'status', 'log --oneline -5', 'diff')"
          },
          repoPath: {
            type: "string",
            description: "Path to the git repository (default: current directory)"
          }
        },
        required: ["command"]
      }
    },
    {
      name: "gac_list_accounts",
      description: "List Google Analytics accounts via gac CLI on the local machine.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "gac_list_properties",
      description: "List Google Analytics properties via gac CLI. If accountId is omitted, scans all accounts.",
      input_schema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Optional GA account ID to scope the property list"
          }
        }
      }
    },
    {
      name: "get_system_info",
      description: "Get information about the system, including OS, CPU, memory, and disk usage.",
      input_schema: {
        type: "object",
        properties: {}
      }
    }
  ];
}
