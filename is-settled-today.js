const moment = require("moment-jalaali");
module.exports = async () => {
  return await transactionLogs.findOne({
    date: moment().format("jYYYYjMMjDD"),
  });
};
