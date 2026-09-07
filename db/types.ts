export interface Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}
export interface Statement {
  bind(...values: any[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<Result<T>>;
  run(): Promise<Result>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Result[]>;
}
