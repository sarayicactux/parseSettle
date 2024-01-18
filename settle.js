const moment = require("moment-jalaali");
const chgBpi = require("./chg-bpi");
const getBpiChg = require("./get-bpi-chg");
const { getSettlingTxns } = require("./txns");
const { getAgents } = require("./agents");
const { userDepit } = require("./test");

module.exports = async () => {
  try {
    console.log("settling...");
    const tmpTxns = await getSettlingTxns();
    console.log(tmpTxns, "tmpTxns");
    const txns = [];
    let shares = [];
    for (const txn of tmpTxns) {
      txn.topAgents = await getAgents(txn.member);
      if (+txn.transaction_type == 1) {
        txn.income = "membership";
        const {
          transactions: { shippingPrices },
        } = await general.findOne({});
        for (const topAgent of txn.topAgents) {
          if (shippingPrices.map((s) => s.username).includes(topAgent)) {
            if (
              +txn.amount >
              +shippingPrices.filter((s) => s.username == topAgent)[0].value
            )
              txn.amount =
                +txn.amount -
                shippingPrices.filter((s) => s.username == topAgent)[0].value;
            break;
          }
        }
        txns.push(txn);
      }
      if ([2, 7, 11].includes(+txn.transaction_type)) {
        txns.push({
          ...txn,
          transaction_type: "4",

          amount: (
            +txn.amount *
            (+txn.transaction_type == 2
              ? [undefined, null, "", " ", NaN].includes(txn.registrantDiscount)
                ? 0.35
                : +txn.registrantDiscount
              : 0.7)
          ).toFixed(0),
        });
        txns.push({
          ...txn,
          transaction_type: "1",
          amount: (+txn.amount * 0.3).toFixed(0),
          income: "buying",
        });
        txns.push({
          ...txn,
          transaction_type: "1",
          amount: (+txn.amount * 0.3).toFixed(0),
          member: txn.acceptor,
          income: "selling",
        });
      } else if (
        [10, 13, 17, 19, 22, 24, 27, 29, 32, 34].includes(+txn.transaction_type)
      ) {
        txns.push({ ...txn, transaction_type: "1", income: "buying" });
        txns.push({
          ...txn,
          transaction_type: "1",
          member: txn.acceptor,
          income: "selling",
        });
      } else if (
        [
          4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33,
          35, 37, 38,
        ].includes(+txn.transaction_type)
      ) {
        txn.transaction_type = 4;
        txns.push(txn);
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

      const memberFind = await members.findOne({ username });
      const newDetail = [];
      let userObjectCard = {};
      userObjectCard.user_fullname =
        memberFind?.first_name + " " + memberFind?.last_name;
      userObjectCard.username = username;
      userObjectCard.income = income;
      // userObjectCard.card_number = card?.card_number;
      userObjectCard.amount = amount;
      newDetail.push(userObjectCard);
      require("fs").appendFileSync(
        __dirname + "/txs.json",
        JSON.stringify(userObjectCard, null, 4)
      );

      switch (+type) {
        case 1:
          // // just for time takhfif: should be updated accordingly later
          // if (topAgents.includes("timetakhfif")) {
          //   shares.push({
          //     account: "5892101047963893",
          //     amount:
          //       +amount * (["selling", "buying"].includes(income) ? 0.5 : 1),
          //     refId,
          //   });
          //   break;
          // }
          // // ==========================================================
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
            username = acceptor?.registrant;
            referee = acceptor?.reagent || null;
          } else {
            const member = await members.findOne({ mobile: username });
            username = member?.registrant;
            referee = member?.reagent || null;
          }
          let txnLevel = 0;
          while (true) {
            if (prevUsername == referee) referee = null;
            const agent = await agents.findOne({ username });
            registrant = await database
              .collection(agent ? accessLevels[+agent.access_level] : "N/A")
              .findOne({ mobile: username });
            if (!registrant)
              registrant = await database
                .collection("GreatClub")
                .findOne({ username: { $eq: username, $in: ["timetakhfif"] } });
            const card = await cards.findOne({
              username,
              type: "1",
              status: "2",
            });
            const cardNumber =
              (card && card.card_number) ||
              (registrant && registrant.card_number);
            const refereeCard = await cards.findOne({
              username: referee || null,
              type: "1",
              status: "2",
            });
            const refereeCardNumber = refereeCard && refereeCard.card_number;
            const { levels } = (await general.findOne({})).sharings;
            for (const key of Object.keys(levels)) {
              if (
                levels[key]
                  .map((l) => +l)
                  .includes(agent && +agent.access_level)
              ) {
                level = key;
                break;
              }
              if (username == "timetakhfif") level = "council";
              else level = null;
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
            if (!agent || username == registrant?.registrant) break;
            prevUsername = username;
            username = registrant?.registrant;
            referee = registrant?.reagent || null;
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
    require("fs").writeFileSync(
      __dirname +
        "/logs/shares" +
        moment().format("jYYYYjMMjDDHHmmss") +
        ".json",
      JSON.stringify(shares, null, 2)
    );
    let newShare = [];
    shares.map((s) => {
      if (!["", " ", undefined, null, NaN].includes(s.account)) {
        newShare.push(s);
      }
    });
    shares = [...newShare];
    newShare = [];
    shares.map((s) => {
      if (!["", " ", undefined, null, NaN, 0, "0"].includes(s.amount)) {
        newShare.push(s);
      }
    });
    shares = [...newShare];
    var result = [];
    shares.reduce(function (res, value) {
      if (!res[value.account]) {
        res[value.account] = { account: value.account, amount: 0 };
        result.push(res[value.account]);
      }
      res[value.account].amount += +value.amount;
      return res;
    }, {});
    require("fs").writeFileSync(
      __dirname + "/logs/total-shares-" + new Date().getTime() + ".json",
      JSON.stringify(result, null, 2)
    );
    require("fs").writeFileSync(
      __dirname +
        "/logs/total-shares-" +
        moment().format("jYYYYjMMjDD") +
        ".json",
      JSON.stringify(result, null, 2)
    );

    console.log(
      result.map((r) => r.account),
      result.map((r) => r.amount)
    );
    require("./findMember")(result);
    for (const share of result) {
      const member = await cards.findOne({ card_number: share.account });
      require("fs").appendFileSync(
        "./shareDetails.log",
        JSON.stringify(
          {
            username: member?.username,
            name: member.first_name + " " + member.last_name,
            card_numbr: share.account,
            amount: share.amount,
          },
          null,
          4
        ),
        "utf-8"
      );
    }
    let newResult = await userDepit(result);
    console.log(newResult);
    newShare = [];
    newResult.map((s) => {
      if (!["", " ", undefined, null, NaN, 0, "0"].includes(s.amount)) {
        newShare.push(s);
      }
    });
    console.log(newResult);
    const transactionLog = {
      totalAmount: newResult.map((r) => r.oldAmount).reduce((a, b) => a + b, 0),
      descriptions: newResult.map((r) => ({
        ...r,
        details: shares
          .filter((s) => s.account == r.account)
          .map((s) => {
            delete s.depit;
            return s;
          }),
      })),
      date: moment().format("jYYYYjMMjDD"),
    };
    let chgResult = { IsSuccess: false };

    chgResult = await chgBpi(
      newShare.map((r) => r.account),
      newShare.map((r) => r.amount)
    );

    console.log(chgResult);
    require("fs").writeFileSync(
      __dirname + "/logs/chg-res-" + new Date().getTime() + ".json",
      JSON.stringify(chgResult, null, 2)
    );
    if (chgResult.IsSuccess) {
      const resp = await getBpiChg(
        moment().format("YYYY/MM/DD"),
        moment().format("YYYY/MM/DD"),
        0,
        50
      );
      transactionLog.batchId =
        resp["Data"][0]["bonCardCharges"].pop()["BatchId"];
      for (const txn of txns) {
        await transactions.updateOne(
          { _id: txn._id },
          { $set: { status: "settled" } }
        );
      }
      await transactionLogs.insertOne(
        JSON.parse(
          JSON.stringify(transactionLog).replace(/account/gi, "cardPAN")
        )
      );
      require("fs").writeFileSync(
        __dirname + "/db/transactionLogs_" + moment().format("jYYYY-jMMjDD"),
        JSON.stringify(transactionLog, null, 2).replace(
          /account/gim,
          "cardPAN"
        ),
        "utf-8"
      );
    }
    require("fs").writeFileSync(
      __dirname +
        "/logs/shares" +
        moment().format("jYYYYjMMjDDHHmmss") +
        ".json",
      JSON.stringify(shares, null, 2)
    );
    console.log(
      JSON.stringify(transactionLog, null, 2).replace(/account/gi, "cardPAN")
    );
    console.log("trrrrrrr!");
  } catch (error) {
    console.log(error);
  }
};
