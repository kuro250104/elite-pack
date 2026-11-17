export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number,
    public readonly retryAfter?: number, public readonly fields?: Record<string, string>) { super(message); this.name = "ApiError"; }
}
