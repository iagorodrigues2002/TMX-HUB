import { env } from '../env.js';
import { ApiError } from '../query-client.js';
import { authToken } from './request.js';

/**
 * XHR-based multipart upload — gives us progress events that fetch() can't.
 * Used for video uploads (potentially up to 100MB).
 */
export function uploadMultipart<T>(
  path: string,
  body: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    xhr.open('POST', `${baseUrl}${path}`);
    xhr.timeout = 20 * 60 * 1000;
    const token = authToken.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'json';
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
      } else {
        const r = (xhr.response ?? {}) as { detail?: string; message?: string };
        const msg = r.detail || r.message || `HTTP ${xhr.status}`;
        reject(new ApiError(msg, xhr.status, r));
      }
    };
    xhr.onerror = () => reject(new ApiError('Falha de rede no upload.', 0));
    xhr.ontimeout = () =>
      reject(
        new ApiError(
          'O upload excedeu 20 minutos. Verifique a conexão e tente novamente com menos vídeos.',
          0,
        ),
      );
    xhr.send(body);
  });
}
