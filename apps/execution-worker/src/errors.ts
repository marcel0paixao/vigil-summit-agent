export class WorkflowExecutionWorkerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "WorkflowExecutionWorkerError";
  }
}
