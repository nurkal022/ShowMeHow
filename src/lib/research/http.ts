import { badRequest } from '../http/route-kit';
import { ResearchError } from './store';

/** Отказы хранилища исследователя — 400 с текстом для человека; прочее пробрасывается. */
export async function withResearchErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ResearchError) return badRequest(e.message);
    throw e;
  }
}
