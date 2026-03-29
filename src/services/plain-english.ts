/**
 * @file plain-english.ts — Translates raw AI activity events into plain English
 * @description Every event gets a human-readable explanation that anyone can understand.
 * No jargon. No tech speak. Just clear descriptions of what the AI is doing and why it matters.
 */

export type ActivityType =
  | 'llm:request'
  | 'llm:response'
  | 'file:read'
  | 'file:write'
  | 'file:create'
  | 'file:delete'
  | 'process:exec'
  | 'process:spawn'
  | 'network:outbound'
  | 'tool:call'
  | 'tool:result'
  | 'thought:reasoning'
  | 'thought:plan'
  | 'idle:start'
  | 'idle:end'
  | 'error';

interface TranslationInput {
  type: ActivityType;
  details: Record<string, unknown>;
  agentName: string;
}

interface Translation {
  /** One sentence a human can understand */
  plain: string;
  /** Short label for the UI (e.g. "Reading file") */
  label: string;
  /** Emoji icon */
  icon: string;
  /** Category color: blue=thinking, green=working, yellow=communicating, gray=idle, red=alert */
  color: 'blue' | 'green' | 'yellow' | 'gray' | 'red' | 'purple';
}

export function translateToPlainEnglish(input: TranslationInput): Translation {
  const { type, details, agentName } = input;
  const name = agentName || 'The AI';

  switch (type) {
    // ── LLM Interactions ──────────────────────────────────────
    case 'llm:request': {
      const model = String(details.model || 'an AI model');
      const msgCount = Number(details.messageCount || 0);
      const tokens = Number(details.promptTokens || 0);
      const lastMsg = String(details.lastUserMessage || '').slice(0, 80);

      if (lastMsg) {
        return {
          plain: `${name} is asking ${model}: "${lastMsg}${lastMsg.length >= 80 ? '...' : ''}"`,
          label: 'Sending prompt',
          icon: '💬',
          color: 'yellow',
        };
      }
      return {
        plain: `${name} is sending a conversation (${msgCount} messages${tokens ? `, ~${tokens} tokens` : ''}) to ${model}`,
        label: 'Sending prompt',
        icon: '💬',
        color: 'yellow',
      };
    }

    case 'llm:response': {
      const model = String(details.model || 'the AI');
      const tokens = Number(details.completionTokens || 0);
      const latency = Number(details.latencyMs || 0);
      const content = String(details.responsePreview || '').slice(0, 80);

      if (content) {
        return {
          plain: `${model} replied: "${content}${content.length >= 80 ? '...' : ''}"${latency ? ` (took ${(latency / 1000).toFixed(1)}s)` : ''}`,
          label: 'Got response',
          icon: '✨',
          color: 'yellow',
        };
      }
      return {
        plain: `${model} finished responding${tokens ? ` (${tokens} tokens)` : ''}${latency ? ` in ${(latency / 1000).toFixed(1)}s` : ''}`,
        label: 'Got response',
        icon: '✨',
        color: 'yellow',
      };
    }

    // ── File Operations ───────────────────────────────────────
    case 'file:read': {
      const file = shortenPath(String(details.path || details.filename || 'a file'));
      return {
        plain: `${name} is reading ${file} to understand its contents`,
        label: 'Reading file',
        icon: '📖',
        color: 'blue',
      };
    }

    case 'file:write': {
      const file = shortenPath(String(details.path || details.filename || 'a file'));
      const size = formatBytes(Number(details.size || details.bytes || 0));
      return {
        plain: `${name} is editing ${file}${size ? ` (${size})` : ''}`,
        label: 'Writing file',
        icon: '✍️',
        color: 'green',
      };
    }

    case 'file:create': {
      const file = shortenPath(String(details.path || details.filename || 'a file'));
      return {
        plain: `${name} created a new file: ${file}`,
        label: 'New file',
        icon: '📄',
        color: 'green',
      };
    }

    case 'file:delete': {
      const file = shortenPath(String(details.path || details.filename || 'a file'));
      return {
        plain: `${name} deleted ${file}`,
        label: 'Deleted file',
        icon: '🗑️',
        color: 'red',
      };
    }

    // ── Process/Command Execution ─────────────────────────────
    case 'process:exec':
    case 'process:spawn': {
      const cmd = String(details.command || '').slice(0, 100);
      const plainCmd = translateCommand(cmd);
      return {
        plain: `${name} is running a command: ${plainCmd}`,
        label: 'Running command',
        icon: '💻',
        color: 'green',
      };
    }

    // ── Network ───────────────────────────────────────────────
    case 'network:outbound': {
      const domain = String(details.domain || details.host || details.url || 'the internet');
      const plainDomain = translateDomain(domain);
      return {
        plain: `${name} is connecting to ${plainDomain}`,
        label: 'Network request',
        icon: '🌐',
        color: 'purple',
      };
    }

    // ── Tool Usage ────────────────────────────────────────────
    case 'tool:call': {
      const tool = String(details.tool || details.name || 'a tool');
      const args = String(details.args || details.input || '').slice(0, 60);
      return {
        plain: `${name} is using the "${tool}" tool${args ? `: ${args}` : ''}`,
        label: `Using ${tool}`,
        icon: '🔧',
        color: 'green',
      };
    }

    case 'tool:result': {
      const tool = String(details.tool || details.name || 'a tool');
      return {
        plain: `${name} got results back from "${tool}"`,
        label: `${tool} done`,
        icon: '📋',
        color: 'green',
      };
    }

    // ── Thinking ──────────────────────────────────────────────
    case 'thought:reasoning': {
      const thought = String(details.content || details.text || '').slice(0, 100);
      if (thought) {
        return {
          plain: `${name} is thinking: "${thought}${thought.length >= 100 ? '...' : ''}"`,
          label: 'Thinking',
          icon: '🧠',
          color: 'blue',
        };
      }
      return {
        plain: `${name} is thinking about how to approach this`,
        label: 'Thinking',
        icon: '🧠',
        color: 'blue',
      };
    }

    case 'thought:plan': {
      const plan = String(details.content || details.text || '').slice(0, 100);
      return {
        plain: `${name} is planning its next steps${plan ? `: "${plan}"` : ''}`,
        label: 'Planning',
        icon: '📐',
        color: 'blue',
      };
    }

    // ── Idle ──────────────────────────────────────────────────
    case 'idle:start':
      return {
        plain: `${name} is idle — waiting for something to do`,
        label: 'Idle',
        icon: '💤',
        color: 'gray',
      };

    case 'idle:end':
      return {
        plain: `${name} is back and working again`,
        label: 'Active',
        icon: '⚡',
        color: 'green',
      };

    // ── Error ─────────────────────────────────────────────────
    case 'error': {
      const msg = String(details.message || details.error || 'Something went wrong');
      return {
        plain: `${name} ran into a problem: ${msg}`,
        label: 'Error',
        icon: '❌',
        color: 'red',
      };
    }

    default:
      return {
        plain: `${name} did something: ${type}`,
        label: type,
        icon: '❓',
        color: 'gray',
      };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function shortenPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `.../${parts.slice(-2).join('/')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function translateCommand(cmd: string): string {
  if (!cmd) return 'a shell command';
  const lower = cmd.toLowerCase();

  if (lower.startsWith('npm ')) return `installing/running packages (${cmd.slice(0, 60)})`;
  if (lower.startsWith('git ')) return `working with Git (${cmd.slice(0, 60)})`;
  if (lower.startsWith('cd ')) return `navigating to a folder`;
  if (lower.startsWith('ls') || lower.startsWith('dir')) return 'listing files in a directory';
  if (lower.startsWith('cat ') || lower.startsWith('head ') || lower.startsWith('tail ')) return `reading a file's contents`;
  if (lower.startsWith('mkdir')) return 'creating a new folder';
  if (lower.startsWith('cp ') || lower.startsWith('copy ')) return 'copying files';
  if (lower.startsWith('mv ') || lower.startsWith('move ')) return 'moving/renaming files';
  if (lower.startsWith('rm ') || lower.startsWith('del ')) return '⚠️ deleting files';
  if (lower.startsWith('curl ') || lower.startsWith('wget ')) return 'downloading something from the internet';
  if (lower.startsWith('python') || lower.startsWith('node') || lower.startsWith('tsx')) return `running a script (${cmd.slice(0, 60)})`;
  if (lower.startsWith('grep ') || lower.startsWith('rg ')) return 'searching through files';
  if (lower.includes('docker')) return `working with Docker (${cmd.slice(0, 60)})`;
  if (lower.includes('test') || lower.includes('vitest') || lower.includes('jest')) return 'running tests';
  if (lower.includes('build') || lower.includes('compile')) return 'building the project';

  return cmd.slice(0, 80);
}

function translateDomain(domain: string): string {
  const lower = domain.toLowerCase();
  if (lower.includes('openai.com')) return 'OpenAI (ChatGPT/GPT API)';
  if (lower.includes('anthropic.com')) return 'Anthropic (Claude API)';
  if (lower.includes('googleapis.com') || lower.includes('google.com')) return 'Google (Gemini API)';
  if (lower.includes('github.com')) return 'GitHub';
  if (lower.includes('npmjs.org') || lower.includes('npm')) return 'npm (package registry)';
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return 'a local server on this machine';
  if (lower.includes('docker')) return 'Docker';
  if (lower.includes('huggingface')) return 'Hugging Face (AI models)';
  if (lower.includes('ollama')) return 'Ollama (local AI)';
  return domain;
}
