// Cliente HTTP minimalista com tratamento padrão de erros.

async function request(method, url, opts = {}) {
  const init = { method, credentials: 'include', headers: {}, signal: opts.signal };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  } else if (opts.body !== undefined) {
    init.body = opts.body;
  }
  const res = await fetch(url, init);
  let json = null;
  try { json = await res.json(); } catch { /* sem body */ }
  if (!res.ok || (json && json.ok === false)) {
    const err = new Error(json?.error || `http_${res.status}`);
    err.status = res.status;
    err.code = json?.error;
    err.info = json?.info;
    throw err;
  }
  return json?.data ?? null;
}

export const api = {
  get: (url, opts) => request('GET', url, opts),
  post: (url, body) => request('POST', url, { body }),
  patch: (url, body) => request('PATCH', url, { body }),
  delete: (url, body) => request('DELETE', url, { body }),
  upload: (url, formData) => request('POST', url, { body: formData }),

  // Upload com callback de progresso (0‒100). Usa XHR para ter acesso ao evento upload.progress.
  uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.responseType = 'json';
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        const json = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300 && json?.ok !== false) {
          resolve(json?.data ?? null);
        } else {
          const err = new Error(json?.error || `http_${xhr.status}`);
          err.status = xhr.status;
          err.code = json?.error;
          err.info = json?.info;
          reject(err);
        }
      };
      xhr.onerror = () => { const e = new Error('network_error'); e.code = 'network_error'; reject(e); };
      xhr.send(formData);
    });
  },
};
