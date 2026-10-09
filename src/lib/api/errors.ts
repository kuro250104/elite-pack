export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number,
    public readonly retryAfter?: number) { super(message); this.name = "ApiError"; }
}
