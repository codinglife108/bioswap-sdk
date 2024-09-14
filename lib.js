const {
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
    ComputeBudgetProgram
} = require('@solana/web3.js')

const { AnchorProvider, BN, Program } = require('@coral-xyz/anchor')

const {
    createAssociatedTokenAccountInstruction,
    createCloseAccountInstruction,
    createSyncNativeInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID
} = require('@solana/spl-token')

const IDL = require('./bio_swap.json')

const getMintPubKey = (sourceForUser, destinationForUser) => {
    const mintA = new PublicKey(sourceForUser)
    const mintB = new PublicKey(destinationForUser)

    const isBaseSmall = mintA.toBuffer().compare(mintB.toBuffer()) < 0

    return { mintA, mintB, isBaseSmall }
}

const getProgramData = async (aMintPubkey, bMintPubkey, config) => {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), aMintPubkey.toBuffer(), bMintPubkey.toBuffer()],
        config.programId
    )
    const swapPair = PublicKey.findProgramAddressSync(
        [
            Buffer.from('swap-pair', 'utf-8'),
            aMintPubkey.toBuffer(),
            bMintPubkey.toBuffer()
        ],
        config.programId
    )[0]
    return { pda, swapPair }
}

const getPairData = async (swapPair, program, config) => {
    const swapPairObject = await program.account.swapPair.fetch(
        swapPair.toBase58()
    )
    const tokenAAccount = new PublicKey(swapPairObject.tokenAAccount)
    const tokenBAccount = new PublicKey(swapPairObject.tokenBAccount)
    const poolMintPubkey = new PublicKey(swapPairObject.poolMint)
    const poolAccountForAdmin = new PublicKey(swapPairObject.poolFeeAccount)
    const fees = swapPairObject.fees

    const tokenMint = await getAccount(config.connection, poolAccountForAdmin)

    return {
        tokenAAccount,
        tokenBAccount,
        poolMintPubkey,
        poolAccountForAdmin,
        poolTokenAccount: tokenMint.owner,
        fees
    }
}

const getTokenAddress = async (mint, config) => {
    const is22 = await checkIsToken2022(mint, config)
    let tokenAccount

    if (is22) {
        tokenAccount = getAssociatedTokenAddressSync(
            mint,
            config.pubkey,
            undefined,
            TOKEN_2022_PROGRAM_ID
        )
    } else {
        tokenAccount = getAssociatedTokenAddressSync(
            mint,
            config.pubkey
        )
    }
    const tokenSource = is22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    return { tokenAccount, tokenSource, is22 }
}

const checkBaseNativeForUser = async (mint, config, amount) => {
    const instructions = []

    if (mint.toBase58() === NATIVE_MINT.toBase58()) {
        try {
            const tokenSourceForSwapper = getAssociatedTokenAddressSync(
                NATIVE_MINT,
                config.pubkey,
                true
            )

            const accountInfo = await config.connection.getAccountInfo(
                tokenSourceForSwapper
            )

            if (!accountInfo) {
                const createWsolAccountIxn =
                    createAssociatedTokenAccountInstruction(
                        config.pubkey,
                        tokenSourceForSwapper,
                        config.pubkey,
                        NATIVE_MINT
                    )
                instructions.push(createWsolAccountIxn)
                const solTransIxn = SystemProgram.transfer({
                    fromPubkey: config.pubkey,
                    toPubkey: tokenSourceForSwapper,
                    lamports: new BN(String(Number(amount) * 10 ** 9))
                })
                instructions.push(solTransIxn)
            } else {
                const solTransIxn = SystemProgram.transfer({
                    fromPubkey: config.pubkey,
                    toPubkey: tokenSourceForSwapper,
                    lamports: new BN(Number(amount) * 10 ** 9)
                })
                instructions.push(solTransIxn)
            }
            const syncNativeInx = createSyncNativeInstruction(
                tokenSourceForSwapper
            )
            instructions.push(syncNativeInx)
        } catch (error) {
            console.log(error)
            throw new Error("RPC Error when create wsol sync");   
        }
    }
    return instructions
}

const checkIsToken2022 = async (mint, config) => {
    try {
        await getMint(config.connection, mint)
        return false
    } catch {
        return true
    }
}

const checkQuoteForUser = async (mint, config, tokenSourceForSwapper) => {
    const instructions = []
    const sourceIs22 = await checkIsToken2022(mint, config)

    try {
        const accountInfo = await config.connection.getAccountInfo(
            tokenSourceForSwapper
        )
        if (!accountInfo) {
            let createAccountInstruction
            if (sourceIs22) {
                createAccountInstruction =
                    createAssociatedTokenAccountInstruction(
                        config.pubkey,
                        tokenSourceForSwapper,
                        config.pubkey,
                        mint,
                        TOKEN_2022_PROGRAM_ID
                    )
            } else {
                createAccountInstruction =
                    createAssociatedTokenAccountInstruction(
                        config.pubkey,
                        tokenSourceForSwapper,
                        config.pubkey,
                        mint
                    )
            }
            instructions.push(createAccountInstruction)
        }
        return instructions
    } catch (error) {
        throw new Error('RPC Error when create token account')
    }
}

