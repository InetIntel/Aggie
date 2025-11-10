import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { deleteUser, getUser } from "../../../api/users";
import type { Session, WebAuthnDevice } from "../../../api/session/types";
import { startRegistration } from "@simplewebauthn/browser";
import { 
  webauthnRegisterStart, 
  webauthnRegisterFinish, 
  getSession,
  listWebAuthnDevices,
  renameWebAuthnDevice,
  deleteWebAuthnDevice,
} from "../../../api/session";

import PlaceholderDiv from "../../../components/PlaceholderDiv";

import DropdownMenu from "../../../components/DropdownMenu";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import CreateEditUserForm from "./CreateEditUserForm";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import SetPassword from "./SetPassword";
import {
  faEllipsisH,
  faEdit,
  faTrashAlt,
  faUserShield,
  faKey, 
  faShieldHalved
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import WebAuthnDeviceRow from "./components/WebAuthnDeviceRow";
import { UserRoles } from "../../../api/users/types";

interface IProps {
  session: Session | undefined;
}

const UserProfile = ({ session }: IProps) => {
  const params = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery(["users", params.id], () => {
    if (params.id) return getUser(params.id);
    else return undefined;
  });

  const queryClient = useQueryClient();
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<boolean>(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openEditPassword, setOpenEditPassword] = useState(false);

  const {
    data: devices,
    isLoading: devicesLoading,
    refetch: refetchDevices,
  } = useQuery<WebAuthnDevice[]>(
    ["webauthn-devices"],
    listWebAuthnDevices,
    { enabled: !!session && session._id === params.id }
  );

  const doRenameDevice = useMutation(
    ({ credentialID, label }: { credentialID: string; label: string }) => renameWebAuthnDevice(credentialID, label),
    { onSuccess: () => refetchDevices() }
  );

  const doDeleteUser = useMutation(deleteUser, {
    onSuccess: () => {
      setOpenDelete(false);
      navigate("/settings/users");
    },
  });

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

      const attestation = await startRegistration({optionsJSON: options});

      await webauthnRegisterFinish(attestation);

      //refresh session
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
  const isSelf = session?._id === params.id;
  const role = session?.role as UserRoles | undefined;
  const isAdmin = role === 'admin';
  const isTeamLead = role === 'team_lead';
  const canEdit = !!isSelf || (isAdmin && !isSelf);
  const canEditRole = isAdmin && !isSelf;
  const canDeleteAsTeamLead = isTeamLead && !!data && String(data.createdBy) === String(session?._id) && !isSelf;
  const canDeleteAsAdmin = isAdmin && !isSelf;
  const canDelete = canDeleteAsAdmin || canDeleteAsTeamLead;
  const showMenu = !!(isSelf || isAdmin || (isTeamLead && !!data && String(data.createdBy) === String(session?._id)));

  const grid = "grid grid-cols-4 py-1 items-center";

  return (
    <section className={"mt-4 max-w-screen-xl mx-auto"}>
      <div className={`p-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-300`}>
        <div className='flex justify-between items-center'>
          <h2 className='text-3xl font-medium'>{isSelf && "Your "}Profile</h2>
          {showMenu && (
            <DropdownMenu
              variant='secondary'
              className='px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300 dark:hover:bg-gray-700'
              panelClassName='overflow-hidden right-0 text-sm'
              buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
            >
              {canEdit && (
                <>
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full dark:text-gray-300'
                    onClick={() => setOpenEdit(true)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    Edit
                  </AggieButton>
                  <AggieButton
                    className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 w-full dark:text-gray-300'
                    onClick={() => setOpenEditPassword(true)}
                  >
                    <FontAwesomeIcon icon={faUserShield} />
                    Change Password
                  </AggieButton>
                </>
              )}
              {canDelete && (
                <AggieButton
                  className='px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 text-red-600'
                  onClick={() => setOpenDelete(true)}
                >
                  <FontAwesomeIcon icon={faTrashAlt} />
                    Permanently Delete
                </AggieButton>
              )}
            </DropdownMenu>
          )}
        </div>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Display Name</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 col-span-3  ${grid}`}
          >
            {data?.displayName || "Not Set"}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Username</p>
          <p
            className={`text-1xl font-medium inline-flex items-center gap-1 col-span-3 ${grid}`}
          >
            {data?.username}
          </p>
        </PlaceholderDiv>
        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Role</p>
          <span className='px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded w-fit border border-slate-300'>
            {data?.role}
          </span>
        </PlaceholderDiv>

        <PlaceholderDiv loading={isLoading} className={grid}>
          <p className=''>Email</p>
          <p className='mt-1'>{data?.email}</p>
        </PlaceholderDiv>
        <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-300">
          <h3 className="text-xl font-medium mb-2">Security</h3>

          <div className="grid grid-cols-4 py-1 items-center">
            <p>Enrollment Status</p>
            <div className="col-span-3 inline-flex items-center gap-2">
              <span
                className={[
                  "text-xs px-2 py-0.5 rounded-full border",
                  (session?.mfa_enrolled ? "text-green-700 border-green-300 bg-green-50" : "text-amber-700 border-amber-300 bg-amber-50")
                ].join(" ")}
                title={session?.mfa_enrolled ? "You have at least one registered passkey" : "No passkeys enrolled yet"}
              >
                {session?.mfa_enrolled ? "MFA Enrolled" : "MFA Off"}
              </span>
            </div>
          </div>
          {isSelf && (
           <> 
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
                  {enrollLoading ? "Enrolling..." : "Enable / Add authenticator"}
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
                  <div className="p-3 text-sm text-slate-500">No devices yet.</div>
                ) : (
                  devices?.map((device) => (
                    <WebAuthnDeviceRow
                      key={device.credentialID}
                      device={device}
                      onRename={(credentialID, label) => doRenameDevice.mutate({credentialID, label })}
                      onDelete={(credentialID) => doDeleteDevice.mutate(credentialID)}
                      renaming={doRenameDevice.isLoading}
                      deleting={doDeleteDevice.isLoading}
                    />
                  ))
                )}
              </div>
            </div>
            </>
            
          )}
        </div>        
      </div>
      <AggieDialog
        isOpen={!!openEdit}
        onClose={() => setOpenEdit(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: "Edit user details",
        }}
      >
        <CreateEditUserForm 
          user={data} 
          onClose={() => setOpenEdit(false)} 
          canEditRole={canEditRole}
          currentUserRole={role}
        />
      </AggieDialog>
      <AggieDialog
        isOpen={!!openEditPassword}
        onClose={() => setOpenEditPassword(false)}
        className='px-3 py-4 w-full max-w-lg'
        data={{
          title: `Change password`,
        }}
      >
        <SetPassword
          user={session}
          onClose={() => setOpenEditPassword(false)}
        />
      </AggieDialog>
      <ConfirmationDialog
        isOpen={!!openDelete}
        variant='danger'
        disabled={doDeleteUser.isLoading}
        title={`Delete ${data?.username}'s Account Permanently?`}
        description={"Are you sure you want to do this?"}
        confirmText={"Delete"}
        onClose={() => setOpenDelete(false)}
        onConfirm={() => !!data && doDeleteUser.mutate(data)}
      ></ConfirmationDialog>
    </section>
  );
};

export default UserProfile;
