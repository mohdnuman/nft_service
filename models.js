const mongoose = require("mongoose");
const db1 = mongoose.createConnection(
  "mongodb+srv://mohdnuman:numaniscool@sandbox.7miwi8d.mongodb.net/?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const addressConnection = mongoose.createConnection(
  "mongodb://sam:samiscool@34.132.190.198:27017/address?authSource=admin",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

db1.on("connected", function () {
  console.log(`MongoDB :: connected ${this.name}`);
});

addressConnection.on("connected", function () {
  console.log(`MongoDB :: connected ${this.name}`);
});

const NftUser = new mongoose.Schema({
  userAddress: {
    type: String,
  },
  contractAddress:{
    type:String,
  },
  collectionName:{
    type:String,
  },
  tokenId:{
    type:Number,
  },
  image:{
    type:String,
  },
});

const ethereumSchema = new mongoose.Schema({
  address: {
    type: String,
  },
  blockNumber: {
    type: Number,
  },
  blockTimeStamp: {
    type: Number,
  },
  transactionHash: {
    type: String,
  },
  transactionIndex: {
    type: String,
  },
});

const EthereumModel = addressConnection.model("ethereum", ethereumSchema);
const NftUserModel = db1.model("nft_user", NftUser);

module.exports = {
  NftUserModel,
  EthereumModel,
};
