const { PublicKey, Connection, Keypair } = require("@solana/web3.js");
const { swapWithPrivateKey } = require("./lib");
const { Wallet } = require("@coral-xyz/anchor");
const bs58 = require('bs58');

class BioSwap {

  config = {
    programId: new PublicKey("CxwNsCSB97vRfumidQkERe6UEBAxbconoDXdET5WGBiA"),
    connection: new Connection("https://api.mainnet-beta.solana.com"),
    slippage: 3,
    swapper: null
  }

  constructor (url, wallet) {
    if (url) {
      this.config.connection = new Connection(url);
    }

    if (typeof(wallet) === "string") {
      let adminKey
      if (wallet.includes("[")) {
        adminKey = eval(wallet);
      } else {
        adminKey = bs58.decode(wallet);
      }
      const keypair = Keypair.fromSecretKey(Uint8Array.from(adminKey));  
      this.config.swapper = new Wallet(keypair);
    } else if (typeof(wallet) === "object") {
      if(wallet.publicKey) {
        this.config.swapper = wallet
      } else {
        const adminKey = eval(JSON.stringify(wallet));
        const keypair = Keypair.fromSecretKey(Uint8Array.from(adminKey));  
        this.config.swapper = new Wallet(keypair);
      }
    } else {
      console.error("Wrong Signer")
    }
  }

  swap = async (fromToken, toToken, amount) => {
    if (this.config.swapper) {
      const tx = await swapWithPrivateKey(
        this.config,
        fromToken,
        toToken,
        amount
      );
      return tx;
    } else {
      throw new Error("No wallet provided");
    }
  };

}

module.exports = BioSwap;
