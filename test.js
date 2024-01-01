const { write, writeFileSync } = require("fs");
const moment = require("moment-jalaali");
// [
//   '5022294033893993',
//   '5022294033205255',
//   '5022294032845333',
//   '5022294032418230',
// ] [ 400000, 1200000, 30000, 570000 ]
// const {open, close} = require("./db")
const invoiceNumberInit = () => moment().format("YYYYMMDDHHmmss") + String(process.hrtime()[1]).padStart(9, "0");
const userDepit = async (shares) => {
  try {
    const depit = JSON.parse(JSON.stringify(shares))
    const today = moment().format("jYYYYjMMjDD");
    const getUserDebtInstallment = async (username) => {
      const aggregate = [];
      aggregate.push({
        $match: {
          username,
          status: "0",
          "maturities.status": "0",
          maturities: {
            $elemMatch: {
              "payDate": { $lte: today }
            },
          }
        }
      })
      aggregate.push({
        $project: {
          username: 1,
          maturities: {
            $filter: {
              input: "$maturities",
              as: 'maturitie',
              cond: { $and: [{ $eq: ['$$maturitie.status', "0"] }, { $lte: ['$$maturitie.payDate', String(today)] }] }
            }
          }
        }
      })
      aggregate.push({
        $addFields: {
          "maturities.username": "$username",
          "maturities.installmentID": "$_id",
        }
      })
      aggregate.push({ $project: { username: 0 } })
      const installmentsUser = await installments.aggregate(aggregate).sort({ _id: 1 }).toArray();
      return installmentsUser
    }
    const getUserDebtInsurance = async (username) => {
      const aggregate = [];
      aggregate.push({
        $match: {
          username,
          status: "1",
        }
      })
      const insuranceUser = await insurance.aggregate(aggregate).sort({ _id: 1 }).toArray();
      return insuranceUser.filter(item => {
        if (+item.year > +moment().format("jYYYY")) return false;
        if (+item.year < +moment().format("jYYYY")) return true;
        if (+item.year == +moment().format("jYYYY")) return +item.month < +moment().format("jM");

        return false;

      });
    }
    const updateUserDebtInstallment = async (installmentID, newAmount, oldAmount, date) => {
      const installmentsUser = await installments.findOne({ _id: installmentID });
      for (const installment of installmentsUser.maturities) {
        if (installment.status == "0" && installment.amount == oldAmount && installment.date == date) {
          if (!installment.deductions?.length) {
            installment.installmentAmount = installment.amount
          }
          installment.oldAmount = oldAmount;
          installment.amount = newAmount;
          installment.status = (newAmount == 0) ? "1" : "0";
          installment.invoiceNumber = (newAmount == 0) ? 1 : null;
          installment.deductions = installment.deductions?.length ? [...installment.deductions, today] : [today];
          installmentsUser.amount = +installmentsUser.amount - (+oldAmount - +newAmount);
          installmentsUser.status = installmentsUser.amount == "0" ? "1" : "0"
        }
      }
      console.log(installmentsUser.maturities)
      await installments.updateOne({ _id: installmentID }, {
        $set: { maturities: installmentsUser.maturities, amount: installmentsUser.amount, status: installmentsUser.status }
      });
    }
    const updateUserDebtInsurance = async (id, amount, transaction) => {
      await insurance.updateOne({ _id: id }, {
        $set: {
          refId: "1",
          description: "کسر در فرآیند تسهیم",
          status: transaction.status,
          amount,
          billAmount: amount,
          totalAmount: amount
        },
        $push: { transactions: transaction }
      });
      console.log({
        refId: "1",
        description: "کسر از تسهیم",
        status: transaction ? "1" : "2",
        amount,
        billAmount: amount
      })
    }

    let maxTry = 0;
    while (maxTry < 30) {
      for (const share of shares) {
        if (!share.depit) share.depit = []
        const card = await cards.findOne({ card_number: share.account });
        if (!card) continue;
        const userInstallments = await getUserDebtInstallment(card?.username || card?.mb || card?.mobile)
        const userInsurance = await getUserDebtInsurance(card?.username || card?.mb || card?.mobile)
        let Maturitieses = []
        for (const maturities of userInstallments) {
          Maturitieses.push(maturities.maturities)
        }
        Maturitieses = Maturitieses.flat(3);
        for (const matur of Maturitieses) {
          if (+share.amount >= +matur.amount) {
            share.amount = +share.amount - +matur.amount;
            share.depit.push({
              amount: +matur.amount,
              description: "کسر مبلغ قسط",
              installmentID: matur.installmentID
            })
            await updateUserDebtInstallment(matur.installmentID, 0, matur.amount, matur.date)
          } else if (+share.amount > 0) {
            let newAmount = +matur.amount - +share.amount;
            share.depit.push({
              amount: +matur.amount,
              description: "کسر مبلغ قسط",
              installmentID: matur.installmentID
            })
            await updateUserDebtInstallment(matur.installmentID, newAmount, matur.amount, matur.date)
            share.amount = 0;
          }
        }
        for (const insurance of userInsurance) {
          if (+share.amount >= +insurance.totalAmount) {
            share.amount = +share.amount - +insurance.totalAmount;
            share.depit.push({
              amount: +insurance.totalAmount,
              description: "کسر مبلغ بیمه",
              insuranceID: insurance._id
            })
            await updateUserDebtInsurance(insurance._id, 0, { amount: +insurance.totalAmount, deductions: today, status: "2" })
          } else if (+share.amount > 0) {
            const amount = +insurance.totalAmount - +share.amount;
            share.depit.push({
              amount: +share.amount,
              description: "کسر مبلغ بیمه",
              insuranceID: insurance._id
            })
            await updateUserDebtInsurance(insurance._id, amount, { amount: share.amount, deductions: today, status: "1" })
            share.amount = 0;
          }
        }
      }
      maxTry++;
    }
    const result = shares.map(share => {
      share.oldAmount = depit.find(d => d.account == share.account)?.amount;
      return share
    });
    writeFileSync("./result.json", JSON.stringify(result, null, 4), "utf-8")
    console.log(result)
    return result
  } catch (error) {
    console.log(error)
  }
}
// await userDepit(shares);
module.exports = {
  userDepit
}