/**
 * The per-response nonce the admin Worker writes into <meta name="csp-nonce">. Mantine puts it on the <style> elements
 * it renders (its CSS variables), so the CSP can allow exactly those instead of every inline style element.
 */
export const cspNonce = () => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? ''