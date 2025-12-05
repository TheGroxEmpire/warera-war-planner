#!/bin/bash
export FLASK_APP=warera/app.py
export DEV_MODE_DISINFO=true
export POP_SIZE=500
export N_GEN=200
export POOL_SIZE=8
flask run
