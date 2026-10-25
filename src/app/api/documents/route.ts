import { after } from "next/server";
import { getContainer } from "@/container";
import { ValidationError } from "@/domain/errors";
import { handle } from "@/lib/http";

export const GET = handle(async () => Response.json(await getContainer().documents.list()));

/**
 * Accepts one or more files under the `file` field. Each is recorded as `processing` and
 * answered with 202; parsing, chunking and embedding continue after the response is sent.
 */
export const POST = handle(async (request: Request) => {
  const { ingestion, config } = getContainer();
  const form = await request.formData().catch(() => {
    throw new ValidationError("Expected a multipart/form-data body");
  });
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ValidationError('Attach at least one file in the "file" field');

  const maxBytes = config.MAX_UPLOAD_MB * 1024 * 1024;
  const tooLarge = files.find((f) => f.size > maxBytes);
  if (tooLarge) throw new ValidationError(`"${tooLarge.name}" exceeds ${config.MAX_UPLOAD_MB} MB`);

  const uploads = await Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { upload: await ingestion.register({ name: file.name, bytes }), bytes };
    }),
  );
  after(async () => {
    for (const { upload, bytes } of uploads) await ingestion.process(upload, bytes);
  });
  return Response.json(
    uploads.map((u) => u.upload.document),
    { status: 202 },
  );
});
