import * as Yup from "yup";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useField } from "formik";

import { getCredentials } from "../../../api/credentials";
import { editSource, newSource } from "../../../api/sources";
import type { Source, SourceAccessMode } from "../../../api/sources/types";

import { Listbox } from "@headlessui/react";
import FormikDropdown from "../../../components/FormikDropdown";
import FormikInput from "../../../components/FormikInput";
import FormikWithSchema from "../../../components/FormikWithSchema";
import type { Credential } from "../../../api/credentials/types";

import {
  faChevronDown,
  faCheck,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CredentialOption, CREDENTIAL_OPTIONS, providerLabel } from "../../../api/common";

import { getTeams } from "../../../api/teams";
import type { Team } from "../../../api/teams/types";

interface IProps {
  source?: Source;
  onClose: () => void;
  // Pre-scope a brand-new source form to an API type (e.g. when opened from a
  // per-type section). Ignored when editing an existing source.
  defaultType?: CredentialOption;
}

// The "Feed name" is just a display label for the feed (the `nickname`
// field) — it does not affect what gets fetched. Spell that out so users don't
// confuse it with the account/handle, the connection, or the provider.
const SourceNameField = () => (
  <div className='flex flex-col gap-1'>
    <FormikInput
      name='nickname'
      label='Feed name'
      placeholder="A label for this feed, e.g. 'Elections — Mastodon #wildfire'"
    />
    <p className='text-xs text-slate-500 dark:text-gray-400'>
      A name to identify this feed in your lists; the items it collects appear as
      Reports. It's only a label — it doesn't change what gets fetched. Pick
      something recognizable, like the topic plus the account or hashtag.
    </p>
  </div>
);

