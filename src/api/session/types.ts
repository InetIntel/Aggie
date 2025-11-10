import { hasId } from "../common";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

export interface Session extends hasId {
  email: string;
  hasDefaultPassword: boolean;
  provider: string;
  role: "admin" | "monitor" |"viewer" |"team_lead" | undefined;
  username: string;
  mfa?: boolean;              // session is MFA-verified
  mfa_enrolled?: boolean;     // account has at least one WebAuthn credential
  mfa_enforced?: boolean;     // MFA policy enforced for this user/org
  __v?: number;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;          // present when mfa=false and JWT is also set as cookie
  mfa?: boolean;           // whether current session has been verified by mfa
  mfa_required?: boolean;  // whether current session require mfa verification
  pendingLoginId?: string; // present when mfa_required=true
}

export type AuthOptions = PublicKeyCredentialRequestOptionsJSON;

export type RegisterOptions = PublicKeyCredentialCreationOptionsJSON;

export type AuthFinishPayload = {
  username: string; 
  assertion: AuthenticationResponseJSON;
};

export type RegisterFinishPayload = RegistrationResponseJSON;

export interface SourceEvent {
  datetime: string;
  type: string;
  message: string;
}

export type WebAuthnDevice = {
  credentialID: string;          // base64url string 
  label: string;
  transports: string[];
  fmt: string;
  aaguid: string;
  counter: number;
  userVerified: boolean;
  lastUsedAt?: string | null;
  createdAt?: string | null;
};
