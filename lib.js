const {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");

const { AnchorProvider, BN, Program } = require("@coral-xyz/anchor");

const {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const IDL = require("./bio_swap.json");

const getMintPubKey = (sourceForUser, destinationForUser) => {
  const mintA = new PublicKey(sourceForUser);
  const mintB = new PublicKey(destinationForUser);

  const isBaseSmall = mintA.toBuffer().compare(mintB.toBuffer()) < 0;

  return { mintA, mintB, isBaseSmall };
};

const getProgramData = async (aMintPubkey, bMintPubkey, config) => {
  const [pda] = await PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), aMintPubkey.toBuffer(), bMintPubkey.toBuffer()],
    config.programId
  );
  const swapPair = PublicKey.findProgramAddressSync(
    [
      Buffer.from("swap-pair", "utf-8"),
      aMintPubkey.toBuffer(),
      bMintPubkey.toBuffer(),
    ],
    config.programId
  )[0];
  return { pda, swapPair };
};

const getPairData = async (swapPair, program) => {
  const swapPairObject = await program.account.swapPair.fetch(
    swapPair.toBase58()
  );
  const tokenAAccount = new PublicKey(swapPairObject.tokenAAccount);
  const tokenBAccount = new PublicKey(swapPairObject.tokenBAccount);
  const poolMintPubkey = new PublicKey(swapPairObject.poolMint);
  const poolAccountForAdmin = new PublicKey(swapPairObject.poolFeeAccount);
  const fees = swapPairObject.fees;
  return {
    tokenAAccount,
    tokenBAccount,
    poolMintPubkey,
    poolAccountForAdmin,
    fees,
  };
};

const getTokenAddress = async (mint, pubkey, config) => {
  const is22 = await checkIsToken2022(mint, config);
  let tokenAccount;

  if (is22) {
    tokenAccount = getAssociatedTokenAddressSync(
      mint,
      pubkey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
  } else {
    tokenAccount = getAssociatedTokenAddressSync(mint, pubkey);
  }
  const tokenSource = is22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  return { tokenAccount, tokenSource, is22 };
};

const checkBaseNativeForUser = async (mint, swapper, amount, config) => {
  const instructions = [];

  if (mint.toBase58() === NATIVE_MINT.toBase58()) {
    const tokenSourceForSwapper = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      swapper.publicKey
    );

    try {
      const account = await getAccount(config.connection, tokenSourceForSwapper);
      if (Number(account.amount) < Number(amount) * 10 ** 9) {
        const solTransIxn = SystemProgram.transfer({
          fromPubkey: swapper.publicKey,
          toPubkey: tokenSourceForSwapper,
          lamports: Number(amount) * 10 ** 9 - Number(account.amount),
        });
        instructions.push(solTransIxn);
      }
    } catch (err) {
      const createWsolAccountIxn = createAssociatedTokenAccountInstruction(
        swapper.publicKey,
        tokenSourceForSwapper,
        swapper.publicKey,
        NATIVE_MINT
      );
      instructions.push(createWsolAccountIxn);
      const solTransIxn = SystemProgram.transfer({
        fromPubkey: swapper.publicKey,
        toPubkey: tokenSourceForSwapper,
        lamports: new BN(String(Number(amount) * 10 ** 9)),
      });
      instructions.push(solTransIxn);
    }
    const syncNativeInx = createSyncNativeInstruction(tokenSourceForSwapper);
    instructions.push(syncNativeInx);
  }
  return instructions;
};

const checkIsToken2022 = async (mint, config) => {
  try {
    await getMint(config.connection, mint);
    return false;
  } catch {
    return true;
  }
};

const checkQuoteForUser = async (mint, pubkey, tokenSourceForSwapper, config) => {
  const instructions = [];
  const sourceIs22 = await checkIsToken2022(mint, config);

  try {
    if (sourceIs22) {
      await getAccount(
        config.connection,
        tokenSourceForSwapper,
        null,
        TOKEN_2022_PROGRAM_ID
      );
    } else {
      await getAccount(config.connection, tokenSourceForSwapper);
    }
  } catch {
    let createAccountInstruction;
    if (sourceIs22) {
      createAccountInstruction = createAssociatedTokenAccountInstruction(
        pubkey,
        tokenSourceForSwapper,
        pubkey,
        mint,
        TOKEN_2022_PROGRAM_ID
      );
    } else {
      createAccountInstruction = createAssociatedTokenAccountInstruction(
        pubkey,
        tokenSourceForSwapper,
        pubkey,
        mint
      );
    }
    instructions.push(createAccountInstruction);
  }
  return instructions;
};

const checkQuoteNativeForUser = async (mint, pubkey) => {
  const instructions = [];
  if (mint.toBase58() === NATIVE_MINT.toBase58()) {
    const tokenDestinationForSwapper = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      pubkey
    );
    const closeAccountIxn = createCloseAccountInstruction(
      tokenDestinationForSwapper,
      pubkey,
      pubkey
    );
    instructions.push(closeAccountIxn);
  }

  return instructions;
};

