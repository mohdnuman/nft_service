const config = require("./config.json");
const Web3 = require("web3");
const mongoose = require("mongoose");
let { NftUserModel, EthereumModel } = require("./models.js");
const axios = require("axios");
const erc721 = require("./erc721.json");
var converter = require("hex2dec");
const abi = [
  {
    constant: true,
    inputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

async function getWeb3Instance() {
  return new Promise(async (resolve, reject) => {
    try {
      resolve(new Web3(new Web3.providers.HttpProvider(config.geth.url)));
    } catch (error) {
      reject(error);
    }
  });
}

async function removeDuplicates(raw_batch, unique_field) {
  return new Promise(async (resolve, reject) => {
    try {
      const unique = [...new Set(raw_batch.map((item) => item[unique_field]))];
      resolve(unique);
    } catch (error) {
      reject(error);
    }
  });
}

async function check721(contractAddress) {
  return new Promise(async (resolve, reject) => {
    try {
      if (contractAddress == null) resolve(false);
      //   console.log(contractAddress);
      var web3 = await getWeb3Instance();
      let contract = new web3.eth.Contract(abi, contractAddress);
      let is721 = await contract.methods.supportsInterface("0x80ac58cd").call();

      resolve(is721);
    } catch (error) {
      resolve(false);
    }
  });
}

async function checkTransfer(logs) {
  return new Promise(async (resolve, reject) => {
    try {
      var transferLogs = [];
      for (let i = 0; i < logs.length; i++) {
        if (
          logs[i].topics[0] ==
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ) {
          transferLogs.push(logs[i]);
        }
      }
      resolve(transferLogs);
    } catch (error) {
      reject(error);
    }
  });
}

async function getNftData(logs) {
  return new Promise(async (resolve, reject) => {
    try {
      let dataObjects = [];
      for (let i = 0; i < logs.length; i++) {
        var web3 = await getWeb3Instance();
        var contractAddress = logs[i].address;
        var contract = new web3.eth.Contract(erc721, contractAddress);
        if (logs[i].topics[3] == undefined) {
          continue;
        }
        var tokenId = converter.hexToDec(logs[i].topics[3]);
        tokenId = parseInt(tokenId);
        var user = logs[i].topics[2];
        user = '0x'+user.slice(26);
        var owner = await contract.methods.ownerOf(tokenId).call();
        if (owner.toLowerCase() != user.toLowerCase()) {
          continue;
        }
        var collectionName = await contract.methods.name().call();

        // console.log(contractAddress);
        // let response;
        // try {
        //   const options = {
        //     method: "GET",
        //     url: `https://deep-index.moralis.io/api/v2/nft/${contractAddress}/${tokenId}`,
        //     params: { chain: "eth", format: "decimal" },
        //     headers: {
        //       accept: "application/json",
        //       "X-API-Key":
        //         "89QleVHymuDXy7Iqdz3aMSplpFlh7m6TOsK57YiwtpRLS8pUWAwCCBqvDhrP53wg",
        //     },
        //   };
        //   response = await axios.request(options);
        // } catch (err) {
        //   console.log(err);
        //   resolve(null);
        // }
        // var metadata = JSON.parse(response.data.metadata);
        // var image = metadata.image;
        var dataObject = {
          userAddress: user,
          contractAddress: contractAddress,
          collectionName: collectionName,
          tokenId: tokenId,
          image: null,
        };
        dataObjects.push(dataObject);
      }
      resolve(dataObjects);
    } catch (error) {
      reject(error);
    }
  });
}
(async () => {
  try {
    var latestBlockNumber = 0;
    var isProcessing = true;
    var startBlock = config.startBlock;
    var endBlock = config.endBlock;
    var raw_batch = [];
    var transactionReceipts = [];
    var transactionReceiptCalls = [];
    var startDate = Date.now();
    var latestBlockData, latestBlockNumber;
    var web3 = await getWeb3Instance();
    var contractChecks = [];
    var checkContractCalls = [];
    var checkTransferCalls = [];
    var transferLogs = [];
    var getNftDataCalls = [];
    var NftData = [];
    var operations = [];
    var start;
    while (true) {
      if (isProcessing) {
        for (var iterBlock = startBlock; iterBlock <= endBlock; iterBlock++) {
          start = Date.now();
          startDate = Date.now();

          if (config.stopBlock != "" && iterBlock >= config.stopBlock) {
            console.log({ status: "process completed" });
            process.exit(1);
          }
          raw_batch = await EthereumModel.find(
            { blockNumber: iterBlock },
            "transactionHash -_id"
          );
          batch = await removeDuplicates(raw_batch, "transactionHash");

          transactionReceiptCalls = [];
          batch.forEach((transactionHash) => {
            transactionReceiptCalls.push(
              web3.eth.getTransactionReceipt(transactionHash)
            );
          });
          transactionReceipts = await Promise.all(transactionReceiptCalls);

          checkContractCalls = [];
          transactionReceipts.forEach((transactionReceipt) => {
            checkContractCalls.push(check721(transactionReceipt.to));
          });
          contractChecks = await Promise.all(checkContractCalls);

          checkTransferCalls = [];
          for (let i = 0; i < transactionReceipts.length; i++) {
            if (contractChecks[i]) {
              checkTransferCalls.push(
                checkTransfer(transactionReceipts[i].logs)
              );
            }
          }
          transferLogs = await Promise.all(checkTransferCalls);

          getNftDataCalls = [];
          transferLogs.forEach((logs) => {
            getNftDataCalls.push(getNftData(logs));
          });
          NftData = await Promise.all(getNftDataCalls);

          NftData.forEach((Nft_user) => {
            if (Nft_user != null) {
              for (let i = 0; i < Nft_user.length; i++) {
                operations.push({
                  updateOne: {
                    filter: { userAddress: Nft_user[i].userAddress },
                    update: Nft_user[i],
                    upsert: true,
                  },
                });
              }
            }
          });
          var bulkReceipt = await NftUserModel.bulkWrite(operations, {
            ordered: false,
          });
          console.log(bulkReceipt);
          var consoleObject = {
            seconds: Date.now() - start,
            blockNumber: iterBlock,
          };
          consoleObject = JSON.stringify(consoleObject);
          console.log(consoleObject);
          // console.log(Date.now() - start, "seconds taken to process block no.",blockNumber);
          // console.log(bulkReceipt.result.nModified, "documents modified");
          // console.log(bulkReceipt.result.nUpserted, "documents upserted");
        }
      }
      await new Promise((res) => setTimeout(res, config.sleepTime));
      latestBlockData = await EthereumModel.find({})
        .sort({ blockNumber: -1 })
        .limit(1);
      latestBlockNumber = latestBlockData[0].blockNumber;
      if (endBlock < latestBlockNumber) {
        startBlock = endBlock + 1;
        endBlock = latestBlockNumber;
        isProcessing = true;
      } else {
        isProcessing = false;
      }
    }
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
