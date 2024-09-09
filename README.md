# Bioswap SDK

## Tech Stacks

Nodejs latest version

## How it works

### call bioswap function with these parameters
    privateKey
    fromToken
    toToken
    amount

### example method to use
    const bioswap = require('bioswap-sdk')


    const privateKey = <key>
    const fromToken = "So11111111111111111111111111111111111111112";
    const toToken = "BLLbAtSHFpgkSaUGmSQnjafnhebt8XPncaeYrpEgWoVk";
    const amount = 0.01;

    bioswap(privateKey, fromToken, toToken, amount)