const changeToBN = async (amount, mint, config) => {
  let tokenMint;
  try {
    tokenMint = await getMint(config.connection, mint);
  } catch (error) {
    tokenMint = await getMint(config.connection, mint, null, TOKEN_2022_PROGRAM_ID);
  }

  const resultAmount = new BN(
    String(Math.floor(amount * 10 ** tokenMint.decimals))
  );
  return resultAmount;
};

const calculateFee = (tokenAmount, feeNumerator, feeDenominator) => {
  if (feeNumerator == 0 || tokenAmount == 0) {
    return 0;
  } else {
    let fee = (tokenAmount * feeNumerator) / feeDenominator;
    if (fee == 0) {
      return 1;
    } else {
      return fee;
    }
  }
};

const tradingFee = async (tradingTokens, fees) => {
  return await calculateFee(
    tradingTokens,
    fees.tradeFeeNumerator,
    fees.tradeFeeDenominator
  );
};

const ownerTradingFee = async (tradingTokens, fees) => {
  return await calculateFee(
    tradingTokens,
    fees.ownerTradeFeeNumerator,
    fees.ownerTradeFeeDenominator
  );
};

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
    const tradeFee = await tradingFee(amountIn, fees);
    const ownerFee = await ownerTradingFee(amountIn, fees);

    const total_fees = tradeFee + ownerFee;
    const sourceAmountLessFees = amountIn - total_fees;

    const [tokenAPoolAccountInfo, tokenBPoolAccountInfo] = await Promise.all([
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
      ),
    ]);
    const tokenAPoolBalance = tokenAPoolAccountInfo.amount.toString();
    const tokenBPoolBalance = tokenBPoolAccountInfo.amount.toString();

    if (Number(tokenAPoolBalance) / 10 <= sourceAmountLessFees) {
      return 0;
    }

    const invariant = Number(tokenAPoolBalance) * Number(tokenBPoolBalance);
    const newSwapSourceAmount =
      Number(tokenAPoolBalance) + sourceAmountLessFees;
    const newSwapDestinationAmount = invariant / newSwapSourceAmount;
    const destinationAmountSwapped =
      Number(tokenBPoolBalance) - newSwapDestinationAmount;

    return destinationAmountSwapped;
  } catch (e) {
    console.log(e);
    return 0;
  }
};

exports.swapWithPrivateKey = async (
  config,
  baseToken,
  quoteToken,
  amountIn
) => {
  try {
    const provider = new AnchorProvider(config.connection, config.swapper, {});
    const program = new Program(IDL, config.programId, provider);

    const { mintA, mintB, isBaseSmall } = getMintPubKey(baseToken, quoteToken);

    const aMintPubkey = isBaseSmall ? mintA : mintB;
    const bMintPubkey = isBaseSmall ? mintB : mintA;
    const { pda, swapPair } = await getProgramData(aMintPubkey, bMintPubkey, config);

    const {
      tokenAAccount,
      tokenBAccount,
      poolMintPubkey,
      poolAccountForAdmin,
      fees,
    } = await getPairData(swapPair, program);

    const aTokenData = await getTokenAddress(mintA, config.swapper.publicKey, config);

    const aTokenUser = aTokenData.tokenAccount;
    const aTokenSource = aTokenData.tokenSource;
    const aTokenIs = aTokenData.is22;

    const bTokenData = await getTokenAddress(mintB, config.swapper.publicKey, config);
    const bTokenUser = bTokenData.tokenAccount;
    const bTokenSource = aTokenData.tokenSource;
    const bTokenIs = aTokenData.is22;

    const aTokenPDA = isBaseSmall ? tokenAAccount : tokenBAccount;
    const bTokenPDA = isBaseSmall ? tokenBAccount : tokenAAccount;

    const addInstruction1 = await checkBaseNativeForUser(
      mintA,
      config.swapper,
      amountIn,
      config
    );

    const addInstruction2 = await checkQuoteForUser(
      mintB,
      config.swapper.publicKey,
      bTokenUser,
      config
    );

    const amountOut = await getQuote(
      aTokenIs,
      bTokenIs,
      aTokenPDA,
      bTokenPDA,
      amountIn,
      fees,
      config
    );

    if (amountOut <= 0) {
      console.error(`amountOut is ${amountOut}`);
      return;
    }

    const _avPercent = 100 - config.slippage;
    const _amount = (Number(amountOut) * _avPercent) / 100;

    const sendAmount = await changeToBN(amountIn, aMintPubkey, config);
    const receiveAmount = await changeToBN(_amount, bMintPubkey, config);

    const addInstruction3 = await program.methods
      .swapExactIn(sendAmount, receiveAmount)
      .accounts({
        swapper: config.swapper.publicKey,
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const addInstruction4 = await checkQuoteNativeForUser(
      mintB,
      config.swapper.publicKey
    );

    const instructions = [
      ...addInstruction1,
      ...addInstruction2,
      addInstruction3,
      ...addInstruction4,
    ];
    const { blockhash } = await config.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: config.swapper.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);
    const signedTxn = await config.swapper.signTransaction(transaction);
    const tx = await config.connection.sendTransaction(signedTxn, {
      skipPreflight: true,
    });

    return tx;
  } catch (error) {
    console.log(error, "error");
  }
};
