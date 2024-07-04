import fs from "fs"
import path from 'path';
import "./config"

// testnet mint txs
// 0x6384f4070a3b4db3fb220a34930f35d5cc53c82b74cfee0443541b91afea7823
// 0x463692041a5f43fee886fd060ddf73b4459f7007d95214b5ccac424ec63a905b

// mainnet-test
// const SPORE_CODE_HASH = '0x4a4dce1df3dffff7f8b2cd7dff7303df3b6150c9788cb75dcf6747247132b9f5'


// mainnet
const SPORE_CODE_HASH = '0x4a4dce1df3dffff7f8b2cd7dff7303df3b6150c9788cb75dcf6747247132b9f5'

async function fetchSpores(txHash: string) {
  const body = JSON.stringify({ 
    "id": 2, "jsonrpc": "2.0", 
    "method": "get_transaction", 
    "params": [txHash] 
  });

  const { result } = await fetch(process.env.CKB_NODE_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }).then(res => res.json())

  const { outputs } = result.transaction
  
  let sporeIds = []
  for (let output of outputs) {
    if (!output.type) {
      continue
    }
    if (output.type.code_hash === SPORE_CODE_HASH){
      sporeIds.push(output.type.args)
    }
  }
  return sporeIds
}

async function exportSporeIds() {
  let sporeIds: any[] = []
  for(let i = 1; i <= 12; i++) {
    const { txHash } = JSON.parse(fs.readFileSync(path.join(__dirname, `../logs/mainnet/step-3-${i}-ckbtx.log`)).toString())
    console.log("fetch == ", i, txHash)
    const ids = await fetchSpores(txHash)
    sporeIds = sporeIds.concat(ids)
  }

  fs.writeFileSync(path.join(__dirname, "../logs/mainnet-sporeIds-2.json"), JSON.stringify(sporeIds))
}

exportSporeIds()
