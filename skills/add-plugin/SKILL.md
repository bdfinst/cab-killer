---
name: add-plugin
description: >-
  Install a Claude Code plugin and register it in plugins.json so the
  full team can replicate the install. Use this whenever adding a new
  plugin to the project — it keeps plugins.json in sync with what is
  actually installed.
argument-hint: >-
  <name@marketplace> [--repo <owner/repo>]
user-invocable: true
allowed-tools: Read, Edit, Bash
---

# Add Plugin

Role: implementation. This skill installs a Claude Code plugin and
adds it to `plugins.json` so `./install.sh` stays the source of truth
for the project's plugin set.

You have been invoked with the `/add-plugin` skill.

## Implementation constraints

1. **Always update plugins.json.** Installing without registering
   defeats the purpose — the whole point is reproducibility.
2. **Derive marketplace from the identifier.** The `name@marketplace`
   format encodes both; never ask the user to repeat information
   already in the argument.
3. **Do not duplicate entries.** Check plugins.json before adding;
   if the plugin is already registered, report it and stop.

## Parse Arguments

Arguments: $ARGUMENTS

Required: plugin identifier (`$0`) in `name@marketplace` format —
e.g. `cab-killer@cab-killer` or `skill-creator@claude-plugins-official`.

Optional:

- `--repo <owner/repo>`: GitHub repository to register as the
  marketplace source before installing (e.g. `bdfinst/cab-killer`).
  Required for plugins not on an official marketplace.

## Steps

### 1. Parse arguments

Extract:
- `NAME` — the part before `@` in `$0`
- `MARKETPLACE` — the part after `@` in `$0`
- `REPO` — value of `--repo`, or empty string if not provided

### 2. Check for existing registration

Read `plugins.json`. If `.plugins[]` already contains an entry with
`"name": "<NAME>"`, report:

```
<NAME> is already registered in plugins.json. Nothing to do.
```

and stop.

### 3. Register marketplace (if --repo provided)

If `REPO` is non-empty, run:

```bash
claude plugin marketplace add <REPO>
```

If this fails, report the error and stop — do not proceed to install.

### 4. Install the plugin

Run:

```bash
claude plugin install <NAME>@<MARKETPLACE>
```

If this fails, report the error and stop — do not update plugins.json
for a plugin that did not install successfully.

### 5. Add to plugins.json

Append a new entry to the `plugins` array in `plugins.json`:

- If `REPO` is non-empty:
  ```json
  {
    "repo": "<REPO>",
    "marketplace": "<MARKETPLACE>",
    "name": "<NAME>",
    "required": true
  }
  ```
- If `REPO` is empty (official marketplace):
  ```json
  {
    "marketplace": "<MARKETPLACE>",
    "name": "<NAME>",
    "required": true
  }
  ```

### 6. Report

```
Installed:  <NAME>@<MARKETPLACE>
Repo:       <REPO or "official marketplace">
plugins.json: updated
```
