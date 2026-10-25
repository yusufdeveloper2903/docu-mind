import { getContainer } from "@/container";
import { NotFoundError } from "@/domain/errors";
import { handle, parseOrThrow } from "@/lib/http";
import { idSchema } from "@/lib/schemas";

/** The full source passage behind a citation. */
export const GET = handle(async (_request: Request, ctx: RouteContext<"/api/chunks/[id]">) => {
  const id = parseOrThrow(idSchema, (await ctx.params).id, "chunk id");
  const chunk = await getContainer().chunks.get(id);
  if (!chunk) throw new NotFoundError("Passage not found");
  return Response.json(chunk);
});
