import { request } from 'node:http';

// Native fetch stops waiting for headers after five minutes, before large Drive downloads finish.
export function requestCreativeAnalysis(url, headers, body) {
  if (new URL(url).origin !== 'http://localhost:3120') throw Error('Local preview only');
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers, signal: AbortSignal.timeout(3600000) }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
        if (text.length > 2000000) req.destroy(Error('Analysis response exceeds limit'));
      });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, result: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
