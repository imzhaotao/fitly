import 'server-only';
import { cookies } from 'next/headers';

export const WS_COOKIE = 'fitly_ws';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** 读取匿名工作区 ID（只读，用于 Server Component） */
export async function readWorkspace(): Promise<string | undefined> {
  return (await cookies()).get(WS_COOKIE)?.value;
}

/** 读取或创建匿名工作区 ID（仅可在 Route Handler / Server Action 中调用） */
export async function ensureWorkspace(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(WS_COOKIE)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  jar.set(WS_COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: ONE_YEAR, path: '/', secure: process.env.NODE_ENV === 'production' });
  return id;
}
