import type { AddressInfo } from 'net';
import http from 'http';
import axios, { AxiosInstance } from 'axios';
import { createApp } from '../../src/app';

/**
 * Axios's default query serializer encodes spaces as `+` and leaves `(`/`)`
 * unescaped — both rejected by express-openapi-validator's strict "must be url
 * encoded" check (it wants RFC 3986 percent-encoding, e.g. for WKT geometries
 * like `POINT(34.8 32.05)`). This serializer always produces plain %XX escapes.
 */
function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function serializeParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${strictEncode(key)}=${strictEncode(String(value))}`)
    .join('&');
}

export interface TestServer {
  /** Plain axios client, not an Express-aware wrapper — tests exercise the API the
   * same way any real HTTP client would, decoupled from server implementation
   * details. `validateStatus` always resolves so tests assert status codes
   * themselves instead of axios throwing on 4xx/5xx. */
  client: AxiosInstance;
  close: () => Promise<void>;
}

/**
 * Starts the real app in-process on an OS-assigned port (port 0) rather than a
 * hardcoded one, so parallel test files never collide. Test and backend share
 * the same process/code path as production — this is the actual Express app,
 * just not bound to a fixed port.
 */
export async function startTestServer(): Promise<TestServer> {
  const server = http.createServer(createApp());

  await new Promise<void>((resolve) => server.listen(0, resolve));

  const { port } = server.address() as AddressInfo;

  const client = axios.create({
    baseURL: `http://127.0.0.1:${port}`,
    validateStatus: () => true,
    paramsSerializer: serializeParams,
  });

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  return { client, close };
}
