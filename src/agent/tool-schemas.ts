import { z } from 'zod';

export const CommandSchema = z.object({
  command: z.string().min(1).max(10000),
  timeout: z.number().default(30),
});

export const FileReadSchema = z.object({
  path: z.string().min(1),
  limit: z.number().default(100),
  offset: z.number().default(1),
});

export const FileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const BrowserActionSchema = z.object({
  type: z.enum([
    'navigate',
    'screenshot',
    'click',
    'type',
    'content',
    'evaluate',
    'fill',
    'select',
    'scroll',
    'back',
    'forward',
    'snapshot',
  ]),
  payload: z.record(z.unknown()).optional(),
});

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});

export const GitCommandSchema = z.object({
  command: z.string().min(1),
  repoPath: z.string().optional(),
});

export const GacListAccountsSchema = z.object({});
export const GacListPropertiesSchema = z.object({
  accountId: z.string().optional(),
});
