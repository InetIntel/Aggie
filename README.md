![Aggie](public/angular/images/logo-green.png)

## Introduction

Aggie is a web application for using social media and other resources to track groups around real-time events such as elections or natural disasters.

Aggie can retrieve data from several sources such as Twitter, Facebook, Tiktok, Instagram, Truthsocial, and RSS

Items (called _reports_) from all sources are streamed into the application. Monitors can quickly triage incoming reports by marking them as _relevant_ or _irrelevant_.

Relevant reports can be grouped into _groups_ for further monitoring and follow-up.

Reports are fully searchable and filterable via a fast web interface.

Users can be assigned to _admin_, _manager_, _monitor_, and _viewer_ roles, each with appropriate permissions.

Aggie is built using React and Express.js, commonly used and popular web frameworks.

Contact mikeb@cc.gatech.edu for more information on the Aggie project.

## Table of Contents

- [Using the Application](#using-the-application)
- [Source Installation](#source-installation)
- [Development](#Development)

- [Project Configuration](#project-configuration)
- [Architecture](#architecture)

## Using the Application

Extensive documentation about using the application can be found in [ReadTheDocs page](http://aggie.readthedocs.io/en/stable/).

## Source Installation

### Software Requirements

1. **node.js** (v22 LTS)
   1. Use [Fast Node Manager](https://github.com/Schniz/fnm).
      - fast node manager (FNM) allows multiple versions of node.js to be used on your system and manages the versions within each project.
      - this is the 2025 recommended node manager
      - After installing fnm:
        1. Navigate to the aggie project directory: `cd aggie`.
        1. Run `fnm install` to install the version specified in `.nvmrc`.
        1. then `fnm use` to switch to that version.
1. **Mongo DB** (requires >= 7.0.0)
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

### Social Media and Feeds

#### 2024 update:

> **changes to many social media APIs means we need new ways of obtaining data from these sites. crowdtangle is being sunset. work in progress.**

### Junkipedia

currently the only supported importer besides RSS.
[website](https://www.junkipedia.org)

### Fetching

1. Set `fetching` value to enable/disable fetching for all sources at global level.

- This is also changed during runtime based on user choice.

### Logging

TBD

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

TBD
