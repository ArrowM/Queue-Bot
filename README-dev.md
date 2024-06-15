<!-- TOC -->
  * [Running Locally](#running-locally)
    * [Option 1: Install and run with Docker (recommended)](#option-1-install-and-run-with-docker-recommended)
    * [Option 2: Manually install and run](#option-2-manually-install-and-run)
  * [How to create and edit commands](#how-to-create-and-edit-commands)
    * [Adding commands](#adding-commands)
    * [Adding command options](#adding-command-options)
    * [Adding buttons](#adding-buttons)
    * [Util files](#util-files)
    * [Database changes](#database-changes)
  * [Misc](#misc)
<!-- TOC -->

## Running Locally

Clone the repository:

```bash
git clone https://github.com/ArrowM/Queue-Bot
```

Create or reuse a Discord bot application and invite it to your server.
See [Discord.js guide](https://discordjs.guide/preparations/setting-up-a-bot-application.html).

Update the `.env` file with your bot's TOKEN and CLIENT_ID.

### Option 1: Install and run with Docker (recommended)

```bash
npm run dock
```

This will build the Docker image and run the bot in a container. The bot will automatically restart if it crashes.

### Option 2: Manually install and run

[Install Node.js](https://nodejs.org/en/download/package-manager).

Run the setup script (**run each time you update the project**):

```bash
npm run setup
```

Run the bot:

```bash
npm start
```

## How to create and edit commands

Please reference the other files as examples, they follow very similar structures. These instructions are more geared towards pointing you
to the files that will need to be added/updated.

### Adding commands

1. Add a new `.command.ts` file to the `src/commands/commands` directory. Commands should extend `EveryoneCommand` or `AdminCommand`.
2. Add the new command class to the `src/commands.command.loader.ts` file.
3. Update the `README.md` file and the help commands in the `src/commands/help.command.ts` file.

### Adding command options

1. Add a new `.option.ts` file to the `src/options/options` directory. Options should extend one of the base options at the bottom of
   the `src/options/base-options.ts` file.
2. Update the `src/options/options.loader.ts` file.

### Adding buttons

1. Create a new `.button.ts` file in the `src/buttons/buttons` directory. Buttons should extend `EveryoneButton` or `AdminButton`.
2. update the `src/buttons/buttons.loader.ts` file.

### Util files

If the code for your new command is complex or re-usable, consider placing your logic a utility file in the `src/utils` directory.

### Database changes

If you need to add or modify database tables or columns:

1. Update the `src/db/schema.ts` file.
2. If you add a new table, or need new querying methods, update the `src/db/store.ts` file and the `src/db/queries.ts` file.
3. Run `drizzle-kit generate` in the terminal. The drizzle command will generate the necessary SQL migration files for you, which will then
   be applied with `drizzle-kit push`.

## Misc

Please lint before pushing:
```bash
npm run lint
```

This project is designed to run without compiling thanks to `@swc-node/register/esm`.