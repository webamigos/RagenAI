export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
