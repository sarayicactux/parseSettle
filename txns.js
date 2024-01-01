const { ObjectId } = require("bson");
const moment = require("moment-jalaali");
const getSettlingTxns = async () => {
  const query = {
    $and: [
      { status: { $nin: ["postponed", "settled", "fined"] } },
      { date: { $lt: moment().format("jYYYY/jMM/jDD") } },
      { member: { $ne: '09811234018' } },
      {
        owner: {
          $nin: blacklist,
        },
      },
    ],
  };

  //   const query = {
  //      _id: {
  //       $in: [ObjectId("617c30e3416ee16024711b45"), ObjectId("617c30e3416ee16024711b48"), ObjectId("617c30e3416ee16024711b42"), ObjectId("617c30e2416ee16024711b3f"), ObjectId("617c30e2416ee16024711b3c"),
  //       ],
  //      },
  //   };
  // const query = {owner : "09109109020", date : "1400/08/07"}
  return await transactions.find(query).toArray();
};

module.exports.getSettlingTxns = getSettlingTxns;