const checkQuoteNativeForUser = async (mint, pubkey) => {
    const instructions = []
    if (mint.toBase58() === NATIVE_MINT.toBase58()) {
        const tokenDestinationForSwapper = getAssociatedTokenAddressSync(
            NATIVE_MINT,
            pubkey
        )
        const closeAccountIxn = createCloseAccountInstruction(
            tokenDestinationForSwapper,
            pubkey,
            pubkey
        )
        instructions.push(closeAccountIxn)
    }

    return instructions
}

const changeToBN = async (amount, mint, config) => {
    let tokenMint
    try {
        tokenMint = await getMint(config.connection, mint)
    } catch (error) {
        tokenMint = await getMint(
            config.connection,
            mint,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    }

    const resultAmount = new BN(
        String(Math.floor(amount * 10 ** tokenMint.decimals))
    )
    return resultAmount
}

const calculateFee = (tokenAmount, feeNumerator, feeDenominator) => {
    if (feeNumerator == 0 || tokenAmount == 0) {
        return 0
    } else {
        let fee = (tokenAmount * feeNumerator) / feeDenominator
        if (fee == 0) {
            return 1
        } else {
            return fee
        }
    }
}

const tradingFee = async (tradingTokens, fees) => {
    return await calculateFee(
        tradingTokens,
        fees.tradeFeeNumerator,
        fees.tradeFeeDenominator
    )
}

const ownerTradingFee = async (tradingTokens, fees) => {
    return await calculateFee(
        tradingTokens,
        fees.ownerTradeFeeNumerator,
        fees.ownerTradeFeeDenominator
    )
}

const getQuote = async (
    aTokenIs,
    bTokenIs,
    tokenAForPda,
    tokenBForPda,
    amountIn,
    fees,
    config
) => {
    try {
        const tradeFee = await tradingFee(amountIn, fees)
        const ownerFee = await ownerTradingFee(amountIn, fees)

        const total_fees = tradeFee + ownerFee
        const sourceAmountLessFees = amountIn - total_fees

        const [tokenAPoolAccountInfo, tokenBPoolAccountInfo] =
            await Promise.all([
                getAccount(
                    config.connection,
                    tokenAForPda,
                    undefined,
                    aTokenIs ? TOKEN_2022_PROGRAM_ID : undefined
                ),
                getAccount(
                    config.connection,
                    tokenBForPda,
                    undefined,
                    bTokenIs ? TOKEN_2022_PROGRAM_ID : undefined
                )
            ])
        const tokenAPoolBalance = tokenAPoolAccountInfo.amount.toString()
        const tokenBPoolBalance = tokenBPoolAccountInfo.amount.toString()

        if (Number(tokenAPoolBalance) / 10 <= sourceAmountLessFees) {
            return 0
        }

        const invariant = Number(tokenAPoolBalance) * Number(tokenBPoolBalance)
        const newSwapSourceAmount =
            Number(tokenAPoolBalance) + sourceAmountLessFees
        const newSwapDestinationAmount = invariant / newSwapSourceAmount
        const destinationAmountSwapped =
            Number(tokenBPoolBalance) - newSwapDestinationAmount

        return destinationAmountSwapped
    } catch (e) {
        return 0
    }
}

const getLpUsers = async (mint, poolTokenAccount) => {
    let allOwners = []
    const response = await fetch(
        'https://mainnet.helius-rpc.com/?api-key=23f7cc4d-b4f4-4dea-a99a-8fd903d9bbd1',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'getTokenAccounts',
                id: 'helius-test',
                params: {
                    page: 1,
                    limit: 1000,
                    displayOptions: {},
                    mint: mint.toBase58()
                }
            })
        }
    )
    const data = await response.json()

    data.result.token_accounts.forEach((account) => {
        if (poolTokenAccount !== account.owner) {
            allOwners.push({
                pubkey: new PublicKey(account.address),
                isSigner: false,
                isWritable: true
            })
        }
    })

    return allOwners
}

