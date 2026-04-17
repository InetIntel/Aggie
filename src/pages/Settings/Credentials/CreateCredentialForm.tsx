import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as Yup from "yup";
import {
  mastodonAuthStart,
  mastodonAuthStatus,
  newCredential,
  telegramUserAuthStart,
  telegramUserAuthVerifyCode,
  telegramUserAuthVerifyPassword,
} from "../../../api/credentials";

import { Listbox } from "@headlessui/react";
import AxiosErrorCard from "../../../components/AxiosErrorCard";
import AggieButton from "../../../components/AggieButton";
import FormikInput from "../../../components/FormikInput";
import FormikWithSchema from "../../../components/FormikWithSchema";

import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CredentialOption, CREDENTIAL_OPTIONS } from "../../../api/common";

// credential type dropdown

interface IProps {
  onClose: () => void;
}

type TelegramUserStep = "start" | "code" | "password";
type MastodonStep = "start" | "authorizing";

const CREDENTIAL_NAME_PLACEHOLDER = "Enter credential name (<20 chars)";

const CreateCredentialForm = ({ onClose }: IProps) => {
  const [
    credentialType,
    setCredentialType
  ] = useState<CredentialOption>("ioda");
  const [telegramUserStep, setTelegramUserStep] =
    useState<TelegramUserStep>("start");
  const [telegramUserName, setTelegramUserName] = useState("");
  const [telegramAuthRequestId, setTelegramAuthRequestId] = useState("");
  const [mastodonStep, setMastodonStep] = useState<MastodonStep>("start");
  const [mastodonCredentialName, setMastodonCredentialName] = useState("");
  const [mastodonAuthRequestId, setMastodonAuthRequestId] = useState("");
  const [mastodonServerUrl, setMastodonServerUrl] = useState("");
  const mastodonPopupRef = useRef<Window | null>(null);
  const mastodonPollRef = useRef<number | null>(null);

  const queryClient = useQueryClient();
  const doCreateCredential = useMutation(newCredential, {
    onSuccess: () => {
      queryClient.invalidateQueries(["credentials"]);
      onClose();
    },
  });
  const doTelegramUserAuthStart = useMutation(telegramUserAuthStart, {
    onSuccess: (data) => {
      setTelegramAuthRequestId(data.authRequestId);
      setTelegramUserStep("code");
    },
  });
  const doTelegramUserAuthVerifyCode = useMutation(telegramUserAuthVerifyCode, {
    onSuccess: async (data) => {
      if (data.status === "PASSWORD_REQUIRED") {
        setTelegramUserStep("password");
        return;
      }

      await doCreateCredential.mutateAsync({
        credentials: {},
        name: telegramUserName,
        type: "telegramUser",
        authRequestId: telegramAuthRequestId,
      });
    },
  });
  const doTelegramUserAuthVerifyPassword = useMutation(
    telegramUserAuthVerifyPassword,
    {
      onSuccess: async () => {
        await doCreateCredential.mutateAsync({
          credentials: {},
          name: telegramUserName,
          type: "telegramUser",
          authRequestId: telegramAuthRequestId,
        });
      },
    }
  );
  const doMastodonAuthStart = useMutation(mastodonAuthStart, {
    onSuccess: (data) => {
      setMastodonAuthRequestId(data.authRequestId);
      setMastodonStep("authorizing");

      mastodonPopupRef.current = window.open(
        data.authUrl,
        "aggie-mastodon-auth",
        "popup=yes,width=640,height=800"
      );
    },
  });

  const resetTelegramUserFlow = () => {
    setTelegramUserStep("start");
    setTelegramUserName("");
    setTelegramAuthRequestId("");
    doTelegramUserAuthStart.reset();
    doTelegramUserAuthVerifyCode.reset();
    doTelegramUserAuthVerifyPassword.reset();
  };

  const stopMastodonPolling = () => {
    if (mastodonPollRef.current) {
      window.clearInterval(mastodonPollRef.current);
      mastodonPollRef.current = null;
    }
  };

  const resetMastodonFlow = () => {
    stopMastodonPolling();
    mastodonPopupRef.current?.close();
    mastodonPopupRef.current = null;
    setMastodonStep("start");
    setMastodonCredentialName("");
    setMastodonAuthRequestId("");
    setMastodonServerUrl("");
    doMastodonAuthStart.reset();
  };

  useEffect(() => {
    if (!mastodonAuthRequestId) return;

    const checkStatus = async () => {
      const status = await mastodonAuthStatus(mastodonAuthRequestId);
      if (status.status !== "AUTHORIZED") return;

      stopMastodonPolling();
      mastodonPopupRef.current?.close();
      mastodonPopupRef.current = null;

      await doCreateCredential.mutateAsync({
        credentials: {},
        name: mastodonCredentialName,
        type: "mastodon",
        authRequestId: mastodonAuthRequestId,
      });
    };

    mastodonPollRef.current = window.setInterval(() => {
      checkStatus().catch(() => {});
    }, 2000);

    return () => {
      stopMastodonPolling();
    };
  }, [mastodonAuthRequestId, mastodonCredentialName]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "aggie-mastodon-auth-complete") return;
      if (!event.data?.authRequestId) return;
      if (event.data.authRequestId !== mastodonAuthRequestId) return;

      mastodonAuthStatus(event.data.authRequestId)
        .then(async (status) => {
          if (status.status !== "AUTHORIZED") return;

          stopMastodonPolling();
          mastodonPopupRef.current?.close();
          mastodonPopupRef.current = null;

          await doCreateCredential.mutateAsync({
            credentials: {},
            name: mastodonCredentialName,
            type: "mastodon",
            authRequestId: event.data.authRequestId,
          });
        })
        .catch(() => {});
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mastodonAuthRequestId, mastodonCredentialName]);

  useEffect(() => {
    return () => {
      stopMastodonPolling();
      mastodonPopupRef.current?.close();
    };
  }, []);

  const telegramUserError =
    doTelegramUserAuthStart.error ||
    doTelegramUserAuthVerifyCode.error ||
    doTelegramUserAuthVerifyPassword.error ||
    doCreateCredential.error;
  const mastodonError = doMastodonAuthStart.error || doCreateCredential.error;

  // junkpedia credential
  // could be cleaner but idk how to work the type inferencing with yup
  const junkipediaSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    junkipediaAPIKey: Yup.string().required("API Token required"),
  });
  type IJunkipediaSchema = Yup.InferType<typeof junkipediaSchema>;

  const junkipediaForm = (
    <FormikWithSchema
      schema={junkipediaSchema}
      onSubmit={(values: IJunkipediaSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "junkipedia",
          secrets: {
            junkipediaAPIKey: values.junkipediaAPIKey,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput
        name='name'
        label='Credential Name'
        placeholder={CREDENTIAL_NAME_PLACEHOLDER}
      />
      <FormikInput name='junkipediaAPIKey' label='Junkipedia API Token' />
    </FormikWithSchema>
  );

  const telegramBotSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    botAPIToken: Yup.string().required("Bot API token required"),
  });
  type ITelegramBotSchema = Yup.InferType<typeof telegramBotSchema>;

  const telegramBotForm = (
    <FormikWithSchema
      schema={telegramBotSchema}
      onSubmit={(values: ITelegramBotSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "telegramBot",
          secrets: {
            botAPIToken: values.botAPIToken,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput
        name='name'
        label='Credential Name'
        placeholder={CREDENTIAL_NAME_PLACEHOLDER}
      />
      <FormikInput name='botAPIToken' label='Telegram Bot API Token' />
    </FormikWithSchema>
  );

  const telegramUserStartSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    apiId: Yup.string().required("Telegram API ID required"),
    apiHash: Yup.string().required("Telegram API hash required"),
    phone: Yup.string().required("Telegram phone number required"),
  });
  type ITelegramUserStartSchema = Yup.InferType<typeof telegramUserStartSchema>;

  const telegramUserCodeSchema = Yup.object().shape({
    code: Yup.string().required("Telegram verification code required"),
  });
  type ITelegramUserCodeSchema = Yup.InferType<typeof telegramUserCodeSchema>;

  const telegramUserPasswordSchema = Yup.object().shape({
    password: Yup.string().required("Telegram password required"),
  });
  type ITelegramUserPasswordSchema =
    Yup.InferType<typeof telegramUserPasswordSchema>;

  const telegramUserForm = (
    <div className='flex flex-col gap-3'>
      <div className='rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 px-3 py-2 text-sm text-slate-600 dark:text-gray-400'>
        <p>Telegram User uses your Telegram app API ID, API hash, and phone login.</p>
        <p>Enter the login code Telegram sends you. If 2FA is enabled, you will be asked for your password next.</p>
      </div>

      {telegramUserError && <AxiosErrorCard error={telegramUserError} />}

      {telegramUserStep === "start" && (
        <FormikWithSchema
          schema={telegramUserStartSchema}
          onSubmit={(values: ITelegramUserStartSchema) => {
            doTelegramUserAuthVerifyCode.reset();
            doTelegramUserAuthVerifyPassword.reset();
            setTelegramUserName(values.name);
            doTelegramUserAuthStart.mutate({
              apiId: values.apiId,
              apiHash: values.apiHash,
              phone: values.phone,
            });
          }}
          loading={doTelegramUserAuthStart.isLoading}
          onClose={onClose}
          onSubmitText='Send Code'
        >
          <FormikInput
            name='name'
            label='Credential Name'
            placeholder={CREDENTIAL_NAME_PLACEHOLDER}
          />
          <FormikInput name='apiId' label='Telegram App API ID' />
          <FormikInput name='apiHash' label='Telegram App API Hash' />
          <FormikInput
            name='phone'
            label='Telegram Phone Number'
            placeholder='Include country code, e.g. +15551234567'
          />
        </FormikWithSchema>
      )}

      {telegramUserStep === "code" && (
        <>
          <div className='rounded border border-slate-300 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-600 dark:text-gray-400'>
            <p>Credential: <span className='font-medium'>{telegramUserName}</span></p>
            <p>Auth session created. Enter the Telegram login code to continue.</p>
          </div>
          <FormikWithSchema
            schema={telegramUserCodeSchema}
            onSubmit={(values: ITelegramUserCodeSchema) => {
              doTelegramUserAuthVerifyCode.reset();
              doTelegramUserAuthVerifyCode.mutate({
                authRequestId: telegramAuthRequestId,
                code: values.code,
              });
            }}
            loading={
              doTelegramUserAuthVerifyCode.isLoading ||
              doCreateCredential.isLoading
            }
            onClose={onClose}
            onSubmitText='Verify Code'
          >
            <FormikInput name='code' label='Telegram Verification Code' />
          </FormikWithSchema>
          <div className='flex justify-end'>
            <AggieButton variant='secondary' onClick={resetTelegramUserFlow}>
              Start Over
            </AggieButton>
          </div>
        </>
      )}

      {telegramUserStep === "password" && (
        <>
          <div className='rounded border border-slate-300 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-600 dark:text-gray-400'>
            <p>Telegram requires your account password to finish sign-in.</p>
          </div>
          <FormikWithSchema
            schema={telegramUserPasswordSchema}
            onSubmit={(values: ITelegramUserPasswordSchema) => {
              doTelegramUserAuthVerifyPassword.reset();
              doTelegramUserAuthVerifyPassword.mutate({
                authRequestId: telegramAuthRequestId,
                password: values.password,
              });
            }}
            loading={
              doTelegramUserAuthVerifyPassword.isLoading ||
              doCreateCredential.isLoading
            }
            onClose={onClose}
            onSubmitText='Verify Password'
          >
            <FormikInput
              name='password'
              label='Telegram 2FA Password'
              type='password'
            />
          </FormikWithSchema>
          <div className='flex justify-end'>
            <AggieButton variant='secondary' onClick={resetTelegramUserFlow}>
              Start Over
            </AggieButton>
          </div>
        </>
      )}
    </div>
  );

  const iodaSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required")
  });
  type IodaSchema = Yup.InferType<typeof iodaSchema>;

  const iodaForm = (
    <FormikWithSchema
      schema={iodaSchema}
      onSubmit={(values: IodaSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "ioda",
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput
        name='name'
        label='Credential Name'
        placeholder={CREDENTIAL_NAME_PLACEHOLDER}
      />
    </FormikWithSchema>
  );

  const cloudflareSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    cloudflareApiToken: Yup.string().required("Cloudflare API Token required."),
  });
  type CloudflareSchema = Yup.InferType<typeof cloudflareSchema>;

  const cloudflareForm = (
    <FormikWithSchema
      schema={cloudflareSchema}
      onSubmit={(values: CloudflareSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "cloudflare",
          secrets: {
            cloudflareApiToken: values.cloudflareApiToken,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput
        name='name'
        label='Credential Name'
        placeholder={CREDENTIAL_NAME_PLACEHOLDER}
      />
      <FormikInput name='cloudflareApiToken' label='Cloudflare API Token' />
    </FormikWithSchema>
  );

  const mastodonSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    serverUrl: Yup.string()
      .url("Enter a valid Mastodon server URL")
      .required("Mastodon server URL required"),
  });
  type IMastodonSchema = Yup.InferType<typeof mastodonSchema>;

  const mastodonForm = (
    <div className='flex flex-col gap-3'>
      {/* <div className='rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 px-3 py-2 text-sm text-slate-600 dark:text-gray-400'>
        <p>Mastodon credentials are created through your Mastodon server's OAuth flow.</p>
        <p>Use the server base URL, for example `https://mastodon.social/@username`.</p>
      </div> */}

      {mastodonError && <AxiosErrorCard error={mastodonError} />}

      {mastodonStep === "start" && (
        <FormikWithSchema
          schema={mastodonSchema}
          onSubmit={(values: IMastodonSchema) => {
            setMastodonCredentialName(values.name);
            setMastodonServerUrl(values.serverUrl);
            doMastodonAuthStart.mutate({
              serverUrl: values.serverUrl,
            });
          }}
          loading={doMastodonAuthStart.isLoading}
          onClose={onClose}
          onSubmitText='Authorize Mastodon'
        >
          <FormikInput
            name='name'
            label='Credential Name'
            placeholder={CREDENTIAL_NAME_PLACEHOLDER}
          />
          <FormikInput
            name='serverUrl'
            label='Mastodon Server URL'
            placeholder='e.g., https://mastodon.social/@username'
          />
        </FormikWithSchema>
      )}

      {mastodonStep === "authorizing" && (
        <>
          <div className='rounded border border-slate-300 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-600 dark:text-gray-400'>
            <p>Credential: <span className='font-medium'>{mastodonCredentialName}</span></p>
            <p>Server: <span className='font-medium'>{mastodonServerUrl}</span></p>
            <p>Finish authorization in the popup, then this credential will be saved automatically.</p>
          </div>
          <div className='flex justify-between'>
            <AggieButton
              variant='secondary'
              type='button'
              onClick={() => {
                const popup = mastodonPopupRef.current;
                if (popup && !popup.closed) {
                  popup.focus();
                  return;
                }
                if (!doMastodonAuthStart.data?.authUrl) return;
                mastodonPopupRef.current = window.open(
                  doMastodonAuthStart.data.authUrl,
                  "aggie-mastodon-auth",
                  "popup=yes,width=640,height=800"
                );
              }}
            >
              Open Authorization Window
            </AggieButton>
            <AggieButton variant='secondary' onClick={resetMastodonFlow}>
              Start Over
            </AggieButton>
          </div>
        </>
      )}
    </div>
  );

  // rss credential
  // could be cleaner but idk how to work the type inferencing with yup
  /*const rssSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required")
  });
  type IRssSchema = Yup.InferType<typeof rssSchema>;

  const rssForm = (
    <FormikWithSchema
      schema={rssSchema}
      onSubmit={(values: IRssSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "rss",
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput
        name='name'
        label='Credential Name'
        placeholder={CREDENTIAL_NAME_PLACEHOLDER}
      />
    </FormikWithSchema>
  );

  const crowdTangleSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    dashboardAPIToken: Yup.string().required("API Token required"),
  });

  const twitterSchema = Yup.object().shape({
    name: Yup.string().required("Credentials name required"),
    consumerKey: Yup.string().required("Consumer key required."),
    consumerSecret: Yup.string().required("Consumer secret required."),
    accessToken: Yup.string().required("Access Token required."),
    accessTokenSecret: Yup.string().required("Access Token secret required."),
  });
  type ITwitterSchema = Yup.InferType<typeof twitterSchema>;

  const twitterForm = (
    <FormikWithSchema
      schema={twitterSchema}
      onSubmit={(values: ITwitterSchema) => {
        doCreateCredential.mutate({
          credentials: {},
          name: values.name,
          type: "twitter",
          secrets: {
            consumerKey: values.consumerKey,
            consumerSecret: values.consumerSecret,
            accessToken: values.accessToken,
            accessTokenSecret: values.accessTokenSecret,
          },
        });
      }}
      loading={doCreateCredential.isLoading}
      onClose={onClose}
    >
      <FormikInput name='name' label='Credential Name' />
      <FormikInput name='consumerKey' label='Twitter API Token' />
      <FormikInput name='consumerSecret' label='Twitter API Token Secret' />
      <FormikInput name='accessToken' label='Twitter Access Token' />
      <FormikInput name='accessTokenSecret' label='Twitter Access Token Secret' />
    </FormikWithSchema>
  );*/

  return (
    <>
      <label className='text-slate-600 dark:text-gray-400'>Credential Type</label>
      <Listbox
        value={credentialType}
        onChange={setCredentialType}
        as='div'
        className='relative font-medium mb-3'
      >
        <Listbox.Button className='px-3 py-2 focus-theme flex justify-between items-center bg-slate-50 dark:bg-gray-900 border border-slate-300 w-full hover:bg-slate-100 dark:hover:bg-gray-700 text-left ui-active:bg-slate-200  dark:ui-active:bg-gray-600 rounded'>
          {credentialType || "Select Credential"}
          <FontAwesomeIcon
            icon={faChevronDown}
            className='ui-active:rotate-180 text-slate-400 dark:text-gray-400 '
          />
        </Listbox.Button>
        <Listbox.Options className='absolute left-0 mt-1 right-0 shadow-md border border-slate-300 bg-white dark:bg-gray-800 rounded'>
          {[...CREDENTIAL_OPTIONS].map((item) => (
            <Listbox.Option
              key={item}
              value={item}
              className='flex justify-between px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 ui-selected:bg-slate-100 dark:ui-selected:bg-gray-700 cursor-pointer items-center'
            >
              {item}

              <FontAwesomeIcon
                icon={faCheck}
                className={`text-slate-400 dark:text-gray-400 ${
                  item === credentialType ? "" : "hidden"
                }`}
              />
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </Listbox>
      {credentialType === "junkipedia" && junkipediaForm}
      {/* {credentialType === "telegramBot" && telegramBotForm} */}
      {credentialType === "telegramUser" && telegramUserForm}
      {credentialType === "mastodon" && mastodonForm}
      {/*credentialType === "rss" && rssForm*/}
      {/*credentialType === "twitter" && twitterForm*/}
      {credentialType === "ioda" && iodaForm}
      {credentialType === "cloudflare" && cloudflareForm}
    </>
  );
};

export default CreateCredentialForm;
