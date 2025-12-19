@echo off
set FLASK_APP=warera/app.py
set DEV_MODE_DISINFO=false
set POP_SIZE=1000
set N_GEN=200
set POOL_SIZE=12
flask run
