# 🤝 Contributing to mikiclaw

Thank you for your interest in contributing to mikiclaw! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Security](#security)

---

## 🧭 Code of Conduct

### Our Pledge

We pledge to make participation in mikiclaw a harassment-free experience for everyone. We welcome contributors of all backgrounds and identities.

### Expected Behavior

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Publishing others' private information
- Other unethical or unprofessional conduct

---

## 🚀 Getting Started

### 1. Fork the Repository

```bash
# Click "Fork" on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/mikiclaw
cd mikiclaw
```

### 2. Set Up Upstream

```bash
# Add upstream remote
git remote add upstream https://github.com/Softorize/mikiclaw

# Verify remotes
git remote -v
```

### 3. Create a Branch

```bash
# Always branch from main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

---

## 💻 Development Setup

### Prerequisites

- Node.js 22+
- npm or pnpm
- Git

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Run Tests

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

---

## 📝 Making Changes

### Types of Contributions

#### Bug Fixes

1. Create a test that reproduces the bug
2. Fix the bug
3. Verify the test passes
4. Document the fix

#### New Features

1. Discuss the feature in an issue first
2. Create a design document if needed
3. Implement the feature
4. Add tests
5. Update documentation

#### Documentation

1. Fix typos or clarify confusing sections
2. Add examples where helpful
3. Keep formatting consistent

#### Performance Improvements

1. Benchmark before and after
2. Document the improvement
3. Ensure tests still pass

### Commit Guidelines

#### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build/config changes

#### Examples

```bash
# Good commits
feat(agent): add web search tool with SSRF protection
fix(validation): reject null bytes in file paths
docs(readme): add Docker deployment instructions
test(encryption): add tests for key rotation
refactor(config): simplify configuration loading

# Bad commits
fixed stuff
updated code
changes
```

### Security Considerations

When making changes:

1. **Never** commit credentials or API keys
2. **Always** validate user input
3. **Always** use allowlist approach for security features
4. **Never** use eval() or similar dangerous functions
5. **Always** log security-relevant events

---

## 📤 Pull Request Guidelines

### Before Submitting

- [ ] Code follows coding standards
- [ ] All tests pass
- [ ] New code has tests
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No sensitive data committed

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe tests performed:
- Unit tests added/updated
- Manual testing performed

## Checklist
- [ ] Code follows project guidelines
- [ ] Self-review completed
- [ ] Tests pass locally
- [ ] Documentation updated
```

### Review Process

1. **Automated Checks**: CI must pass
2. **Code Review**: At least one maintainer review
3. **Testing**: Changes tested by reviewer
4. **Merge**: Squash and merge by maintainer

---

## 📐 Coding Standards

### TypeScript

```typescript
// Use strict mode
"use strict";

// Prefer const over let
const MAX_RETRIES = 3;

// Use meaningful variable names
const userRateLimitEntry = getRateLimit(userId);

// Use async/await for promises
async function fetchData(): Promise<Data> {
  const response = await fetch(url);
  return response.json();
}

// Use type annotations
interface UserConfig {
  id: string;
  preferences: UserPreferences;
}

// Handle errors explicitly
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", { error: String(error) });
  throw error;
}
```

### File Organization

```
src/
├── module/
│   ├── index.ts      # Public exports
│   ├── service.ts    # Main logic
│   ├── types.ts      # Type definitions
│   └── utils.ts      # Helper functions
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `userConfig` |
| Functions | camelCase | `validateInput` |
| Classes | PascalCase | `ConfigManager` |
| Interfaces | PascalCase | `UserPreferences` |
| Types | PascalCase | `ApiResponse` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Files | kebab-case | `config-manager.ts` |

### Code Style

```typescript
// Use 2-space indentation
function example() {
  const value = compute();
  return value;
}

// Use semicolons
const x = 5;

// Use single quotes for strings
const message = 'Hello';

// Use template literals for interpolation
const greeting = `Hello, ${name}!`;

// Add spaces around operators
const sum = a + b;

// Use trailing commas in multi-line objects
const config = {
  name: 'mikiclaw',
  version: '1.0.0',
};
```

---

## 🧪 Testing

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { validateCommand } from '../src/utils/validation';

describe('validateCommand', () => {
  it('should reject commands with injection patterns', () => {
    const result = validateCommand('ls; rm -rf /');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('injection');
  });

  it('should accept safe commands', () => {
    const result = validateCommand('git status');
    expect(result.valid).toBe(true);
  });
});
```

### Test Coverage Goals

| Component | Minimum Coverage |
|-----------|------------------|
| Security-critical code | 90% |
| Core functionality | 80% |
| Utilities | 70% |
| New features | 90% |

### Running Tests

```bash
# All tests
npm test

# Specific file
npx vitest tests/validation.test.ts

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 📚 Documentation

### README Updates

Update README.md when:

- Adding new features
- Changing configuration options
- Modifying commands or APIs
- Adding deployment options

### Code Comments

```typescript
// Good comment - explains WHY
// Using PBKDF2 to derive key from master key
// This provides key stretching against brute force
const key = pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');

// Bad comment - just repeats WHAT
// Derive the key using pbkdf2Sync
const key = pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
```

### API Documentation

```typescript
/**
 * Validates and sanitizes file paths to prevent path traversal attacks.
 *
 * @param inputPath - The path to validate
 * @param options - Optional validation settings
 * @returns Validation result with sanitized path or error message
 *
 * @example
 * ```typescript
 * const result = sanitizePath('src/index.ts');
 * if (result.valid) {
 *   readFile(result.path);
 * }
 * ```
 */
export function sanitizePath(
  inputPath: string,
  options?: SanitizeOptions
): ValidationResult {
  // ...
}
```

---

## 🔐 Security

### Reporting Vulnerabilities

1. **Do NOT** create a public issue
2. Email security concerns privately
3. Use GitHub's private vulnerability reporting
4. Allow 90 days for response

### Security Review Checklist

For all PRs:

- [ ] No hardcoded credentials
- [ ] Input validation added/updated
- [ ] No new eval() or similar calls
- [ ] Logging for security events
- [ ] No sensitive data in logs
- [ ] Dependencies reviewed for vulnerabilities

### Running Security Tests

```bash
# Run security-focused tests
npm test -- --grep security

# Check for vulnerable dependencies
npm audit

# Fix vulnerabilities
npm audit fix
```

---

## 🎯 Areas Needing Contribution

### Good First Issues

Look for issues labeled:
- `good first issue`
- `help wanted`
- `documentation`

### High Priority Areas

1. **Documentation** - Examples, tutorials, translations
2. **Testing** - Increase coverage, add edge cases
3. **Performance** - Optimize bottlenecks
4. **Accessibility** - Improve error messages
5. **Integrations** - New AI providers, tools

---

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and ideas
- **Code Comments**: For understanding implementation

---

## 🏆 Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Annual contributor highlights

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to mikiclaw! 🦞**
