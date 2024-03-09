import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({});

export const POST = async (request: Request) => {
  const json = await schema.safeParseAsync(await request.json());
  if (!json.success) {
    return NextResponse.json(json.error.format(), { status: 400 });
  }

  // StreamingTextResponse(OpenAIStream(completions))
};