// Credential picker: pick an existing credential of this type. Connections are
// configured ahead of time on the Connections page, so there's no inline "add
// connection" here — the feed form only chooses among what already exists.
const CredentialPickerField = ({
  label,
  credentialsList,
}: {
  label: string;
  credentialsList?: Credential[];
}) => {
  const [, meta, helpers] = useField<string>("credentials");

  const options =
    credentialsList?.map((cred) => ({ _id: cred._id, label: cred.name })) || [];

  // Convenience: when nothing is selected yet (new source) and credentials of
  // this type exist, default to the first one. Runs once options are available;
  // never overrides an explicit choice.
  const value = meta.value;
  useEffect(() => {
    if (!value && options.length) {
      helpers.setValue(options[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);

  return (
    <div className='flex flex-col gap-2'>
      <FormikDropdown
        list={
          options.length
            ? options
            : [{ _id: "", label: "No connections yet — add one in Connections" }]
        }
        label={label}
        name={"credentials"}
      />
    </div>
  );
};

// Chip input for tracking multiple hashtags at once, backed by the Formik
// `lists` field as a comma-separated string (the Mastodon channel splits it).
const MastodonHashtagField = () => {
  const [field, , helpers] = useField<string>("lists");
  const [draft, setDraft] = useState("");

  const parse = (raw: string) =>
    (raw || "")
      .split(/[\s,]+/)
      .map((tag) => tag.trim().replace(/^#+/, ""))
      .filter(Boolean);

  const tags = parse(field.value);

  const commit = (raw: string) => {
    const next = [...tags];
    parse(raw).forEach((tag) => {
      if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
        next.push(tag);
      }
    });
    helpers.setValue(next.join(", "));
    setDraft("");
  };

  const removeTag = (tag: string) => {
    helpers.setValue(tags.filter((existing) => existing !== tag).join(", "));
  };

  return (
    <div className='flex flex-col gap-1'>
      <span className='text-slate-600 dark:text-gray-400'>Hashtags</span>
      <div className='flex flex-wrap gap-2 items-center px-2 py-2 rounded border border-slate-300 bg-slate-50 dark:bg-gray-900'>
        {tags.map((tag) => (
          <span
            key={tag}
            className='inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-gray-600 px-2 py-1 text-sm font-medium'
          >
            #{tag}
            <button
              type='button'
              onClick={() => removeTag(tag)}
              className='text-slate-500 hover:text-slate-800 dark:hover:text-gray-200'
              aria-label={`Remove ${tag}`}
            >
              <FontAwesomeIcon icon={faXmark} size='xs' />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const value = e.target.value;
            if (/[\s,]$/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={tags.length ? "Add another…" : "Type a hashtag and press Enter"}
          className='flex-1 min-w-[8rem] bg-transparent focus:outline-none text-black dark:text-gray-300 px-1 py-1'
        />
      </div>
      <p className='text-xs text-slate-500 dark:text-gray-400'>
        Track one or more hashtags — press Enter or comma to add each. Posts matching
        any of the tags are collected, with duplicates removed.
      </p>
    </div>
  );
};

const MastodonConditionalFields = () => {
  const [, meta] = useField<string>("keywords");
  const mode = meta.value;

  return (
    <>
      {mode === "hashtag" && <MastodonHashtagField />}
      {mode === "keyword" && (
        <FormikInput
          name='lists'
          label='Keyword'
          placeholder='Required for keyword mode'
        />
      )}
      {mode === "public" && (
        <FormikDropdown
          list={[
            { _id: "local", label: "Local public timeline" },
            { _id: "public", label: "Federated public timeline" },
          ]}
          label={"Public Timeline Scope"}
          name={"regex"}
        />
      )}
    </>
  );
};

//helper for source access control
//may change the date gating and go back to public vs private with team backing

const getSourceAccessTeamIds = (source?: Source) => {
  return (source?.accessPolicy?.teams || []).map((team) => {
    if (typeof team === "string") return team;
    return team._id;
  });
};

const getSourceAccessInitialValues = (source?: Source) => ({
  accessPolicyMode: source?.accessPolicy?.mode || "public",
  accessPolicyTeams: getSourceAccessTeamIds(source),
  accessPolicyCutoffDate: source?.accessPolicy?.cutoffDate
    ? source.accessPolicy.cutoffDate.slice(0, 10)
    : "",
});

const SourceAccessPolicyFields = ({ teams }: { teams?: Team[] }) => {
  const [modeField] = useField<SourceAccessMode>("accessPolicyMode");
  const [teamsField, , teamsHelpers] = useField<string[]>("accessPolicyTeams");
  const [cutoffField] = useField<string>("accessPolicyCutoffDate");

  const selectedTeamIds = teamsField.value || [];
  const isRestricted =
    modeField.value === "restricted" || modeField.value === "public_until";

  const toggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      teamsHelpers.setValue(selectedTeamIds.filter((id) => id !== teamId));
      return;
    }

    teamsHelpers.setValue([...selectedTeamIds, teamId]);
  };

  return (
    <div className='mt-4 rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 p-3'>
      <h3 className='font-medium mb-1'>Access Policy</h3>
      <p className='text-xs text-slate-500 dark:text-gray-400 mb-3'>
        Controls whether this source is broadly visible or restricted to specific teams.
      </p>

      <FormikDropdown
        list={[
          { _id: "public", label: "Public" },
          { _id: "restricted", label: "Restricted to teams" },
          { _id: "public_until", label: "Public until cutoff date" },
        ]}
        label={"Access Mode"}
        name={"accessPolicyMode"}
      />

      {modeField.value === "public_until" && (
        <div className='flex flex-col gap-1 mb-3'>
          <label className='text-slate-600 dark:text-gray-400'>
            Cutoff Date
          </label>
          <input
            {...cutoffField}
            type='date'
            className='px-3 py-2 focus-theme bg-white dark:bg-gray-800 border border-slate-300 rounded'
          />
          <p className='text-xs text-slate-500 dark:text-gray-400'>
            Data before this date is treated as public. Data after this date is restricted to the selected teams.
          </p>
        </div>
      )}


      {isRestricted && (
        <div className='flex flex-col gap-2'>
          <label className='text-slate-600 dark:text-gray-400'>
            Allowed Teams
          </label>

          {teams && teams.length > 0 ? (
            teams.map((team) => (
              <label
                key={team._id}
                className='flex items-center gap-2 text-sm'
              >
                <input
                  type='checkbox'
                  checked={selectedTeamIds.includes(team._id)}
                  onChange={() => toggleTeam(team._id)}
                />
                <span>{team.name}</span>
              </label>
            ))
          ) : (
            <p className='text-xs text-slate-500 dark:text-gray-400'>
              No teams available yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const CreateEditSourceForm = ({ source, onClose, defaultType }: IProps) => {
  const [credentialType, setCredentialType] =
    useState<CredentialOption>(
      (source?.media as CredentialOption) || defaultType || "ioda"
    );

  // The provider is fixed whenever it's known upfront — editing an existing feed
  // or adding one from a provider-scoped section. Only a bare "new feed" form
  // (no source, no defaultType) lets the user pick the provider.
  const providerLocked = !!source || !!defaultType;

  const queryClient = useQueryClient();

  const { data: credentials } = useQuery(["credentials"], getCredentials, {
    staleTime: 50000,
  });

  const { data: teams } = useQuery(["teams"], getTeams, {
    staleTime: 50000,
  });

  const credentialsList =
    credentials && credentials.filter((cred) => cred.type === credentialType);

  const sourceAccessInitialValues = getSourceAccessInitialValues(source);

function onSubmit(data: any) {
  const {
    accessPolicyMode,
    accessPolicyTeams,
    accessPolicyCutoffDate,
    ...sourceData
  } = data;

  const accessPolicy = {
    mode: accessPolicyMode || "public",
    teams: accessPolicyMode === "public" ? [] : accessPolicyTeams || [],
    cutoffDate:
      accessPolicyMode === "public_until"
        ? accessPolicyCutoffDate || null
        : null,
  };

  const payload = {
    ...sourceData,
    media: credentialType,
    accessPolicy,
  };

  if (!source) {
    doCreateSource.mutate(payload);
    return;
  }

  doEditSource.mutate({ ...payload, _id: source._id });
}

  const doCreateSource = useMutation(newSource, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const doEditSource = useMutation(editSource, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["sources"]);
    },
  });
  const isLoading = doCreateSource.isLoading || doEditSource.isLoading;

  // junkpedia credential
  // could be cleaner but idk how to work the type inferencing with yup
  const JunkipediaSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    // sourceKeywords: Yup.string().required(
    //   "Keywords are required to create a Junkipedia source"
    // ),
    // lists: Yup.string().required(
    //   "Lists are required to create a Junkipedia source"
    // ),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
  });
  type IJunkipediaSchema = Yup.InferType<typeof JunkipediaSchema>;

  const JunkipediaForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "https://www.junkipedia.com/",
        ...sourceAccessInitialValues,
      }}
      schema={JunkipediaSchema}
      onSubmit={(values: IJunkipediaSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikInput name='lists' label='Lists' />

      <CredentialPickerField
        label='Connection'
        credentialsList={credentialsList}
      />
      <SourceAccessPolicyFields teams={teams} />
    </FormikWithSchema>
  );

  const telegramBotSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
  });
  type ITelegramBotSchema = Yup.InferType<typeof telegramBotSchema>;

  const telegramBotForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
        ...sourceAccessInitialValues,
      }}
      schema={telegramBotSchema}
      onSubmit={(values: ITelegramBotSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"Connection"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );

  const telegramUserSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
    lists: Yup.string().required(
      "At least one Telegram chat, channel, or user is required"
    ),
  });
  type ITelegramUserSchema = Yup.InferType<typeof telegramUserSchema>;

  const telegramUserForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
        ...sourceAccessInitialValues,
      }}
      schema={telegramUserSchema}
      onSubmit={(values: ITelegramUserSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <CredentialPickerField
        label='Connection'
        credentialsList={credentialsList}
      />
      <div className='flex flex-col gap-1'>
        <FormikInput
          name='lists'
          label='Chats / Channels / Users'
          placeholder='Comma-separated Telegram entities, e.g. @channel_one, -1001234567890'
        />
        <p className='text-xs text-slate-500 dark:text-gray-400'>
          Enter the Telegram entities this account can access, such as public usernames
          like @channel_one or private chat/channel IDs like -1001234567890. Separate
          multiple entries with commas.
        </p>
      </div>
      <SourceAccessPolicyFields teams={teams} />
    </FormikWithSchema>
  );


  const iodaSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    keywords: Yup.string().required("Country Code is required"),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
  });
  type IodaSchema = Yup.InferType<typeof iodaSchema>;
  const iodaForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
        ...sourceAccessInitialValues,
      }}
      schema={iodaSchema}
      onSubmit={(values: IodaSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikDropdown
        list={
          [{ _id: "IR", label: "IR" }]
        }
        label={"Two-Letter Country Code"}
        name={"keywords"}
      />
      <CredentialPickerField
        label='Connection'
        credentialsList={credentialsList}
      />
      <SourceAccessPolicyFields teams={teams} />
    </FormikWithSchema>
  );

  const cloudflareSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    keywords: Yup.string().required("Country Code is required"),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
  });
  type CloudflareSchema = Yup.InferType<typeof cloudflareSchema>;
  const cloudflareForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
        ...sourceAccessInitialValues,
      }}
      schema={cloudflareSchema}
      onSubmit={(values: CloudflareSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikDropdown
        list={
          [{ _id: "IR", label: "IR" }]
        }
        label={"Two-Letter Country Code"}
        name={"keywords"}
      />
      <CredentialPickerField
        label='Connection'
        credentialsList={credentialsList}
      />
      <SourceAccessPolicyFields teams={teams} />
    </FormikWithSchema>
  );

  const mastodonSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
    keywords: Yup.string()
      .oneOf(["public", "home", "hashtag", "keyword"])
      .required("A Mastodon mode is required"),
    lists: Yup.string().when("keywords", {
      is: (value: string) => value === "hashtag" || value === "keyword",
      then: (schema) =>
        schema.required("A hashtag or keyword value is required"),
      otherwise: (schema) => schema.optional(),
    }),
    regex: Yup.string().when("keywords", {
      is: "public",
      then: (schema) =>
        schema
          .oneOf(["local", "public"])
          .required("A public timeline scope is required"),
      otherwise: (schema) => schema.optional(),
    }),
  });
  type IMastodonSchema = Yup.InferType<typeof mastodonSchema>;

  const mastodonForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex:
          source?.media === "mastodon"
            ? source?.regex || "local"
            : "local",
        keywords:
          source?.media === "mastodon"
            ? source?.keywords || "public"
            : "public",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
        ...sourceAccessInitialValues,
      }}
      schema={mastodonSchema}
      onSubmit={(values: IMastodonSchema) => {
        const payload = {
          ...values,
          lists:
            values.keywords === "hashtag" || values.keywords === "keyword"
              ? values.lists
              : "",
          regex: values.keywords === "public" ? values.regex : "",
        };
        onSubmit(payload);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikDropdown
        list={
          [
            { _id: "public", label: "Public timeline" },
            { _id: "home", label: "Home timeline" },
            { _id: "hashtag", label: "Hashtag" },
            { _id: "keyword", label: "Keyword search" },
          ]
        }
        label={"Mastodon Mode"}
        name={"keywords"}
      />
      <MastodonConditionalFields />
      <CredentialPickerField
        label='Connection'
        credentialsList={credentialsList}
      />
      <SourceAccessPolicyFields teams={teams} />
    </FormikWithSchema>
  );


  /*const RssSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    // sourceKeywords: Yup.string().required(
    //   "Keywords are required to create a Junkipedia source"
    // ),
    lists: Yup.string().required(
      "Lists are required to create a Junkipedia source"
    ),
  });
  type IRssSchema = Yup.InferType<typeof RssSchema>;


  const RSSForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "",
      }}
      schema={RssSchema}
      onSubmit={(values: IRssSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <SourceNameField />
      <FormikInput name='lists' label='Lists' />
      <FormikInput name='regex' label='regex' />
      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"Connection"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );

  const twitterSchema = Yup.object().shape({
    nickname: Yup.string().required("Feed name is required"),
    // regex: Yup.string().required(
    //   "Query is required to create a Twitter source"
    // ),
    credentials: Yup.string().required(
      "A connection is required to create a feed"
    ),
  });
  type ITwitterSchema = Yup.InferType<typeof twitterSchema>;

  const TwitterForm = (
    <FormikWithSchema
      initialValues={{
        nickname: source?.nickname || "",
        media: source?.media || "",
        regex: source?.regex || "",
        keywords: source?.keywords || "",
        lists: source?.lists || "",
        tags: source?.tags || "",
        credentials: source?.credentials._id || "",
        sourceURL: source?.url || "",
        url: "https://www.x.com/",
      }}
      schema={twitterSchema}
      onSubmit={(values: ITwitterSchema) => {
        onSubmit(values);
      }}
      loading={isLoading}
      onClose={onClose}
    >
      <FormikInput name='nickname' label='Feed name' />

      <FormikInput name='regex' label='regex' />
      { /*<FormikInput name='lists' label='Lists' /> }

      <FormikDropdown
        list={
          credentialsList?.map((i) => {
            return { _id: i._id, label: i.name };
          }) || [{ _id: "", label: "loading" }]
        }
        label={"Connection"}
        name={"credentials"}
      />
    </FormikWithSchema>
  );*/

  return (
    <>
      {!providerLocked && (
        <>
          <label className='text-slate-600 dark:text-gray-400'>Provider</label>
          <Listbox
            value={credentialType}
            onChange={setCredentialType}
            as='div'
            className='relative z-20 font-medium mb-3'
          >
            <Listbox.Button className='px-3 py-2 focus-theme flex justify-between items-center bg-slate-50 dark:bg-gray-900 border border-slate-300 w-full hover:bg-slate-100 dark:hover:bg-gray-700 text-left ui-active:bg-slate-200 dark:ui-active:bg-gray-600  rounded'>
              {credentialType ? providerLabel(credentialType) : "Select provider"}
              <FontAwesomeIcon
                icon={faChevronDown}
                className='ui-active:rotate-180 text-slate-400 dark:text-gray-400'
              />
            </Listbox.Button>
            <Listbox.Options className='absolute left-0 right-0 z-30 mt-1 rounded border border-slate-300 bg-white shadow-md dark:bg-gray-800'>
              {[...CREDENTIAL_OPTIONS].map((item) => (
                <Listbox.Option
                  key={item}
                  value={item}
                  className='flex justify-between px-3 py-2 hover:bg-slate-100 dark:hover:bg-gray-700 ui-selected:bg-slate-100 dark:ui-selected:bg-gray-700 cursor-pointer items-center'
                >
                  {providerLabel(item)}

                  <FontAwesomeIcon
                    icon={faCheck}
                    className={`text-slate-400 dark:text-gray-400${
                      item === credentialType ? "" : "hidden"
                    }`}
                  />
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Listbox>
        </>
      )}
      {credentialType === "junkipedia" && JunkipediaForm}
      {/* {credentialType === "telegramBot" && telegramBotForm} */}
      {credentialType === "telegramUser" && telegramUserForm}
      {credentialType === "mastodon" && mastodonForm}
      {/*credentialType === "rss" && RSSForm*/}
      {/*credentialType === "twitter" && TwitterForm*/}
      {credentialType === "ioda" && iodaForm}
      {credentialType === "cloudflare" && cloudflareForm}
    </>
  );
};

export default CreateEditSourceForm;
