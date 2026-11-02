export interface ApiRequest {
  method?: string;
  body?: unknown;
}

export interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
}

export type ApiHandler = (request: ApiRequest, response: ApiResponse) => Promise<unknown>;
