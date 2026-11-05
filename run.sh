#!/bin/sh

npm install

# Iniciar servidor backend SQLite en segundo plano
node server/index.ts &
SERVER_PID=$!

# Al salir del script (Ctrl+C), detener el backend
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM

# Iniciar frontend con Vite
npm run dev
