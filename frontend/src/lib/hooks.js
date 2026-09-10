import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Fetch data from a GET endpoint; re-runs when path or params change. */
export function useFetch(path, params, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const key = JSON.stringify(params || {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path || !enabled) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await api.get(path, JSON.parse(key));
      if (id === seq.current) { setData(res); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path, key, enabled]);

  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Simple controlled-form state helper. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((name, value) => {
    setValues((prev) => {
      if (!name.includes('.')) return { ...prev, [name]: value };
      const [a, b] = name.split('.');
      return { ...prev, [a]: { ...(prev[a] || {}), [b]: value } };
    });
  }, []);
  const bind = (name, { type } = {}) => {
    const [a, b] = name.split('.');
    const raw = b ? values[a]?.[b] : values[a];
    if (type === 'checkbox') return { checked: Boolean(raw), onChange: (e) => set(name, e.target.checked) };
    return { value: raw ?? '', onChange: (e) => set(name, type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value) };
  };
  return { values, setValues, set, bind };
}
