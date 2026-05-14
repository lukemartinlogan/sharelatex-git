<h1 align="center">
  <br>
  <a href="https://www.overleaf.com"><img src="doc/logo.png" alt="Overleaf" width="300"></a>
</h1>

<h4 align="center">An open-source online real-time collaborative LaTeX editor.</h4>

<p align="center">
  <a href="https://github.com/overleaf/overleaf/wiki">Wiki</a> •
  <a href="https://www.overleaf.com/for/enterprises">Server Pro</a> •
  <a href="#contributing">Contributing</a> •
  <a href="https://mailchi.mp/overleaf.com/community-edition-and-server-pro">Mailing List</a> •
  <a href="#authors">Authors</a> •
  <a href="#license">License</a>
</p>

<img src="doc/screenshot.png" alt="A screenshot of a project being edited in Overleaf Community Edition">
<p align="center">
  Figure 1: A screenshot of a project being edited in Overleaf Community Edition.
</p>

## Community Edition

[Overleaf](https://www.overleaf.com) is an open-source online real-time collaborative LaTeX editor. We run a hosted version at [www.overleaf.com](https://www.overleaf.com), but you can also run your own local version, and contribute to the development of Overleaf.

> [!CAUTION]
> Overleaf Community Edition is intended for use in environments where **all** users are trusted. Community Edition is **not** appropriate for scenarios where isolation of users is required due to Sandbox Compiles not being available. When not using Sandboxed Compiles, users have full read and write access to the `sharelatex` container resources (filesystem, network, environment variables) when running LaTeX compiles.

For more information on Sandbox Compiles check out our [documentation](https://docs.overleaf.com/on-premises/configuration/overleaf-toolkit/server-pro-only-configuration/sandboxed-compiles).

## Enterprise

If you want help installing and maintaining Overleaf in your lab or workplace, we offer an officially supported version called [Overleaf Server Pro](https://www.overleaf.com/for/enterprises). It also includes more features for security (SSO with LDAP or SAML), administration and collaboration (e.g. tracked changes). [Find out more!](https://www.overleaf.com/for/enterprises)

## Keeping up to date

Sign up to the [mailing list](https://mailchi.mp/overleaf.com/community-edition-and-server-pro) to get updates on Overleaf releases and development.

## Installation

We have detailed installation instructions in the [Overleaf Toolkit](https://github.com/overleaf/toolkit/).

## Upgrading

If you are upgrading from a previous version of Overleaf, please see the [Release Notes section on the Wiki](https://github.com/overleaf/overleaf/wiki#release-notes) for all of the versions between your current version and the version you are upgrading to.

## Overleaf Docker Image

This repo contains two dockerfiles, [`Dockerfile-base`](server-ce/Dockerfile-base), which builds the
`sharelatex/sharelatex-base` image, and [`Dockerfile`](server-ce/Dockerfile) which builds the
`sharelatex/sharelatex` (or "community") image.

The Base image generally contains the basic dependencies like `wget`, plus `texlive`.
We split this out because it's a pretty heavy set of
dependencies, and it's nice to not have to rebuild all of that every time.

The `sharelatex/sharelatex` image extends the base image and adds the actual Overleaf code
and services.

Use `make build-base` and `make build-community` from `server-ce/` to build these images.

We use the [Phusion base-image](https://github.com/phusion/baseimage-docker)
(which is extended by our `base` image) to provide us with a VM-like container
in which to run the Overleaf services. Baseimage uses the `runit` service
manager to manage services, and we add our init-scripts from the `server-ce/runit`
folder.

## Git Integration (Fork)

This fork adds a Git integration layer on top of Overleaf Community Edition, allowing you to commit, push, and pull your Overleaf project to/from any Git remote (e.g. GitHub).

### How it works

Each Overleaf project gets its own local Git repository stored on the host at `GIT_REPOS_PATH/<project-id>/`. When you click a Git button, the backend:

1. **Commit** — Exports all project docs and binary files from Overleaf into the local repo, stages everything with `git add -A`, and creates a commit.
2. **Push** — Runs `git push origin HEAD` using your stored SSH key, streaming output back to the UI.
3. **Pull & Merge** — Fetches from origin, merges using `--allow-unrelated-histories`, then syncs all changed files back into Overleaf in real time via socket events (open editors refresh without a page reload).

### UI

Three buttons appear in the toolbar (top bar):

- **Commit** (save icon) — Snapshot the current project state into the local Git repo.
- **Push** (upload icon) — Push the local commits to the configured remote.
- **Pull** (download icon) — Fetch and merge from remote, then sync changes into Overleaf.

A **Git** tab in the left rail lets you configure the remote URL (e.g. `git@github.com:you/repo.git`).

### Setup

#### 1. Configure host directory

Set `GIT_REPOS_PATH` in your `.env` to a directory writable by the container (`chmod 777` it, since Node runs as `www-data` uid 33):

```bash
echo "GIT_REPOS_PATH=/path/to/git-repos" >> .env
chmod 777 /path/to/git-repos
```

#### 2. Upload your SSH private key

In Overleaf, go to **Account Settings → Git SSH Key** and paste your private key (the one whose public key is registered with GitHub/GitLab). The key is stored at `GIT_REPOS_PATH/.ssh/<user-id>/id_rsa` with mode 600.

To verify the key authenticates correctly:

```bash
docker exec sharelatex bash -c \
  'ssh -i /git-repos/.ssh/<user-id>/id_rsa \
       -o StrictHostKeyChecking=no \
       -o UserKnownHostsFile=/dev/null \
       git@github.com 2>&1'
# Should print: Hi <your-username>! You've successfully authenticated...
```

#### 3. Set the remote URL

Open your project, click the **Git** tab in the left rail, and enter the remote URL (e.g. `git@github.com:you/repo.git`). Click **Save**.

#### 4. Commit, push, pull

Use the three toolbar buttons. A floating output panel shows the result of each operation and auto-dismisses after 15 seconds.

### Building the custom image

The Docker image is built from `home-server/overleaf-/docker-compose.yml`. The frontend must be compiled locally first:

```bash
cd services/web
node scripts/patch-git-frontend.mjs .
npm run webpack:production
cp -r public/ public-built/
```

Then build and start:

```bash
cd home-server/overleaf-
docker compose build --no-cache sharelatex
docker compose up -d
```

### Architecture notes

- **Backend**: `services/web/app/src/Features/Git/` — `GitManager.mjs` (core operations), `GitRouter.mjs` (HTTP routes), `GitSshManager.mjs` (SSH key storage), `GitController.mjs` (request handlers).
- **Frontend**: `services/web/frontend/js/features/git/` — toolbar buttons, rail panel, settings section. Patched into the stock image's `ide-redesign` tree by `scripts/patch-git-frontend.mjs` at build time.
- Real-time updates after pull use `EditorController.upsertDocWithPath` / `upsertFileWithPath`, which emit socket events so open editors refresh without a page reload.
- Binary files (images, PDFs) are detected by scanning the first 8 KB for null bytes.

## Contributing

Please see the [CONTRIBUTING](CONTRIBUTING.md) file for information on contributing to the development of Overleaf.

## Authors

[The Overleaf Team](https://www.overleaf.com/about)

## License

The code in this repository is released under the GNU AFFERO GENERAL PUBLIC LICENSE, version 3. A copy can be found in the [`LICENSE`](LICENSE) file.

Copyright (c) Overleaf, 2014-2025.
