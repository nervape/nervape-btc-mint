import {
  getDeployVariables
} from "./config"

const { ckbAddress, btcAddress, service } = getDeployVariables()

console.log("ckbAddress =", ckbAddress)
console.log("btcAddress =", btcAddress)


service.getBtcBalance(btcAddress!).then(console.log)