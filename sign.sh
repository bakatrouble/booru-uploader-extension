#!/bin/bash

source .env

pnpm sign \
    -k $AMO_KEY \
    -s $AMO_SECRET
