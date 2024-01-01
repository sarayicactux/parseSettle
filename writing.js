#!/usr/bin/node
const fs = require("fs")
  const run = async () => {
    try {
      require("fs").writeFileSync(__dirname + "/myCronjob.log", "ruuuuuuuuuuuuuunnnnnnnnnnnnnnn!!!!!!!!!!!!!1111111");
    } catch (error) {
      require("fs").writeFileSync(
        __dirname + "/errorssssss.log",
        JSON.stringify(error)
      );
    }
  };
module.exports = run;