exports.swapWithPrivateKey = async (
    config,
    baseToken,
    quoteToken,
    amountIn
) => {
    try {
        const provider = new AnchorProvider(config.connection, {
            publicKey: new PublicKey(config.RANDOM_WALLET_ADDRESS),
          });
        const program = new Program(IDL, config.programId, provider)

        const { mintA, mintB, isBaseSmall } = getMintPubKey(
            baseToken,
            quoteToken
        )
        const aMintPubkey = isBaseSmall ? mintA : mintB
        const bMintPubkey = isBaseSmall ? mintB : mintA

        const { pda, swapPair } = await getProgramData(
            aMintPubkey,
            bMintPubkey,
            config
        )

        const [
            {
                tokenAAccount,
                tokenBAccount,
                poolMintPubkey,
                poolAccountForAdmin,
                poolTokenAccount,
                fees
            },
            aTokenData,
            bTokenData,
            addInstruction1
        ] = await Promise.all([
            getPairData(swapPair, program, config),
            getTokenAddress(mintA, config),
            getTokenAddress(mintB, config),
            checkBaseNativeForUser(mintA, config, amountIn)
        ])

        const aTokenUser = aTokenData.tokenAccount
        const aTokenSource = aTokenData.tokenSource
        const aTokenIs = aTokenData.is22

        const bTokenUser = bTokenData.tokenAccount
        const bTokenSource = aTokenData.tokenSource
        const bTokenIs = aTokenData.is22

        const aTokenPDA = isBaseSmall ? tokenAAccount : tokenBAccount
        const bTokenPDA = isBaseSmall ? tokenBAccount : tokenAAccount

        const [addInstruction2, amountOut, lpTokenUsers, hash] =
            await Promise.all([
                checkQuoteForUser(mintB, config, bTokenUser),
                getQuote(
                    aTokenIs,
                    bTokenIs,
                    aTokenPDA,
                    bTokenPDA,
                    amountIn,
                    fees,
                    config
                ),
                getLpUsers(poolMintPubkey, String(poolTokenAccount)),
                config.connection.getLatestBlockhash()
            ])

        if (amountOut <= 0) {
            throw new Error(`amountOut is ${amountOut}`)
        }

        const _avPercent = 100 - config.slippage
        const _amount = (Number(amountOut) * _avPercent) / 100

        const [sendAmount, receiveAmount] = await Promise.all([
            changeToBN(amountIn, aMintPubkey, config),
            changeToBN(_amount, bMintPubkey, config)
        ])

        const addInstruction3 = await program.methods
            .swapExactIn(sendAmount, receiveAmount)
            .accounts({
                swapper: config.pubkey,
                pair: swapPair,
                tokenSource: mintA,
                tokenDestination: mintB,
                tokenSourceForPda: aTokenPDA,
                tokenDestinationForPda: bTokenPDA,
                tokenSourceForSwapper: aTokenUser,
                tokenDestinationForSwapper: bTokenUser,
                poolFeeAccount: poolAccountForAdmin,
                hostFeeAccount: poolAccountForAdmin,
                pool: poolMintPubkey,
                pda: pda,
                tokenProgramSource: aTokenSource,
                tokenProgramDestination: bTokenSource,
                tokenProgram: TOKEN_PROGRAM_ID
            })
            .remainingAccounts(lpTokenUsers)
            .instruction()

        const addInstruction4 = await checkQuoteNativeForUser(
            mintB,
            config.pubkey
        )

        const instructions = [
            ...addInstruction1,
            ...addInstruction2,
            addInstruction3,
            ...addInstruction4
        ]
        const message = new TransactionMessage({
            payerKey: config.pubkey,
            recentBlockhash: hash.blockhash,
            instructions
        }).compileToV0Message()

        return message
    } catch (error) {
        // console.log(error)
        throw new Error(error)
    }
}

exports.getAmount = async (config, baseToken, quoteToken, amountIn) => {
    try {
        const provider = new AnchorProvider(config.connection, {
            publicKey: new PublicKey(config.RANDOM_WALLET_ADDRESS),
          });
        const program = new Program(IDL, config.programId, provider)

        const { mintA, mintB, isBaseSmall } = getMintPubKey(
            baseToken,
            quoteToken
        )

        const aMintPubkey = isBaseSmall ? mintA : mintB
        const bMintPubkey = isBaseSmall ? mintB : mintA
        const { swapPair } = await getProgramData(
            aMintPubkey,
            bMintPubkey,
            config
        )

        const { tokenAAccount, tokenBAccount, fees } = await getPairData(
            swapPair,
            program
        )

        const aTokenData = await getTokenAddress(
            mintA,
            config.pubkey,
            config
        )

        const aTokenIs = aTokenData.is22
        const bTokenIs = aTokenData.is22

        const aTokenPDA = isBaseSmall ? tokenAAccount : tokenBAccount
        const bTokenPDA = isBaseSmall ? tokenBAccount : tokenAAccount

        const amountOut = await getQuote(
            aTokenIs,
            bTokenIs,
            aTokenPDA,
            bTokenPDA,
            amountIn,
            fees,
            config
        )

        if (amountOut <= 0) {
            throw new Error(`amountOut is ${amountOut}`)
        }

        const _avPercent = 100 - config.slippage
        const _amount = (Number(amountOut) * _avPercent) / 100

        return _amount
    } catch (error) {
        throw new Error(error)
    }
}
