import { stopImpersonation } from '@/lib/auth/impersonation';

/** «Вернуться в админку»: без guardAdmin — сейчас в сессии не админ, а тот, за кого он смотрит. */
export async function DELETE(req: Request) {
  return stopImpersonation(req);
}
