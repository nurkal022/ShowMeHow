import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { createProject, listProjects } from '@/lib/research/store';
import { withResearchErrors } from '@/lib/research/http';

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return NextResponse.json({ projects: await listProjects(user.id) });
}

export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  return withResearchErrors(async () => NextResponse.json({ project: await createProject(user.id, body) }, { status: 201 }));
}
