export function getTools() {
  return [
    {
      name: "bash",
      description: "Execute a bash command. Use for file operations, git, running scripts, etc.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute"
          }
        },
        required: ["command"]
      }
    },
    {
      name: "read_file",
      description: "Read the contents of a file from the filesystem.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the file to read"
          }
        },
        required: ["path"]
      }
    },
    {
      name: "glob",
      description: "Find files matching a pattern in the filesystem.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.js')"
          }
        },
        required: ["pattern"]
      }
    },
    {
      name: "search",
      description: "Search the web for information.",
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
      name: "grep",
      description: "Search for text within files.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The text pattern to search for"
          },
          path: {
            type: "string",
            description: "Directory to search in (default: current directory)"
          }
        },
        required: ["pattern"]
      }
    }
  ];
}
