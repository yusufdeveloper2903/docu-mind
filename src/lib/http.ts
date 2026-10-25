import { z } from "zod";
import { DomainError, ValidationError } from "@/domain/errors";

/** RFC 9457 problem details. */
export function problem(
  status: number,
  title: string,
  detail: string,
  extra: object = {},
): Response {
  return Response.json(
    { type: "about:blank", title, status, detail, ...extra },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      `Invalid ${what}`,
      result.error.issues.map((i) => ({ path: i.path.join(".") || what, message: i.message })),
    );
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

/** Wraps a route handler so domain errors map to their status and everything else to a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ValidationError) {
        return problem(400, error.title, error.message, { errors: error.issues });
      }
      if (error instanceof DomainError) return problem(error.status, error.title, error.message);
      console.error(error);
      return problem(500, "Internal Server Error", "Something went wrong.");
    }
  };
}
