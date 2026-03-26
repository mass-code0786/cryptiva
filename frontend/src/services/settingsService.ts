import api from "./api";

export type SettingResponse = {
  key: string;
  value: string;
  updatedAt?: string;
};

export const fetchSetting = (key: string) => api.get<SettingResponse>(`/settings/${key}`);

export const updateSetting = (key: string, value: string) =>
  api.post<SettingResponse>(`/settings/${key}`, {
    value,
  });
