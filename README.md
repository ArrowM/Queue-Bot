  
# Queue-Bot  

[![TopGG](https://top.gg/api/widget/status/679018301543677959.svg?noavatar=true)](https://top.gg/bot/679018301543677959)  
[![BuyMeACoffee](https://img.shields.io/badge/BuyMeACoffee-Donate-ff9004.svg?logo=CoffeeScript&style=flat-square)](https://www.buymeacoffee.com/Arroww)  
[![Discord Support Server](https://img.shields.io/discord/678645128755150863?label=Discord&style=flat-square)](https://discord.gg/RbmfnP3)  

Create voice & text channel queues. Queue Bot provides live queue displays in chat, assists in removing users in order, and allows for customization.  

https://user-images.githubusercontent.com/42418080/182225650-5fc2ae04-6012-4d5a-9cad-279521b3b048.mp4  
*Example of Queue Bot usage*

## Getting Started  
1. Invite the bot to your server: **[INVITE LINK](https://discord.com/oauth2/authorize?client_id=679018301543677959&permissions=2232511568&scope=bot%20applications.commands)**  
2. Use `/help setup` and follow the instructions  

## Commands  

### Commands for Everyone
`/display` - Display a queue  
`/help` - Display help messages  
`/join` - Join a text queue / Update queue message after joining  
`/leave` - Leave a text queue  
`/myqueues` - Show my queues  

### Privileged Commands  
Privileged commands are restricted to the server owner, administrators, and users with any of the following roles: `mod`, `moderator`, `admin`, `administrator`. Users or roles can be granted permission to use privileged commands with `/permission add`.  
If a command that expects a channel name is not given one, the current text channel will be used.  

**Queue Management**  
`/autopull` - Get/Set automatic pull from a voice queue  
`/blacklist` - Add/Delete/List/Clear users or roles from a queue blacklist  
`/button` - Get/Set whether a \"Join / Leave\" button appears under a text queue display  
`/clear` - Clear a queue  
`/color` - Get/Set color of queue displays  
`/enqueue` - Add a specified user or role to a text queue / Update queue message  
`/graceperiod` - Get/Set how long users can leave a queue before losing their position  
`/header` - Get/Set a header on display messages  
`/dequeue` - Dequeue a user  
`/lock` - Lock or unlock a queue. Locked queues can still be left  
`/logging` - Get/Set a dedicated logging channel for bot messages  
`/mentions` - Get/Set whether users are displayed as mentions (on), or normal text (off). Normal text helps avoid the @invalid-user issue  
`/move` - Move a user to a new position in a queue  
`/next` - Pull from a text queue  
`/pullnum` - Get/Set the default # of users to pull when autopull is off or when using the `/next` command  
`/queues` - Add/Delete/List queues  
`/roles` - Get/Set whether queue members are assigned a role named `In Queue: ...`  
`/schedule` - Add/Delete/List scheduled commands  
`/shuffle` - Shuffle a queue  
`/size` - Get/Set size limit of a queue  
`/timestamps` - Get/Set whether to display timestamps next to users
`/to-me` - Pull user(s) from a voice queue to you and display their name(s)  
`/whitelist` - Add/Delete/List/Clear users or roles from a queue whitelist  

**Bot Management**  
`/altprefix` - Enable or disable alternate prefix `!`  
`/mode` - Get/Set display mode  
`/notifications` - Get/Set notification status (on = DM users when they are pulled out. off = no DMS)
`/permission` - Add/Delete/List/Clear users and roles with bot permissions
`/priority` - Add/Delete/List/Clear users and roles with queue priority  
`/start` - Add the bot to a voice queue

## How to set up your own hosting  
1. [Create a Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)
2. Clone/download this repository  
3. Create a database for storing queues. If doing local development [here are instructions for using Docker to create a viable database](#local-development-automation), otherwise the steps for establishing a Postgres instance on Windows are below. **If you use a different type of database, [you need to install an additional library for it](https://knexjs.org/#Installation-node)**.  
    1. [Download Postgresql](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)  
    2. Run the installer. Use the default port. Skip Stack Builder. Remember the password you set, you will need it later.  
    3. Open Windows start menu, search for and open SQL Shell (psql).  
    4. Leave the default login values for Server, Database, Port, and Username.  
    5. Enter the password you chose during installation.  
    6. Create a new database. (The semicolon is important):  
        `CREATE DATABASE queue;`  
4. Modify the required fields in `config/config.json` (see the [configuration](#Configuration) section below).
5. [Install NodeJS v18](https://nodejs.org/en/download/current/).
6. Open command prompt in project directory (If you have the project open in file explorer, click on the directory bar, enter `cmd`, and hit enter).
   1. Enter the following to install dependencies:  
   `npm ci`  
   **If you get an error**, try switching to npm 7.X.X:  
   `npm i -g npm@7`  
   2. Then build:  
   `npm run build`  
   3. And start   
   `npm start`  
   If you get an error at boot, there is something wrong in your config.json. When you close command prompt, the bot will stop.  
7. Invite the bot with the following url after replacing `CLIENT_ID` with your own client id:  
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2433838096&scope=applications.commands%20bot
8. **Optional**. Make the bot run in the background.  
     9a. In command prompt, enter `npm install pm2 -g`  
     9b. To start the bot, enter `pm2 start build/bot.js --time`  
     9c. To stop the bot, enter `pm2 stop bot`  

## Configuration
Require fields must be set before starting the bot.

| REQUIRED Config Fields | Description                                                                                                                        | Default      | Required? |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------|--------------|-----------|
| clientId               | Bot clientId. Found in the Discord Developer Portal for the bot you created in Step 1                                              |              | Y         |
| token                  | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. (See image of token location below this table) |              | Y         |
| databasePassword       | Database login password                                                                                                            |              | Y         |
|                        |                                                                                                                                    |              |           |
| color                  | The color of bot messages                                                                                                          |              | N         |
| databaseUsername       | Database login username                                                                                                            | `postgres`   | N         |
| databaseName           | Database name                                                                                                                      | `queue`      | N         |
| databaseHost           | Database host url                                                                                                                  | `localhost`  | N         |
| databaseType           | Type of database for queue storage                                                                                                 | `postgresql` | N         |
| gracePeriod            | Default number of seconds a user can leave the queue without being removed                                                         | `0`          | N         | 
| permissionsRegexp      | What server roles can use bot commands. Uses RegExp. Accepts "mod" and "mods" by default                                           |              | N         | 
| topGgToken             | Token for updating top.gg server count. This should be left blank                                                                  |              | N         |
| announcementChannelId  | Channel to send announcements about bot patches                                                                                    |              | N         |

![Token Location](docs/token_location.PNG)
*Token location in Discord Developer Portal*

## Local Development Automation
A [docker-compose definition file](docker-compose.yml) is provided in the root directory which will prepare a postgresql instance for bot development.

To create a postgres instance open a terminal instance to the root directory of this repository and run  
```  
docker-compose up  
```
To configure this bot for the docker-composed instance of postgres simply alter [config.json](config/config.json) values for `databaseUsername` and `databasePassword` to `docker` while keeping the repository defaults for the other database configuration values.  

Note - The `token` configuration must still be set based on your own discord bot token obtained through [the setup instructions](#how-to-set-up-your-own-hosting).  

### Cleanup
To clean up the docker-composed postgres instance open a terminal instance to the root directory of this repository and run  
```  
docker-compose down  
```  
