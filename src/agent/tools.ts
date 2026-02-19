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
        properties: {}
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
      name: "read_file",
      description: "Read the contents of a file from the filesystem. Use this to view code, configs, or any text files.",
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
      description: "Write content to a file. Creates new file or overwrites existing.",
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
      description: "List files and directories in a folder. Shows file sizes and modification dates.",
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
      description: "Find files matching a pattern in the filesystem using glob patterns.",
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
      description: "Search for text patterns within files. Useful for finding code or configuration.",
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
      name: "get_system_info",
      description: "Get information about the system, including OS, CPU, memory, and disk usage.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "nodejs",
      description: "Execute Node.js code safely. NOTE: Direct eval is disabled. Use bash tool with 'node -e' for calculations.",
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "JavaScript code to execute (limited functionality)"
          }
        },
        required: ["code"]
      }
    }
  ];
}
