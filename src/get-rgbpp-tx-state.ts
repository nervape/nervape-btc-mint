import {
  getDeployVariables
} from "./config"

const { service } = getDeployVariables()

const txid = process.argv[2]

if (txid === undefined) throw new Error("txid required");
if (txid.length !== 64) throw new Error("Invalid txid length");

const getTxState = async () => {
  const { state, failedReason } = await service.getRgbppTransactionState(txid)
  console.log("rgbpp state = ", state, failedReason)
}

getTxState()