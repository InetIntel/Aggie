import axios from "axios";
import {
  Credential,
  TelegramUserAuthStartResponse,
  TelegramUserAuthVerifyResponse,
} from "./types";
export const getCredentials = async () => {
  const { data } = await axios.get<Credential[]>("/api/credential");
  return data;
};

export const newCredential = async (values: any) => {
  const { data } = await axios.post("/api/credential", values);
  return data;
};

export const deleteCredential = async (credential: Credential) => {
  const { data } = await axios.delete("/api/credential/" + credential._id);
  return data;
};

export const telegramUserAuthStart = async (values: {
  apiId: string;
  apiHash: string;
  phone: string;
}) => {
  const { data } = await axios.post<TelegramUserAuthStartResponse>(
    "/api/credential/telegram-user/auth/start",
    values
  );
  return data;
};

export const telegramUserAuthVerifyCode = async (values: {
  authRequestId: string;
  code: string;
}) => {
  const { data } = await axios.post<TelegramUserAuthVerifyResponse>(
    "/api/credential/telegram-user/auth/verify-code",
    values
  );
  return data;
};

export const telegramUserAuthVerifyPassword = async (values: {
  authRequestId: string;
  password: string;
}) => {
  const { data } = await axios.post<TelegramUserAuthVerifyResponse>(
    "/api/credential/telegram-user/auth/verify-password",
    values
  );
  return data;
};
