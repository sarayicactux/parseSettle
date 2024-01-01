const { getAgents } = require("./agents");
const deletePostponement = async () => {
  await transactions.updateMany(
    {
      $or: [
        {
          status: "postponed",
          postponedReasons: ["card"]
        },
        {
          status: "postponed",
          postponedReasons: []
        }
      ]
    },
    {
      $unset: {
        status: "",
        postponedReasons: "",
      },
    }
  );
};
const checkCards = async () => {
  console.log("checking cards ...");

  await deletePostponement();
  // return;

  const settlingTxns = await require("./txns").getSettlingTxns();
  console.log(settlingTxns);

  // get list of usernames to be checked
  let list = Array.from(
    new Set(
      settlingTxns
        .map((t) =>
          [t.owner, t.transaction_type != 1 ? t.member : "", t.transaction_type == 2 ? t.member : t.acceptor].filter(
            (m) => ("" + m).match(/^(\+98|0098|98|0)?9\d{9}$/g)
          )
        )
        .flat()
    )
  );
  let postponed = [];
  for (const item of list) {
    for (let username of [item, ...(await getAgents(item))]) {
      if (username == 0) {
        username = "parsecard";
      }
      const card = await cards.findOne({
        username,
        type: "1",
        status: "2",
        card_number: /^502229/,
      });
      let cardStatus = {};
      if (card && card.card_number) {
        cardStatus = await require("./get-bpi-card-st")(card.card_number);
      }

      require("fs").appendFileSync("./card-status.json", JSON.stringify(cardStatus, null, 4), "utf-8");
      const cardState = cardStatus.Data ? cardStatus.Data.length ? cardStatus.Data[0].CardState : 0 : 0;
      console.log(username, cardState);
      if (username != "parsecard" && username != "timetakhfif" && cardState != 1 && cardState != 4) {
        postponed.push(item);
        break;
      }
    }
    // console.log(item);
  }

  for (const txn of settlingTxns) {
    if (
      [
        4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33,
      ].includes(+txn.transaction_type) &&
      txn.member
    )
      continue;
    if (
      postponed.includes(txn.owner) ||
      postponed.includes(txn.member) ||
      postponed.includes(txn.acceptor) ||
      !txn.member ||
      !+txn.amount
    )
      await transactions.updateOne(
        { _id: txn._id },
        {
          $set: {
            status: "postponed",
            postponedReasons: [...(txn.postponedReasons || []), "card"],
          },
        }
      );
  }
  console.log("directs...");
  for (const txn of settlingTxns.filter((txn) =>
    [
      4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33,
    ].includes(+txn.transaction_type)
  )) {
    const card = await cards.findOne({
      username: txn.member,
      type: "1",
      status: "2",
      card_number: /^502229/,
    });
    let cardStatus = {};
    if (card && card.card_number) {
      cardStatus = await require("./get-bpi-card-st")(card.card_number);
      require("fs").appendFileSync("./card-status.json", JSON.stringify(cardStatus, null, 4), "utf-8");
    }
    // console.log(cardStatus);
    const cardState = cardStatus.Data
      ? cardStatus.Data.length
        ? cardStatus.Data[0].CardState
        : 0
      : 0;
    console.log(txn.member, cardState);
    if (cardState != 1 && cardState != 4) {
      console.log("cardState != 1 && cardState != 4", txn._id)
      await transactions.updateOne(
        { _id: txn._id },
        {
          $set: {
            status: "postponed",
            postponedReasons: [...(txn.postponedReasons || []), "card"],
          },
        }
      );
    }
  }
  console.log("done.");
};

module.exports = checkCards;
