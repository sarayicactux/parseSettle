let accessLevels = [
  "",
  "total_agency",
  "part_agent",
  "acceptor",
  "acceptor_club",
  "member_club",
  "psp",
  "marketer",
  "supplier",
  "",
  "serviceAgents",
  "salesManager",
];
const getOrganizationLoans = async (username) => {
  const { MongoClient } = require("mongodb");
  const uri = "mongodb://admin:J74X9w$vmz^f@localhost:27017";
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db("admin");
  let user, organizationLoans;
  const agent = await db.collection("Agents").findOne({ mobile: username });
  if (agent)
    user = await db
      .collection(accessLevels[agent.access_level])
      .findOne({ mobile: username });
  if (!user) user = await db.collection("Members").findOne({ username });
  while (true) {
    if (!user) break;
    if (user.mobile == user.registrant) break;
    let agent;
    organizationLoans = await db
      .collection("organizationLoans")
      .findOne({ username: user.registrant });
    if (!organizationLoans) {
      agent = await db
        .collection("Agents")
        .findOne({ username: user.registrant });
    } else {
      break;
    }
    if (!agent) break;
    user = await db
      .collection(accessLevels[agent.access_level])
      .findOne({ mobile: user.registrant });
  }
  return organizationLoans;
};
const getOrganizationLoans = async () => {
  const agents = await getOrganizationLoans("09332255768");
};
module.exports = {
  getOrganizationLoans,
};

// const fs = require("fs");
// (async () => {
//     // const files = await fs.readdirSync(__dirname + "/logs");
//     let fileData = "erfan\r\n";
//             // for (const file of files) {
//             //     (async() => {
//             //         if(file.match(/\.json$/gi)){
//             //             console.log(file);
//             //             fileData = await fs.readFileSync(__dirname + "/logs/" + file, "utf-8");
//             //             await fs.appendFileSync(__dirname + "/read-json-data.json", fileData);
//             //         }
//             //     })()
//             // }
//             await fs.appendFileSync(__dirname + "/read-json-data.log", fileData);
//     // console.log(fileData);
//     // console.log(files);
// })()
