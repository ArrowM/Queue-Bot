# Debate-Queue-Bot
## Setup
1. [Create your Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)
2. Clone/download this repository
3. Create a database for storing queues. Here's a [guide for postgres on Windows](https://www.microfocus.com/documentation/idol/IDOL_12_0/MediaServer/Guides/html/English/Content/Getting_Started/Configure/_TRN_Set_up_PostgreSQL.htm) (follow up to step 4). Create a database, but don't create a table because bot.js will create its own table.
4. Modify `config.json`:  

| Parameter           | Description                                                                                                                       |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `prefix`            | Command prefix (Default: `!`)                                                                                                     |
| `token`             | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. See image of token location below this table. |
| `database_type`     | Type of database for queue storage. (Default: `postgresql`)                                                                       |
| `database_uri`      | Database URI. (Example: `localhost:5432/YOUR_TABLE_NAME`)                                                                     |
| `database_username` |                                                                                                                                   |
| `database_password` | Blank space for no password.                                                                                                                                  |

![Token Location](docs/token_location.PNG)  

5. [Install NodeJS](https://discordjs.guide/preparations/#installing-node-js)
6. Install Dependencies. Open terminal in project directory. `sudo npm install`
7. Start the Bot. `node bot.js`. If you get an error at boot, there is something wrong in your config.json.

