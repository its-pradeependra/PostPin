/** Typed error parsed from the API's standard `{ error: { code, message, request_id } }` envelope. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, requestId?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    type ErrorBody = { error?: { code?: string; message?: string; request_id?: string; details?: unknown } };
    let body: ErrorBody | null = null;
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      /* non-JSON response */
    }
    const e = body?.error ?? {};
    return new ApiError(
      e.message ?? res.statusText ?? "Request failed",
      e.code ?? "error",
      res.status,
      e.request_id,
      e.details,
    );
  }
}
