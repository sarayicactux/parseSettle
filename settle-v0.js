const moment = require("moment-jalaali");
const chgBpi = require("./chg-bpi");
const getBpiChg = require("./get-bpi-chg");
const { getSettlingTxns } = require("./txns");
const { getAgents } = require("./agents");
module.exports = async () => {
  console.log("settling...");
  const txns = await getSettlingTxns();
  let shares = [];
  for (let i = 0; txns[i]; i++) {
    txns[i].topAgents = await getAgents(txns[i].member);

    if (!txns[i].income && +txns[i].transaction_type == 1) {
      txns[i].income = "membership";
      const {
        transactions: { shippingPrices },
      } = await general.findOne({});
      for (const topAgent of txns[i].topAgents) {
        if (shippingPrices.map((s) => s.username).includes(topAgent)) {
          if (
            +txns[i].amount >
            +shippingPrices.filter((s) => s.username == topAgent)[0].value
          )
            txns[i].amount =
              +txns[i].amount -
              shippingPrices.filter((s) => s.username == topAgent)[0].value;
          break;
        }
      }
    }
    if ([7, 11].includes(+txns[i].transaction_type)) {
      txns.push({
        ...txns[i],
        transaction_type: "4",
        amount: (txns[i].amount * 0.7).toFixed(0),
      });
      txns.push({
        ...txns[i],
        transaction_type: "1",
        amount: (txns[i].amount * 0.3).toFixed(0),
        income: "buying",
      });
      txns.push({
        ...txns[i],
        transaction_type: "1",
        amount: (txns[i].amount * 0.3).toFixed(0),
        member: txns[i].acceptor,
        income: "selling",
      });
      txns.splice(i, 1);
    }
    if (
      [10, 13, 17, 19, 22, 24, 27, 29, 32, 34].includes(
        +txns[i].transaction_type
      )
    ) {
      txns.push({ ...txns[i], transaction_type: "1", income: "buying" });
      txns.push({
        ...txns[i],
        transaction_type: "1",
        member: txns[i].acceptor,
        income: "selling",
      });
      txns.splice(i, 1);
    }
  }
  for (const txn of txns) {
    let {
      transaction_type: type,
      member: username,
      amount,
      income,
      topAgents,
      _id: refId,
    } = txn;
    if (
      [
        4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33,
      ].includes(+type)
    )
      type = 4;
    switch (+type) {
      case 1:
        let sharing;
        for (const topAgent of topAgents) {
          sharing = await sharings.findOne({ income, username: topAgent });
          if (sharing) break;
        }
        if (!sharing)
          sharing = await sharings.findOne({ income, username: "parsecard" });
        console.log(sharing.income, username);
        var sum = 0,
          level,
          member,
          prevUsername = username,
          registrant,
          referee;
        if (income == "selling") {
          const acceptor = await acceptors.findOne({ mobile: username });
          username = acceptor.registrant;
          referee = acceptor.reagent || null;
        } else {
          const member = await members.findOne({ mobile: username });
          username = member.registrant;
          referee = member.reagent || null;
        }
        let txnLevel = 0;
        while (true) {
          if (prevUsername == referee) referee = null;
          const agent = await agents.findOne({ username });
          registrant = await database
            .collection(agent ? accessLevels[+agent.access_level] : "test")
            .findOne({ mobile: username });
          const card = await cards.findOne({
            username,
            type: "1",
            status: "2",
          });
          const cardNumber = card && card.card_number;
          const refereeCard = await cards.findOne({
            username: referee || null,
            type: "1",
            status: "2",
          });
          const refereeCardNumber = refereeCard && refereeCard.card_number;
          const { levels } = (await general.findOne({})).sharings;
          for (const key of Object.keys(levels)) {
            if (
              levels[key].map((l) => +l).includes(agent && +agent.access_level)
            ) {
              level = key;
              break;
            }
            level = null;
          }
          const share = Math.max(sharing[level] - sum, 0);
          sum += !!share && share;
          // console.log(+agent.access_level, level, sharing[level], share, sum, cardNumber);
          if (share || username == "parsecard") {
            if (refereeCardNumber) {
              shares.push({
                account: refereeCardNumber,
                amount:
                  username == "parsecard"
                    ? (0.05 * +shares[shares.length - 1].amount).toFixed()
                    : (
                        ((!txnLevel ? sharing["referee"] : 0.05 * +share) *
                          +amount) /
                        100
                      ).toFixed(),
                refId,
              });
            }
            if (cardNumber)
              // may lead to inconsistency
              shares.push({
                account: cardNumber,
                amount: (
                  ((!txnLevel && refereeCardNumber
                    ? sharing[level] - sharing["referee"]
                    : (refereeCardNumber ? 0.95 : 1) * +share) *
                    +amount) /
                  100
                ).toFixed(),
                refId,
              });
          }
          // console.log(levels, registrant);
          if (!agent || username == registrant.registrant) break;
          prevUsername = username;
          username = registrant.registrant;
          referee = registrant.reagent || null;

          txnLevel++;
        }
        break;
      case 4:
        console.log("direct", username);
        shares.push({
          account: (
            await cards.findOne({
              username,
              type: "1",
              status: "2",
            })
          ).card_number,
          amount,
          refId,
        });
        break;
      default:
        console.log("other", type, username);
    }
  }
  console.log(shares);
  require("fs").writeFileSync(
    "./logs/shares" + moment().format("jYYYYjMMjDDHHmmss") + ".json",
    JSON.stringify(shares, null, 2)
  );
  var result = [];
  shares.reduce(function (res, value) {
    if (!res[value.account]) {
      res[value.account] = { account: value.account, amount: 0 };
      result.push(res[value.account]);
    }
    res[value.account].amount += +value.amount;
    return res;
  }, {});
  console.log(result);
  console.log(
    result.map((r) => r.account),
    result.map((r) => r.amount)
  );
  const transactionLog = {
    totalAmount: result.map((r) => r.amount).reduce((a, b) => a + b, 0),
    descriptions: result.map((r) => ({
      ...r,
      details: shares.filter((s) => s.account == r.account),
    })),
    date: moment().format("jYYYYjMMjDD"),
  };
  // let chgResult = await chgBpi(
  //   result.map((r) => r.account),
  //   result.map((r) => r.amount)
  // );
  // console.log(chgResult);
  let chgResult = {};
  if (chgResult.IsSuccess) {
    const resp = await getBpiChg(
      moment().format("YYYY/MM/DD"),
      moment().format("YYYY/MM/DD"),
      0,
      50
    );
    transactionLog.batchId = resp["Data"][0]["bonCardCharges"].pop()["BatchId"];
    for (const txn of txns) {
      await transactions.updateOne(
        { _id: txn._id },
        { $set: { status: "settled" } }
      );
    }
    await transactionLogs.insertOne(
      JSON.parse(JSON.stringify(transactionLog).replace(/account/gi, "cardPAN"))
    );
  }
  console.log(
    JSON.stringify(transactionLog, null, 2).replace(/account/gi, "cardPAN")
  );
  console.log("done!");
};
