const { PublicKey, Connection } = require("@solana/web3.js");
const { swapWithPrivateKey, getAmount } = require("./lib");

class BioSwap {

  config = {
    programId: new PublicKey("CxwNsCSB97vRfumidQkERe6UEBAxbconoDXdET5WGBiA"),
    connection: new Connection("https://api.mainnet-beta.solana.com"),
    RANDOM_WALLET_ADDRESS: 'FUg6vdQyauSKCWffzyj8H1k8snSao4TC3oKqUFoRDZQE',
    slippage: 3,
  }

  constructor (url, slippage) {
    if (url) {
      this.config.connection = new Connection(url);
    }
    if (slippage) {
      this.config.slippage = slippage;
    }
  }

  swap = async (pubkey, fromToken, toToken, amount) => {
    const tx = await swapWithPrivateKey(
      this.config,
      pubkey,
      fromToken,
      toToken,
      amount
    );
    return tx;
  };

  getSwappedAmount = async (pubkey, fromToken, toToken, amount) => {
    const amountOut = await getAmount(
      this.config,
      pubkey,
      fromToken,
      toToken,
      amount
    );
    return amountOut;
  };

}

module.exports = BioSwap;
