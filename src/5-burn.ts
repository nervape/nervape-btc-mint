import { sendBtc, sendUtxos, AddressType } from '@rgbpp-sdk/btc';
import { BtcAssetsApiError } from '@rgbpp-sdk/service';
import { getDeployVariables, writeStepLog, getFastestFeeRate } from "./config"


// last live tx
const txid = '95b3ec73db3bd9e6697b9e1e2bccc9c535fd1eb7d2ccea615f0c082ba89f004d'

const burnUtxo = async () => {
  const { source, btcAddress, service, btcKeyPair } = getDeployVariables()
  const feeRate = await getFastestFeeRate()
  console.log("feeRate = ", feeRate)

  const balance = await service.getBtcBalance(btcAddress!)
  console.log("balance = ", balance)

  const btcDeadAddress = '1BitcoinEaterAddressDontSendf59kuE'

  const utxo = await service.getBtcTransaction(txid)

  // Send BTC tx
  const psbt = await sendUtxos({
    from: btcAddress!,
    changeAddress: btcAddress!,
    inputs: [
      {
        txid: txid,
        vout: 1,
        value: utxo.vout[1].value,
        scriptPk: utxo.vout[1].scriptpubkey,
        addressType: AddressType.P2WPKH,
        address: btcAddress!,
      },
      {
        txid: txid,
        vout: utxo.vout.length - 1,
        value: utxo.vout[utxo.vout.length - 1].value,
        scriptPk: utxo.vout[utxo.vout.length - 1].scriptpubkey,
        addressType: AddressType.P2WPKH,
        address: btcAddress!,
      }
    ],
    outputs: [
      {
        address: btcDeadAddress,
        value: 546,
        minUtxoSatoshi: 546
      }
    ],
    feeRate: feeRate, // optional, default to 1 sat/vbyte
    source,
  });

  // Sign & finalize inputs
  psbt.signAllInputs(btcKeyPair);
  psbt.finalizeAllInputs();

  // // Broadcast transaction
  const tx = psbt.extractTransaction();

  const { txid: btcTxId } = await service.sendBtcTransaction(tx.toHex());
  console.log('btcTxId = ', btcTxId);
  // burn txid =  e2c60bc910e662e55e6ea1cd1f564ace6c6f60ecb063e8b7fba5e50603a92346
  // https://mempool.space/tx/e2c60bc910e662e55e6ea1cd1f564ace6c6f60ecb063e8b7fba5e50603a92346
};

// burn rgb++ cluster utxo to prevent mint
// burnUtxo()
