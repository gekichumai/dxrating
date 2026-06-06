import { createFileRoute } from '@tanstack/react-router'

const ALLOWED_USER_AGENTS = [
  'OAI-SearchBot',
  'GPTBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Googlebot',
  'Applebot',
  '*',
]

export const CONTENT_SIGNAL_DIRECTIVE = 'Content-Signal: ai-train=yes, search=yes, ai-input=yes'

export function buildRobotsTxt() {
  return `${ALLOWED_USER_AGENTS.map((userAgent) => `User-agent: ${userAgent}\nAllow: /\n${CONTENT_SIGNAL_DIRECTIVE}`).join('\n\n')}

Sitemap: https://dxrating.net/sitemap.xml
LLM-Info: https://dxrating.net/llms.txt`
}

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const robots = buildRobotsTxt()

        return new Response(robots, {
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})