export class ExperienceStepError extends Error {
  constructor(
    message: string,
    readonly stepId: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "ExperienceStepError";
  }
}

export function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && /abort|cancel/i.test(error.message)) return true;
  return false;
}
