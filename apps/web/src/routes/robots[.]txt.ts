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

export function buildRobotsTxt() {
  return `${ALLOWED_USER_AGENTS.map((userAgent) => `User-agent: ${userAgent}\nAllow: /`).join('\n\n')}

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