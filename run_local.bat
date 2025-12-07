@echo off
set FLASK_APP=warera/app.py
set DEV_MODE_DISINFO=false
set POP_SIZE=500
set N_GEN=100
set POOL_SIZE=8
flask run
