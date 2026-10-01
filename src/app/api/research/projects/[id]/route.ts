import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { deleteProject, updateProject } from '@/lib/research/store';
import { withResearchErrors } from '@/lib/research/http';

export async function PATCH(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const id = (await params).id;
  return withResearchErrors(async () => {
    const project = await updateProject(user.id, id, body);
    return project ? NextResponse.json({ project }) : notFound();
  });
}

export async function DELETE(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return (await deleteProject(user.id, (await params).id)) ? NextResponse.json({ ok: true }) : notFound();
}
