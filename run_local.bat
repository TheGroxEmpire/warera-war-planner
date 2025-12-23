@echo off
set FLASK_APP=warera/app.py
set DEV_MODE_DISINFO=false
set POP_SIZE=200
set N_GEN=50
set POOL_SIZE=10
flask run
