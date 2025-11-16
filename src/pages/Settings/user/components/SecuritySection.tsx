import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { startRegistration } from "@simplewebauthn/browser";

import type { Session, WebAuthnDevice } from "../../../../api/session/types";
import {
  webauthnRegisterStart,
  webauthnRegisterFinish,
  getSession,
  listWebAuthnDevices,
  renameWebAuthnDevice,
  deleteWebAuthnDevice,
  totpEnrollStart,
  totpEnrollVerify,
  totpDisable,
  totpRegenerateRecoveryCodes,
} from "../../../../api/session";

import AggieButton from "../../../../components/AggieButton";
import WebAuthnDeviceRow from "./WebAuthnDeviceRow";

type SecuritySectionProps = {
  session: Session | undefined;
  user: any | undefined;                 
  isSelf: boolean;
  onUserUpdated: () => Promise<any> | void; 
};

type TTab = "webauthn" | "totp";

const SecuritySection = ({ session, user, isSelf, onUserUpdated }: SecuritySectionProps) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TTab>("webauthn");

  const mfaEnrolled = !!session?.mfa_enrolled;
  const totpEnabled = !!(user as any)?.mfa?.totp?.enabled;
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<boolean>(false);

  const {
    data: devices,
    isLoading: devicesLoading,
    refetch: refetchDevices,
  } = useQuery<WebAuthnDevice[]>(
    ["webauthn-devices"],
    listWebAuthnDevices,
    { enabled: isSelf } 
  );

  const doRenameDevice = useMutation(
    ({ credentialID, label }: { credentialID: string; label: string }) =>
      renameWebAuthnDevice(credentialID, label),
    {
      onSuccess: () => refetchDevices(),
    }
  );

  const doDeleteDevice = useMutation(
    (credentialID: string) => deleteWebAuthnDevice(credentialID),
    {
      onSuccess: async () => {
        await refetchDevices();
        const fresh = await getSession();
        queryClient.setQueryData(["session"], fresh);
      },
    }
  );

  async function handleEnrollWebAuthn() {
    setEnrollError(null);
    setEnrollSuccess(false);
    setEnrollLoading(true);
    try {
      const options = await webauthnRegisterStart();
      const attestation = await startRegistration({ optionsJSON: options });
      await webauthnRegisterFinish(attestation);

      const fresh = await getSession();
      queryClient.setQueryData(["session"], fresh);
      await refetchDevices();

      setEnrollSuccess(true);
    } catch (e: any) {
      setEnrollError(e?.message || "Enrollment failed. Please try again.");
    } finally {
      setEnrollLoading(false);
    }
  }

  const [totpEnrollVisible, setTotpEnrollVisible] = useState(false);
  const [totpEnrollLoading, setTotpEnrollLoading] = useState(false);
  const [totpEnrollError, setTotpEnrollError] = useState<string | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  const [totpManualSecret, setTotpManualSecret] = useState<string | null>(null);
  const [totpCodeInput, setTotpCodeInput] = useState("");
  const [totpRecoveryCodes, setTotpRecoveryCodes] = useState<string[] | null>(null);
  const [totpDisableLoading, setTotpDisableLoading] = useState(false);
  const [totpRegenLoading, setTotpRegenLoading] = useState(false);
  const [totpRegenError, setTotpRegenError] = useState<string | null>(null);

  async function handleTotpEnrollStart() {
    setTotpEnrollError(null);
    setTotpEnrollLoading(true);
    setTotpRecoveryCodes(null);

    try {
      const res = await totpEnrollStart();
      setTotpQrDataUrl(res.qrPngDataUrl);
      setTotpManualSecret(res.manualSecret);
      setTotpEnrollVisible(true);
    } catch (e: any) {
      setTotpEnrollError(
        e?.message || "Could not start TOTP enrollment. Please try again."
      );
    } finally {
      setTotpEnrollLoading(false);
    }
  }

  async function handleTotpEnrollVerify() {
    if (!totpCodeInput.trim()) return;
    setTotpEnrollError(null);
    setTotpEnrollLoading(true);

    try {
      const res = await totpEnrollVerify(totpCodeInput.trim());
      if (!res.ok || !res.totpEnabled) {
        setTotpEnrollError(
          "Verification failed. Please check the code and try again."
        );
      } else {
        setTotpRecoveryCodes(res.recoveryCodes || []);

        const freshSession = await getSession();
        queryClient.setQueryData(["session"], freshSession);
        await onUserUpdated();
      }
    } catch (e: any) {
      setTotpEnrollError(
        e?.message || "Could not verify TOTP enrollment. Please try again."
      );
    } finally {
      setTotpEnrollLoading(false);
    }
  }

  async function handleTotpDisable() {
    if (
      !confirm(
        "Disable TOTP for your account? You will no longer be asked for TOTP codes."
      )
    ) {
      return;
    }
    setTotpDisableLoading(true);
    setTotpRegenError(null);
    try {
      await totpDisable();
      setTotpEnrollVisible(false);
      setTotpQrDataUrl(null);
      setTotpManualSecret(null);
      setTotpRecoveryCodes(null);
      setTotpCodeInput("");

      const freshSession = await getSession();
      queryClient.setQueryData(["session"], freshSession);
      await onUserUpdated();
    } catch (e: any) {
      setTotpRegenError(e?.message || "Could not disable TOTP.");
    } finally {
      setTotpDisableLoading(false);
    }
  }

  async function handleTotpRegenerateCodes() {
    setTotpRegenLoading(true);
    setTotpRegenError(null);
    try {
      const res = await totpRegenerateRecoveryCodes();
      setTotpRecoveryCodes(res.recoveryCodes || []);
    } catch (e: any) {
      setTotpRegenError(e?.message || "Could not regenerate recovery codes.");
    } finally {
      setTotpRegenLoading(false);
    }
  }

  return (
    <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-300">
      <h3 className="text-xl font-medium mb-3">Security</h3>

      {/* Overall MFA status */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium">Enrollment Status</span>
        <span
          className={[
            "text-xs px-2 py-0.5 rounded-full border",
            mfaEnrolled
              ? "text-green-700 border-green-300 bg-green-50"
              : "text-amber-700 border-amber-300 bg-amber-50",
          ].join(" ")}
          title={
            mfaEnrolled
              ? "You have at least one MFA method configured"
              : "No MFA methods enrolled yet"
          }
        >
          {mfaEnrolled ? "MFA Enrolled" : "MFA Off"}
        </span>
      </div>

      {!isSelf && (
        <p className="text-sm text-slate-500">
          You can only manage MFA for your own account.
        </p>
      )}

      {isSelf && (
        <>
          {/* Tabs */}
          <div className="border-b border-slate-200 dark:border-gray-700 mb-3 flex gap-2">
            <button
              type="button"
              className={[
                "px-3 py-2 text-sm border-b-2",
                activeTab === "webauthn"
                  ? "border-[#416B34] text-[#416B34]"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
              onClick={() => setActiveTab("webauthn")}
            >
              WebAuthn (Passkeys)
            </button>
            <button
              type="button"
              className={[
                "px-3 py-2 text-sm border-b-2",
                activeTab === "totp"
                  ? "border-[#416B34] text-[#416B34]"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
              onClick={() => setActiveTab("totp")}
            >
              Authenticator App (TOTP)
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "webauthn" ? (
            <div>
              <div className="grid grid-cols-4 py-2 items-center">
                <p>WebAuthn Enrollment</p>
                <div className="col-span-3">
                  <AggieButton
                    variant="primary"
                    className="justify-center"
                    onClick={handleEnrollWebAuthn}
                    loading={enrollLoading}
                    disabled={enrollLoading}
                  >
                    <FontAwesomeIcon icon={faKey} className="mr-2" />
                    {enrollLoading
                      ? "Enrolling..."
                      : "Enable / Add authenticator"}
                  </AggieButton>

                  {enrollError && (
                    <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      {enrollError}
                    </p>
                  )}
                  {enrollSuccess && (
                    <p className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                      Device enrolled. MFA is now active for this session.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <p className="text-lg font-medium mb-1">Enrolled devices</p>
                <div className="rounded-lg border border-slate-300 dark:border-gray-700">
                  {devicesLoading ? (
                    <div className="p-3 text-sm text-slate-500">Loading…</div>
                  ) : !devices || devices.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">
                      No devices yet.
                    </div>
                  ) : (
                    devices.map((device) => (
                      <WebAuthnDeviceRow
                        key={device.credentialID}
                        device={device}
                        onRename={(credentialID, label) =>
                          doRenameDevice.mutate({ credentialID, label })
                        }
                        onDelete={(credentialID) =>
                          doDeleteDevice.mutate(credentialID)
                        }
                        renaming={doRenameDevice.isLoading}
                        deleting={doDeleteDevice.isLoading}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 py-2 items-start mt-1">
              <p>TOTP (Authenticator app)</p>
              <div className="col-span-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-full border",
                      totpEnabled
                        ? "text-green-700 border-green-300 bg-green-50"
                        : "text-amber-700 border-amber-300 bg-amber-50",
                    ].join(" ")}
                  >
                    {totpEnabled ? "Enabled" : "Not enabled"}
                  </span>

                  {!totpEnabled && (
                    <AggieButton
                      variant="secondary"
                      className="justify-center"
                      type="button"
                      onClick={handleTotpEnrollStart}
                      loading={totpEnrollLoading}
                      disabled={totpEnrollLoading}
                    >
                      <FontAwesomeIcon icon={faShieldHalved} className="mr-2" />
                      Set up TOTP
                    </AggieButton>
                  )}

                  {totpEnabled && (
                    <>
                      <AggieButton
                        variant="secondary"
                        className="justify-center"
                        type="button"
                        onClick={() =>
                          setTotpEnrollVisible((visible) => !visible)
                        }
                      >
                        Manage TOTP
                      </AggieButton>
                      <AggieButton
                        variant="danger"
                        className="justify-center"
                        type="button"
                        onClick={handleTotpDisable}
                        loading={totpDisableLoading}
                        disabled={totpDisableLoading}
                      >
                        Disable TOTP
                      </AggieButton>
                    </>
                  )}
                </div>

                {totpEnrollError && (
                  <p className="mt-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {totpEnrollError}
                  </p>
                )}
                {totpRegenError && (
                  <p className="mt-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {totpRegenError}
                  </p>
                )}

                {(totpEnrollVisible || (!totpEnabled && totpQrDataUrl)) && (
                  <div className="mt-3 border border-slate-200 rounded-md bg-slate-50 dark:bg-gray-900 p-3 space-y-3">
                    {totpQrDataUrl && (
                      <div className="flex flex-col sm:flex-row gap-3 items-start">
                        <img
                          src={totpQrDataUrl}
                          alt="TOTP QR code"
                          className="w-32 h-32 border border-slate-300 rounded bg-white"
                        />
                        <div className="text-xs text-slate-700 dark:text-gray-300">
                          <p className="font-medium mb-1">
                            Scan this QR code in your authenticator app.
                          </p>
                          <p>
                            Alternatively, you can enter this secret manually:
                          </p>
                          <code className="block mt-1 px-2 py-1 bg-white dark:bg-gray-800 border border-slate-300 rounded text-[11px] select-all">
                            {totpManualSecret}
                          </code>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Enter a 6-digit code to confirm setup
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={8}
                        className="w-full px-2 py-1 border rounded-md bg-white dark:bg-gray-900 focus-theme"
                        value={totpCodeInput}
                        onChange={(e) => setTotpCodeInput(e.target.value)}
                        placeholder="Code from your authenticator app"
                      />
                      <div className="mt-2 flex justify-end">
                        <AggieButton
                          variant="primary"
                          type="button"
                          onClick={handleTotpEnrollVerify}
                          loading={totpEnrollLoading}
                          disabled={
                            totpEnrollLoading || !totpCodeInput.trim()
                          }
                          className="justify-center"
                        >
                          Verify
                        </AggieButton>
                      </div>
                    </div>

                    {totpRecoveryCodes && totpRecoveryCodes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-700 mb-1">
                          Recovery codes (shown only once)
                        </p>
                        <p className="text-xs text-slate-600 mb-2">
                          Store these in a safe place. Each code can be used
                          once if you lose access to your authenticator app.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                          {totpRecoveryCodes.map((c) => (
                            <code
                              key={c}
                              className="px-2 py-1 text-[11px] bg-white dark:bg-gray-800 border border-slate-300 rounded text-center"
                            >
                              {c}
                            </code>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <AggieButton
                            variant="secondary"
                            type="button"
                            onClick={handleTotpRegenerateCodes}
                            loading={totpRegenLoading}
                            disabled={totpRegenLoading}
                            className="justify-center"
                          >
                            Regenerate recovery codes
                          </AggieButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SecuritySection;