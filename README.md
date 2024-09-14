# Bioswap SDK

Bioswap is a lightweight and easy-to-use SDK for interacting with token swaps on the Solana blockchain. 
It provides functionality for liquidity providers, traders, and developers to seamlessly exchange tokens from decentralized pools of Bioswap Pool.

## Key Features:
    Get Swapped Amount: get swapped token amount in advance.
    Token Swaps: Instantly swap tokens in liquidity pools.

## Installation
    npm i bioswap-sdk

## Tech Stacks

    Node.js latest version

    @coral-xyz/anchor: "^0.29.0",
    @solana/web3.js: "^1.95.2",
    @solana/spl-token: "^0.4.8"

    @solana/wallet-adapter-react: "^0.15.35",
    @solana/wallet-adapter-react-ui: "^0.9.35",

## How it works

### example method to use swap function
    const Bioswap = require('bioswap-sdk')

    const signer = // From PrivateKey or Phantom

    const fromToken = "So11111111111111111111111111111111111111112";
    const toToken = "BLLbAtSHFpgkSaUGmSQnjafnhebt8XPncaeYrpEgWoVk";
    const amount = 1;
    const rpcUrl = ""
    const slippage = 3

    const bioswap = new Bioswap(rpcUrl, slippage, signer.publicKey)
    <!-- If you don't pass rpcUrl it will be default mainnet RPC url -->
    <!-- If you don't pass slippage, it will be 3% automatically -->

    const init = async () => {
        const message = await bioswap.swap(fromToken, toToken, amount);
        const transaction = new VersionedTransaction(message);
        const signedTxn = await signer.signTransaction(transaction);
        const tx = await connection.sendTransaction(signedTxn, {
          skipPreflight: true,
        });
      
        console.log(tx);        
    }
    init()

### example method to use getSwappedAmount function in Node.js with PrivateKey
    const Bioswap = require('bioswap-sdk')

    const signer = // From PrivateKey or Phantom

    const fromToken = "So11111111111111111111111111111111111111112";
    const toToken = "BLLbAtSHFpgkSaUGmSQnjafnhebt8XPncaeYrpEgWoVk";
    const amount = 1;
    const rpcUrl = ""
    const slippage = 3

    const bioswap = new Bioswap(rpcUrl, slippage, signer.publicKey)
    <!-- If you don't pass rpcUrl it will be default mainnet RPC url -->
    <!-- If you don't pass slippage, it will be 3% automatically -->

    const init = async () => {
        const message = await bioswap.getSwappedAmount(fromToken, toToken, amount);
        const transaction = new VersionedTransaction(message);
        const signedTxn = await signer.signTransaction(transaction);
        const tx = await connection.sendTransaction(signedTxn, {
          skipPreflight: true,
        });
      
        console.log(tx);        
    }
    init()