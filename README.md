# Bioswap SDK

## Tech Stacks

Node.js latest version

@coral-xyz/anchor: "^0.29.0",
@solana/web3.js: "^1.95.2",
@solana/spl-token: "^0.4.8"

@solana/wallet-adapter-react: "^0.15.35",
@solana/wallet-adapter-react-ui: "^0.9.35",

## How it works

### call bioswap function with these parameters
    privateKey
    fromToken
    toToken
    amount

### example method to use in Node.js with PrivateKey
    const Bioswap = require('bioswap-sdk')

    const privateKey = []
    const fromToken = "So11111111111111111111111111111111111111112";
    const toToken = "BLLbAtSHFpgkSaUGmSQnjafnhebt8XPncaeYrpEgWoVk";
    const amount = 1;
    const rpcUrl = ""

    const bioswap = new Bioswap(rpcUrl, privateKey)

    const init = async () => {
        const result = await bioswap.swap(fromToken, toToken, amount)
        console.log(result)
    }
    init()

### example method to use in Web3 Frontend with Wallet connection

    import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
    import { useAnchorWallet } from "@solana/wallet-adapter-react";
    import Bioswap from 'bioswap-sdk'

    export default function Home() {

        const wallet = useAnchorWallet();

        const sendSol = async () => {
            const fromToken = "So11111111111111111111111111111111111111112";
            const toToken = "BLLbAtSHFpgkSaUGmSQnjafnhebt8XPncaeYrpEgWoVk";
            const amount = 1;
            const rpcUrl = ""

            const bioswap = new Bioswap(rpcUrl, wallet)
            const result = await bioswap.swap(toToken, fromToken, amount)
            console.log(result)
        };

        return (
            <div>
                <WalletMultiButton />
                <button onClick={() => sendSol()}>Send</button>
            </div>
        );
    }
