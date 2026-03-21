import axios from "axios";

const normalizeUrl = (value: string) => value.trim().replace(/\/+$/, "");

const resolveApiUrl = () => {
  const hostname = window.location.hostname.toLowerCase();

  if (hostname === "cryptiva.world" || hostname === "www.cryptiva.world") {
    return "https://api.cryptiva.world/api";
  }

  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredApiUrl) {
    return normalizeUrl(configuredApiUrl);
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000/api";
  }

  throw new Error("Missing VITE_API_URL. Define it in frontend/.env.");
};

const apiUrl = resolveApiUrl();

const api = axios.create({
  baseURL: apiUrl,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
