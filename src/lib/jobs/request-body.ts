/**
 * Тело запроса как JSON-объект. null — тело не JSON или не объект: такой запрос
 * не от нашего клиента, и роут отвечает на него 400, а не 500.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
