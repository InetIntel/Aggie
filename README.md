![Aggie](public/angular/images/logo-green.png)

## Introduction

Aggie is a web application for using social media and other resources to track groups around real-time events such as elections or natural disasters.

Aggie can retrieve data from several sources:

- [Twitter](https://search.twitter.com) (tweets matching a keyword search)
- [Telegram](https://telegram.org)
- [Crowdtangle](https://www.crowdtangle.com/) (Facebook, Instagram, and Reddit posts from publicly accessible groups and pages)
- [RSS](http://en.wikipedia.org/wiki/RSS) (article titles and descriptions)
- [ELMO](http://getelmo.org) (answers to survey questions)

Items (called _reports_) from all sources are streamed into the application. Monitors can quickly triage incoming reports by marking them as _relevant_ or _irrelevant_.

Relevant reports can be grouped into _groups_ for further monitoring and follow-up.

Reports are fully searchable and filterable via a fast web interface.

Users can be assigned to _admin_, _manager_, _monitor_, and _viewer_ roles, each with appropriate permissions.

Aggie is built using React and Express.js, commonly used and popular web frameworks.

Contact mikeb@cc.gatech.edu for more information on the Aggie project.

[Sassafras Tech Collective](http://sassafras.coop) offers managed instances of Aggie, along with development and support services.

## Table of Contents

- [Using the Application](#using-the-application)
- [Source Installation](#source-installation)
- [Development](#Development)

- [Maintenance](#maintenance)
- [Project Configuration](#project-configuration)
- [Architecture](#architecture)
- [Building and Publishing Aggie's documentation](#building-and-publishing-aggies-documentation)

## Using the Application

Extensive documentation about using the application can be found in [ReadTheDocs page](http://aggie.readthedocs.io/en/stable/).

## Source Installation

### Software Requirements

1. **node.js** (v18.20 LTS)
   1. Use [Node Version Manager](https://github.com/nvm-sh/nvm).
      - Node Version Manager (nvm) allows multiple versions of node.js to be used on your system and manages the versions within each project.
      - on windows, you can either use `nvm-windows` and `nvs`
      - After installing nvm:
        1. Navigate to the aggie project directory: `cd aggie`.
        1. Run `nvm install` to install the version specified in `.nvmrc`.
        1. then `nvm use` to switch to that version.
1. **Mongo DB** (requires >= 4.2.0)
   1. Follow the [installation instructions](https://docs.mongodb.com/v4.2/installation/#mongodb-community-edition-installation-tutorials) for your operating system.
   1. You can connect to the live database, ask a maintainer for a copy of the db access token. you will need mongoCompass installed.
   1. if you are running a copy of the dabase locally:
      1. Make sure MongoDB is running:
         - On Linux run `sudo systemtl status mongod` to see whether the `mongod` daemon started MongoDB successfully. If there are any errors, you can check out the logs in `/var/log/mongodb` to see them.
      1. Note: You do not need to create a user or database for aggie in Mongo DB. These will be generated during the installation process below.

### Installation

1. Clone the [aggie repo](https://github.com/TID-Lab/aggie).
   - you can use github-desktop, or clone using git.
   - In your terminal, navigate to your main projects folder (e.g. Documents).
   - Use this command: `git clone https://github.com/TID-Lab/aggie.git`.
   - `cd aggie`

1. Copy `.env.example` to `.env `.

   - ask current developers for a copy of the .env
   - the `DATABASE_URL` key should be the current mongo database, ask developers for a copy of this key

1. **(optional, rarely needed)** You might have issues with HTTPS. if so, copy your SSL certificate information to the `config` folder (two files named `key.pem` and `cert.pem`).

   - If you do not have the certificate you can create a new self-signed certificate with the following command:
     `openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365`
   - This will allow you to start the server but it will generate unsafe warnings in the browser. You will need a real trusted certificate for production use.
   - Adding the `-nodes` flag will generate an unencrypted private key, allowing you to run tests without passphrase prompt

1. Run `npm install` from the project directory.
   - This installs all dependencies.

## Development

1. Use `npm run dev` for development.
   - you can run frontend and backend in separate shells with `npm run dev:frontend` and `npm run dev:backend`
1. Navigate to `https://localhost:8000` in your browser.
   - This will show you the running site. Login with the user name and password, which you can obtain from the current devs

### Production

1. build react app with `npm run build`
1. run `npm start`
   - remember to have your `ENVIRONMENT=production` in the `.env` file.

### Pull Requests

When collaborating with multiple developers, we adopt a feature-branch workflow. If you are unfamiliar, [read this article](https://www.split.io/blog/understanding-the-feature-branching-strategy-in-git/).

the `develop` branch is our main/staging branch. production will be built from this branch. try not to push directly to this branch.

when writing PRs, include high-level changes and notable/interesting engineering challenges. However, you don't need to be particularly granular.

PR's should be reviewed by another developer, ideally the developer lead or the developer with domain knowledge of the feature before merging.

#### PR merge conflicts

resolve conflicts with the main `develop` branch by merging the latest into the current branch. for example, if you are working on a PR `example-feature-branch` then:

1. `checkout develop`
1. `git fetch --all`
1. `git pull `
1. `checkout example-feature-branch`
1. `git merge develop`
1. resolve any merge conflicts then push to branch

## Maintenance

TODO: create proper maintenance

### Tests

TODO: tests are broken at the moment. this is a work in progress

### Social Media and Feeds

#### 2424 update:

changes to many social media APIs means we need new ways of obtaining data from these sites. crowdtangle is being sunset. work in progress.

#### Twitter

1. <del>Follow [these instructions](https://developer.twitter.com/en/docs/basics/authentication/oauth-1-0a/obtaining-user-access-tokens) to generate tokens to use the Twitter API.
1. <del>Go to Settings > Configuration and edit the Twitter settings. Remember to toggle the switch on, once you have saved the settings.


#### WhatsApp

The WhatsApp feature is documented in a [conference paper](http://idl.iscram.org/files/andresmoreno/2017/1498_AndresMoreno_etal2017.pdf). As WhatsApp does not currently offer an API, a Firefox extension in Linux is used to redirect notifications from [web.whatsapp.com](http://web.whatsapp.com) to Aggie server. Thus, you need a Linux computer accessing WhatsApp through Firefox for this to work. Follow these steps to have it working.

1. Install Firefox in Linux using your distribution preferred method.
1. Install [GNotifier](https://addons.mozilla.org/firefox/addon/gnotifier/) add-on in Firefox.
1. Configure the add-on [about:addons](about:addons):
   - Set Notification Engine to Custom command
   - Set the custom command to `curl --data-urlencode "keyword=<your own keyword>" --data-urlencode "from=%title" --data-urlencode "text=%text" http://<IP address|domain name>:2222/whatsapp`
     - We suggest setting your `keyword` to a unique string of text with out spaces or symbols, e.g., the phone number of the WhatsApp account used for Aggie. This keyword must be the same one as the one specified in the Aggie application, when creating the WhatsApp Aggie source.
     - Replace `IP address|domain` with the address or domain where Aggie is installed (e.g., `localhost` for testing).
1. Visit [web.whatsapp.com](http://web.whatsapp.com), follow instructions, and _enable browser notifications_
1. Notifications will not be sent to Aggie when browser focus is on the WhatsApp tab, so move away from that tab if not replying to anyone.

#### ELMO

1. Log in to your ELMO instance with an account having coordinator or higher privileges on the mission you want to track.
1. In your ELMO instance, mark one or more forms as public (via the Edit Form page). Note the Form ID in the URL bar (e.g. if URL ends in `/m/mymission/forms/123`, the ID is `123`).
1. Visit your profile page (click the icon bearing your username in the top-right corner) and copy your API key (click 'Regenerate' if necessary).
1. Go to Settings > Configuration and edit the ELMO settings. Remember to toggle the switch on, once you have saved the settings.

### Google Places

Aggie uses Google Places for guessing locations in the application. To make it work:

1. You will need to get an API key from [Google API console](https://console.developers.google.com/) for [Google Places API](https://developers.google.com/places/documentation/).
1. Read about [Google API usage](https://developers.google.com/places/web-service/usage) limits and consider [whitelisting](https://support.google.com/googleapi/answer/6310037) your Aggie deployment to avoid surprises.
1. Go to Settings > Configuration and edit the Google Places settings and add the key.

### Emails

The current build does not have email support

<del>Email service is required to create new users.

1. <del>`fromEmail` is the email address from which system emails come. Also used for the default admin user.
1. <del>`email.from` is the address from which application emails will come
1. <del>`email.transport` is the set of parameters that will be passed to [NodeMailer](http://www.nodemailer.com). Valid transport method values are: 'SES', 'sendgrid' and 'SMTP'.
1. <del>If you are using SES for sending emails, make sure `config.fromEmail` has been authorized in your Amazon SES configuration.

</del>

### Fetching

1. Set `fetching` value to enable/disable fetching for all sources at global level.

- This is also changed during runtime based on user choice.

### <del>Remote access

<del>See the first part of the Tableau docs in [BI Connector setup](docs/content/tableau/bi-connector-setup.md).

## Architecture

Aggie consists of two largely separate frontend and backend apps. Some model code (in `/shared`) is shared between them.

### Backend

The backend is a Node.js/Express app responsible for fetching and analyzing data and servicing API requests. There are three main modules, each of which runs in its own process:

- API module
- Fetching module

See README files in the `lib` subdirectories for more info on each module.

The model layer (in `/models`) is shared among all three modules.

### Frontend

See detailed Frontend at [FRONTEND.md](FRONTEND.md)

The frontend is a SPA react app that runs in the browser and interfaces with the API, via both pull (REST) and push (WebSockets) modalities. It source files contained in `/src` and `/public`. when built, files are served from `/build`

## Building and Publishing Aggie's documentation

would be nice to have modern docs, but we dont at the moment

<del>
The documentation is in the `docs` directory. These are automatically built and
pushed on each commit for the `master` and `develop` branches in Github:

- `develop`: [http://aggie.readthedocs.io/en/latest](http://aggie.readthedocs.io/en/latest/)

To build the docs locally, do the following:

1. Install [Python](https://www.python.org/downloads/) and [pip](https://pip.pypa.io/en/stable/installing/)
1. Install [Sphinx](http://www.sphinx-doc.org/) with `pip install -U Sphinx`
1. Install `recommonmark`: `pip install recommonmark`
1. Install Read The Docs theme: `pip install sphinx_rtd_theme`
1. From the `docs` directory in Aggie, run `make html`
1. The compiled documentation has its root at `docs/_build/html/index.html`
