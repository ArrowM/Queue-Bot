# Debate-Queue-Bot
Created to manage voice channel waiting rooms. This bot allows you to display the order of people waiting and easily pull them to another channel.  

## Setup
1. [Create your Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)  
2. Clone/download this repository  
3. Create a database for storing queues. Here's a the steps for Windows:  
	3a. [Download Postgresql](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)  
	3b. Run the installer. Use the default port. Skip Stack Builder. Remember the password you set, you will need it later.  
	3c. Add Postgres to the Windows PATH:  
		Open Windows Start menu. Search for "Edit the system environment variables", click result.  
		Click the "Environment Variables" button on the bottom.  
		Under "System Variables", find "PATH", select it. Click "Edit".  
		On the right, click "New".  
		Enter "C:\Program Files\PostgreSQL\12\bin".  
		Hit "OK" on each window to save the changes.  
	3d. Open command prompt.  
	3e. Enter `psql -u postgres`  
	3f. Enter the password you chose during installation.   
	3g. Create a new database. (The semicolon is important):  
		`CREATE DATABASE myDatabase;`  
	3h. Close command prompt.  
4. Open the Queue Bot folder.  
5. Modify `config.json`:  
	If you followed all of Step 3, you only need to update the bolded fields in the table below.

| Parameter             | Description                                                                                                                       |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| **prefix**            | Command prefix (Default: `!`)                                                                                                     |
| **token**             | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. See image of token location below this table. |
| **databaseUri**       | Database URI. (Example: `localhost:5432/myDatabase`)						       							                        |
| **databaseUsername**  |                                                                                                                                   |
| **databasePassword**  |                                                                                                                                   |
| databaseType          | Type of database for queue storage. (Default: `postgresql`)                                                                       |
| gracePeriod           | Number of seconds a user can leave the queue without being removed                                                                |
| permissionsRegexp     | What server roles can use bot commands. Uses RegExp. Accepts "mod" and "mods" by default.                                         |
| color                 | The color of bot messages.                                                                                                        |
| COMMANDS              |                                                                                                                                   |
| clearCmd              | Command to clear the queue.                                                                                                       |
| colorCmd              | Command to change the color.                                                                                                      |
| commandPrefixCmd      | Command to change the command prefix.                                                                                             |
| displayCmd            | Command to display a queue in a text channel.                                                                                     |
| gracePeriodCmd        | Command to change the grace period.                                                                                               |
| helpCmd               | Command to display the help information.                                                                                          |
| joinCmd               | Command to join a text channel queue.                                                                                             |
| kickCmd               | Command to kick users from a queue.                                                                                               |
| nextCmd               | Command to pull the next user from a text channel                                                                                 |
| queueCmd              | Command to change queues.                                                                                                         |
| shuffleCmd            | Command to shuffle the queue.                                                                                                     |
| startCmd              | Command to make the bot join a voice channel.                                                                                     |

![Token Location](docs/token_location.PNG)  

5. [Install NodeJS 12](https://discordjs.guide/preparations/#installing-node-js)  
6. Install Dependencies. Open commmand prompt in project directory (If you have the project open in file explorer, click on the directory bar and enter "cmd"). Enter `npm install` into command prompt. You can ignore the NPM warnings. Keep the command prompt open.
7. Compile the TypeScript file, enter `tsc -p .`
8. Start the Bot. Enter `node bot.js` into command prompt. If you get an error at boot, there is something wrong in your config.json. When you close command prompt, the bot will stop.  
9. **Optional**. Make the bot run in the background, so you don't need command prompt open.  
	9a. In command prompt (set to the project directory), enter `npm install pm2`  
	9b. To start the bot, enter `pm2 start bot.ts`  
	9c. To stop the bot, enter `pm2 stop bot.ts`  
  
## How to use  
### Non-Restricted Commands  
Available to everyone.  
#### Join a Text Channel Queue 
`!j {channel name} {OPTIONAL: message to display next to your name}` joins or leaves a text channel queue.   
#### Help  
`!h` displays a list of all commands.  

### Restricted Commands  
Available to owners or users with mod or mods in their server roles.  
#### Modify & List Queues  
`!q {channel name}` creates a new queue or deletes an existing queue.  
`!q` shows the existing queues.  
#### Display Queue  
`!d {channel name}` displays the members in a queue. These messages stay updated.  
#### Pull Users from Voice Queue  
`!s {channel name}` adds the bot to a voice queue. The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue. Right-click the bot to disconnect it from the voice channel when done. See the example gif below.  
#### Pull Users from Text Queue  
`!n {channel name}` removes the next person in a text queue and displays their name.  
#### Kick  
`!k {channel name} @{user 1} @{user 2} ...`  kicks one or more people from a queue.  
#### Clear Queue  
`!clear {channel name}` clears a queue.  
#### Shuffle Queue  
`!shuffle {channel name}` shuffles a queue.  
  
#### Change the Grace Period  
`!g {time in seconds}` changes how long a person can leave a queue before being removed.  
#### Change the Command Prefix  
`!prefix {new prefix}` changes the prefix for Queue Bot commands.  
#### Change the Color  
`!c {new color}` changes the color of bot messages.  


![Example of `!s`](docs/example.gif)  
