import { parse } from 'cookie'

export const parseCookieHeader = (cookieHeader: string | null) => parse(cookieHeader ?? '')