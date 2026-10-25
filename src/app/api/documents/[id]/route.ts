import { getContainer } from "@/container";
import { NotFoundError } from "@/domain/errors";
import { handle, parseOrThrow } from "@/lib/http";
import { idSchema } from "@/lib/schemas";

export const DELETE = handle(
  async (_request: Request, ctx: RouteContext<"/api/documents/[id]">) => {
    const id = parseOrThrow(idSchema, (await ctx.params).id, "document id");
    if (!(await getContainer().documents.delete(id))) throw new NotFoundError("Document not found");
    return new Response(null, { status: 204 });
  },
);
