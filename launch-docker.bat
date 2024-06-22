@echo off
rem Set the container name
set CONTAINER_NAME=queue-bot

rem Check if the container is running
docker ps -q -f name=%CONTAINER_NAME% > nul 2>&1
if %errorlevel% equ 0 (
    rem Create a dated log file name
    set LOG_FILE=logs\%CONTAINER_NAME%_%date:~10,4%-%date:~4,2%-%date:~7,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%.log

    rem Save the logs to the file
    mkdir logs 2>nul
    docker logs %CONTAINER_NAME% > %LOG_FILE%

    rem Check if the logs were saved successfully
    if %errorlevel% equ 0 (
        echo Logs saved to %LOG_FILE%
    ) else (
        echo Failed to save logs
        exit /b 1
    )
) else (
    echo Container %CONTAINER_NAME% is not running. Skipping log saving.
)

git pull

docker-compose down

npx drizzle-kit push

docker-compose up -d --build

docker image prune -f

docker logs -f queue-bot
