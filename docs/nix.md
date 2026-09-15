# Managing the Nix Flake

This repo is packaged as a Nix flake (`flake.nix` / `flake.lock`). This doc covers the
flake's structure and the day-to-day tasks for maintaining it. For install instructions
as an end user, see the [README's Nix section](../README.md#nix).

## Outputs

- `packages.<system>.{breezy-gnome,breezy-kde,breezy-ui,breezy-vulkan}` — the individual
  components, built from `.nix/packages/<name>/default.nix`.
- `packages.<system>.breezy-desktop` — a `symlinkJoin` of all of the above, plus the
  `xrlinuxdriver` package pulled in from the `xrlinuxdriver` input.
- `packages.<system>.xrlinuxdriver` / `packages.<system>.default` — passthroughs.
- `devShells.<system>.default` — a shell with all packages' build inputs available.
- `overlays.default` — exposes every package above onto `pkgs`.

Supported systems: `x86_64-linux`, `aarch64-linux`.

## Inputs

- `nixpkgs` — tracks `nixos-unstable`, via the `github:` shorthand.
- `flake-compat` — lets `default.nix`/`shell.nix` work for non-flake Nix users; also via
  `github:`.
- `xrlinuxdriver` — the sibling [XRLinuxDriver](https://github.com/wheaney/XRLinuxDriver)
  flake, sourced from `git+https://github.com/wheaney/XRLinuxDriver` **with
  `submodules = true`**.

### Why `xrlinuxdriver` can't use `github:`

The `github:` flake-ref type fetches a tarball via the GitHub API, which never includes
submodule content and accepts no `submodules` parameter (this is a known upstream
limitation — see [NixOS/nix#11275](https://github.com/NixOS/nix/issues/11275)). Since
XRLinuxDriver has its own submodules that need to come along, its input must use the
`git`/`git+https` fetcher instead, with `submodules = true` set explicitly.

### `self.submodules`

Both this repo and XRLinuxDriver set `self.submodules = true;` in their own `flake.nix`.
This tells Nix to fetch the *local* repo (as `self`) via git with submodules recursed,
which is required here since breezy-desktop vendors `vkBasalt`, `XRLinuxDriver`,
`sombrero`, and `PyXRLinuxDriverIPC` as submodules.

## Common tasks

Build a package:

```bash
nix build .#breezy-desktop
```

Validate the flake (evaluates all outputs, runs checks):

```bash
nix flake check
```

Enter a dev shell:

```bash
nix develop
```

Update just the `xrlinuxdriver` input:

```bash
nix flake lock --update-input xrlinuxdriver
```

Update everything else (leaving `xrlinuxdriver` pinned):

```bash
nix flake lock --update-input nixpkgs --update-input flake-compat
```

Avoid a plain `nix flake update` here — it would also bump `xrlinuxdriver`, which is
meant to be updated on its own schedule (see below).

Add a new package: drop a `default.nix` under `.nix/packages/<name>/`, `callPackage` it
in the `packages` attrset in `flake.nix`, and add it to the `breezy-desktop` join and to
the `nix-ci.yml` build matrix.

## CI

- `.github/workflows/nix-ci.yml` — on every push/PR: builds each package and runs
  `nix flake check`.
- `.github/workflows/nix-update-xrlinuxdriver-input.yml` — daily at 00:00 UTC, updates
  only the `xrlinuxdriver` input and pushes the resulting `flake.lock` straight to
  `main` if it changed.
- `.github/workflows/nix-update-inputs.yml` — Sundays at 00:00 UTC, updates the
  remaining inputs (`nixpkgs`, `flake-compat`) the same way.

Both update workflows push directly to `main` rather than opening a PR, so keep an eye
on them if branch protection rules change.
