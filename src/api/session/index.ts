import axios from "axios";
import { 
  LoginData, 
  LoginResponse, 
  Session,
  AuthOptions,
  RegisterOptions,
  AuthFinishPayload,
  RegisterFinishPayload,
  WebAuthnDevice, 
} from "./types";



export const logIn = async (loginData: LoginData) => {
  const { data } = await axios.request({
    method: "POST",
    url: "/login",
    data: loginData,
    withCredentials: true, 
  });

  return data as LoginResponse;
};

// Webauthn Enroll Step 1: request register option (incl. challenge) from server
export const webauthnRegisterStart = async (): Promise<RegisterOptions> => {
  const { data } = await axios.post(
    "/webauthn/register/start",
    {},
    { withCredentials: true }
  );
  return data as RegisterOptions;
};

// Webauthn Enroll Step 2: send credential to server for verification and storage
export const webauthnRegisterFinish = async (
  attestation: RegisterFinishPayload
): Promise<{ ok: boolean; mfa: boolean }> => {
  const { data } = await axios.post(
    "/webauthn/register/finish",
    attestation,
    { withCredentials: true }
  );
  return data;
};

// Webauthn Login Step 1: ask server for assertion options
export const webauthnLoginStart = async (body: {
  pendingLoginId?: string;
  username?: string;
}): Promise<AuthOptions> => {
  const { data } = await axios.post("/webauthn/login/start", body, {
    withCredentials: true,
  });
  return data as AuthOptions;
};

// Webauthn Login Step 2: send assertion response to finish MFA login
export const webauthnLoginFinish = async (
  body: AuthFinishPayload
): Promise<{ ok: boolean; mfa: true; token?: string }> => {
  const { data } = await axios.post(
    "/webauthn/login/finish",
    { username: body.username, ...body.assertion },
    { withCredentials: true }
  );
  return data;
};

export const listWebAuthnDevices = async (): Promise<WebAuthnDevice[]> => {
  const { data } = await axios.get("/webauthn/credentials", { withCredentials: true });
  return data?.credentials ?? [];
};

export const renameWebAuthnDevice = async (credentialID: string, label: string) => {
  await axios.patch(
    `/webauthn/credentials/${credentialID}`,
    { label },
    { withCredentials: true }
  );
};

export const deleteWebAuthnDevice = async (credentialID: string) => {
  await axios.delete(`/webauthn/credentials/${credentialID}`, { withCredentials: true });
};


export const getSession = async (): Promise<Session> => {
  const { data } = await axios.get("/session", { withCredentials: true });
  return data;
};

export const getSession_untyped = async () => {
  const { data } = await axios.get("/session", { withCredentials: true });
  return data;
};

export const logOut = async () => {
  const { data } = await axios.post("/logout", {}, { withCredentials: true });
  return data;
};