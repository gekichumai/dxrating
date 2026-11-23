import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strayFixes } from './check.ts'

const issues = (text: string) => strayFixes(text).map(({ issue }) => issue)

test('a line that reads exactly "Fixes <ID>" is allowed, one per issue', () => {
  const message = [
    'fix(web): stop the crash',
    '',
    'Fixes DXRATING-WEB-7M',
    'Fixes DXRATING-WEB-79',
    '',
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  ].join('\n')
  assert.deepEqual(issues(message), [])
  assert.deepEqual(issues('Fixes DXRATING-BACKEND-1Z\r\n\r\n## Tests\r\n'), [])
})

test('a negated mention in backticks still resolves the issue (#626)', () => {
  assert.deepEqual(
    strayFixes('Neither tag includes query text.\nThe commit does **not** say `Fixes DXRATING-BACKEND-2J`.'),
    [{ issue: 'DXRATING-BACKEND-2J', line: 'The commit does **not** say `Fixes DXRATING-BACKEND-2J`.' }],
  )
})

test('every keyword Sentry reads is caught, in any case and mid-sentence', () => {
  assert.deepEqual(issues('This does not fix DXRATING-WEB-R yet.'), ['DXRATING-WEB-R'])
  assert.deepEqual(issues('Resolves: DXRATING-WEB-R'), ['DXRATING-WEB-R'])
  assert.deepEqual(issues('closed the gap in DXRATING-BACKEND-6'), ['DXRATING-BACKEND-6'])
  assert.deepEqual(issues('Fixes DXRATING-BACKEND-1Z. Investigates DXRATING-BACKEND-2J.'), ['DXRATING-BACKEND-1Z'])
  assert.deepEqual(issues('Fixes DXRATING-WEB-1, DXRATING-WEB-2'), ['DXRATING-WEB-1', 'DXRATING-WEB-2'])
})

test('the words after a Fixes line run on across blank lines', () => {
  assert.deepEqual(issues('Fixes DXRATING-WEB-7H\n\nDXRATING-WEB-7K is a different bug'), ['DXRATING-WEB-7K'])
})

test('markdown links and Sentry issue URLs resolve too', () => {
  assert.deepEqual(issues('Not a fix for [DXRATING-WEB-7C](https://example.sentry.io/issues/42/)'), ['DXRATING-WEB-7C'])
  assert.deepEqual(issues('Fixes https://gekichumai.sentry.io/issues/123456/'), [
    'https://gekichumai.sentry.io/issues/123456/',
  ])
})

test('only IDs of our Sentry projects count, in any case', () => {
  assert.deepEqual(issues('Fixes the sign-in flow on keyboard-operable buttons'), [])
  assert.deepEqual(issues('- Fixed CVE-2026-5222 and CVE-2026-5223.'), [])
  assert.deepEqual(issues('this may fix dxrating-web-r'), ['dxrating-web-r'])
})

test('a Fixes line quoted in a code block or comment still resolves the issue', () => {
  const investigates = 'Investigates DXRATING-BACKEND-2J; the fix PR should say:\n\n'
  const fence = '```'
  assert.deepEqual(issues(`${investigates}${fence}\nFixes DXRATING-BACKEND-2J\n${fence}\n`), ['DXRATING-BACKEND-2J'])
  assert.deepEqual(issues(`${investigates}~~~\nFixes DXRATING-BACKEND-2J`), ['DXRATING-BACKEND-2J'])
  assert.deepEqual(issues(`${investigates}<!--\nFixes DXRATING-BACKEND-2J\n-->`), ['DXRATING-BACKEND-2J'])
  assert.deepEqual(issues(`${investigates}    Fixes DXRATING-BACKEND-2J\n`), ['DXRATING-BACKEND-2J'])
  assert.deepEqual(issues(`${fence}\nlog\n${fence}\nFixes DXRATING-BACKEND-2J\n`), [])
})

test('issues mentioned without a fix keyword pass', () => {
  assert.deepEqual(issues('Investigates DXRATING-BACKEND-2J; a fix comes later.'), [])
})