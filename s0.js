const fs = require("fs");
const moment = require("moment-jalaali");
const { MongoClient, ObjectId } = require("mongodb");
const chgBpi = require("./chg-bpi");
const getBpiChg = require("./get-bpi-chg");
const bpmChgAndDchgVrAcc = require("./bpm-chg-and-dchg-vr-acc");
const sendPatSmsVr = require("./send-pat-sms-vr");

const MAX_RETRY = 10;

const connectionString = "mongodb://admin:J74X9w$vmz^f@localhost:27017";

(async () => {
  let client = await MongoClient.connect(connectionString, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  let db = client.db("admin");
  let access_levels = [
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
  ];
  return;
  try {
    await db.collection("transactions").updateMany(
      {
        status: "postponed",
        postponedReasons: "card",
      },
      {
        $pull: {
          postponedReasons: "card",
        },
      }
    );
    await db.collection("transactions").updateMany(
      {
        status: "postponed",
        postponedReasons: [],
      },
      {
        $unset: {
          status: "",
          postponedReasons: "",
        },
      }
    );
    const txns = await db
      .collection("transactions")
      .find({
        $and: [
          { status: { $nin: ["settled", "fined"] } },
          { date: { $lt: moment().format("jYYYY/jMM/jDD") } },
          {
            owner: {
              $nin: ["09120603235", "09126979399", "09125687422"],
            },
          },
        ],
      })
      .toArray();

    const list = Array.from(
      new Set(
        txns
          .map((t) =>
            [
              t.owner,
              t.transaction_type != 1 ? t.member : "",
              t.acceptor,
            ].filter((m) => ("" + m).match(/^(\+98|0098|98|0)?9\d{9}$/g))
          )
          .flat()
      )
    );
    const members = (await db.collection("Members").find({}).toArray())
      .concat(await db.collection("total_agency").find({}).toArray())
      .concat(await db.collection("part_agent").find({}).toArray())
      .concat(await db.collection("acceptor").find({}).toArray())
      .concat(await db.collection("acceptor_club").find({}).toArray())
      .concat(await db.collection("member_club").find({}).toArray())
      .concat(await db.collection("psp").find({}).toArray())
      .concat(await db.collection("marketer").find({}).toArray())
      .concat(await db.collection("supplier").find({}).toArray());
    let postponed = [];
    for (const member of members.filter((m) => list.includes(m.mobile))) {
      let card = await db
        .collection("member_bank_card")
        .findOne({ username: member.mobile, type: "1", status: "2" });
      if (!card || card?.card_number == "") {
        postponed.push(member.mobile);
        continue;
      }
      if (!member.registrant) continue;
      const agent = await db
        .collection("Agents")
        .findOne({ username: member.registrant });
      if (!agent) continue;
      const registrant = await db
        .collection(access_levels[agent.access_level])
        .findOne({ mobile: member.registrant });
      if (!registrant) continue;
      card = await db
        .collection("member_bank_card")
        .findOne({ username: registrant.mobile, type: "1", status: "2" });
      if (!card || card?.card_number == "") {
        postponed.push(member.mobile);
        continue;
      }
      const partAgent = await db
        .collection("part_agent")
        .findOne({ mobile: registrant.part_agency });
      if (!partAgent) continue;
      card = await db
        .collection("member_bank_card")
        .findOne({ username: partAgent.mobile, type: "1", status: "2" });
      if (!card || card?.card_number == "") {
        postponed.push(member.mobile);
        continue;
      }
      const totalAgent = await db
        .collection("total_agency")
        .findOne({ mobile: registrant.total_agency });
      if (!totalAgent) continue;
      card = await db
        .collection("member_bank_card")
        .findOne({ username: totalAgent.mobile, type: "1", status: "2" });
      if (!card || card?.card_number == "") {
        postponed.push(member.mobile);
        continue;
      }
    }
    postponed = Array.from(new Set(postponed));
    await db.collection("transactions").updateMany(
      {
        $or: [
          { owner: { $in: postponed } },
          { member: { $in: postponed } },
          { acceptor: { $in: postponed } },
        ],
        status: { $ne: "settled" },
        transaction_type: { $nin: ["4", "5", "6"] },
      },
      { $set: { status: "postponed" } },
      { $push: { postponedReasons: "card" } }
    );

    const logs = await db
      .collection("discount_api_logs")
      .find({
        status: { $in: ["committed", "settling"] },
        date: { $lt: moment().format("jYYYYjMMjDD") },
      })
      .toArray();
    let accounts = [];
    let amounts = [];
    let refIds = [];
    let levels = [];
    for (const log of logs) {
      let member = await db
        .collection("Members")
        .findOne({ mobile: log.mobile });
      if (!member) {
        const tmpAgent = await db
          .collection("Agents")
          .findOne({ username: log.mobile });
        if (tmpAgent) {
          member = await db
            .collection(access_levels[+tmpAgent.access_level])
            .findOne({ mobile: log.mobile });
        }
      }
      const acceptor = await db
        .collection("acceptor")
        .findOne({ terminal_number: log.terminalId });
      const memberCard = await db
        .collection("member_bank_card")
        .findOne({ username: member.mobile, type: "1", status: "2" });
      const discount = (100 - log.response.merchantShare) / 100;

      const discAmount = await require("./ins-disc-rd")(
        log.mobile,
        "" + Math.round(0.35 * discount * log.amount),
        log.refId
      );
      if (+discAmount) {
        accounts.push(memberCard.card_number);
        amounts.push(+discAmount);
        refIds.push(log.refId);
        levels.push("member");
      }
      memberParty: {
        const memberAgent = await db
          .collection("Agents")
          .findOne({ username: member.registrant });
        if (!memberAgent) break memberParty;
        let memberAgentCard = await db
          .collection("member_bank_card")
          .findOne({ username: memberAgent.username, type: "1", status: "2" });
        if (memberAgent.access_level < 3) {
          accounts.push(memberAgentCard.card_number);
          amounts.push(Math.round(0.075 * discount * log.amount));
          refIds.push(log.refId);
          levels.push("memberAgent");
        } else {
          accounts.push(memberAgentCard.card_number);
          amounts.push(Math.round(0.0375 * discount * log.amount));
          refIds.push(log.refId);
          levels.push("memberAgent");
          let memberAgentUser = await db
            .collection(access_levels[memberAgent.access_level])
            .findOne({ mobile: memberAgent.username });
          if (!memberAgentUser) break memberParty;
          let memberAgentPartAgent = await db
            .collection("part_agent")
            .findOne({ mobile: memberAgentUser.part_agency });
          if (memberAgentPartAgent) {
            let memberAgentPartAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: memberAgentPartAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(memberAgentPartAgentCard.card_number);
            amounts.push(Math.round(0.0375 * discount * log.amount));
            refIds.push(log.refId);
            levels.push("memberHighAgent");
            break memberParty;
          }
          let memberAgentTotalAgent = await db
            .collection("total_agency")
            .findOne({ mobile: memberAgentUser.total_agency });
          if (memberAgentTotalAgent) {
            let memberAgentTotalAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: memberAgentTotalAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(memberAgentTotalAgentCard.card_number);
            amounts.push(Math.round(0.0375 * discount * log.amount));
            refIds.push(log.refId);
            levels.push("memberHighAgent");
            break memberParty;
          }
        }
      }
      acceptorParty: {
        if (!acceptor) break acceptorParty;
        const acceptorAgent = await db
          .collection("Agents")
          .findOne({ username: acceptor.registrant });
        if (!acceptorAgent) break acceptorParty;
        let acceptorAgentCard = await db
          .collection("member_bank_card")
          .findOne({
            username: acceptorAgent.username,
            type: "1",
            status: "2",
          });
        if (acceptorAgent.access_level < 3) {
          accounts.push(acceptorAgentCard.card_number);
          amounts.push(Math.round(0.075 * discount * log.amount));
          refIds.push(log.refId);
          levels.push("acceptorAgent");
        } else {
          accounts.push(acceptorAgentCard.card_number);
          amounts.push(Math.round(0.0375 * discount * log.amount));
          refIds.push(log.refId);
          levels.push("acceptorAgent");
          let acceptorAgentUser = await db
            .collection(access_levels[acceptorAgent.access_level])
            .findOne({ mobile: acceptorAgent.username });
          if (!acceptorAgentUser) break acceptorParty;
          let acceptorAgentPartAgent = await db
            .collection("part_agent")
            .findOne({ mobile: acceptorAgentUser.part_agency });
          if (acceptorAgentPartAgent) {
            let acceptorAgentPartAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: acceptorAgentPartAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(acceptorAgentPartAgentCard.card_number);
            amounts.push(Math.round(0.0375 * discount * log.amount));
            refIds.push(log.refId);
            levels.push("acceptorHighAgent");
            break acceptorParty;
          }
          let acceptorAgentTotalAgent = await db
            .collection("total_agency")
            .findOne({ mobile: acceptorAgentUser.total_agency });
          if (acceptorAgentTotalAgent) {
            let acceptorAgentTotalAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: acceptorAgentTotalAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(acceptorAgentTotalAgentCard.card_number);
            amounts.push(Math.round(0.0375 * discount * log.amount));
            refIds.push(log.refId);
            levels.push("acceptorHighAgent");
            break acceptorParty;
          }
        }
      }
      await db
        .collection("discount_api_logs")
        // .updateOne({ _id: log._id }, { $set: { status: "settled" } });
        .updateOne({ _id: log._id }, { $set: { status: "settling" } });
    }
    let transactions = await db
      .collection("transactions")
      .find({
        $and: [
          { status: { $nin: ["settled", "postponed", "fined"] } },
          { date: { $lt: moment().format("jYYYY/jMM/jDD") } },
          {
            owner: {
              $nin: ["09120603235", "09126979399", "09125687422"],
            },
          },
        ],
      })
      .toArray();
    for (const transaction of transactions) {
      if (transaction.transaction_type == "1" && transaction.amount == "700000")
        transaction.amount = "500000";
      // pop insurance
      const partAgents = await db
        .collection("part_agent")
        .find({
          $or: [
            { registrant: "09124789684" },
            { part_agency: "09124789684" },
            { total_agency: "09124789684" },
          ],
        })
        .toArray();
      const memberClubs = await db
        .collection("member_club")
        .find({
          $or: [
            { registrant: "09124789684" },
            { part_agency: "09124789684" },
            { total_agency: "09124789684" },
          ],
        })
        .toArray();
      if (
        partAgents.map((p) => p.mobile).includes(transaction.owner) ||
        memberClubs.map((p) => p.mobile).includes(transaction.owner)
      ) {
        transaction.owner = "09124789684";
        transaction.owner_type = "1";
      }
      // 1
      // 2
      // 3
      // 4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33
      // 7, 11
      // 10, 13, 17, 19, 22, 24, 27, 29, 32, 34
      if (
        [
          4, 5, 6, 8, 9, 12, 14, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33,
        ].includes(+transaction.transaction_type)
      )
        transaction.transaction_type = "4";
      if ([7, 11].includes(+transaction.transaction_type))
        transaction.transaction_type = "7";
      if (
        [10, 13, 17, 19, 22, 24, 27, 29, 32, 34].includes(
          +transaction.transaction_type
        )
      )
        transaction.transaction_type = "10";
      newMemberParty: {
        let memberCard = await db
          .collection("member_bank_card")
          .findOne({ username: transaction.member, type: "1", status: "2" });
        let memberAgentCard = await db
          .collection("member_bank_card")
          .findOne({ username: transaction.owner, type: "1", status: "2" });
        // type 10 is type 7 without user discount (deducted)
        if (
          transaction.transaction_type == "7" ||
          transaction.transaction_type == "10"
        ) {
          let member = await db
            .collection("Members")
            .findOne({ mobile: transaction.member });
          if (!member) {
            const tmpAgent = await db
              .collection("Agents")
              .findOne({ username: transaction.member });
            if (tmpAgent) {
              member = await db
                .collection(access_levels[+tmpAgent.access_level])
                .findOne({ mobile: transaction.member });
            }
          }
          // if (!memberCard) break newMemberParty;
          if (transaction.transaction_type == "7" && memberCard) {
            const discAmount = await require("./ins-disc-rd")(
              transaction.member,
              "" + Math.round(0.7 * transaction.amount),
              "" + transaction._id
            );
            if (+discAmount) {
              accounts.push(memberCard.card_number);
              amounts.push(+discAmount);
              refIds.push(transaction._id);
              levels.push("member");
            }
          }
          // calculation because of user discount deduction
          if (transaction.transaction_type == "10") {
            transaction.amount *= 10 / 3;
          }

          memberAgent = await db
            .collection("Agents")
            .findOne({ username: member.registrant });
          if (!memberAgent) break newMemberParty;
          memberAgentCard = await db.collection("member_bank_card").findOne({
            username: memberAgent.username,
            type: "1",
            status: "2",
          });
          if (memberAgent.access_level < 3) {
            accounts.push(memberAgentCard.card_number);
            amounts.push(Math.round(0.075 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("memberAgent");
          } else {
            accounts.push(memberAgentCard.card_number);
            amounts.push(Math.round(0.0375 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("memberAgent");
            let memberAgentUser = await db
              .collection(access_levels[memberAgent.access_level])
              .findOne({ mobile: memberAgent.username });
            if (!memberAgentUser) break newMemberParty;
            let memberAgentPartAgent = await db
              .collection("part_agent")
              .findOne({ mobile: memberAgentUser.part_agency });
            if (memberAgentPartAgent) {
              let memberAgentPartAgentCard = await db
                .collection("member_bank_card")
                .findOne({
                  username: memberAgentPartAgent.mobile,
                  type: "1",
                  status: "2",
                });
              accounts.push(memberAgentPartAgentCard.card_number);
              amounts.push(Math.round(0.0375 * transaction.amount));
              refIds.push(transaction._id);
              levels.push("memberHighAgent");
              break newMemberParty;
            }
            let memberAgentTotalAgent = await db
              .collection("total_agency")
              .findOne({ mobile: memberAgentUser.total_agency });
            if (memberAgentTotalAgent) {
              let memberAgentTotalAgentCard = await db
                .collection("member_bank_card")
                .findOne({
                  username: memberAgentTotalAgent.mobile,
                  type: "1",
                  status: "2",
                });
              accounts.push(memberAgentTotalAgentCard.card_number);
              amounts.push(Math.round(0.0375 * transaction.amount));
              refIds.push(transaction._id);
              levels.push("memberHighAgent");
              break newMemberParty;
            }
          }
        } else if (transaction.transaction_type === "4") {
          if (!memberCard) break newMemberParty;
          accounts.push(memberCard.card_number);
          amounts.push(Math.round(transaction.amount));
          refIds.push(transaction._id);
          levels.push("member");
        } else if (!memberAgentCard) break newMemberParty;
        else if (
          parseInt(transaction.owner_type) < 3 ||
          transaction.owner == "09128457939"
        ) {
          // 1 or 2
          accounts.push(memberAgentCard.card_number);
          amounts.push(Math.round(0.5 * transaction.amount));
          refIds.push(transaction._id);
          levels.push("memberAgent");
        } else {
          // 3 or more
          accounts.push(memberAgentCard.card_number);
          if (transaction.owner == "09128432926") amounts.push(185000);
          else if (transaction.owner_type == 7)
            amounts.push(Math.round(0.2 * transaction.amount));
          else amounts.push(Math.round(0.25 * transaction.amount));
          refIds.push(transaction._id);
          levels.push("memberAgent");
          let memberAgentUser = await db
            .collection(access_levels[parseInt(transaction.owner_type)])
            .findOne({ mobile: transaction.owner });
          if (!memberAgentUser) break newMemberParty;
          let memberAgentPartAgent = await db
            .collection("part_agent")
            .findOne({ mobile: memberAgentUser.part_agency });
          if (memberAgentPartAgent) {
            let memberAgentPartAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: memberAgentPartAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(memberAgentPartAgentCard.card_number);
            if (transaction.owner == "09128432926") amounts.push(165000);
            else if (transaction.owner_type == 7)
              amounts.push(Math.round(0.2 * transaction.amount));
            else amounts.push(Math.round(0.25 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("memberHighAgent");
            if (transaction.owner_type != 7) break newMemberParty;
          }
          let memberAgentTotalAgent = await db
            .collection("total_agency")
            .findOne({ mobile: memberAgentUser.total_agency });
          if (memberAgentTotalAgent) {
            let memberAgentTotalAgentCard = await db
              .collection("member_bank_card")
              .findOne({
                username: memberAgentTotalAgent.mobile,
                type: "1",
                status: "2",
              });
            accounts.push(memberAgentTotalAgentCard.card_number);
            if (transaction.owner_type == 7)
              amounts.push(
                Math.round(
                  (memberAgentPartAgent ? 0.1 : 0.3) * transaction.amount
                )
              );
            else amounts.push(Math.round(0.25 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("memberHighAgent");
            break newMemberParty;
          }
        }
      }
      newAcceptorParty: {
        if (
          transaction.transaction_type == "7" ||
          transaction.transaction_type == "10"
        ) {
          // because of user discount deduction
          // bug found calculated before
          // if (transaction.transaction_type == "10")
          //   transaction.amount *= 10 / 3;

          const acceptor = await db
            .collection("acceptor")
            .findOne({ mobile: transaction?.acceptor });
          if (!acceptor) break newAcceptorParty;
          const acceptorAgent = await db
            .collection("Agents")
            .findOne({ username: acceptor.registrant });
          if (!acceptorAgent) break newAcceptorParty;
          let acceptorAgentCard = await db
            .collection("member_bank_card")
            .findOne({
              username: acceptorAgent.username,
              type: "1",
              status: "2",
            });
          if (acceptorAgent.access_level < 3) {
            accounts.push(acceptorAgentCard.card_number);
            amounts.push(Math.round(0.075 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("acceptorAgent");
          } else {
            accounts.push(acceptorAgentCard.card_number);
            amounts.push(Math.round(0.0375 * transaction.amount));
            refIds.push(transaction._id);
            levels.push("acceptorAgent");
            let acceptorAgentUser = await db
              .collection(access_levels[acceptorAgent.access_level])
              .findOne({ mobile: acceptorAgent.username });
            if (!acceptorAgentUser) break newAcceptorParty;
            let acceptorAgentPartAgent = await db
              .collection("part_agent")
              .findOne({ mobile: acceptorAgentUser.part_agency });
            if (acceptorAgentPartAgent) {
              let acceptorAgentPartAgentCard = await db
                .collection("member_bank_card")
                .findOne({
                  username: acceptorAgentPartAgent.mobile,
                  type: "1",
                  status: "2",
                });
              accounts.push(acceptorAgentPartAgentCard.card_number);
              amounts.push(Math.round(0.0375 * transaction.amount));
              refIds.push(transaction._id);
              levels.push("acceptorHighAgent");
              break newAcceptorParty;
            }
            let acceptorAgentTotalAgent = await db
              .collection("total_agency")
              .findOne({ mobile: acceptorAgentUser.total_agency });
            if (acceptorAgentTotalAgent) {
              let acceptorAgentTotalAgentCard = await db
                .collection("member_bank_card")
                .findOne({
                  username: acceptorAgentTotalAgent.mobile,
                  type: "1",
                  status: "2",
                });
              accounts.push(acceptorAgentTotalAgentCard.card_number);
              amounts.push(Math.round(0.0375 * transaction.amount));
              refIds.push(transaction._id);
              levels.push("acceptorHighAgent");
              break newAcceptorParty;
            }
          }
        }
      }
      await db
        .collection("transactions")
        // .updateOne({ _id: transaction._id }, { $set: { status: "settled" } });
        .updateOne({ _id: transaction._id }, { $set: { status: "settling" } });
    }
    let totalAccounts = Array.from(new Set(accounts));
    let totalAmounts = [];
    let descriptions = [];
    for (let totalAccount of totalAccounts) {
      let totalAmount = 0;
      let details = [];
      for (let i = 0; i < accounts.length; i++) {
        if (totalAccount === accounts[i]) {
          totalAmount += amounts[i];
          details.push({
            refId: refIds[i],
            amount: amounts[i],
            level: levels[i],
          });
        }
      }
      totalAmounts.push(totalAmount);
      descriptions.push({
        cardPAN: totalAccount,
        amount: totalAmount,
        details,
      });
    }

    let transactionLog = {
      totalAmount: totalAmounts.reduce((a, b) => a + b, 0),
      descriptions,
      date: moment().format("jYYYYjMMjDD"),
    };
    fs.appendFileSync(
      __filename + ".log",
      JSON.stringify(transactionLog, null, 2) + "\n"
    );

    let chgResult = await chgBpi(totalAccounts, totalAmounts);
    fs.appendFileSync(
      __filename + ".log",
      JSON.stringify(chgResult, null, 2) + "\n"
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
      await db.collection("discount_api_logs").updateMany(
        { status: "settling" },
        {
          $set: {
            status: "settled",
          },
        }
      );
      await db.collection("transactions").updateMany(
        { status: "settling" },
        {
          $set: {
            status: "settled",
          },
        }
      );
      let logResult = await db
        .collection("transactionLogs")
        .insertOne(transactionLog);
      fs.appendFileSync(
        __filename + ".log",
        JSON.stringify(logResult, null, 2) + "\n"
      );
    }
    // virtual transactions
    const creditRequests = await db
      .collection("credit_requests")
      .find({
        $and: [
          { request_status: { $in: ["7", "9"] } },
          { virtual_pay_date: { $lt: moment().format("jYYYY/jMM/jDD") } },
        ],
      })
      .toArray();
    for (const creditRequest of creditRequests) {
      const card = await db.collection("member_bank_card").findOne({
        username: creditRequest.username,
        type: "1",
        status: "2",
      });
      const plan = await db
        .collection("loans")
        .findOne({ _id: ObjectId(creditRequest.loan_accepted_code) });
      // Charge Credit
      for (let i = 0; i < MAX_RETRY; i++) {
        const bpmResponse = await bpmChgAndDchgVrAcc(
          card.card_number,
          1,
          2,
          plan.virtual_amount,
          Math.floor(new Date().getTime() / 1000),
          "واریز بابت تسهیلات",
          Math.floor(new Date().getTime() / 1000)
        );
        if (bpmResponse[0].responseCode == "000") {
          // put into chargecredit for documantation
          await db.collection("chargecredit").insertOne({
            username: "parsecard",
            payer: "parsecard",
            payee: creditRequest.username,
            about: "واریز بابت تسهیلات",
            // ip: "5.238.199.222",
            credit: plan.virtual_amount,
            // invoiceNumber: 1611227521,
            // invoiceDate: "1399/11/02",
            // terminalCode: "",
            // merchantCode: "",
            amount: "",
            status: "6",
            refId: creditRequest._id,
            psp_response: bpmResponse,
          });
          await db.collection("credit_requests").updateOne(
            { _id: creditRequest._id },
            {
              $set: {
                request_status:
                  creditRequest.request_status == "7" ? "10" : "11",
              },
            }
          );
          const member = await db
            .collection("Members")
            .findOne({ mobile: creditRequest.username });
          await sendPatSmsVr(
            member.mobile,
            member.first_name + " " + member.last_name,
            plan.virtual_amount
          );
          break;
        }
      }
    }
  } catch (err) {
    console.log(err);
    fs.appendFileSync(__filename + ".err.log", err.message + "\n");
  } finally {
    client.close();
  }
})().catch((err) => console.log(err));
