import { sendBtc } from '@rgbpp-sdk/btc';
import { BtcAssetsApiError } from '@rgbpp-sdk/service';
import { getDeployVariables, writeStepLog, getFastestFeeRate } from "./config"

const prepareUtxo = async () => {
  const { source, btcAddress, service, btcKeyPair } = getDeployVariables()
  const feeRate = await getFastestFeeRate()
  console.log("feeRate = ", feeRate)

  const balance = await service.getBtcBalance(btcAddress!)
  console.log("balance = ", balance)

  // Send BTC tx
  const psbt = await sendBtc({
    from: btcAddress!,
    tos: [
      {
        address: btcAddress!,
        value: 546,
        minUtxoSatoshi: 546
      },
    ],
    feeRate: feeRate, // optional, default to 1 sat/vbyte
    source,
  });

  // Sign & finalize inputs
  psbt.signAllInputs(btcKeyPair);
  psbt.finalizeAllInputs();

  // Broadcast transaction
  const tx = psbt.extractTransaction();
  const { txid: btcTxId } = await service.sendBtcTransaction(tx.toHex());
  console.log('btcTxId = ', btcTxId);

  writeStepLog('0', {
    txid: btcTxId,
    index: 0
  })
  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx to be confirmed');
      const tx = await service.getBtcTransaction(btcTxId);
      if(tx.status.confirmed) {
        clearInterval(interval);
        console.info(`Utxo is confirmed ${btcTxId}:0`);
      }
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};

prepareUtxo()

