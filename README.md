  
# Queue-Bot  
  
[![TopGG](https://top.gg/api/widget/status/679018301543677959.svg?noavatar=true)](https://top.gg/bot/679018301543677959)  
[![BuyMeACoffee](https://img.shields.io/badge/BuyMeACoffee-Donate-ff9004.svg?logo=CoffeeScript&style=flat-square)](https://www.buymeacoffee.com/Arroww)  
[![Discord Support Server](https://img.shields.io/discord/678645128755150863?label=Discord&style=flat-square)](https://discord.gg/RbmfnP3)  
  
Create voice and text queues in your discord server. This bot allows you to display the order of people waiting and easily pull them to another channel.  
  
## Getting Started  
1. Invite the bot to your server: **[INVITE LINK](https://discord.com/oauth2/authorize?client_id=679018301543677959&permissions=2232511568&scope=bot%20applications.commands)**  
2. Use `/help setup` and follow the instructions  
  
## Commands  
  
### Commands for Everyone  
`/join` - Join a text queue  
`/leave` - Leave a text queue  
`/myqueues` - Show my queues  
`/help` - Display help messages
  
### Privileged Commands  
Privileged commands are restricted to the server owner, administrators, and users with any of the following roles: `mod`, `moderator`, `admin`, `administrator`. Users or roles can be granted permission to use privileged commands with `/permission add`.  
If a command that expects a channel name is not given one, the current text channel will be used.  
  
**Queue Management**  
`/altprefix` - Enable or disable alternate prefix `!`  
`/autopull` - Get / Set automatic pull from a voice queue  
`/blacklist` - Add / delete / display blacklists of users and roles  
`/button` - Get / Set whether a \"Join / Leave\" button appears under a text queue display  
`/clear` - Clear a queue  
`/color` - Get / Set color of queue displays  
`/display` - Display a queue  
`/enqueue` - Add another user to a queue  
`/graceperiod` - Get / Set how long users can leave a queue before losing their position  
`/header` - Get / Set a header on display messages  
`/kick` - Kick from a queue  
`/mentions` - Get / Set whether users are displayed as mentions (on), or normal text (off). Normal text helps avoid the @invalid-user issue  
`/next` - Pull from a text queue  
`/pullnum` - Get / Set # of users to pull when manually pulling from a voice queue  
`/queues` - Add / delete / display queues  
`/shuffle` - Shuffle a queue  
`/size` - Get / Set size limit of a queue  
`/start` - Add the bot to a voice queue  
`/whitelist` - Add / delete / display whitelists of users and roles  

**Bot Management**  
`/mode` - Set display mode  
`/permission` - Add / delete / display users and roles with bot permissions  
  
![Example of `/start`](docs/example.gif)  
  
## How to setup your own Queue Bot hosting  
1. [Create a Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)  
    ![Permissions](docs/permissions.png)  
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
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|---|  
| clientId               | Bot clientId. Found in the Discord Developer Portal for the bot you created in Step 1.                                            | |
| token                  | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. See image of token location below this table. | |  
| databasePassword       | Database login password                                                                                                           | |  
  
| Optional Config Fields | Description                                                                                                                       | Default |  
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|---|  
| color                  | The color of bot messages.                                                                                                        | |  
| databaseUsername		 | Database login username                                                                                                           | `postgres` |  
| databaseName           | Database name                                                                                                                     | `queue` |  
| databaseHost           | Database host url                                                                                                                 | `localhost` |  
| databaseType           | Type of database for queue storage.                                                                                               | `postgresql` |  
| gracePeriod            | Default number of seconds a user can leave the queue without being removed                                                        | `0` |  
| permissionsRegexp      | What server roles can use bot commands. Uses RegExp. Accepts "mod" and "mods" by default                                          | |  
| topGgToken             | Token for updating top.gg server count. This should be left blank                                                                 | |  
| announcementChannelId  | Channel to send anounncements about bot patches                                                                                   | |  
  
![Token Location](docs/token_location.PNG)  
  
5. [Install NodeJS 16.6+](https://discordjs.guide/preparations/#installing-node-js)  
6. [Install Node-gyp](https://github.com/nodejs/node-gyp#installation)  
7. Install Dependencies. Open commmand prompt in project directory (If you have the project open in file explorer, click on the directory bar, enter `cmd`, and hit enter). Enter `npm i` into command prompt. Keep the command prompt open.  
8. Build the bot. In the same command prompt, enter `npm run build`.  
9. Start the Bot. Enter `npm start` into command prompt. If you get an error at boot, there is something wrong in your config.json. When you close command prompt, the bot will stop.  
10.  **Optional**. Make the bot run in the background, so you don't need command prompt open.  
	9a. In command prompt, enter `npm install pm2 -g`  
	9b. To start the bot, enter `cd build`, then `pm2 start bot.js --time`  
	9c. To stop the bot, enter `pm2 stop bot`  
  
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
