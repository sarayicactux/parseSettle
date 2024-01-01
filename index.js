#!/usr/bin/node
require("./init");
const { open, close } = require("./db");
const checkCards = require("./check-cards");
const settle = require("./settle");
const isSettledToday = require("./is-settled-today");

const run = async () => {
  try {
    await open();
    if (await isSettledToday()) return;
    if (require("fs").readFileSync(__dirname + "/lock.json", "utf8") == "true")
      process.exit(0);
    require("fs").writeFileSync(__dirname + "/lock.json", JSON.stringify(true));
    // for (const txn of await require("./txns").getSettlingTxns())
    //   console.log(txn.member, await require("./agents").getAgents(txn.member));
    await checkCards();
    await settle();
  } catch (error) {
    console.log("Error----------------:  ", error.message);
    require("fs").appendFileSync(
      __dirname + "/error.log",
      JSON.stringify(error)
    );
  } finally {
    await close();
    require("fs").writeFileSync(
      __dirname + "/lock.json",
      JSON.stringify(false)
    );
  }
};
run()
// module.exports = run;
