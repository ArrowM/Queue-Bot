# Queue-Bot

[![Discord Bots](https://top.gg/api/widget/status/679018301543677959.svg?noavatar=true)](https://top.gg/bot/679018301543677959)
[![BuyMeACoffee](https://img.shields.io/badge/BuyMeACoffee-Donate-ff9004.svg?logo=CoffeeScript&style=flat-square)](https://www.buymeacoffee.com/Arroww)
[![Discord Chat](https://img.shields.io/discord/678645128755150863?label=Discord&style=flat-square)](https://discord.gg/RbmfnP3)

Created to manage voice channel waiting rooms. This bot allows you to display the order of people waiting and easily pull them to another channel.  

## How to use
*Privileged users* are the server owner, administrators, and users with any of the following roles: `mod`, `moderator`, `admin`, `administrator`.  
1. **Create a Queue.**  
	`!queue {channel name}` creates a queue. Only *privileged users* can create queues. `{channel name}` must be the name of an existing text or voice channel.  
2. **Join a Queue.**  
	**TEXT**: `!join {channel name} {OPTIONAL: custom message}` or clicking the queue reaction will add a person to a queue.  
	**VOICE**: Joining the matching voice channel will add you to a voice queue.  
3. **Pull Users From a Queue.**  
	**TEXT**: `!next {queue name} {amount}` can be used by *privileged users* to get the next people out of the queue.  
   **VOICE**: `!start {queue name}` makes the bot join the voice channel, then move the bot to a new (non-queue) channel to set a "target". Then you can disconnect the bot from the voice channel. If the target channel has a user limit `!limit {queue name} {#}`, the bot will automatically move people from the queue to keep the target channel full. 
	If the target channel doesnt't have a user limit, you can drag the bot to the target channel whenever you want to pull people from the queue (and the bot will swap with them). You can customize how many people the bot will pull at a time `!pullnum {queue name} {#}`.    
4. **Customization.**  
	*Privileged users* can customize the command prefix, message color, messaging mode, and how long people can leave a queue without losing their spot with the commands below.There are also additional commands to do things like shuffling and clearing queues.  

### Privileged Commands
Privileged commands are restricted to the server owner, administrators, and users with any of the following roles: `mod`, `moderator`, `admin`, `administrator`.  
If a command that expects a channel name is not given one, the current text channel will be used.  

{server role | @user}\` ` +
                        `grants permissions to use bot commands.

| Function | Command | Default | Description |
|-|-|-|-|
| Create a Queue | `!queue {channel name} {OPTIONAL: size}` | | Create a queue. |
| List Queues | `!queue` | | List the names of the existing queues. |
| Add Queue Manager Role | `!addrole {server role | @user}` | | Grants permissions to use bot commands. |
| Delete Queue Manager Role | `!deleterole {server role | @user}` | | Revokes permissions to use bot commands. | 
| Delete a Queue | `!delete {queue name}` | | Delete a queue. |
| Display a Queue | `!display {queue name}` | | Display the members in a queue. These messages stay updated. | 
| Pull from Voice | `!start {queue name}` | | Add the bot to a voice queue. Then the bot can be dragged into another channel to automatically pull the person(s) at the front of the queue. If the destination queue has a size limit, the bot will pull people until the limit is met. | 
| Pull from Text | `!next {queue name} {OPTIONAL: amount}` | |  Remove people from the text queue and displays their name. |
| Join | `!join {queue name} @{user 1} @{user 2}... {OPTIONAL: custom message}` | | Add one or more people to a queue. |
| Kick | `!kick {OPTIONAL: queue name} @{user 1} @{user 2} ...` | | Kick one or more people. If a queue name is given, it will kick from a single queue. Otherwise, it will kick people from every queue. |
| Clear | `!clear {queue name}` | | Clear a queue. |
| Shuffle | `!shuffle {queue name}` | | Shuffle a queue. |
| Set Queue Size Limit | `!limit {queue name} {#}` | | Set queue size limit. |
| Mention Queue | `!mention {queue name} {OPTIONAL: message}` | | Mention everyone in a queue. You can add a message too. |
| Blacklist | `!blacklist {queue name} @{user 1} @{user 2}...` | | Blacklist people from a queue. Use again to remove from blacklist. |
| List Blacklist | `!blacklist {queue name}` | | Display the blacklist for a queue. |
|||||
|**Channel Settings**|||
| Autofill | `!autofill {queue name} {on\off}` | `on` | Turn autofill on or off. |
| Pull Amount | `!pullnum {queue name} {#}` | `1` | Set the default number of people to pull. |
| Set Display Message Header | `!header {queue name} {message}` | | Set a header for display messaged. Leave `{header}` blank to remove. |
|||||
|**Server Settings**|||
| Set the Command Prefix | `!prefix {new prefix}` | in config | Set the prefix for Queue Bot commands. |
| Set the Color | `!color {new color}` | in config | Set the color of bot messages. |
| Set the Grace Period | `!grace {# seconds}` | `0` | Set how long a person can leave a queue before losing their spot. |
| Set the Display Mode | `!mode {#}` | `1` | Set how the display messages are updated. Use `!mode` to see the different update modes. |
| Command Cleanup | `!cleanup {on\off}` | `on` | Toggle the cleanup of user-sent Queue Bot commands. |

### Commands for Everyone

| Function | Command | Description |
|-|-|-|
| Join | `!join {queue name} {OPTIONAL: custom message}` | Join a queue a queue. |
| Help | `!help` | Get a help message. |
| My Queues | `!myqueues` | Display a member's position in of the each queue they have joined. |


![Example of `!s`](docs/example.gif)  

## How to setup your own Queue Bot hosting
1. [Create your Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)  
    1a. The required scopes for this bot are currently `bot`.
2. Clone/download this repository  
3. Create a database for storing queues. If doing local development [here are instructions for using Docker to create a viable database](#local-development-automation), otherwise here are the steps for establishing a Postgres instance on Windows:  
	3a. [Download Postgresql](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)  
	3b. Run the installer. Use the default port. Skip Stack Builder. Remember the password you set, you will need it later.  
	3c. Open Windows start menu, search for and open SQL Shell (psql).  
	3d. Leave the default login values for Server, Database, Port, and Username.  
	3e. Enter the password you chose during installation.  
	3f. Create a new database. (The semicolon is important):  
		`CREATE DATABASE queue;`  
	3g. Close command prompt.  
4. Open the Queue Bot folder.  
5. Modify `config/config.json`:  
	If you followed all of Step 3, you only need to update the REQUIRED fields in the table below.  
  
| REQUIRED Config Fields | Description                                                                                                                       | Default |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|-|
| prefix                 | Command prefix                                                                                                                    | `!` |
| token                  | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. See image of token location below this table. | |
| databasePassword       | Database login password                                                                                                           | |
  
| Optional Config Fields | Description                                                                                                                       | Default |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|-|
| color                  | The color of bot messages.                                                                                                        | |
| databaseUsername		 | Database login username                                                                                                           | `postgres` |
| databaseName           | Database name                                                                                                                     | `queue` |
| databaseHost           | Database host url                                                                                                                 | `localhost` |
| databaseType           | Type of database for queue storage.                                                                                               | `postgresql` |
| gracePeriod            | Number of seconds a user can leave the queue without being removed                                                                | `0` |
| permissionsRegexp      | What server roles can use bot commands. Uses RegExp. Accepts "mod" and "mods" by default.                                         | `\\bmod(erator)?s?\\b\|\\badmin(istrator)?s?\\b` |
| topGgToken             | Token for updating top.gg server count. This should be left blank.                                                                | |

| Config Command Fields  | Description                                                                                                                       | Default |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|-|
| autofillCmd            | Command to toggle autofill.                                                                                                       | `autofill` |
| blacklistCmd           | Command to set and display blacklist.                                                                                             | `blacklist` |
| cleanupCmd             | Command to toggle command cleanup.                                                                                                | `cleanup` |
| clearCmd               | Command to clear the queue.                                                                                                       | `clear` |
| colorCmd               | Command to set the color.                                                                                                         | `color` |
| displayCmd             | Command to display a queue in a text channel.                                                                                     | `display` |
| gracePeriodCmd         | Command to set the grace period.                                                                                                  | `grace` |
| headerCmd              | Command to set the header of a queue.                                                                                             | `header` |
| helpCmd                | Command to display the help information.                                                                                          | `help` |
| joinCmd                | Command to join a text channel queue.                                                                                             | `join` |
| kickCmd                | Command to kick users from a queue.                                                                                               | `kick` |
| limitCmd               | Command to set queue size limit.                                                                                                  | `limit` |
| mentionCmd             | Command to mention all users in a queue.                                                                                          | `mention` |
| modeCmd                | Command to set the display messaging mode.                                                                                        | `mode` |
| myQueuesCmd            | Command to display a member's position in each queue they have joined.                                                            | `mode` |
| nextCmd                | Command to pull the next user from a text channel.                                                                                | `next` |
| prefixCmd              | Command to set the command prefix.                                                                                                | `prefix` |
| pullNumCmd             | Command to set the number of people pulled at once.                                                                               | `pullnum` |
| queueCmd               | Command to create / list queues.                                                                                                  | `queue` |
| queueDeleteCmd         | Command to delete a queues.                                                                                                       | `delete`|
| roleAddCmd             | Command to grant permissions to use bot commands.                                                                                 | `addrole`|
| roleDeleteCmd          | Command to revoke permissions to use bot commands.                                                                                | `deleterole` |
| shuffleCmd             | Command to shuffle the queue.                                                                                                     | `shuffle` |
| startCmd               | Command to make the bot join a voice channel.                                                                                     | `start` |

![Token Location](docs/token_location.PNG)  

5. [Install NodeJS 12+](https://discordjs.guide/preparations/#installing-node-js)  
6. [Install Node-gyp](https://github.com/nodejs/node-gyp#installation)
7. Install Dependencies. Open commmand prompt in project directory (If you have the project open in file explorer, click on the directory bar, enter `cmd`, and hit enter). Enter `npm i` into command prompt. Keep the command prompt open.  
8. Build the bot. In the same command prompt, enter `npm run build`.  
9. Start the Bot. Enter `npm start` into command prompt. If you get an error at boot, there is something wrong in your config.json. When you close command prompt, the bot will stop.  
10.  **Optional**. Make the bot run in the background, so you don't need command prompt open.  
	9a. In command prompt, enter `npm install pm2 -g`  
	9b. To start the bot, enter `pm2 start bot.js --time`  
	9c. To stop the bot, enter `pm2 stop bot.js`  

### Local Development Automation

A [docker-compose definition file](docker-compose.yml) is provided in the root directory which will prepare a postgresql instance for bot development. 

To create a postgres instance open a terminal instance to the root directory of this repository and run 
```
docker-compose up
```

To configure this bot for the docker-composed instance of postgres simply alter [config.json](config/config.json) values for ```databaseUsername``` and ```databasePassword``` to ```docker``` while keeping the repository defaults for the other database configuration values.

Note - The ```token``` configuration must still be set based on your own discord bot token obtained through [the setup instructions](#how-to-setup-your-own-queue-bot-hosting).

#### Cleanup

To clean up the docker-composed postgres instance open a terminal instance to the root directory of this repository and run
```
docker-compose down
```
