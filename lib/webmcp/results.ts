export interface ToolSuccessResult<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ToolError<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

export interface ToolFailureResult<Code extends string = string> {
  readonly ok: false;
  readonly error: ToolError<Code>;
}

export function createToolFailure<Code extends string>(
  code: Code,
  message: string,
): ToolFailureResult<Code> {
  return {
    ok: false,
    error: { code, message },
  };
}
