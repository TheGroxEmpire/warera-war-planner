@echo off
if "%FLASK_APP%"=="" set FLASK_APP=warera.app:app
if "%FLASK_DEBUG%"=="" set FLASK_DEBUG=1
if "%PORT%"=="" set PORT=5000
flask run --host 0.0.0.0 --port %PORT%
