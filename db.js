const { MongoClient } = require("mongodb");
// Replace the uri string with your MongoDB deployment's connection string.
const uri = "mongodb://admin:J74X9w$vmz^f@localhost:27017";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const open = async () => {
  try {
    await client.connect();
    global.database = client.db("admin");
    const colls = [
      { key: "general", value: "general" },
      { key: "members", value: "Members" },
      { key: "Members", value: "Members" },
      { key: "agents", value: "Agents" },
      { key: "totalAgents", value: "total_agency" },
      { key: "partAgents", value: "part_agent" },
      { key: "acceptors", value: "acceptor" },
      { key: "acceptorClubs", value: "acceptor_club" },
      { key: "memberClubs", value: "member_club" },
      { key: "psps", value: "psp" },
      { key: "marketers", value: "marketer" },
      { key: "suppliers", value: "supplier" },
      { key: "serviceAgents", value: "serviceAgents" },
      { key: "cards", value: "member_bank_card" },
      { key: "transactions", value: "transactions" },
      { key: "sharings", value: "sharings" },
      { key: "transactionLogs", value: "transactionLogs" },
      { key: "installments", value: "installments" },
      { key: "installmentsTest", value: "installments_test" },
      { key: "insuranceTest", value: "insurance_test" },
      { key: "insurance", value: "insurance" },
    ];
    for (const coll of colls)
      global[coll.key] = database.collection(coll.value);

    global.blacklist = (await general.findOne({})).transactions.blacklist;
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
};
const close = async () => {
  await client.close();
};

module.exports.open = open;
module.exports.close = close;
